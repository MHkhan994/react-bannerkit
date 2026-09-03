/*
 * The top bar: where you are, which screen you are editing, how tall the banner
 * is, and the way out to preview and save.
 */
import { BREAKPOINT_ORDER, DEVICES } from '../../core/types'
import {
  canRedo,
  canUndo,
} from '../state/history'
import {
  currentBreakpoint,
  template,
  type EditorAction,
  type EditorState,
} from '../state/reducer'
import { Button, Input, Segmented, cn } from '../ui/primitives'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export interface TopBarProps {
  state: EditorState
  dispatch: (action: EditorAction) => void
  dirty: boolean
  saveState: SaveState
  saveError: string | null
  onSave?: (() => void) | undefined
  onOpenJson: () => void
}

export function TopBar({
  state,
  dispatch,
  dirty,
  saveState,
  saveError,
  onSave,
  onOpenJson,
}: TopBarProps) {
  const bp = currentBreakpoint(state)

  return (
    <header className="col-span-3 flex h-11 items-center gap-3 border-b border-border bg-surface px-3">
      <h1 className="min-w-0 max-w-[22ch] truncate text-[15px] font-semibold text-foreground">
        {template(state).name}
      </h1>

      <Segmented
        label="Screen"
        value={state.breakpoint}
        options={BREAKPOINT_ORDER.map((name) => ({ value: name, label: DEVICES[name].label }))}
        onChange={(breakpoint) => dispatch({ type: 'setBreakpoint', breakpoint })}
      />

      <div className="flex items-center gap-1.5">
        <span className="bnb-label">Size</span>
        <Segmented
          label="Size mode"
          value={bp.sizeMode}
          options={[
            { value: 'ratio', label: 'Ratio' },
            { value: 'fit', label: 'Fit' },
            { value: 'cover', label: 'Cover' },
          ]}
          onChange={(mode) =>
            dispatch({
              type: 'updateBreakpoint',
              patch: { sizeMode: mode as 'ratio' | 'fit' | 'cover' },
            })
          }
        />
        <Input
          type="number"
          className="w-[70px]"
          aria-label={bp.sizeMode === 'ratio' ? 'Design height in pixels' : 'Frame height'}
          value={bp.sizeMode === 'ratio' ? bp.designHeight : bp.frameHeight}
          min={bp.sizeMode !== 'ratio' && bp.frameHeightUnit === 'vh' ? 10 : 120}
          max={bp.sizeMode !== 'ratio' && bp.frameHeightUnit === 'vh' ? 100 : 4000}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value)
            if (!Number.isFinite(parsed)) return
            dispatch({
              type: 'updateBreakpoint',
              patch: bp.sizeMode === 'ratio' ? { designHeight: parsed } : { frameHeight: parsed },
            })
          }}
        />
        <span className="text-[11px] text-muted-foreground">
          {bp.sizeMode !== 'ratio' && bp.frameHeightUnit === 'vh' ? '% of screen' : 'px'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canUndo(state.history)}
          title="Undo (Ctrl+Z)"
          onClick={() => dispatch({ type: 'undo' })}
        >
          Undo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRedo(state.history)}
          title="Redo (Ctrl+Shift+Z)"
          onClick={() => dispatch({ type: 'redo' })}
        >
          Redo
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenJson}>
          JSON
        </Button>

        <Button
          variant="secondary"
          onClick={() =>
            dispatch({ type: 'setView', view: state.view === 'preview' ? 'edit' : 'preview' })
          }
        >
          {state.view === 'preview' ? 'Back to editor' : 'Preview'}
        </Button>

        {onSave ? (
          <Button onClick={onSave} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </Button>
        ) : null}

        {/*
          Announced rather than only coloured, so a save failure is not something
          only sighted users find out about.
        */}
        <span
          role="status"
          aria-live="polite"
          className={cn(
            'text-[11px]',
            saveState === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {saveState === 'error' ? (saveError ?? 'Save failed') : saveState === 'saved' ? 'Saved' : ''}
        </span>
      </div>
    </header>
  )
}
