import { describe, expect, test } from 'vitest'
import { createPanel } from './defaults'
import { createSequentialIdFactory } from './ids'
import {
  cloneNode,
  countPanels,
  findParentSplit,
  findPanel,
  listPanels,
  removePanel,
  setSplitRatio,
  splitPanel,
  updatePanel,
} from './tree'
import type { BannerNode, BannerSplit } from './types'

function asSplit(node: BannerNode): BannerSplit {
  if (node.kind !== 'split') throw new Error('expected a split')
  return node
}

/** A single leaf panel, the state every new template starts in. */
function oneLeaf() {
  const id = createSequentialIdFactory('p')
  return { root: createPanel(id), id }
}

/** A root split into two columns, so parent/sibling behaviour can be exercised. */
function twoPanels() {
  const { root: leaf, id } = oneLeaf()
  const result = splitPanel(leaf, leaf.id, 'cols', id)
  if (!result) throw new Error('split failed')
  return { root: result.root, added: result.panel, original: leaf, id }
}

describe('countPanels', () => {
  test('a lone leaf counts as one panel', () => {
    expect(countPanels(oneLeaf().root)).toBe(1)
  })

  test('counts leaves, not splits', () => {
    expect(countPanels(twoPanels().root)).toBe(2)
  })
})

describe('splitPanel', () => {
  test('replaces the panel with a split holding the original and a new panel', () => {
    const { root, original, added } = twoPanels()
    const split = asSplit(root)
    expect(split.dir).toBe('cols')
    expect(split.ratio).toBe(0.5)
    expect(split.a.id).toBe(original.id)
    expect(split.b.id).toBe(added.id)
  })

  test('leaves the original tree untouched, so history can hold on to it', () => {
    const { root: leaf, id } = oneLeaf()
    const before = structuredClone(leaf)
    splitPanel(leaf, leaf.id, 'rows', id)
    expect(leaf).toEqual(before)
  })

  test('the new panel is empty, so the user starts from a clean surface', () => {
    expect(twoPanels().added.elements).toEqual([])
  })

  test('splits a nested panel and keeps the total count correct', () => {
    const { root, added, id } = twoPanels()
    const result = splitPanel(root, added.id, 'rows', id)
    if (!result) throw new Error('split failed')
    expect(countPanels(result.root)).toBe(3)
    expect(asSplit(asSplit(result.root).b).dir).toBe('rows')
  })

  test('shares untouched subtrees by reference rather than deep copying', () => {
    const { root, original, added, id } = twoPanels()
    const result = splitPanel(root, added.id, 'cols', id)
    if (!result) throw new Error('split failed')
    // The `a` branch was not on the path to the change, so it must be the very
    // same object: structural sharing keeps history cheap.
    expect(asSplit(result.root).a).toBe(asSplit(root).a)
    expect(asSplit(result.root).a.id).toBe(original.id)
  })

  test('returns null for an unknown panel id', () => {
    const { root, id } = oneLeaf()
    expect(splitPanel(root, 'nope', 'cols', id)).toBeNull()
  })
})

describe('removePanel', () => {
  test('replaces the parent split with the surviving sibling', () => {
    const { root, original, added } = twoPanels()
    const next = removePanel(root, added.id)
    expect(next.kind).toBe('panel')
    expect(next.id).toBe(original.id)
    expect(countPanels(next)).toBe(1)
  })

  test('refuses to remove the last panel, because a banner needs at least one', () => {
    const { root } = oneLeaf()
    expect(removePanel(root, root.id)).toBe(root)
  })

  test('removes a deeply nested panel and promotes its sibling', () => {
    const { root, added, id } = twoPanels()
    const result = splitPanel(root, added.id, 'rows', id)
    if (!result) throw new Error('split failed')
    const next = removePanel(result.root, result.panel.id)
    expect(countPanels(next)).toBe(2)
    expect(listPanels(next).map((p) => p.id)).toEqual(listPanels(root).map((p) => p.id))
  })

  test('leaves the tree alone for an unknown id', () => {
    const { root } = twoPanels()
    expect(removePanel(root, 'nope')).toBe(root)
  })

  test('does not mutate the tree it was given', () => {
    const { root, added } = twoPanels()
    const before = structuredClone(root)
    removePanel(root, added.id)
    expect(root).toEqual(before)
  })
})

describe('cloneNode', () => {
  test('gives every node, slide, and element a fresh id', () => {
    const { root, id } = twoPanels()
    const copy = cloneNode(root, id)
    const ids = (node: BannerNode): string[] =>
      node.kind === 'split'
        ? [node.id, ...ids(node.a), ...ids(node.b)]
        : [
            node.id,
            ...node.elements.map((e) => e.id),
            ...node.slides.flatMap((s) => [s.id, ...s.elements.map((e) => e.id)]),
          ]
    const before = ids(root)
    const after = ids(copy)
    expect(after).toHaveLength(before.length)
    expect(after.filter((x) => before.includes(x))).toEqual([])
    expect(new Set(after).size).toBe(after.length)
  })

  test('preserves structure and values, changing only identity', () => {
    const { root, id } = twoPanels()
    const copy = cloneNode(root, id)
    const strip = (node: BannerNode): unknown =>
      node.kind === 'split'
        ? { kind: 'split', dir: node.dir, ratio: node.ratio, a: strip(node.a), b: strip(node.b) }
        : { kind: 'panel', pad: node.pad, bg: node.bg, elements: node.elements.length }
    expect(strip(copy)).toEqual(strip(root))
  })

  test('is a deep copy, so editing the copy cannot reach the original', () => {
    const { root, id } = oneLeaf()
    const copy = cloneNode(root, id)
    if (copy.kind === 'split') throw new Error('expected a panel')
    copy.slides[0]!.bg = '#ff0000'
    expect(root.slides[0]!.bg).not.toBe('#ff0000')
  })
})

describe('setSplitRatio', () => {
  test('sets the ratio of the addressed split', () => {
    const { root } = twoPanels()
    expect(asSplit(setSplitRatio(root, root.id, 0.42)).ratio).toBe(0.42)
  })

  test('clamps to 0.15 so a panel can never be dragged away to nothing', () => {
    const { root } = twoPanels()
    expect(asSplit(setSplitRatio(root, root.id, -3)).ratio).toBe(0.15)
    expect(asSplit(setSplitRatio(root, root.id, 0.85001)).ratio).toBe(0.85)
  })

  test('does not mutate the tree it was given', () => {
    const { root } = twoPanels()
    setSplitRatio(root, root.id, 0.3)
    expect(asSplit(root).ratio).toBe(0.5)
  })

  test('returns the same tree when the ratio would not change', () => {
    /*
     * Identity matters, not just equality. A divider drag dispatches on every
     * mousemove; if an unchanged ratio still allocated a new tree, the editor
     * would record an undo step for a drag that moved nothing, and React would
     * re-render the canvas for no reason.
     */
    const { root } = twoPanels()
    expect(setSplitRatio(root, root.id, 0.5)).toBe(root)
    // Clamping counts too: a ratio outside the range that lands on the current
    // value is still no change.
    const clamped = setSplitRatio(root, root.id, 0.85)
    expect(setSplitRatio(clamped, clamped.id, 0.99)).toBe(clamped)
  })

  test('returns the same tree for an unknown split id', () => {
    const { root } = twoPanels()
    expect(setSplitRatio(root, 'nope', 0.3)).toBe(root)
  })
})

describe('findPanel and findParentSplit', () => {
  test('finds a nested panel by id', () => {
    const { root, added } = twoPanels()
    expect(findPanel(root, added.id)?.id).toBe(added.id)
  })

  test('returns null when the id is not a panel in this tree', () => {
    expect(findPanel(twoPanels().root, 'nope')).toBeNull()
  })

  test('the root has no parent split', () => {
    const { root } = oneLeaf()
    expect(findParentSplit(root, root.id)).toBeNull()
  })

  test('finds the split that owns a panel', () => {
    const { root, added } = twoPanels()
    expect(findParentSplit(root, added.id)?.id).toBe(root.id)
  })
})

describe('updatePanel', () => {
  test('applies a patch to one panel and leaves its siblings alone', () => {
    const { root, added, original } = twoPanels()
    const next = updatePanel(root, added.id, { pad: 7 })
    expect(findPanel(next, added.id)?.pad).toBe(7)
    expect(findPanel(next, original.id)?.pad).toBe(original.pad)
  })

  test('does not mutate the tree it was given', () => {
    const { root, added } = twoPanels()
    const before = structuredClone(root)
    updatePanel(root, added.id, { pad: 99 })
    expect(root).toEqual(before)
  })
})
