/*
 * The canvas: the banner at device size, scaled to fit, with editing chrome.
 *
 * The banner itself is drawn by `<BannerRenderer>` - the very component
 * consumers ship - with `inert` set so links do not navigate. Everything this
 * file adds sits on top as absolutely positioned overlays: selection outlines,
 * split tools, divider handles, and the hit targets that make elements
 * draggable. Nothing here changes how the banner renders, which is what keeps
 * the editor honest: if the canvas and the live page ever disagree, it is a bug
 * in one component rather than a difference between two implementations.
 */
import { useRef } from 'react'

import { computeLayout, insetStyle, resolveHeight } from '../../core/layout'
import { findNode } from '../../core/tree'
import { DEVICES, type BannerPanel, type BreakpointName } from '../../core/types'
import { BannerRenderer } from '../../renderer/BannerRenderer'
import {
  currentBreakpoint,
  slideCursorOf,
  template,
  type EditorAction,
  type EditorState,
} from '../state/reducer'
import { Button, cn } from '../ui/primitives'
import { useDividerDrag, useElementDrag } from '../useDrag'

interface CanvasProps {
  state: EditorState
  dispatch: (action: EditorAction) => void
  /** Available width in px, used to fit the frame. */
  available: number
}

/** Device width, the banner's resolved height, and the scale needed to fit. */
function frameMetrics(state: EditorState, available: number) {
  const device = DEVICES[state.breakpoint]
  const bp = currentBreakpoint(state)
  const height = resolveHeight(bp, state.breakpoint)
  // Never scale up: a 390px mobile frame is shown at its real size.
  const scale = Math.min(1, available > 0 ? available / device.width : 1)
  return { device, height, scale }
}

export function Canvas({ state, dispatch, available }: CanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const { device, height, scale } = frameMetrics(state, available)
  const bp = currentBreakpoint(state)
  const { leaves, dividers } = computeLayout(bp.root)

  const onDividerDown = useDividerDrag(frameRef, dispatch, scale)
  const onElementDown = useElementDrag(dispatch)

  const selectedPanelId = state.selection.kind !== 'template' ? state.selection.panelId : null
  const selectedElementId =
    state.selection.kind === 'element' ? state.selection.elementId : null

  const label = `${device.label} · ${device.width}px × ${height}px${
    bp.heightMode === 'vh' ? ` · ${bp.vh}% of screen` : ''
  }`

  return (
    <div className="bnb-canvas" onPointerDown={() => dispatch({ type: 'selectTemplate' })}>
      <div className="bnb-canvas-inner">
        <p className="mb-2 text-[11.5px] text-muted-foreground">{label}</p>

        {/*
          The scaled frame is wrapped in a box sized to the *scaled* dimensions,
          so the surrounding layout reserves the right amount of space. Without
          it the wrapper keeps the unscaled size and leaves a large gap.
        */}
        <div style={{ width: device.width * scale, height: height * scale }}>
          <div
            ref={frameRef}
            className="relative"
            style={{
              width: device.width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <BannerRenderer
              template={template(state)}
              breakpoint={state.breakpoint}
              // Links must not navigate away from the editor.
              inert
              label={`${template(state).name} preview`}
              /*
               * Selection and dragging attach to the real elements rather than to
               * invisible boxes placed over them. An element still in the stack is
               * positioned by flex, so the editor does not know where it is - and
               * a hit box could only be placed over an element that had already
               * been dragged free, which is exactly backwards.
               */
              selectedElementId={selectedElementId ?? undefined}
              onElementPointerDown={(element, panelId, event) =>
                onElementDown(event, panelId, element.id)
              }
            />

            {/* Editing chrome, above the banner. */}
            <div className="absolute inset-0">
              {leaves.map(({ panel, rect }, index) => (
                <PanelChrome
                  key={panel.id}
                  panel={panel}
                  index={index}
                  state={state}
                  dispatch={dispatch}
                  style={insetStyle(rect, bp.gutter)}
                  selected={panel.id === selectedPanelId}
                  selectedElementId={selectedElementId}
                  onElementPointerDown={onElementDown}
                  scale={scale}
                />
              ))}

              {dividers.map((divider) => {
                const split = findNode(bp.root, divider.splitId)
                const ratio = split?.kind === 'split' ? split.ratio : 0.5
                const vertical = divider.axis === 'y'
                return (
                  <div
                    key={divider.splitId}
                    className="bnb-divider"
                    data-axis={divider.axis}
                    role="separator"
                    aria-orientation={vertical ? 'horizontal' : 'vertical'}
                    aria-label="Resize panels"
                    tabIndex={0}
                    style={
                      vertical
                        ? {
                            left: `${divider.rect.x}%`,
                            width: `${divider.rect.w}%`,
                            top: `calc(${divider.pos}% - 3px)`,
                          }
                        : {
                            top: `${divider.rect.y}%`,
                            height: `${divider.rect.h}%`,
                            left: `calc(${divider.pos}% - 3px)`,
                          }
                    }
                    onPointerDown={(event) => onDividerDown(event, divider, ratio)}
                    onKeyDown={(event) => {
                      // Keyboard resizing, since a drag is unavailable.
                      const step = event.shiftKey ? 0.05 : 0.01
                      const back = vertical ? 'ArrowUp' : 'ArrowLeft'
                      const forward = vertical ? 'ArrowDown' : 'ArrowRight'
                      if (event.key !== back && event.key !== forward) return
                      event.preventDefault()
                      dispatch({
                        type: 'setSplitRatio',
                        splitId: divider.splitId,
                        ratio: ratio + (event.key === forward ? step : -step),
                      })
                    }}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <p className="mt-3 max-w-[46ch] text-[11.5px] leading-[1.6] text-muted-foreground">
          Hover a panel for split controls. Drag a divider to resize, or drag an element to place it
          freely.
        </p>
      </div>
    </div>
  )
}

interface PanelChromeProps {
  panel: BannerPanel
  index: number
  state: EditorState
  dispatch: (action: EditorAction) => void
  style: React.CSSProperties
  selected: boolean
  selectedElementId: string | null
  onElementPointerDown: (event: React.PointerEvent, panelId: string, elementId: string) => void
  scale: number
}

function PanelChrome({
  panel,
  index,
  state,
  dispatch,
  style,
  selected,
  selectedElementId,
  onElementPointerDown,
  scale,
}: PanelChromeProps) {
  const host = panel.type === 'carousel' ? panel.slides[slideCursorOf(state, panel)] : panel
  const elements = host?.elements ?? []
  const canDelete = computeLayout(currentBreakpoint(state).root).leaves.length > 1

  return (
    <div
      data-panel-id={panel.id}
      className={cn('bnb-selectable group absolute', selected && 'z-10')}
      data-selected={selected}
      style={style}
      onPointerDown={(event) => {
        event.stopPropagation()
        dispatch({ type: 'selectPanel', panelId: panel.id })
      }}
      role="button"
      tabIndex={0}
      aria-label={`Panel ${index + 1}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          dispatch({ type: 'selectPanel', panelId: panel.id })
        }
      }}
    >
      {/*
        Split tools, revealed on hover or when the panel is selected. Sized in
        inverse proportion to the canvas scale so they stay legible and clickable
        on a frame that has been shrunk to fit.
      */}
      <div
        className={cn(
          'absolute right-1 top-1 z-30 flex gap-1 opacity-0 transition-opacity',
          'group-hover:opacity-100 focus-within:opacity-100',
          selected && 'opacity-100',
        )}
        style={{ transform: `scale(${1 / scale})`, transformOrigin: 'top right' }}
      >
        <Button
          size="icon"
          variant="secondary"
          title="Split into columns"
          aria-label={`Split panel ${index + 1} into columns`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => dispatch({ type: 'splitPanel', panelId: panel.id, dir: 'cols' })}
        >
          <SplitIcon direction="cols" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          title="Split into rows"
          aria-label={`Split panel ${index + 1} into rows`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => dispatch({ type: 'splitPanel', panelId: panel.id, dir: 'rows' })}
        >
          <SplitIcon direction="rows" />
        </Button>
        {canDelete ? (
          <Button
            size="icon"
            variant="destructive"
            title="Delete panel"
            aria-label={`Delete panel ${index + 1}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => dispatch({ type: 'removePanel', panelId: panel.id })}
          >
            <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </Button>
        ) : null}
      </div>

      {/* Slide dots for a carousel, so the slide being edited can be changed. */}
      {panel.type === 'carousel' && panel.slides.length > 1 ? (
        <div
          className="absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 gap-1"
          style={{ transform: `translateX(-50%) scale(${1 / scale})` }}
        >
          {panel.slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Edit slide ${slideIndex + 1}`}
              aria-pressed={slideCursorOf(state, panel) === slideIndex}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                dispatch({ type: 'setSlideCursor', panelId: panel.id, slide: slideIndex })
              }
              className={cn(
                'h-2 w-2 rounded-full border border-background',
                slideCursorOf(state, panel) === slideIndex ? 'bg-ring' : 'bg-background/60',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SplitIcon({ direction }: { direction: 'cols' | 'rows' }) {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      {direction === 'cols' ? <path d="M12 3v18" /> : <path d="M3 12h18" />}
    </svg>
  )
}
