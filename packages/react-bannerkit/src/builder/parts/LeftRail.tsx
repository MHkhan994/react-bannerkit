/*
 * The left rail: what to add, the banner frame, the layer tree, and copying a
 * layout to another screen.
 *
 * Section order and copy follow the design handoff, which was iterated with the
 * user.
 */
import { useState } from 'react'

import { computeLayout } from '../../core/layout'
import { countPanels, listPanels } from '../../core/tree'
import {
  BREAKPOINT_ORDER,
  DEVICES,
  type BannerElement,
  type BannerElementType,
  type BreakpointName,
} from '../../core/types'
import {
  currentBreakpoint,
  slideCursorOf,
  type EditorAction,
  type EditorState,
} from '../state/reducer'
import { Button, Dialog, SectionLabel, Separator, Swatches, cn } from '../ui/primitives'
import { DEFAULT_SWATCHES } from '../../core/defaults'

const TOOLBOX: readonly { type: BannerElementType; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'button', label: 'Button' },
  { type: 'link', label: 'Link' },
  { type: 'image', label: 'Image' },
  { type: 'overlay', label: 'Overlay' },
  { type: 'spacer', label: 'Spacer' },
  { type: 'icon', label: 'Icon' },
]

/** A short preview of an element, for the layer rows. */
function describe(element: BannerElement): string {
  const detail =
    'text' in element
      ? element.text
      : element.type === 'icon'
        ? element.glyph
        : element.type === 'image'
          ? (element.alt || 'image')
          : ''
  const trimmed = detail.length > 18 ? `${detail.slice(0, 18)}…` : detail
  const free = 'pos' in element && element.pos ? ' ·free' : ''
  return `${element.type}${trimmed ? `: ${trimmed}` : ''}${free}`
}

interface RailProps {
  state: EditorState
  dispatch: (action: EditorAction) => void
}

export function LeftRail({ state, dispatch }: RailProps) {
  const [copyTarget, setCopyTarget] = useState<BreakpointName | null>(null)
  const bp = currentBreakpoint(state)
  const panels = listPanels(bp.root)
  const selectedPanelId = state.selection.kind === 'template' ? null : state.selection.panelId
  const hasPanel = selectedPanelId !== null
  const selectedElementId = state.selection.kind === 'element' ? state.selection.elementId : null

  const others = BREAKPOINT_ORDER.filter((name) => name !== state.breakpoint)

  return (
    <div className="bnb-rail flex flex-col gap-6 border-r border-border px-4 py-3">
      {/* ---- add to selected panel ---- */}
      <section>
        <SectionLabel>Add to selected panel</SectionLabel>
        <div className="grid grid-cols-2 gap-1">
          {TOOLBOX.map((entry) => (
            <Button
              key={entry.type}
              variant="secondary"
              size="sm"
              disabled={!hasPanel}
              onClick={() => dispatch({ type: 'addElement', elementType: entry.type })}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        {!hasPanel ? (
          <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
            Select a panel on the canvas first.
          </p>
        ) : null}
      </section>

      {/* ---- banner frame ---- */}
      <section>
        <SectionLabel>Banner frame</SectionLabel>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[11px] text-foreground">Space between panels</span>
              <span className="text-[11px] text-muted-foreground">{bp.gutter}px</span>
            </div>
            <input
              type="range"
              className="bnb-range w-full"
              aria-label="Space between panels"
              min={0}
              max={48}
              step={1}
              value={bp.gutter}
              onChange={(event) =>
                dispatch({
                  type: 'updateBreakpoint',
                  patch: { gutter: Number.parseFloat(event.target.value) },
                  // A slider sweep is one gesture; the reducer collapses it.
                })
              }
            />
          </div>
          <div>
            <span className="mb-1 block text-[11px] text-foreground">Colour behind panels</span>
            <Swatches
              label="Colour behind panels"
              value={bp.bg}
              swatches={DEFAULT_SWATCHES}
              allowTransparent
              onChange={(value) => dispatch({ type: 'updateBreakpoint', patch: { bg: value } })}
            />
          </div>
        </div>
      </section>

      {/* ---- layers ---- */}
      <section>
        <SectionLabel>Layers</SectionLabel>
        <div className="flex flex-col">
          <LayerRow
            label="Template settings"
            active={state.selection.kind === 'template'}
            onSelect={() => dispatch({ type: 'selectTemplate' })}
          />

          {panels.map((panel, index) => {
            const slide = slideCursorOf(state, panel)
            const host = panel.type === 'carousel' ? panel.slides[slide] : panel
            const isSelected = panel.id === selectedPanelId
            return (
              <div key={panel.id}>
                <LayerRow
                  label={
                    panel.type === 'carousel'
                      ? `Panel ${index + 1} · carousel, slide ${slide + 1}`
                      : `Panel ${index + 1}`
                  }
                  active={isSelected && state.selection.kind === 'panel'}
                  onSelect={() => dispatch({ type: 'selectPanel', panelId: panel.id })}
                  onDelete={
                    countPanels(bp.root) > 1
                      ? () => dispatch({ type: 'removePanel', panelId: panel.id })
                      : undefined
                  }
                />

                {panel.type === 'carousel'
                  ? panel.slides.map((s, slideIndex) => (
                      <LayerRow
                        key={s.id}
                        indent={1}
                        label={`▸ Slide ${slideIndex + 1} · ${s.elements.length} items${
                          s.href ? ' · linked' : ''
                        }${slideIndex === slide ? ' · editing' : ''}`}
                        active={isSelected && slideIndex === slide}
                        onSelect={() =>
                          dispatch({ type: 'setSlideCursor', panelId: panel.id, slide: slideIndex })
                        }
                        onDelete={
                          panel.slides.length > 1
                            ? () =>
                                dispatch({
                                  type: 'removeSlide',
                                  panelId: panel.id,
                                  slide: slideIndex,
                                })
                            : undefined
                        }
                      />
                    ))
                  : null}

                {isSelected
                  ? (host?.elements ?? []).map((element) => (
                      <LayerRow
                        key={element.id}
                        indent={panel.type === 'carousel' ? 2 : 1}
                        label={`— ${describe(element)}`}
                        active={element.id === selectedElementId}
                        onSelect={() =>
                          dispatch({
                            type: 'selectElement',
                            panelId: panel.id,
                            elementId: element.id,
                          })
                        }
                        onDelete={() =>
                          dispatch({
                            type: 'removeElement',
                            panelId: panel.id,
                            elementId: element.id,
                          })
                        }
                      />
                    ))
                  : null}
              </div>
            )
          })}

          {selectedPanelId && state.selection.kind !== 'template' ? (
            <AddSlideRow state={state} dispatch={dispatch} panelId={selectedPanelId} />
          ) : null}
        </div>
      </section>

      {/* ---- this breakpoint ---- */}
      <section>
        <SectionLabel>This breakpoint</SectionLabel>
        <p className="mb-2 text-[11px] leading-[1.5] text-muted-foreground">
          Each screen keeps its own layout, sizing, and spacing. Copying replaces everything on the
          target screen.
        </p>
        <div className="flex flex-col gap-1">
          {others.map((name) => (
            <Button key={name} variant="secondary" size="sm" onClick={() => setCopyTarget(name)}>
              Copy to {DEVICES[name].label}
            </Button>
          ))}
        </div>
      </section>

      <Dialog
        open={copyTarget !== null}
        onClose={() => setCopyTarget(null)}
        title={
          copyTarget
            ? `Copy ${DEVICES[state.breakpoint].label} to ${DEVICES[copyTarget].label}?`
            : ''
        }
        description={
          copyTarget
            ? `This replaces everything currently on ${DEVICES[copyTarget].label} with the ${
                DEVICES[state.breakpoint].label
              } layout — ${countPanels(bp.root)} ${
                countPanels(bp.root) === 1 ? 'panel' : 'panels'
              }, their content and the banner height. You can undo it.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCopyTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (copyTarget) {
                  dispatch({ type: 'copyBreakpoint', from: state.breakpoint, to: copyTarget })
                }
                setCopyTarget(null)
              }}
            >
              Copy layout
            </Button>
          </>
        }
      />
    </div>
  )
}

function AddSlideRow({
  state,
  dispatch,
  panelId,
}: RailProps & { panelId: string }) {
  const panel = listPanels(currentBreakpoint(state).root).find((p) => p.id === panelId)
  if (!panel || panel.type !== 'carousel') return null
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-1 justify-start"
      onClick={() => dispatch({ type: 'addSlide', panelId })}
    >
      + Add slide
    </Button>
  )
}

function LayerRow({
  label,
  active,
  indent = 0,
  onSelect,
  onDelete,
}: {
  label: string
  active: boolean
  indent?: number
  onSelect: () => void
  onDelete?: (() => void) | undefined
}) {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'min-w-0 flex-1 truncate rounded-[var(--bnb-radius)] px-1.5 py-1 text-left text-[11.5px] transition-colors',
          active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
        style={indent ? { paddingLeft: 6 + indent * 10 } : undefined}
      >
        {label}
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${label}`}
          className="shrink-0 px-1 text-[11px] text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
