/*
 * The two direct-manipulation gestures: resizing a divider and placing an
 * element freely.
 *
 * Both follow the same shape. Pointer events are captured on the window rather
 * than the element, so the drag survives the pointer leaving the target; every
 * move dispatches a `transient` action that replaces the present without
 * recording history; and release dispatches `commit`, making the whole gesture a
 * single undo step.
 *
 * Pointer events rather than mouse events, so a stylus and touch work too, and
 * `setPointerCapture` is avoided in favour of window listeners because the
 * element being dragged is re-rendered mid-gesture.
 */
import { useCallback } from 'react'

import type { LayoutDivider } from '../core/layout'
import type { EditorAction } from './state/reducer'

/** Movement required before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 3

type Dispatch = (action: EditorAction) => void

interface DragSession {
  moved: boolean
  cleanup: () => void
}

/*
 * Shared plumbing: listen on the window, ignore movement below the threshold,
 * and guarantee a single commit at the end.
 */
function beginDrag(
  event: React.PointerEvent,
  dispatch: Dispatch,
  onMove: (event: PointerEvent) => void,
): void {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()

  const start = { x: event.clientX, y: event.clientY }
  const session: DragSession = { moved: false, cleanup: () => {} }

  const move = (moveEvent: PointerEvent) => {
    if (
      !session.moved &&
      Math.abs(moveEvent.clientX - start.x) < DRAG_THRESHOLD &&
      Math.abs(moveEvent.clientY - start.y) < DRAG_THRESHOLD
    ) {
      return
    }
    session.moved = true
    onMove(moveEvent)
  }

  const end = () => {
    session.cleanup()
    // Only a gesture that actually moved something is worth an undo step.
    if (session.moved) dispatch({ type: 'commit' })
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end, { once: true })
  window.addEventListener('pointercancel', end, { once: true })
  session.cleanup = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
}

/**
 * Resizing a split.
 *
 * The frame's rect and the split's starting ratio are captured once, on press,
 * so the maths stays stable even as the tree re-renders underneath the gesture.
 */
export function useDividerDrag(
  frameRef: React.RefObject<HTMLElement | null>,
  dispatch: Dispatch,
  scale: number,
) {
  return useCallback(
    (event: React.PointerEvent, divider: LayoutDivider, ratio: number) => {
      const frame = frameRef.current
      if (!frame) return

      const box = frame.getBoundingClientRect()
      // The frame is drawn scaled; a pointer moves in screen pixels, so the span
      // has to be measured in the same space.
      const span =
        divider.axis === 'y' ? (box.height * divider.rect.h) / 100 : (box.width * divider.rect.w) / 100
      if (span <= 0) return

      const origin = divider.axis === 'y' ? event.clientY : event.clientX

      beginDrag(event, dispatch, (moveEvent) => {
        const position = divider.axis === 'y' ? moveEvent.clientY : moveEvent.clientX
        const delta = (position - origin) / span
        dispatch({
          type: 'setSplitRatio',
          splitId: divider.splitId,
          ratio: ratio + delta,
          transient: true,
        })
      })
    },
    [dispatch, frameRef, scale],
  )
}

/**
 * Placing an element freely inside its panel.
 *
 * The element's own rect is read synchronously on press. React nulls
 * `currentTarget` once the handler returns, so reading it later - inside the
 * move listener - yields null; this was a real bug in the prototype and the
 * reason the rect is captured up front rather than looked up on demand.
 */
export function useElementDrag(dispatch: Dispatch) {
  return useCallback(
    (event: React.PointerEvent, panelId: string, elementId: string) => {
      const node = event.currentTarget as HTMLElement | null

      /*
       * Select first, and unconditionally.
       *
       * Everything below depends on being able to measure the panel, and that
       * can legitimately fail - a panel with no size yet, a tree a media query
       * has hidden. While selection sat behind those guards, a press in that
       * state did nothing whatsoever: no drag, and no selection either.
       *
       * Stopping propagation is part of the same decision. The rendered panel
       * carries its own press handler, so without this the press would bubble
       * and immediately replace the element selection with the panel's.
       */
      event.stopPropagation()
      dispatch({ type: 'selectElement', panelId, elementId })

      /*
       * The rendered panel, not the editor's chrome overlay. The overlay is a
       * sibling of the banner rather than an ancestor of its elements, so looking
       * for it from here finds nothing.
       */
      const panel = node?.closest<HTMLElement>('[data-bnb-panel]')
      if (!node || !panel) return

      const panelBox = panel.getBoundingClientRect()
      const elementBox = node.getBoundingClientRect()
      if (panelBox.width <= 0 || panelBox.height <= 0) return

      // Where the element currently sits, as a percentage of the panel box. An
      // element still in the stack has no stored position, so this is where it
      // has been laid out to.
      const origin = {
        x: ((elementBox.left - panelBox.left) / panelBox.width) * 100,
        y: ((elementBox.top - panelBox.top) / panelBox.height) * 100,
      }
      const start = { x: event.clientX, y: event.clientY }

      beginDrag(event, dispatch, (moveEvent) => {
        dispatch({
          type: 'setElementPosition',
          elementId,
          pos: {
            x: origin.x + ((moveEvent.clientX - start.x) / panelBox.width) * 100,
            y: origin.y + ((moveEvent.clientY - start.y) / panelBox.height) * 100,
          },
          transient: true,
        })
      })
    },
    [dispatch],
  )
}
