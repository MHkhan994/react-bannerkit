import { describe, expect, test } from 'vitest'
import { createDefaultTemplate } from '../../core/defaults'
import { createSequentialIdFactory } from '../../core/ids'
import { normalizeTemplate } from '../../core/normalize'
import { countPanels, findPanel, listPanels } from '../../core/tree'
import { DESIGN_WIDTH_RANGE, type BannerPanel, type BannerTemplate } from '../../core/types'
import { canRedo, canUndo } from './history'
import {
  activeHost,
  createEditorState,
  editorReducer,
  selectedElement,
  selectedPanel,
  template,
  type EditorAction,
  type EditorState,
} from './reducer'

const ids = () => createSequentialIdFactory('e')

function start(overrides?: (t: BannerTemplate) => void): EditorState {
  const t = createDefaultTemplate({ id: ids(), createdAt: '2026-01-01T00:00:00.000Z' })
  overrides?.(t)
  return createEditorState(t, ids())
}

/** Applies a sequence of actions, which is how most of these read best. */
const run = (state: EditorState, ...actions: EditorAction[]): EditorState =>
  actions.reduce(editorReducer, state)

const rootId = (state: EditorState) => template(state).breakpoints[state.breakpoint].root.id

describe('selection', () => {
  test('starts on the template itself, so the inspector has something to show', () => {
    expect(start().selection.kind).toBe('template')
  })

  test('selecting a panel clears any element selection', () => {
    const s = run(
      start(),
      { type: 'selectPanel', panelId: 'x' },
      { type: 'selectElement', panelId: 'x', elementId: 'y' },
      { type: 'selectPanel', panelId: 'x' },
    )
    expect(s.selection).toEqual({ kind: 'panel', panelId: 'x' })
  })

  test('switching breakpoint clears the selection, since ids do not cross layouts', () => {
    const s = run(
      start(),
      { type: 'selectPanel', panelId: 'x' },
      { type: 'setBreakpoint', breakpoint: 'mobile' },
    )
    expect(s.breakpoint).toBe('mobile')
    expect(s.selection.kind).toBe('template')
  })

  test('reports the selected panel and element as objects, not just ids', () => {
    const s0 = start()
    const id = rootId(s0)
    const panel = findPanel(template(s0).breakpoints.laptop.root, id)!
    const s = run(s0, { type: 'selectElement', panelId: id, elementId: panel.elements[1]!.id })
    expect(selectedPanel(s)?.id).toBe(id)
    expect(selectedElement(s)?.id).toBe(panel.elements[1]!.id)
  })
})

describe('splitting and removing panels', () => {
  test('splitting selects the new panel, so the next click acts on it', () => {
    const s0 = start()
    const s = editorReducer(s0, { type: 'splitPanel', panelId: rootId(s0), dir: 'cols' })
    expect(countPanels(template(s).breakpoints.laptop.root)).toBe(2)
    const added = listPanels(template(s).breakpoints.laptop.root)[1]!
    expect(s.selection).toEqual({ kind: 'panel', panelId: added.id })
  })

  test('removing a panel clears the selection that pointed at it', () => {
    const s0 = start()
    const split = editorReducer(s0, { type: 'splitPanel', panelId: rootId(s0), dir: 'cols' })
    const added = listPanels(template(split).breakpoints.laptop.root)[1]!
    const s = editorReducer(split, { type: 'removePanel', panelId: added.id })
    expect(countPanels(template(s).breakpoints.laptop.root)).toBe(1)
    expect(s.selection.kind).toBe('template')
  })

  test('refuses to remove the last panel, because a banner needs one', () => {
    const s0 = start()
    const s = editorReducer(s0, { type: 'removePanel', panelId: rootId(s0) })
    expect(countPanels(template(s).breakpoints.laptop.root)).toBe(1)
    expect(canUndo(s.history)).toBe(false)
  })
})

describe('elements', () => {
  test('adds an element to the selected panel', () => {
    const s0 = start()
    const id = rootId(s0)
    const before = findPanel(template(s0).breakpoints.laptop.root, id)!.elements.length
    const s = run(s0, { type: 'selectPanel', panelId: id }, { type: 'addElement', elementType: 'link' })
    const panel = findPanel(template(s).breakpoints.laptop.root, id)!
    expect(panel.elements).toHaveLength(before + 1)
    expect(panel.elements.at(-1)?.type).toBe('link')
  })

  test('selects what it just added, so the inspector opens on it', () => {
    const s0 = start()
    const s = run(
      s0,
      { type: 'selectPanel', panelId: rootId(s0) },
      { type: 'addElement', elementType: 'icon' },
    )
    expect(selectedElement(s)?.type).toBe('icon')
  })

  test('puts an overlay behind everything, wherever it was added from', () => {
    const s0 = start()
    const s = run(
      s0,
      { type: 'selectPanel', panelId: rootId(s0) },
      { type: 'addElement', elementType: 'overlay' },
    )
    const panel = findPanel(template(s).breakpoints.laptop.root, rootId(s0))!
    expect(panel.elements[0]?.type).toBe('overlay')
  })

  test('gives a new element a colour that is legible on its panel', () => {
    /*
     * Splitting a panel produces a light one, and a fixed light default made
     * every element added to it invisible - which reads as a broken editor.
     */
    const s0 = start()
    const id = rootId(s0)

    const onLight = run(
      s0,
      { type: 'updatePanel', patch: { bg: '#eae9e9', bgMode: 'color' }, panelId: id },
      { type: 'selectPanel', panelId: id },
      { type: 'addElement', elementType: 'heading' },
    )
    const light = selectedElement(onLight)
    expect(light?.type === 'heading' && light.color).toBe('#201f1d')

    const onDark = run(
      s0,
      { type: 'updatePanel', patch: { bg: '#201f1d', bgMode: 'color' }, panelId: id },
      { type: 'selectPanel', panelId: id },
      { type: 'addElement', elementType: 'heading' },
    )
    const dark = selectedElement(onDark)
    expect(dark?.type === 'heading' && dark.color).toBe('#f8f4f4')
  })

  test('leaves an overlay colour alone, since it tints rather than reads', () => {
    const s0 = start()
    const id = rootId(s0)
    const s = run(
      s0,
      { type: 'updatePanel', patch: { bg: '#eae9e9', bgMode: 'color' }, panelId: id },
      { type: 'selectPanel', panelId: id },
      { type: 'addElement', elementType: 'overlay' },
    )
    const overlay = selectedElement(s)
    expect(overlay?.type === 'overlay' && overlay.color).toBe('#201f1d')
  })

  test('reads the slide background, not the panel, when adding to a carousel', () => {
    const s0 = start()
    const id = rootId(s0)
    const carousel = run(
      s0,
      { type: 'selectPanel', panelId: id },
      // A dark panel with a light second slide: the slide is what shows.
      { type: 'updatePanel', patch: { type: 'carousel', bg: '#201f1d', bgMode: 'color' } },
    )
    const slides = findPanel(template(carousel).breakpoints.laptop.root, id)!.slides
    const s = run(
      carousel,
      {
        type: 'updatePanel',
        patch: {
          slides: slides.map((sl, i) =>
            i === 1 ? { ...sl, mode: 'color' as const, bg: '#f8f4f4' } : sl,
          ),
        },
      },
      { type: 'setSlideCursor', panelId: id, slide: 1 },
      { type: 'addElement', elementType: 'text' },
    )
    const added = selectedElement(s)
    expect(added?.type === 'text' && added.color).toBe('#201f1d')
  })

  test('does nothing when no panel is selected', () => {
    const s = editorReducer(start(), { type: 'addElement', elementType: 'text' })
    expect(canUndo(s.history)).toBe(false)
  })

  test('updates a field on the selected element', () => {
    const s0 = start()
    const id = rootId(s0)
    const heading = findPanel(template(s0).breakpoints.laptop.root, id)!.elements.find(
      (e) => e.type === 'heading',
    )!
    const s = run(
      s0,
      { type: 'selectElement', panelId: id, elementId: heading.id },
      { type: 'updateElement', patch: { text: 'Rewritten' } },
    )
    const after = findPanel(template(s).breakpoints.laptop.root, id)!.elements.find(
      (e) => e.type === 'heading',
    )
    expect(after?.type === 'heading' && after.text).toBe('Rewritten')
  })

  test('removes an element and clears the selection pointing at it', () => {
    const s0 = start()
    const id = rootId(s0)
    const heading = findPanel(template(s0).breakpoints.laptop.root, id)!.elements.find(
      (e) => e.type === 'heading',
    )!
    const s = run(
      s0,
      { type: 'selectElement', panelId: id, elementId: heading.id },
      { type: 'removeElement', panelId: id, elementId: heading.id },
    )
    const panel = findPanel(template(s).breakpoints.laptop.root, id)!
    expect(panel.elements.some((e) => e.type === 'heading')).toBe(false)
    expect(s.selection).toEqual({ kind: 'panel', panelId: id })
  })
})

describe('carousels', () => {
  const asCarousel = (state: EditorState): { state: EditorState; panel: BannerPanel } => {
    const id = rootId(state)
    const next = run(
      state,
      { type: 'selectPanel', panelId: id },
      { type: 'updatePanel', patch: { type: 'carousel' } },
    )
    return { state: next, panel: findPanel(template(next).breakpoints.laptop.root, id)! }
  }

  test('converting to a carousel copies the panel content onto slide one', () => {
    /*
     * Without this, switching to carousel looks like the content was deleted.
     * The prototype did the copy in its inspector; it belongs in the reducer.
     */
    const s0 = start()
    const before = findPanel(template(s0).breakpoints.laptop.root, rootId(s0))!.elements
    const { panel } = asCarousel(s0)
    expect(panel.slides[0]!.elements.map((e) => e.type)).toEqual(before.map((e) => e.type))
  })

  test('gives the copied elements fresh ids, so editing one slide cannot change the panel', () => {
    const s0 = start()
    const before = findPanel(template(s0).breakpoints.laptop.root, rootId(s0))!.elements
    const { panel } = asCarousel(s0)
    const copied = panel.slides[0]!.elements.map((e) => e.id)
    expect(copied.filter((id) => before.some((e) => e.id === id))).toEqual([])
  })

  test('does not overwrite slide one if it already has content', () => {
    const s0 = start()
    const first = asCarousel(s0)
    const back = run(first.state, { type: 'updatePanel', patch: { type: 'single' } })
    const again = asCarousel(back)
    expect(again.panel.slides[0]!.elements).toHaveLength(first.panel.slides[0]!.elements.length)
  })

  test('adds an element to the slide being edited, not to the panel', () => {
    const s0 = start()
    const { state, panel } = asCarousel(s0)
    const s = run(
      state,
      { type: 'setSlideCursor', panelId: panel.id, slide: 1 },
      { type: 'addElement', elementType: 'link' },
    )
    const after = findPanel(template(s).breakpoints.laptop.root, panel.id)!
    expect(after.slides[1]!.elements.at(-1)?.type).toBe('link')
    expect(after.slides[0]!.elements.some((e) => e.type === 'link')).toBe(false)
  })

  test('reports the slide being edited as the active host', () => {
    const s0 = start()
    const { state, panel } = asCarousel(s0)
    const s = editorReducer(state, { type: 'setSlideCursor', panelId: panel.id, slide: 1 })
    expect(activeHost(s)?.id).toBe(panel.slides[1]!.id)
  })

  test('adds and removes slides, keeping at least one', () => {
    const s0 = start()
    const { state, panel } = asCarousel(s0)
    const added = editorReducer(state, { type: 'addSlide', panelId: panel.id })
    expect(findPanel(template(added).breakpoints.laptop.root, panel.id)!.slides).toHaveLength(3)

    let pruned = added
    for (let i = 0; i < 5; i++) {
      pruned = editorReducer(pruned, { type: 'removeSlide', panelId: panel.id, slide: 0 })
    }
    expect(findPanel(template(pruned).breakpoints.laptop.root, panel.id)!.slides).toHaveLength(1)
  })

  test('pulls the slide cursor back when its slide is removed', () => {
    const s0 = start()
    const { state, panel } = asCarousel(s0)
    const s = run(
      state,
      { type: 'setSlideCursor', panelId: panel.id, slide: 1 },
      { type: 'removeSlide', panelId: panel.id, slide: 1 },
    )
    expect(s.slideCursors[panel.id] ?? 0).toBe(0)
  })

  test('the slide cursor is editor state and never reaches the saved document', () => {
    const s0 = start()
    const { state, panel } = asCarousel(s0)
    const s = editorReducer(state, { type: 'setSlideCursor', panelId: panel.id, slide: 1 })
    expect(JSON.stringify(template(s))).not.toContain('slideCursors')
    const stored = findPanel(template(s).breakpoints.laptop.root, panel.id)! as unknown as Record<
      string,
      unknown
    >
    expect(stored.slide).toBeUndefined()
    // Moving the cursor is not an edit, so it must not be undoable.
    expect(canUndo(s.history)).toBe(canUndo(state.history))
  })
})

describe('breakpoint settings', () => {
  test('updates height, gutter, and frame colour on the current breakpoint only', () => {
    const s = run(start(), { type: 'updateBreakpoint', patch: { gutter: 24, designHeight: 600 } })
    expect(template(s).breakpoints.laptop.gutter).toBe(24)
    expect(template(s).breakpoints.laptop.designHeight).toBe(600)
    expect(template(s).breakpoints.mobile.gutter).toBe(0)
  })

  test('copying a breakpoint replaces the target and switches to it', () => {
    const s0 = start()
    const split = editorReducer(s0, { type: 'splitPanel', panelId: rootId(s0), dir: 'cols' })
    const withGutter = editorReducer(split, { type: 'updateBreakpoint', patch: { gutter: 12 } })
    const s = editorReducer(withGutter, { type: 'copyBreakpoint', from: 'laptop', to: 'mobile' })

    expect(countPanels(template(s).breakpoints.mobile.root)).toBe(2)
    expect(template(s).breakpoints.mobile.gutter).toBe(12)
    expect(s.breakpoint).toBe('mobile')
    expect(s.selection.kind).toBe('template')
  })

  test('a copied layout shares no ids with its source, so selection cannot cross over', () => {
    const s0 = start()
    const s = editorReducer(s0, { type: 'copyBreakpoint', from: 'laptop', to: 'mobile' })
    const source = listPanels(template(s).breakpoints.laptop.root).map((p) => p.id)
    const copy = listPanels(template(s).breakpoints.mobile.root).map((p) => p.id)
    expect(copy.filter((id) => source.includes(id))).toEqual([])
  })
})

describe('the design width override', () => {
  test('a width that differs from the device default is stored per breakpoint', () => {
    const s0 = start()
    const s = editorReducer(s0, { type: 'setDesignWidth', breakpoint: 'laptop', width: 1000 })
    expect(template(s).designWidths).toEqual({ laptop: 1000 })
    // Untouched breakpoints do not gain an entry - same object, not just an
    // equal one.
    expect(template(s).breakpoints.mobile).toBe(template(s0).breakpoints.mobile)
  })

  test('a width equal to the device default is not stored at all', () => {
    const s = editorReducer(start(), { type: 'setDesignWidth', breakpoint: 'laptop', width: 1280 })
    expect(template(s).designWidths).toBeUndefined()
  })

  test('a null width clears an existing override', () => {
    const withOverride = editorReducer(start(), {
      type: 'setDesignWidth',
      breakpoint: 'laptop',
      width: 1000,
    })
    const cleared = editorReducer(withOverride, {
      type: 'setDesignWidth',
      breakpoint: 'laptop',
      width: null,
    })
    expect(template(cleared).designWidths).toBeUndefined()
  })

  test('clearing one breakpoint leaves another override in place', () => {
    const both = run(
      start(),
      { type: 'setDesignWidth', breakpoint: 'laptop', width: 1000 },
      { type: 'setDesignWidth', breakpoint: 'mobile', width: 320 },
    )
    const laptopCleared = editorReducer(both, {
      type: 'setDesignWidth',
      breakpoint: 'laptop',
      width: null,
    })
    expect(template(laptopCleared).designWidths).toEqual({ mobile: 320 })
  })

  test('is undoable, like every other document edit', () => {
    const s0 = start()
    const s1 = editorReducer(s0, { type: 'setDesignWidth', breakpoint: 'laptop', width: 1000 })
    expect(canUndo(s1.history)).toBe(true)
    const undone = editorReducer(s1, { type: 'undo' })
    expect(template(undone).designWidths?.laptop).toBeUndefined()
  })

  /*
   * The reducer clamps because nothing before it does. `min` and `max` on the
   * inspector's number field are HTML validation attributes: they mark the
   * field invalid and let the keystroke through. So the editor stored whatever
   * was typed, while the renderer it embeds normalises on every render - and
   * the canvas measures the un-normalised document, so at `5` it drew a 5px
   * frame around a banner rendering itself at 320.
   */
  test('clamps a width below the range instead of storing what was typed', () => {
    const s = editorReducer(start(), { type: 'setDesignWidth', breakpoint: 'laptop', width: 5 })
    expect(template(s).designWidths).toEqual({ laptop: DESIGN_WIDTH_RANGE.min })
  })

  test('clamps a width above the range', () => {
    const s = editorReducer(start(), { type: 'setDesignWidth', breakpoint: 'laptop', width: 99_999 })
    expect(template(s).designWidths).toEqual({ laptop: DESIGN_WIDTH_RANGE.max })
  })

  test('rounds a fractional width, since a design width is whole pixels', () => {
    const s = editorReducer(start(), { type: 'setDesignWidth', breakpoint: 'laptop', width: 1000.4 })
    expect(template(s).designWidths).toEqual({ laptop: 1000 })
  })

  test('leaves the document alone when handed a width that is not a number', () => {
    const s0 = start()
    const s = editorReducer(s0, { type: 'setDesignWidth', breakpoint: 'laptop', width: Number.NaN })
    expect(template(s)).toBe(template(s0))
  })

  test.each([5, 99_999, 1000.4])(
    'stores for %s exactly what normalizeTemplate would, so canvas and renderer agree',
    (width) => {
      // The divergence this closes: the canvas reads the raw document and the
      // embedded renderer reads a normalised copy, so any width the two clamp
      // differently is a frame drawn at one size around a banner drawn at
      // another.
      const stored = template(editorReducer(start(), { type: 'setDesignWidth', breakpoint: 'laptop', width }))
      expect(normalizeTemplate(stored).designWidths).toEqual(stored.designWidths)
    },
  )
})

describe('undo and redo', () => {
  test('one edit is one undo step', () => {
    const s0 = start()
    const s = editorReducer(s0, { type: 'splitPanel', panelId: rootId(s0), dir: 'cols' })
    expect(countPanels(template(s).breakpoints.laptop.root)).toBe(2)
    const back = editorReducer(s, { type: 'undo' })
    expect(countPanels(template(back).breakpoints.laptop.root)).toBe(1)
    expect(countPanels(template(editorReducer(back, { type: 'redo' })).breakpoints.laptop.root)).toBe(2)
  })

  test('a whole drag gesture collapses into one undo step', () => {
    /*
     * The reason the reducer distinguishes transient actions at all. Sixty
     * mousemove frames must not become sixty presses of undo.
     */
    const s0 = start()
    const split = editorReducer(s0, { type: 'splitPanel', panelId: rootId(s0), dir: 'cols' })
    const splitId = template(split).breakpoints.laptop.root.id

    let dragging = split
    for (const ratio of [0.5, 0.52, 0.58, 0.61, 0.67]) {
      dragging = editorReducer(dragging, { type: 'setSplitRatio', splitId, ratio, transient: true })
    }
    const committed = editorReducer(dragging, { type: 'commit' })

    const ratioOf = (state: EditorState) => {
      const root = template(state).breakpoints.laptop.root
      if (root.kind !== 'split') throw new Error('expected a split at the root')
      return root.ratio
    }

    expect(ratioOf(committed)).toBeCloseTo(0.67, 5)
    // One press of undo returns to where the drag started, not past the split.
    expect(ratioOf(editorReducer(committed, { type: 'undo' }))).toBe(0.5)
  })

  test('a drag that changes nothing adds no undo step', () => {
    const s0 = start()
    const split = editorReducer(s0, { type: 'splitPanel', panelId: rootId(s0), dir: 'cols' })
    const splitId = template(split).breakpoints.laptop.root.id
    const nudged = editorReducer(split, { type: 'setSplitRatio', splitId, ratio: 0.5, transient: true })
    const committed = editorReducer(nudged, { type: 'commit' })
    expect(committed.history.past).toHaveLength(split.history.past.length)
  })

  test('selection is untouched by undo, so the inspector does not jump about', () => {
    const s0 = start()
    const id = rootId(s0)
    const s = run(
      s0,
      { type: 'selectPanel', panelId: id },
      { type: 'updatePanel', patch: { pad: 10 } },
      { type: 'undo' },
    )
    expect(s.selection).toEqual({ kind: 'panel', panelId: id })
  })

  test('an import replaces the document as a single undoable step', () => {
    const replacement = createDefaultTemplate({ name: 'Imported', id: ids() })
    const s = editorReducer(start(), { type: 'replaceTemplate', template: replacement })
    expect(template(s).name).toBe('Imported')
    expect(canUndo(s.history)).toBe(true)
    expect(template(editorReducer(s, { type: 'undo' })).name).toBe('Untitled banner')
  })

  test('repairs an imported document rather than trusting it', () => {
    const s = editorReducer(start(), { type: 'replaceTemplate', template: 'rubbish' as never })
    expect(template(s).breakpoints.laptop.root).toBeTruthy()
  })
})

describe('view', () => {
  test('switches to preview and back', () => {
    const s = editorReducer(start(), { type: 'setView', view: 'preview' })
    expect(s.view).toBe('preview')
    expect(editorReducer(s, { type: 'setView', view: 'edit' }).view).toBe('edit')
  })

  test('entering preview is not an undoable edit', () => {
    const s = editorReducer(start(), { type: 'setView', view: 'preview' })
    expect(canUndo(s.history)).toBe(false)
    expect(canRedo(s.history)).toBe(false)
  })
})

describe('free element placement', () => {
  test('sets a position and clamps it inside the panel', () => {
    const s0 = start()
    const id = rootId(s0)
    const heading = findPanel(template(s0).breakpoints.laptop.root, id)!.elements.find(
      (e) => e.type === 'heading',
    )!
    const s = run(
      s0,
      { type: 'selectElement', panelId: id, elementId: heading.id },
      { type: 'setElementPosition', pos: { x: 150, y: -10 }, transient: true },
      { type: 'commit' },
    )
    const after = selectedElement(s)
    expect(after && 'pos' in after && after.pos).toEqual({ x: 96, y: 0 })
  })

  test('returning an element to the stack drops its position entirely', () => {
    const s0 = start()
    const id = rootId(s0)
    const heading = findPanel(template(s0).breakpoints.laptop.root, id)!.elements.find(
      (e) => e.type === 'heading',
    )!
    const s = run(
      s0,
      { type: 'selectElement', panelId: id, elementId: heading.id },
      { type: 'setElementPosition', pos: { x: 10, y: 10 } },
      { type: 'setElementPosition', pos: null },
    )
    const after = selectedElement(s)!
    // Removed, not zeroed: the document should not carry a meaningless coordinate.
    expect('pos' in after).toBe(false)
  })
})
