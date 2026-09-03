'use client'

/*
 * The editor.
 *
 *   import { BannerBuilder } from 'react-bannerkit/builder'
 *   import 'react-bannerkit/builder.css'
 *
 * Everything renders inside `.bnb-root`, which is what confines the package's
 * CSS to its own subtree and keeps the host page's CSS out. Nothing is portalled
 * to `document.body`, so that boundary has no holes.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { createDefaultTemplate } from '../core/defaults'
import { makeId, type IdFactory } from '../core/ids'
import { normalizeTemplate } from '../core/normalize'
import type { BannerTemplate } from '../core/types'
import { BannerRenderer } from '../renderer/BannerRenderer'
import { Canvas } from './parts/Canvas'
import { Inspector } from './parts/Inspector'
import { LeftRail } from './parts/LeftRail'
import { TopBar, type SaveState } from './parts/TopBar'
import { canRedo, canUndo } from './state/history'
import {
  createEditorState,
  editorReducer,
  selectedElement,
  template as templateOf,
} from './state/reducer'
import { Button, Dialog, Textarea } from './ui/primitives'

export interface BannerBuilderProps {
  /** The template to edit. Omitted, a default template is created. */
  template?: BannerTemplate
  /**
   * Fires after edits settle, on a trailing debounce, so dragging a slider does
   * not call the host sixty times a second.
   */
  onChange?: (template: BannerTemplate) => void
  /**
   * Fires when Save is pressed, never on a debounce. Return a promise and the
   * button shows progress and surfaces failures.
   */
  onSave?: (template: BannerTemplate) => void | Promise<void>
  /** Uploads a chosen file and resolves the URL to store. */
  onUploadImage?: (file: File) => Promise<string>
  theme?: 'light' | 'dark' | 'system'
  /** Milliseconds of quiet before `onChange` fires. */
  debounceMs?: number
  className?: string
  style?: CSSProperties
  /** Injected for deterministic ids in tests. */
  makeId?: IdFactory
}

export function BannerBuilder({
  template: incoming,
  onChange,
  onSave,
  onUploadImage,
  theme = 'light',
  debounceMs = 300,
  className,
  style,
  makeId: idFactory = makeId,
}: BannerBuilderProps) {
  const [state, dispatch] = useReducer(
    editorReducer,
    undefined,
    // Repaired on the way in: the template comes from the consumer's database and
    // may predate this build or have been hand-edited.
    () => createEditorState(incoming ?? createDefaultTemplate({ id: idFactory }), idFactory),
  )

  const doc = templateOf(state)

  /* ---- adopt a genuinely new template from the host ---- */

  const lastIncoming = useRef(incoming)
  useEffect(() => {
    if (incoming === lastIncoming.current) return
    lastIncoming.current = incoming
    if (incoming) dispatch({ type: 'replaceTemplate', template: incoming })
  }, [incoming])

  /* ---- change notification ---- */

  const [savedDoc, setSavedDoc] = useState(doc)
  const dirty = doc !== savedDoc

  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const firstRender = useRef(true)

  useEffect(() => {
    // Mounting is not a change; firing here would mark a pristine editor dirty.
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (!onChangeRef.current) return
    const timer = window.setTimeout(() => onChangeRef.current?.(doc), debounceMs)
    return () => window.clearTimeout(timer)
  }, [doc, debounceMs])

  /* ---- saving ---- */

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = useCallback(async () => {
    if (!onSave) return
    setSaveState('saving')
    setSaveError(null)
    try {
      await onSave(doc)
      setSavedDoc(doc)
      setSaveState('saved')
    } catch (cause) {
      setSaveState('error')
      setSaveError(cause instanceof Error ? cause.message : 'The save failed.')
    }
  }, [doc, onSave])

  /* ---- keyboard shortcuts ---- */

  const rootRef = useRef<HTMLDivElement>(null)

  // The listener reads the latest state through a ref rather than re-binding on
  // every keystroke's worth of state change.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        return
      }
      if (meta && event.key.toLowerCase() === 's' && onSave) {
        event.preventDefault()
        void save()
        return
      }
      if (event.key === 'Escape') {
        dispatch({ type: 'selectTemplate' })
        return
      }

      /*
       * Arrow keys nudge a freely placed element, with shift for a coarse move.
       * Dragging is the natural way to place one, but it cannot be the only way.
       * Typing in a field must still move the caret, so text inputs are excluded.
       */
      const NUDGES: Record<string, { x: number; y: number }> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      }
      const nudge = NUDGES[event.key]
      if (!nudge) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return
      }

      const element = selectedElement(stateRef.current)
      if (!element || !('pos' in element) || !element.pos) return

      event.preventDefault()
      const step = event.shiftKey ? 10 : 1
      dispatch({
        type: 'setElementPosition',
        elementId: element.id,
        pos: { x: element.pos.x + nudge.x * step, y: element.pos.y + nudge.y * step },
      })
    }

    /*
     * Bound to the editor rather than the document. A page-builder embedded in an
     * admin screen has no business swallowing that screen's Ctrl+Z or Ctrl+S.
     */
    node.addEventListener('keydown', onKeyDown)
    return () => node.removeEventListener('keydown', onKeyDown)
  }, [onSave, save])

  /* ---- canvas sizing ---- */

  const canvasRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)

  useLayoutEffect(() => {
    const node = canvasRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      /*
       * `contentRect` of the scroll container, not of the wrapper around it.
       * When a vertical scrollbar appears the scrollbar takes its width out of
       * this box while the wrapper stays as wide as it was, so measuring the
       * wrapper drew the frame ~15px wider than the space it had - a horizontal
       * scrollbar under every banner tall enough to scroll.
       *
       * The 64 is `.bnb-canvas-inner`'s 32px of padding on each side; this
       * element has none of its own.
       */
      if (entry) setAvailable(Math.max(0, entry.contentRect.width - 64))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /* ---- JSON import and export ---- */

  const [jsonOpen, setJsonOpen] = useState(false)

  const themeClass = useMemo(
    () => (theme === 'dark' ? 'bnb-dark' : theme === 'system' ? 'bnb-theme-system' : ''),
    [theme],
  )

  return (
    <div
      ref={rootRef}
      // The scope class is the isolation boundary; it is always present.
      className={`bnb-root ${themeClass}${className ? ` ${className}` : ''}`}
      style={{ height: '100%', ...style }}
      // Needed for the keydown listener to receive keys from the editor's chrome.
      tabIndex={-1}
    >
      <div className="bnb-shell">
        <TopBar
          state={state}
          dispatch={dispatch}
          dirty={dirty}
          saveState={saveState}
          saveError={saveError}
          onSave={onSave ? () => void save() : undefined}
          onOpenJson={() => setJsonOpen(true)}
        />

        {state.view === 'preview' ? (
          <div className="col-span-3 overflow-auto bg-neutral-900 p-8">
            <div className="mx-auto max-w-[1100px]">
              {/*
                Preview is the real renderer, not a second implementation. If the
                editor and a live page ever disagree, the bug is visible here
                while authoring rather than after publishing.
              */}
              <BannerRenderer template={doc} breakpoint={state.breakpoint} inert />
            </div>
          </div>
        ) : (
          <>
            <LeftRail state={state} dispatch={dispatch} />
            <div className="min-w-0">
              <Canvas
                state={state}
                dispatch={dispatch}
                available={available}
                scrollRef={canvasRef}
              />
            </div>
            <Inspector state={state} dispatch={dispatch} onUploadImage={onUploadImage} />
          </>
        )}
      </div>

      <JsonDialog
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        template={doc}
        onImport={(next) => dispatch({ type: 'replaceTemplate', template: next })}
      />
    </div>
  )
}

/*
 * Copy the document out, paste one in.
 *
 * Cheap to build and repeatedly useful: moving a template between environments,
 * filing a reproducible bug report, or hand-editing something the UI cannot yet
 * express.
 */
function JsonDialog({
  open,
  onClose,
  template,
  onImport,
}: {
  open: boolean
  onClose: () => void
  template: BannerTemplate
  onImport: (template: BannerTemplate) => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setDraft(JSON.stringify(template, null, 2))
      setError(null)
      setWarnings([])
    }
  }, [open, template])

  const apply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That is not valid JSON.')
      return
    }
    // Repaired rather than rejected, and anything changed is reported.
    const collected: string[] = []
    const repaired = normalizeTemplate(parsed, { onWarn: (message) => collected.push(message) })
    if (collected.length > 0) {
      setWarnings(collected)
      setError(null)
    }
    onImport(repaired)
    if (collected.length === 0) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Template JSON"
      description="Copy this to move the template elsewhere, or paste one in to replace it. An import is a single undo step."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={apply}>Replace template</Button>
        </>
      }
    >
      <Textarea
        value={draft}
        rows={16}
        spellCheck={false}
        className="font-mono text-[11px]"
        aria-label="Template JSON"
        onChange={(event) => setDraft(event.target.value)}
      />
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {warnings.length > 0 ? (
        <div className="text-[11px] text-muted-foreground">
          <p className="mb-1 text-foreground">Imported with repairs:</p>
          <ul className="flex flex-col gap-0.5">
            {warnings.slice(0, 6).map((warning) => (
              <li key={warning}>· {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  )
}
