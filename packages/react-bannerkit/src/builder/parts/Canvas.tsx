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
import { useState, type Ref } from 'react'
import { createPortal } from 'react-dom'

import { computeLayout, insetStyle, resolveFrameHeight, type LayoutDivider } from '../../core/layout'
import { findNode } from '../../core/tree'
import { DEVICES, designWidthOf, type BannerPanel, type BreakpointName } from '../../core/types'
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
  /*
   * The scroll container, handed back so it can be measured.
   *
   * It has to be this element and not the wrapper around it: only this one
   * scrolls, so only this one's content box loses width when a vertical
   * scrollbar appears in it. Measuring the wrapper kept reporting the
   * pre-scrollbar width, and the frame was then drawn ~15px wider than the box
   * it had to fit in - a horizontal scrollbar under every banner tall enough to
   * scroll.
   */
  scrollRef?: Ref<HTMLDivElement> | undefined
}

/*
 * A divider's geometry, including the two custom properties that size its grab
 * area. `CSSProperties` has no room for custom properties, so the type is
 * widened here rather than with a cast at the call site - React passes anything
 * beginning with `--` straight through to the style attribute.
 */
type DividerStyle = React.CSSProperties & {
  '--bnb-divider-grab': string
  '--bnb-divider-line': string
}

function dividerStyle(divider: LayoutDivider, grab: number, scale: number): DividerStyle {
  const offset = `calc(${divider.pos}% - ${grab / 2}px)`
  return {
    '--bnb-divider-grab': `${grab}px`,
    // Keeps the drawn line one real pixel however far the frame is scaled down.
    '--bnb-divider-line': `${1 / scale}px`,
    ...(divider.axis === 'y'
      ? { left: `${divider.rect.x}%`, width: `${divider.rect.w}%`, top: offset }
      : { top: `${divider.rect.y}%`, height: `${divider.rect.h}%`, left: offset }),
  }
}

/** Design width, the banner's resolved frame height, and the scale needed to fit. */
function frameMetrics(state: EditorState, available: number) {
  const device = DEVICES[state.breakpoint]
  const bp = currentBreakpoint(state)
  const width = designWidthOf(template(state), state.breakpoint)
  const height = resolveFrameHeight(bp, state.breakpoint)
  // Never scale up: a 390px mobile frame is shown at its real size.
  const scale = Math.min(1, available > 0 ? available / width : 1)
  return { device, width, height, scale }
}

export function Canvas({ state, dispatch, available, scrollRef }: CanvasProps) {
  /*
   * The rendered `.bnbr-frame`, held in state rather than a ref so that the
   * chrome can be rendered into it as soon as it exists.
   *
   * All the editing geometry below - the selection outlines, the split tools,
   * the divider handles and the ratio a divider drag computes - is expressed as
   * percentages of the frame the panels divide. The box the canvas sizes below
   * is `designWidth x resolveFrameHeight(...)`, which is that frame only in
   * `ratio` mode: under `fit` and `cover` renderer.css takes `.bnbr-frame` out
   * of flow and centres it inside that box at the scaled design size, so the
   * design is letterboxed within it or cropped beyond it. Chrome drawn against
   * the outer box was then annotating a rectangle nothing was rendered into -
   * measured at 79px above the panels and 159px too tall on a 1280x420 design
   * fitted into an 800px frame - and a divider drag derived its ratio from the
   * same wrong rectangle.
   *
   * So the chrome is not positioned by re-deriving what the CSS decided; it is
   * portaled into the element the CSS decided about. That also fixes a quieter
   * bug: `insetStyle` emits the gutter as `calc(var(--bnbr-u) * n)`, and
   * `--bnbr-u` is declared on `.bnbr-frame`. Outside it the variable does not
   * resolve, which made every `left`/`top`/`width`/`height` on the panel chrome
   * invalid at computed-value time - so with any non-zero gutter the outlines
   * were not merely offset, they were unpositioned.
   */
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const { device, width, height, scale } = frameMetrics(state, available)
  const bp = currentBreakpoint(state)
  const { leaves, dividers } = computeLayout(bp.root)

  const onDividerDown = useDividerDrag(frame, dispatch, scale)
  const onElementDown = useElementDrag(dispatch)

  /*
   * Which panel the pointer is over, so its split controls can be revealed.
   *
   * Read from the event's target rather than from a `:hover` on the chrome
   * overlay: the overlay is `pointer-events: none` now, and such an element
   * never matches `:hover`, so the old `group-hover` could not work. Hover is
   * the one place a DOM lookup is safe - it is decoration, and the worst a miss
   * can do is leave the toolbar hidden until the panel is selected.
   */
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null)

  const selectedPanelId = state.selection.kind !== 'template' ? state.selection.panelId : null
  const selectedElementId =
    state.selection.kind === 'element' ? state.selection.elementId : null

  /*
   * The design's own shape, not the resolved frame - in `fit`/`cover` those
   * differ, and the frame box below (sized `width x height`, i.e.
   * `designWidth x resolveFrameHeight(...)`) is what shows the letterboxing or
   * cropping that difference produces. Labelling it with the resolved height
   * too would just repeat what the box already shows.
   */
  const label = `${device.label} · ${width}px × ${bp.designHeight}px`

  return (
    <div
      ref={scrollRef}
      className="bnb-canvas"
      onPointerDown={() => dispatch({ type: 'selectTemplate' })}
    >
      <div className="bnb-canvas-inner">
        <p className="mb-2 text-[11.5px] text-muted-foreground">{label}</p>

        {/*
          The scaled frame is wrapped in a box sized to the *scaled* dimensions,
          so the surrounding layout reserves the right amount of space. Without
          it the wrapper keeps the unscaled size and leaves a large gap.
        */}
        <div style={{ width: width * scale, height: height * scale }}>
          <div
            className="relative"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            onPointerMove={(event) => {
              const node = event.target as HTMLElement | null
              const panel = node?.closest?.('[data-bnb-panel]')
              setHoveredPanelId(panel?.getAttribute('data-bnb-panel') ?? null)
            }}
            onPointerLeave={() => setHoveredPanelId(null)}
          >
            <BannerRenderer
              template={template(state)}
              breakpoint={state.breakpoint}
              // The one box every overlay below is a percentage of.
              frameRef={setFrame}
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
              onPanelPointerDown={(panelId, event) => {
                // Stops the canvas ground below from clearing the selection.
                event.stopPropagation()
                dispatch({ type: 'selectPanel', panelId })
              }}
            />

            {/*
              Editing chrome, above the banner and inside the frame it annotates.

              Rendered into `.bnbr-frame` through a portal - see the note on
              `frame` above for why the frame rather than the box around it. The
              portal keeps this markup where it reads best, next to the state it
              is derived from, while the DOM puts it where the geometry is right;
              React events still bubble along the component tree, so the hover
              handler on the box above continues to see presses from in here.

              The container is inert to the pointer for the same reason its
              children are: it spans the whole frame, so anything it caught was
              a press meant for the banner. Only the things that are genuinely
              interactive - the split tools, the slide dots, the dividers - opt
              back in.
            */}
            {frame === null
              ? null
              : createPortal(
                  <div className="bnb-chrome pointer-events-none">
                    {leaves.map(({ panel, rect }, index) => (
                      <PanelChrome
                        key={panel.id}
                        panel={panel}
                        index={index}
                        state={state}
                        dispatch={dispatch}
                        style={insetStyle(rect, bp.gutter)}
                        selected={panel.id === selectedPanelId}
                        hovered={panel.id === hoveredPanelId}
                        selectedElementId={selectedElementId}
                        onElementPointerDown={onElementDown}
                        scale={scale}
                      />
                    ))}

                    {dividers.map((divider) => {
                      const split = findNode(bp.root, divider.splitId)
                      const ratio = split?.kind === 'split' ? split.ratio : 0.5
                      const vertical = divider.axis === 'y'
                      /*
                       * The grab area is counter-scaled, exactly as the split
                       * tools are. A fixed 6px handle inside a frame drawn at a
                       * third of device size is barely two pixels on screen -
                       * too fine to hit on purpose, which reads as the divider
                       * not being draggable at all. This keeps it ~10 real
                       * pixels at any zoom.
                       */
                      const grab = 10 / scale
                      return (
                        <div
                          key={divider.splitId}
                          className="pointer-events-auto bnb-divider"
                          data-axis={divider.axis}
                          role="separator"
                          aria-orientation={vertical ? 'horizontal' : 'vertical'}
                          aria-label="Resize panels"
                          tabIndex={0}
                          style={dividerStyle(divider, grab, scale)}
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
                  </div>,
                  frame,
                )}
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
  hovered: boolean
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
  hovered,
  selectedElementId,
  onElementPointerDown,
  scale,
}: PanelChromeProps) {
  const host = panel.type === 'carousel' ? panel.slides[slideCursorOf(state, panel)] : panel
  const elements = host?.elements ?? []
  const canDelete = computeLayout(currentBreakpoint(state).root).leaves.length > 1

  return (
    /*
      Decoration only, and deliberately inert to the pointer.

      This overlay covers the whole panel. While it accepted pointer events it
      was the target of every press inside that panel, so the elements drawn
      underneath never received one: clicking an element selected its panel, and
      dragging an element could not start at all. Selecting a panel now happens
      on the rendered panel itself; the controls below opt back in individually.

      It keeps `tabIndex` and its key handler: focus and clicks are independent,
      so the panel stays reachable and operable from the keyboard.
    */
    <div
      data-panel-id={panel.id}
      className={cn('bnb-selectable group pointer-events-none absolute', selected && 'z-10')}
      data-selected={selected}
      data-hovered={hovered}
      style={style}
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
        data-bnb-tools
        className={cn(
          'pointer-events-auto absolute right-1 top-1 z-30 flex gap-1 opacity-0 transition-opacity',
          'focus-within:opacity-100',
          (selected || hovered) && 'opacity-100',
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

      {/*
        Slide dots for a carousel, so the slide being edited can be changed.

        Anchored to the top even though the bottom would read more naturally:
        `.bnbr-dots` - the carousel's real pagination, which the visitor clicks -
        sits at the bottom centre of this same panel, and the two used to overlap
        into one smeared cluster of dots at two different sizes. The content owns
        the bottom of the panel; editor furniture lives in the top band with the
        split tools.
      */}
      {panel.type === 'carousel' && panel.slides.length > 1 ? (
        <div
          className="pointer-events-auto absolute top-1 left-1/2 z-30 flex gap-1"
          // Counter-scaled so the targets stay usable on a shrunken frame, and
          // grown downward from the top edge rather than outward from its middle.
          style={{
            transform: `translateX(-50%) scale(${1 / scale})`,
            transformOrigin: 'top center',
          }}
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
