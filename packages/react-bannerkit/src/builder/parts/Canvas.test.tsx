// @vitest-environment happy-dom
/*
 * Regression tests for canvas hit targets.
 *
 * The bug these exist for: the editing chrome is an absolutely positioned
 * overlay drawn on top of every panel, and it used to accept pointer events. It
 * therefore swallowed every press meant for the banner underneath, so clicking
 * an element selected its panel instead and dragging an element never began -
 * the element's own handler was never reached.
 *
 * happy-dom does no layout, so hit testing cannot be simulated here. What is
 * asserted instead is the wiring that hit testing depends on: the chrome opts
 * out of pointer events, its controls opt back in, and the renderer's own panel
 * and element nodes carry the handlers. The geometric half is covered by the
 * browser check in the CSS guard.
 */
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { createDefaultTemplate } from '../../core/defaults'
import { createEditorState, editorReducer, type EditorAction } from '../state/reducer'
import { Canvas } from './Canvas'

function setup() {
  const dispatch = vi.fn<(action: EditorAction) => void>()
  const state = createEditorState(createDefaultTemplate({ name: 'Test' }))
  const view = render(<Canvas state={state} dispatch={dispatch} available={1280} />)
  return { dispatch, state, view }
}

/**
 * Gives one element a definite box, since happy-dom does no layout and reports
 * every rect as zero. Only `width`/`height` matter to the divider maths.
 */
function stubRect(element: Element, width: number, height: number): void {
  element.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect
}

/*
 * Where the editing chrome is drawn, and what a divider drag measures.
 *
 * Both used to be the box the canvas sizes itself - `designWidth x
 * resolveFrameHeight(...)`. That is the frame the panels divide only in `ratio`
 * mode: under `fit` and `cover` renderer.css takes `.bnbr-frame` out of flow and
 * centres it inside that box at the scaled design size, so the design is
 * letterboxed within it or cropped beyond it, and the chrome annotated a
 * rectangle nothing was rendered into. Every migrated v1 `heightMode: 'vh'`
 * document arrives in `fit`, so it was the ordinary case rather than an edge.
 *
 * These are structural assertions, not geometric ones: happy-dom has no layout
 * engine, so what is checked is that there is only one box in play.
 */
describe('the editing chrome resolves against the frame the renderer laid out', () => {
  it('renders the chrome layer inside .bnbr-frame, not the box around it', () => {
    const { view } = setup()
    const chrome = view.container.querySelector('.bnb-chrome')
    expect(chrome, 'no .bnb-chrome layer rendered').not.toBeNull()
    expect(chrome!.parentElement?.classList.contains('bnbr-frame')).toBe(true)
  })

  it('puts the panel outlines and divider handles in that same frame', () => {
    let state = createEditorState(createDefaultTemplate({ name: 'Test' }))
    state = editorReducer(state, {
      type: 'splitPanel',
      panelId: state.history.present.breakpoints.laptop.root.id,
      dir: 'cols',
    })
    const view = render(<Canvas state={state} dispatch={vi.fn()} available={1280} />)

    const frame = view.container.querySelector('.bnbr-frame')
    expect(frame).not.toBeNull()
    // Nothing may be left outside: a percentage of the wrong box is wrong
    // whether or not its neighbours are right.
    expect(frame!.querySelectorAll('[data-panel-id]')).toHaveLength(2)
    expect(frame!.querySelectorAll('.bnb-divider')).toHaveLength(1)
    expect(view.container.querySelectorAll('.bnb-chrome')).toHaveLength(1)
  })

  it('derives a divider ratio from the frame box rather than the box around it', () => {
    /*
     * The half of this defect a structural check cannot see. `useDividerDrag`
     * read the wrapper, so the delta a pointer travelled was divided by the
     * wrong span: in `cover` the frame is wider than its wrapper, in `fit`
     * shorter, and either way the split jumped away from the pointer.
     *
     * The two boxes are stubbed to different widths so the arithmetic can only
     * come out right if the frame is the one measured.
     */
    const dispatch = vi.fn<(action: EditorAction) => void>()
    let state = createEditorState(createDefaultTemplate({ name: 'Test' }))
    state = editorReducer(state, {
      type: 'splitPanel',
      panelId: state.history.present.breakpoints.laptop.root.id,
      dir: 'cols',
    })
    const view = render(<Canvas state={state} dispatch={dispatch} available={1280} />)

    const frame = view.container.querySelector('.bnbr-frame')!
    const wrapper = view.container.querySelector('.bnbr-bp-fixed')!
    stubRect(frame, 400, 200)
    stubRect(wrapper, 1000, 500)

    const divider = view.container.querySelector('.bnb-divider')!
    fireEvent.pointerDown(divider, { button: 0, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 40, clientY: 0 })

    const resize = dispatch.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === 'setSplitRatio')
    expect(resize, 'the drag dispatched no setSplitRatio').toBeDefined()
    // 40px of travel across a 400px frame is a tenth of the split, on top of
    // the 0.5 a fresh split starts at. Against the 1000px wrapper it would be
    // 0.54.
    expect((resize as { ratio: number }).ratio).toBeCloseTo(0.6, 10)
  })
})

describe('canvas hit targets', () => {
  it('lets a press on an element select that element rather than its panel', () => {
    const { dispatch, view } = setup()
    const element = view.container.querySelector('[data-bnb-el][data-bnb-draggable]')
    expect(element).not.toBeNull()

    fireEvent.pointerDown(element!, { button: 0 })

    const kinds = dispatch.mock.calls.map(([action]) => action.type)
    expect(kinds).toContain('selectElement')
    expect(kinds).not.toContain('selectPanel')
  })

  it('lets a press on the panel body select the panel', () => {
    const { dispatch, view } = setup()
    const panel = view.container.querySelector('[data-bnb-panel]')
    expect(panel).not.toBeNull()

    fireEvent.pointerDown(panel!, { button: 0 })

    expect(dispatch.mock.calls.map(([action]) => action.type)).toContain('selectPanel')
  })

  it('does not let the chrome overlay take pointer events away from the banner', () => {
    const { view } = setup()
    const chrome = view.container.querySelector('[data-panel-id]')
    expect(chrome).not.toBeNull()
    // The overlay is decoration - outline, toolbar, slide dots - and must never
    // be the thing a press lands on.
    expect(chrome!.className).toContain('pointer-events-none')
  })

  it('keeps the split controls clickable inside that overlay', () => {
    const { view } = setup()
    const button = view.container.querySelector('[aria-label*="into columns"]')
    expect(button).not.toBeNull()
    const tools = button!.closest('[data-bnb-tools]')
    expect(tools).not.toBeNull()
    expect(tools!.className).toContain('pointer-events-auto')
  })

  it('selects the panel a split button belongs to, so the new panel is the split one', () => {
    // Guards the case that made splitting look broken: pressing a control in
    // panel 2's toolbar while panel 1 was selected used to split panel 1.
    const dispatch = vi.fn<(action: EditorAction) => void>()
    let state = createEditorState(createDefaultTemplate({ name: 'Test' }))
    state = editorReducer(state, {
      type: 'splitPanel',
      panelId: state.history.present.breakpoints.laptop.root.id,
      dir: 'cols',
    })
    const view = render(<Canvas state={state} dispatch={dispatch} available={1280} />)

    const buttons = view.container.querySelectorAll('[aria-label*="into rows"]')
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1]!)

    const split = dispatch.mock.calls.map(([a]) => a).find((a) => a.type === 'splitPanel')
    expect(split).toBeDefined()
    const panels = view.container.querySelectorAll('[data-panel-id]')
    expect((split as { panelId: string }).panelId).toBe(
      (panels[1] as HTMLElement).dataset.panelId,
    )
  })
})

/*
 * The editor's slide picker used to sit on top of the carousel's own pagination.
 *
 * Both were anchored to the bottom centre of the same panel: `.bnbr-dots` at
 * `bottom: calc(var(--bnbr-u) * 14)` in renderer.css, and this picker at
 * `bottom-1`. Measured in Chrome on a 4-slide carousel, the two boxes
 * overlapped - renderer dots at y 424.6 h 3.8, the picker at y 425.9 h 9 - so
 * the author saw one smeared cluster of eight dots at two different sizes and
 * could not tell which set did what.
 *
 * They are different things: the pagination is content the visitor will click,
 * the picker is editor furniture that chooses which slide is being edited. The
 * content owns the bottom of the panel, so the furniture moves to the top band
 * where the split tools already live.
 */
describe('the slide picker does not collide with the carousel pagination', () => {
  function carouselView() {
    let state = createEditorState(createDefaultTemplate({ name: 'Test' }))
    const panelId = state.history.present.breakpoints.laptop.root.id
    state = editorReducer(state, { type: 'selectPanel', panelId })
    state = editorReducer(state, { type: 'updatePanel', patch: { type: 'carousel' }, panelId })
    state = editorReducer(state, { type: 'addSlide', panelId })
    return render(<Canvas state={state} dispatch={vi.fn()} available={1280} />)
  }

  it('anchors the picker to the top of the panel, not the bottom', () => {
    const view = carouselView()
    const dot = view.container.querySelector('[aria-label="Edit slide 1"]')
    expect(dot, 'no slide picker rendered - the fixture built no carousel').not.toBeNull()
    const picker = dot!.parentElement!
    expect(picker.className).toMatch(/(^|\s)top-/)
    expect(picker.className, 'the bottom belongs to the renderer pagination').not.toMatch(
      /(^|\s)bottom-/,
    )
  })

  it('still renders the real pagination, which is what the visitor sees', () => {
    const view = carouselView()
    expect(view.container.querySelector('.bnbr-dots')).not.toBeNull()
  })
})
