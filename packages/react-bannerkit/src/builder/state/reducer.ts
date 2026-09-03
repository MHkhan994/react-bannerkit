/*
 * All of the editor's behaviour, as one pure function.
 *
 * Keeping this free of React is what makes the editor testable: every rule about
 * what a split does to the selection, what converting to a carousel does to the
 * content, or what a drag does to the undo stack is asserted directly against
 * `editorReducer` rather than driven through the DOM.
 *
 * Two things are deliberately NOT in the saved document:
 *   - the selection, which is a property of a person looking at the editor
 *   - the slide cursor, which would otherwise persist "the slide whoever edited
 *     this last happened to be looking at" and invite the renderer to read it
 */
import { readableTextColor } from '../../core/contrast'
import { createElement, createPanel } from '../../core/defaults'
import { makeId, type IdFactory } from '../../core/ids'
import { normalizeTemplate } from '../../core/normalize'
import {
  cloneNode,
  countPanels,
  findPanel,
  removePanel as removePanelFromTree,
  replacePanel,
  setSplitRatio,
  splitPanel as splitPanelInTree,
  updatePanel as updatePanelInTree,
  type PanelPatch,
} from '../../core/tree'
import {
  DEVICES,
  clampDesignWidth,
  type BannerBreakpoint,
  type BannerElement,
  type BannerElementType,
  type BannerPanel,
  type BannerPosition,
  type BannerSlide,
  type BannerTemplate,
  type BreakpointName,
  type SplitDirection,
} from '../../core/types'
import {
  commitGesture,
  createHistory,
  push,
  redo,
  replacePresent,
  undo,
  type History,
} from './history'

export type EditorView = 'edit' | 'preview'

export type Selection =
  | { kind: 'template' }
  | { kind: 'panel'; panelId: string }
  | { kind: 'element'; panelId: string; elementId: string }

export interface EditorState {
  history: History<BannerTemplate>
  breakpoint: BreakpointName
  selection: Selection
  /** Which slide of each carousel is being edited. Keyed by panel id. */
  slideCursors: Readonly<Record<string, number>>
  view: EditorView
  /*
   * The document as it was before the current drag started, or null when no drag
   * is in progress. Held so that `commit` can make the whole gesture one undo
   * step - see commitGesture.
   */
  gestureBase: BannerTemplate | null
  /** Injected so tests and snapshots stay deterministic. */
  makeId: IdFactory
}

export type EditorAction =
  | { type: 'setBreakpoint'; breakpoint: BreakpointName }
  | { type: 'setView'; view: EditorView }
  | { type: 'selectTemplate' }
  | { type: 'selectPanel'; panelId: string }
  | { type: 'selectElement'; panelId: string; elementId: string }
  | { type: 'splitPanel'; panelId: string; dir: SplitDirection }
  | { type: 'removePanel'; panelId: string }
  | { type: 'setSplitRatio'; splitId: string; ratio: number; transient?: boolean }
  | { type: 'updatePanel'; patch: PanelPatch; panelId?: string }
  | { type: 'updateBreakpoint'; patch: Partial<Omit<BannerBreakpoint, 'root'>> }
  /*
   * A template-level field, unlike everything above it. `null`, or a width
   * equal to the device default, deletes the override rather than storing it -
   * see the reducer case for why that is what keeps the document meaningful.
   */
  | { type: 'setDesignWidth'; breakpoint: BreakpointName; width: number | null }
  | { type: 'addElement'; elementType: BannerElementType }
  | { type: 'updateElement'; patch: Record<string, unknown>; elementId?: string }
  | { type: 'removeElement'; panelId: string; elementId: string }
  | { type: 'moveElement'; elementId: string; direction: -1 | 1 }
  | { type: 'setElementPosition'; pos: BannerPosition | null; elementId?: string; transient?: boolean }
  | { type: 'setSlideCursor'; panelId: string; slide: number }
  | { type: 'addSlide'; panelId: string }
  | { type: 'removeSlide'; panelId: string; slide: number }
  | { type: 'copyBreakpoint'; from: BreakpointName; to: BreakpointName }
  | { type: 'replaceTemplate'; template: BannerTemplate }
  | { type: 'commit' }
  | { type: 'undo' }
  | { type: 'redo' }

/* ---------------------------------------------------------------- selectors */

export const template = (state: EditorState): BannerTemplate => state.history.present

export const currentBreakpoint = (state: EditorState): BannerBreakpoint =>
  template(state).breakpoints[state.breakpoint]

export function selectedPanel(state: EditorState): BannerPanel | null {
  const { selection } = state
  if (selection.kind === 'template') return null
  return findPanel(currentBreakpoint(state).root, selection.panelId)
}

/** Which slide of a carousel is being edited. */
export const slideCursorOf = (state: EditorState, panel: BannerPanel): number =>
  panel.type === 'carousel'
    ? Math.min(state.slideCursors[panel.id] ?? 0, Math.max(0, panel.slides.length - 1))
    : 0

/*
 * Where new elements go and which elements the inspector lists: the panel
 * itself, or the slide currently being edited if it is a carousel.
 */
export function activeHost(state: EditorState): BannerPanel | BannerSlide | null {
  const panel = selectedPanel(state)
  if (!panel) return null
  if (panel.type !== 'carousel') return panel
  return panel.slides[slideCursorOf(state, panel)] ?? panel
}

export function selectedElement(state: EditorState): BannerElement | null {
  const { selection } = state
  if (selection.kind !== 'element') return null
  const host = activeHost(state)
  return host?.elements.find((el) => el.id === selection.elementId) ?? null
}

/* ------------------------------------------------------------------ helpers */

/** True for actions that change the document and should be undoable. */
function isTransient(action: EditorAction): boolean {
  return 'transient' in action && action.transient === true
}

function withTemplate(
  state: EditorState,
  next: BannerTemplate,
  action: EditorAction,
): EditorState {
  if (isTransient(action)) {
    /*
     * The first frame of a drag remembers where the document started. Every
     * frame after it just replaces the present, so a sixty-frame drag costs one
     * undo step rather than sixty.
     */
    const gestureBase = state.gestureBase ?? state.history.present
    const history = replacePresent(state.history, next)
    if (history === state.history && gestureBase === state.gestureBase) return state
    return { ...state, history, gestureBase }
  }
  const history = push(state.history, next)
  return history === state.history ? state : { ...state, history }
}

/** Applies a change to the current breakpoint's tree. */
function withRoot(state: EditorState, next: BannerBreakpoint['root'], action: EditorAction) {
  const current = currentBreakpoint(state)
  if (next === current.root) return state
  return withTemplate(
    state,
    {
      ...template(state),
      breakpoints: {
        ...template(state).breakpoints,
        [state.breakpoint]: { ...current, root: next },
      },
    },
    action,
  )
}

/** Writes back a panel or the slide inside it, whichever the editor is pointed at. */
function withActiveHost(
  state: EditorState,
  action: EditorAction,
  update: (elements: BannerElement[]) => BannerElement[],
): EditorState {
  const panel = selectedPanel(state)
  if (!panel) return state

  if (panel.type !== 'carousel') {
    return withRoot(
      state,
      updatePanelInTree(currentBreakpoint(state).root, panel.id, { elements: update(panel.elements) }),
      action,
    )
  }

  const index = slideCursorOf(state, panel)
  const slides = panel.slides.map((slide, i) =>
    i === index ? { ...slide, elements: update(slide.elements) } : slide,
  )
  return withRoot(
    state,
    updatePanelInTree(currentBreakpoint(state).root, panel.id, { slides }),
    action,
  )
}

/*
 * Converting a single panel to a carousel copies its content onto slide one.
 * Without this the content appears to vanish, which is what the prototype's
 * inspector worked around; it belongs here instead.
 */
function convertToCarousel(panel: BannerPanel, id: IdFactory): BannerPanel {
  const firstSlide = panel.slides[0]
  if (!firstSlide || firstSlide.elements.length > 0 || panel.elements.length === 0) return panel
  return {
    ...panel,
    slides: panel.slides.map((slide, index) =>
      index === 0
        ? { ...slide, elements: panel.elements.map((el) => ({ ...el, id: id() })) }
        : slide,
    ),
  }
}

/*
 * The colour actually behind an element: the slide's background inside a
 * carousel, the panel's otherwise. A photo background returns an empty string,
 * which `readableTextColor` treats as dark - banner photography usually is, and
 * light text is the safer default.
 */
function hostBackground(host: BannerPanel | BannerSlide): string {
  const mode = 'bgMode' in host ? host.bgMode : host.mode
  return mode === 'color' ? host.bg : ''
}

const clampPos = (pos: BannerPosition): BannerPosition => ({
  x: Math.min(96, Math.max(0, pos.x)),
  y: Math.min(96, Math.max(0, pos.y)),
})

/* ------------------------------------------------------------------ reducer */

export function createEditorState(
  source: BannerTemplate,
  id: IdFactory = makeId,
): EditorState {
  return {
    history: createHistory(normalizeTemplate(source, { id })),
    breakpoint: 'laptop',
    selection: { kind: 'template' },
    slideCursors: {},
    view: 'edit',
    gestureBase: null,
    makeId: id,
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    /* ---- view and selection: never touch the document or the history ---- */

    case 'setBreakpoint':
      if (action.breakpoint === state.breakpoint) return state
      // Ids do not cross layouts, so a selection cannot survive the switch.
      return { ...state, breakpoint: action.breakpoint, selection: { kind: 'template' } }

    case 'setView':
      return state.view === action.view ? state : { ...state, view: action.view }

    case 'selectTemplate':
      return { ...state, selection: { kind: 'template' } }

    case 'selectPanel':
      return { ...state, selection: { kind: 'panel', panelId: action.panelId } }

    case 'selectElement':
      return {
        ...state,
        selection: { kind: 'element', panelId: action.panelId, elementId: action.elementId },
      }

    case 'setSlideCursor': {
      // Moving the cursor is navigation, not an edit.
      const panel = findPanel(currentBreakpoint(state).root, action.panelId)
      const max = panel ? Math.max(0, panel.slides.length - 1) : 0
      const slide = Math.min(Math.max(0, action.slide), max)
      return {
        ...state,
        slideCursors: { ...state.slideCursors, [action.panelId]: slide },
        // Changing slide changes which elements exist, so an element selection
        // pointing into the old slide has to go.
        selection:
          state.selection.kind === 'element' && state.selection.panelId === action.panelId
            ? { kind: 'panel', panelId: action.panelId }
            : state.selection,
      }
    }

    /* ---- structure ---- */

    case 'splitPanel': {
      const result = splitPanelInTree(
        currentBreakpoint(state).root,
        action.panelId,
        action.dir,
        state.makeId,
      )
      if (!result) return state
      const next = withRoot(state, result.root, action)
      return { ...next, selection: { kind: 'panel', panelId: result.panel.id } }
    }

    case 'removePanel': {
      const root = currentBreakpoint(state).root
      if (countPanels(root) < 2) return state
      const next = withRoot(state, removePanelFromTree(root, action.panelId), action)
      if (next === state) return state
      const stillThere =
        state.selection.kind !== 'template' &&
        findPanel(currentBreakpoint(next).root, state.selection.panelId)
      return stillThere ? next : { ...next, selection: { kind: 'template' } }
    }

    case 'setSplitRatio':
      return withRoot(
        state,
        setSplitRatio(currentBreakpoint(state).root, action.splitId, action.ratio),
        action,
      )

    /* ---- panel and breakpoint properties ---- */

    case 'updatePanel': {
      const panelId = action.panelId ?? (state.selection.kind !== 'template' ? state.selection.panelId : null)
      if (!panelId) return state
      const panel = findPanel(currentBreakpoint(state).root, panelId)
      if (!panel) return state

      const patched: BannerPanel = { ...panel, ...action.patch }
      const finished =
        action.patch.type === 'carousel' && panel.type !== 'carousel'
          ? convertToCarousel(patched, state.makeId)
          : patched

      return withRoot(state, replacePanel(currentBreakpoint(state).root, panelId, finished), action)
    }

    case 'updateBreakpoint': {
      const current = currentBreakpoint(state)
      return withTemplate(
        state,
        {
          ...template(state),
          breakpoints: {
            ...template(state).breakpoints,
            [state.breakpoint]: { ...current, ...action.patch },
          },
        },
        action,
      )
    }

    case 'setDesignWidth': {
      /*
       * Clamped here, because nothing upstream does it. The inspector's `min`
       * and `max` are HTML validation attributes: they colour the field red and
       * let the keystroke through, so `5` arrived and was stored verbatim. The
       * renderer was never at risk - `normalizeTemplate` clamps on every render
       * - but the canvas measures the *un-normalized* document, so it drew a
       * 5px frame around a banner rendering itself at 320 and the editor
       * disagreed with its own preview.
       */
      if (action.width !== null && !Number.isFinite(action.width)) return state
      const width = action.width === null ? null : clampDesignWidth(action.width)

      // `designWidths` is destructured out of the spread below rather than
      // just conditionally added back, so that clearing the last override
      // actually removes the property - `...doc` alone would carry the old
      // key straight through even when the new value for it is "nothing".
      const { designWidths: _current, ...doc } = template(state)
      const { [action.breakpoint]: _dropped, ...rest } = _current ?? {}
      // Storing the device default would be a no-op that still shadows it
      // forever, so a width that lands back on the default deletes the key
      // instead - that is what lets `designWidthOf`'s fallback keep working and
      // what keeps a round trip through `normalizeTemplate` idempotent.
      const isDefault = width === null || width === DEVICES[action.breakpoint].width
      const designWidths = isDefault ? rest : { ...rest, [action.breakpoint]: width }
      return withTemplate(
        state,
        {
          ...doc,
          ...(Object.keys(designWidths).length > 0 ? { designWidths } : {}),
        },
        action,
      )
    }

    /* ---- elements ---- */

    case 'addElement': {
      const panel = selectedPanel(state)
      if (!panel) return state
      const element = createElement(action.elementType, state.makeId)

      /*
       * Give it a colour that can be read where it is going. A fixed light
       * default is right on the dark panel a banner starts from and invisible on
       * the light one that splitting produces - and adding a heading that does
       * not appear reads as a broken editor rather than a styling choice.
       *
       * An overlay is exempt: it tints the panel rather than being read.
       */
      const host = activeHost(state)
      if (host && element.type !== 'overlay' && 'color' in element) {
        element.color = readableTextColor(hostBackground(host))
      }
      const next = withActiveHost(state, action, (elements) =>
        // An overlay only makes sense behind everything else.
        element.type === 'overlay' ? [element, ...elements] : [...elements, element],
      )
      if (next === state) return state
      return { ...next, selection: { kind: 'element', panelId: panel.id, elementId: element.id } }
    }

    case 'updateElement': {
      const elementId =
        action.elementId ?? (state.selection.kind === 'element' ? state.selection.elementId : null)
      if (!elementId) return state
      return withActiveHost(state, action, (elements) =>
        elements.map((el) => (el.id === elementId ? ({ ...el, ...action.patch } as BannerElement) : el)),
      )
    }

    case 'removeElement': {
      const next = withActiveHost(state, action, (elements) =>
        elements.filter((el) => el.id !== action.elementId),
      )
      if (next === state) return state
      return state.selection.kind === 'element' && state.selection.elementId === action.elementId
        ? { ...next, selection: { kind: 'panel', panelId: action.panelId } }
        : next
    }

    case 'moveElement':
      return withActiveHost(state, action, (elements) => {
        const index = elements.findIndex((el) => el.id === action.elementId)
        const target = index + action.direction
        if (index === -1 || target < 0 || target >= elements.length) return elements
        const reordered = [...elements]
        const [moved] = reordered.splice(index, 1)
        reordered.splice(target, 0, moved!)
        return reordered
      })

    case 'setElementPosition': {
      const elementId =
        action.elementId ?? (state.selection.kind === 'element' ? state.selection.elementId : null)
      if (!elementId) return state
      return withActiveHost(state, action, (elements) =>
        elements.map((el) => {
          if (el.id !== elementId || el.type === 'overlay') return el
          if (action.pos === null) {
            // Back in the stack: the position is removed, not zeroed, so the
            // document does not carry a meaningless coordinate.
            const { pos: _dropped, ...rest } = el
            return rest as BannerElement
          }
          return { ...el, pos: clampPos(action.pos) }
        }),
      )
    }

    /* ---- slides ---- */

    case 'addSlide': {
      const panel = findPanel(currentBreakpoint(state).root, action.panelId)
      if (!panel) return state
      const slide: BannerSlide = {
        id: state.makeId(),
        mode: 'color',
        bg: panel.bg,
        img: panel.img,
        href: '',
        elements: [],
      }
      return withRoot(
        state,
        updatePanelInTree(currentBreakpoint(state).root, action.panelId, {
          slides: [...panel.slides, slide],
        }),
        action,
      )
    }

    case 'removeSlide': {
      const panel = findPanel(currentBreakpoint(state).root, action.panelId)
      // A carousel with no slides would render nothing at all.
      if (!panel || panel.slides.length < 2) return state
      const slides = panel.slides.filter((_, index) => index !== action.slide)
      const next = withRoot(
        state,
        updatePanelInTree(currentBreakpoint(state).root, action.panelId, { slides }),
        action,
      )
      const cursor = Math.min(state.slideCursors[action.panelId] ?? 0, slides.length - 1)
      return {
        ...next,
        slideCursors: { ...next.slideCursors, [action.panelId]: cursor },
        selection:
          state.selection.kind === 'element' && state.selection.panelId === action.panelId
            ? { kind: 'panel', panelId: action.panelId }
            : state.selection,
      }
    }

    /* ---- whole-breakpoint and whole-document ---- */

    case 'copyBreakpoint': {
      const source = template(state).breakpoints[action.from]
      const next = withTemplate(
        state,
        {
          ...template(state),
          breakpoints: {
            ...template(state).breakpoints,
            // Fresh ids throughout: sharing them would make selecting a panel on
            // one layout highlight a different panel on another.
            [action.to]: { ...source, root: cloneNode(source.root, state.makeId) },
          },
        },
        action,
      )
      return { ...next, breakpoint: action.to, selection: { kind: 'template' } }
    }

    case 'replaceTemplate':
      return {
        ...withTemplate(
          state,
          normalizeTemplate(action.template, { id: state.makeId }),
          action,
        ),
        selection: { kind: 'template' },
        slideCursors: {},
      }

    /* ---- history ---- */

    case 'commit': {
      // Ends a drag. The gesture's frames were transient, so the value from
      // before it started is what undo has to return to.
      if (state.gestureBase === null) return state
      return {
        ...state,
        history: commitGesture(state.history, state.gestureBase),
        gestureBase: null,
      }
    }

    case 'undo':
      return { ...state, history: undo(state.history), gestureBase: null }

    case 'redo':
      return { ...state, history: redo(state.history), gestureBase: null }
  }
}
