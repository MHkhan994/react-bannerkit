import { describe, expect, test } from 'vitest'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  replacePresent,
  undo,
} from './history'

describe('createHistory', () => {
  test('starts with nothing to undo or redo', () => {
    const h = createHistory('a')
    expect(h.present).toBe('a')
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})

describe('push', () => {
  test('makes the new value present and the old one undoable', () => {
    const h = push(createHistory('a'), 'b')
    expect(h.present).toBe('b')
    expect(canUndo(h)).toBe(true)
  })

  test('ignores a push of the identical value, so no-op edits do not fill history', () => {
    const h = createHistory('a')
    expect(push(h, 'a')).toBe(h)
  })

  test('discards the redo future, because history is a line and not a tree', () => {
    const h = redo(undo(push(push(createHistory('a'), 'b'), 'c')))
    expect(h.present).toBe('c')
    const branched = push(undo(h), 'd')
    expect(branched.present).toBe('d')
    expect(canRedo(branched)).toBe(false)
  })

  test('forgets the oldest entries past the limit rather than growing without bound', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    // The oldest survivor is bounded, but undo still works all the way back.
    let back = h
    while (canUndo(back)) back = undo(back)
    expect(back.present).toBe(20)
  })
})

describe('undo and redo', () => {
  test('step back and forward through the same values', () => {
    const h = push(push(createHistory('a'), 'b'), 'c')
    const once = undo(h)
    expect(once.present).toBe('b')
    const twice = undo(once)
    expect(twice.present).toBe('a')
    expect(canUndo(twice)).toBe(false)
    expect(redo(redo(twice)).present).toBe('c')
  })

  test('are no-ops at the ends, so the keyboard shortcut is always safe to press', () => {
    const h = createHistory('a')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})

describe('replacePresent', () => {
  /*
   * This is what makes dragging usable. A divider drag fires a mousemove every
   * frame; pushing each one would mean sixty presses of undo to get back to
   * where you started. Instead every intermediate value replaces the present,
   * and only the final mouseup pushes.
   */
  test('changes the present without adding an undo step', () => {
    const h = push(createHistory('a'), 'b')
    const dragging = replacePresent(replacePresent(h, 'b1'), 'b2')
    expect(dragging.present).toBe('b2')
    expect(dragging.past).toEqual(h.past)
    expect(undo(dragging).present).toBe('a')
  })

  test('a drag that ends where it started leaves one undo step, not none', () => {
    // The push at mouseup is what records the gesture; the previews never do.
    const start = createHistory('a')
    const preview = replacePresent(start, 'a-dragging')
    const committed = push(preview, 'b')
    expect(canUndo(committed)).toBe(true)
    expect(undo(committed).present).toBe('a-dragging')
  })
})
