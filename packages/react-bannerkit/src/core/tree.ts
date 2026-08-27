/*
 * Immutable operations on the banner layout tree.
 *
 * Every function here returns a new tree and never touches the one it is given.
 * That is not stylistic: the editor keeps an undo history of past trees, and a
 * single in-place mutation would silently corrupt every entry pointing at the
 * same objects. The prototype mutated nodes and called forceUpdate, which is
 * exactly why it could not support undo.
 *
 * Untouched subtrees are shared by reference (path copying), so a change deep in
 * a tree allocates one object per level of depth rather than a full deep copy.
 */
import { createPanel } from './defaults'
import { makeId, type IdFactory } from './ids'
import type {
  BannerElement,
  BannerNode,
  BannerPanel,
  BannerPosition,
  BannerSplit,
  SplitDirection,
} from './types'

/** A split can never be dragged past these bounds, so no panel collapses to nothing. */
export const MIN_RATIO = 0.15
export const MAX_RATIO = 0.85

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
}

/*
 * Rebuilds the path to `targetId` and applies `fn` there.
 * Returns null when the id is absent from this subtree, which lets callers
 * return the original root by reference and keeps a no-op genuinely free.
 */
function mapNode(
  node: BannerNode,
  targetId: string,
  fn: (found: BannerNode) => BannerNode,
): BannerNode | null {
  if (node.id === targetId) return fn(node)
  if (node.kind !== 'split') return null
  /*
   * When `fn` decides nothing needs to change it returns the node it was given.
   * Passing that identity back up the chain - rather than rebuilding each
   * ancestor around an unchanged child - is what lets callers detect a genuine
   * no-op by reference, and keeps React from re-rendering branches that did not
   * move.
   */
  const a = mapNode(node.a, targetId, fn)
  if (a) return a === node.a ? node : { ...node, a }
  const b = mapNode(node.b, targetId, fn)
  if (b) return b === node.b ? node : { ...node, b }
  return null
}

export function countPanels(node: BannerNode): number {
  return node.kind === 'split' ? countPanels(node.a) + countPanels(node.b) : 1
}

/** Every leaf panel, left-to-right and top-to-bottom, which is the order the Layers rail shows. */
export function listPanels(node: BannerNode): BannerPanel[] {
  if (node.kind !== 'split') return [node]
  return [...listPanels(node.a), ...listPanels(node.b)]
}

export function findPanel(root: BannerNode, panelId: string): BannerPanel | null {
  if (root.kind !== 'split') return root.id === panelId ? root : null
  return findPanel(root.a, panelId) ?? findPanel(root.b, panelId)
}

export function findNode(root: BannerNode, nodeId: string): BannerNode | null {
  if (root.id === nodeId) return root
  if (root.kind !== 'split') return null
  return findNode(root.a, nodeId) ?? findNode(root.b, nodeId)
}

/** The split that directly owns `nodeId`, or null when it is the root. */
export function findParentSplit(root: BannerNode, nodeId: string): BannerSplit | null {
  if (root.kind !== 'split') return null
  if (root.a.id === nodeId || root.b.id === nodeId) return root
  return findParentSplit(root.a, nodeId) ?? findParentSplit(root.b, nodeId)
}

export interface SplitResult {
  root: BannerNode
  /** The freshly created panel, so the caller can select it. */
  panel: BannerPanel
}

/*
 * Replaces `panelId` with a split whose `a` is the original panel and whose `b`
 * is a new empty one. Returns null if the panel is not in this tree, so the
 * caller can tell "nothing to do" apart from "here is your new tree".
 */
export function splitPanel(
  root: BannerNode,
  panelId: string,
  dir: SplitDirection,
  id: IdFactory = makeId,
): SplitResult | null {
  const target = findPanel(root, panelId)
  if (!target) return null

  // A fresh panel reads as empty space rather than a copy of its neighbour.
  const panel = createPanel(id, { background: '#eae9e9' })
  const split: BannerSplit = { id: id(), kind: 'split', dir, ratio: 0.5, a: target, b: panel }

  const next = mapNode(root, panelId, () => split)
  return next ? { root: next, panel } : null
}

/*
 * Removes a panel by replacing its parent split with the surviving sibling.
 * A banner always keeps at least one panel, so removing the root leaf is a
 * no-op and returns the same tree by reference.
 */
export function removePanel(root: BannerNode, panelId: string): BannerNode {
  if (root.kind !== 'split') return root

  const promoteSibling = (node: BannerNode): BannerNode | null => {
    if (node.kind !== 'split') return null
    if (node.a.kind === 'panel' && node.a.id === panelId) return node.b
    if (node.b.kind === 'panel' && node.b.id === panelId) return node.a
    const a = promoteSibling(node.a)
    if (a) return { ...node, a }
    const b = promoteSibling(node.b)
    if (b) return { ...node, b }
    return null
  }

  return promoteSibling(root) ?? root
}

function cloneElement(el: BannerElement, id: IdFactory): BannerElement {
  // The spread is uniform across the union, but TypeScript cannot narrow a
  // spread of a discriminated union back to the union, hence the assertion.
  const copy = { ...el, id: id() } as BannerElement
  const pos = (copy as { pos?: BannerPosition }).pos
  if (pos) (copy as { pos: BannerPosition }).pos = { ...pos }
  return copy
}

/*
 * A deep copy with fresh ids throughout. Used by "copy this breakpoint to
 * another screen": ids must not be shared across breakpoints, or selecting a
 * panel on mobile would highlight one on laptop.
 */
export function cloneNode(node: BannerNode, id: IdFactory = makeId): BannerNode {
  if (node.kind === 'split') {
    return { ...node, id: id(), a: cloneNode(node.a, id), b: cloneNode(node.b, id) }
  }
  return {
    ...node,
    id: id(),
    elements: node.elements.map((el) => cloneElement(el, id)),
    slides: node.slides.map((slide) => ({
      ...slide,
      id: id(),
      elements: slide.elements.map((el) => cloneElement(el, id)),
    })),
  }
}

/*
 * Identity is preserved when the ratio would not change. A divider drag
 * dispatches on every mousemove, so allocating a new tree for an unchanged value
 * would record an undo step for a drag that moved nothing and re-render the
 * canvas for no reason.
 */
export function setSplitRatio(root: BannerNode, splitId: string, ratio: number): BannerNode {
  const clamped = clampRatio(ratio)
  const next = mapNode(root, splitId, (node) => {
    if (node.kind !== 'split' || node.ratio === clamped) return node
    return { ...node, ratio: clamped }
  })
  return next ?? root
}

/** Fields a patch may not touch: identity and the leaf/split discriminant. */
export type PanelPatch = Partial<Omit<BannerPanel, 'id' | 'kind'>>

export function updatePanel(root: BannerNode, panelId: string, patch: PanelPatch): BannerNode {
  const next = mapNode(root, panelId, (node) =>
    node.kind === 'panel' ? { ...node, ...patch } : node,
  )
  return next ?? root
}

/** Replaces one panel wholesale, for edits too structural to express as a patch. */
export function replacePanel(root: BannerNode, panelId: string, panel: BannerPanel): BannerNode {
  const next = mapNode(root, panelId, (node) => (node.kind === 'panel' ? panel : node))
  return next ?? root
}
