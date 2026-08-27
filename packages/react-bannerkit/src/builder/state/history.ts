/*
 * An undo stack.
 *
 * Deliberately generic and pure: it knows nothing about banners, so it can be
 * reasoned about and tested on its own. The editor stores the whole template as
 * the present value, which is only affordable because the tree operations share
 * structure - an edit deep in a tree allocates one object per level of depth
 * rather than a full copy, so fifty undo steps do not mean fifty deep clones.
 */

export interface History<T> {
  past: readonly T[]
  present: T
  future: readonly T[]
}

/**
 * How far back undo reaches. Fifty is generous for a session of banner editing
 * and bounds memory: without a limit, a long drag-heavy session would keep every
 * intermediate template alive forever.
 */
export const HISTORY_LIMIT = 50

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export const canUndo = <T,>(history: History<T>): boolean => history.past.length > 0
export const canRedo = <T,>(history: History<T>): boolean => history.future.length > 0

/** Records a new value as an undoable step. */
export function push<T>(history: History<T>, next: T): History<T> {
  // A no-op edit should not cost an undo press.
  if (next === history.present) return history
  const past = [...history.past, history.present]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    // Redo is discarded on a new edit: history is a line, not a tree.
    future: [],
  }
}

/*
 * Changes the present without recording a step.
 *
 * This is what makes dragging usable. A divider drag fires a mousemove every
 * frame; pushing each one would mean sixty presses of undo to get back. Drags
 * therefore replace the present as they move and push once on release, so the
 * whole gesture is a single undo step.
 */
export function replacePresent<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history
  return { ...history, present: next }
}

/*
 * Ends a gesture: records `base` - the value from before the gesture started -
 * as the undo target, keeping the current present.
 *
 * `push` cannot do this job. The gesture's intermediate frames already replaced
 * the present, so the pre-gesture value is no longer anywhere in the history;
 * pushing the present over itself is a no-op and undo would skip the whole
 * gesture and land on whatever came before it.
 */
export function commitGesture<T>(history: History<T>, base: T): History<T> {
  if (base === history.present) return history
  const past = [...history.past, base]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: history.present,
    future: [],
  }
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1)
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future
  if (next === undefined) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  }
}
