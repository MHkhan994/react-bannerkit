/*
 * Turning the layout tree into geometry.
 *
 * The tree is walked with a {x, y, w, h} rect expressed in percentages of the
 * banner frame, so leaves can be absolutely positioned and the whole banner
 * scales with its container without any measurement in JavaScript. That is what
 * lets the renderer work server-side with no layout effect.
 */
import { DEVICES, type BannerBreakpoint, type BannerNode, type BannerPanel, type BreakpointName, type Rect } from './types'

/** A banner shorter than this is not a banner. Matches the inspector's minimum. */
export const MIN_BANNER_HEIGHT = 120

export interface LayoutLeaf {
  panel: BannerPanel
  rect: Rect
}

export interface LayoutDivider {
  splitId: string
  /** The rect of the split being divided, needed to convert a drag into a ratio. */
  rect: Rect
  /** Which axis the handle is dragged along: 'x' for a column split, 'y' for a row split. */
  axis: 'x' | 'y'
  /** Position of the boundary along that axis, as a percentage of the frame. */
  pos: number
}

export interface Layout {
  leaves: LayoutLeaf[]
  dividers: LayoutDivider[]
}

const FULL_FRAME: Rect = { x: 0, y: 0, w: 100, h: 100 }

/*
 * Leaves come back in tree order, which is left-to-right then top-to-bottom.
 * The Layers rail and the canvas therefore agree on panel numbering without
 * either having to sort.
 */
export function computeLayout(root: BannerNode): Layout {
  const leaves: LayoutLeaf[] = []
  const dividers: LayoutDivider[] = []

  const walk = (node: BannerNode, rect: Rect): void => {
    if (node.kind !== 'split') {
      leaves.push({ panel: node, rect })
      return
    }
    if (node.dir === 'rows') {
      const first = rect.h * node.ratio
      walk(node.a, { x: rect.x, y: rect.y, w: rect.w, h: first })
      walk(node.b, { x: rect.x, y: rect.y + first, w: rect.w, h: rect.h - first })
      dividers.push({ splitId: node.id, rect, axis: 'y', pos: rect.y + first })
      return
    }
    const first = rect.w * node.ratio
    walk(node.a, { x: rect.x, y: rect.y, w: first, h: rect.h })
    walk(node.b, { x: rect.x + first, y: rect.y, w: rect.w - first, h: rect.h })
    dividers.push({ splitId: node.id, rect, axis: 'x', pos: rect.x + first })
  }

  walk(root, FULL_FRAME)
  return { leaves, dividers }
}

export interface InsetStyle {
  left: string
  top: string
  width: string
  height: string
}

/*
 * Positions one leaf inside the frame, inset by half the gutter on every side.
 * Half on each side means two neighbours end up a full gutter apart, and the
 * outer edge of the banner is inset by half - which is what makes the frame
 * colour read as a mat rather than a stripe down one side.
 *
 * Percentages and pixels are mixed with calc() rather than resolved in JS,
 * because the frame is scaled by CSS transform and its real pixel width is not
 * known at render time.
 */
export function insetStyle(rect: Rect, gutter: number): InsetStyle {
  if (gutter <= 0) {
    return {
      left: `${rect.x}%`,
      top: `${rect.y}%`,
      width: `${rect.w}%`,
      height: `${rect.h}%`,
    }
  }
  const half = gutter / 2
  return {
    left: `calc(${rect.x}% + ${half}px)`,
    top: `calc(${rect.y}% + ${half}px)`,
    width: `calc(${rect.w}% - ${gutter}px)`,
    height: `calc(${rect.h}% - ${gutter}px)`,
  }
}

/*
 * The banner's height in px for a given device.
 *
 * Viewport mode resolves against a nominal screen height per device rather than
 * the real window, so the editor canvas can show a truthful preview of a
 * `50vh` banner while itself being only a few hundred pixels tall. The renderer
 * emits `Nvh` and lets the browser do this properly.
 */
export function resolveHeight(
  breakpoint: Omit<BannerBreakpoint, 'root'>,
  device: BreakpointName,
): number {
  const raw =
    breakpoint.heightMode === 'vh'
      ? Math.round((DEVICES[device].screenHeight * (breakpoint.vh || 100)) / 100)
      : breakpoint.height
  return Math.max(MIN_BANNER_HEIGHT, Math.round(raw))
}
