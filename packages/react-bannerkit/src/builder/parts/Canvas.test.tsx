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
