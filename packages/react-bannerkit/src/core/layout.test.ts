import { describe, expect, test } from 'vitest'
import { createPanel } from './defaults'
import { createSequentialIdFactory } from './ids'
import { computeLayout, insetStyle, resolveFrameHeight } from './layout'
import { listPanels, setSplitRatio, splitPanel } from './tree'
import type { BannerBreakpoint, BannerNode } from './types'

function leaf(): { root: BannerNode; id: ReturnType<typeof createSequentialIdFactory> } {
  const id = createSequentialIdFactory('p')
  return { root: createPanel(id), id }
}

function split(dir: 'cols' | 'rows', ratio?: number) {
  const { root, id } = leaf()
  const result = splitPanel(root, root.id, dir, id)
  if (!result) throw new Error('split failed')
  const next = ratio === undefined ? result.root : setSplitRatio(result.root, result.root.id, ratio)
  return { root: next, id }
}

describe('computeLayout', () => {
  test('a lone panel fills the whole frame and needs no divider', () => {
    const { leaves, dividers } = computeLayout(leaf().root)
    expect(leaves).toHaveLength(1)
    expect(leaves[0]!.rect).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    expect(dividers).toEqual([])
  })

  test('a column split divides the width and leaves the height alone', () => {
    const { leaves } = computeLayout(split('cols', 0.5).root)
    expect(leaves.map((l) => l.rect)).toEqual([
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 50, y: 0, w: 50, h: 100 },
    ])
  })

  test('a row split divides the height and leaves the width alone', () => {
    const { leaves } = computeLayout(split('rows', 0.25).root)
    expect(leaves.map((l) => l.rect)).toEqual([
      { x: 0, y: 0, w: 100, h: 25 },
      { x: 0, y: 25, w: 100, h: 75 },
    ])
  })

  test('a column divider is dragged along x, a row divider along y', () => {
    const cols = computeLayout(split('cols', 0.4).root)
    expect(cols.dividers).toHaveLength(1)
    expect(cols.dividers[0]).toMatchObject({ axis: 'x', pos: 40 })

    const rows = computeLayout(split('rows', 0.4).root)
    expect(rows.dividers[0]).toMatchObject({ axis: 'y', pos: 40 })
  })

  test('a divider carries the id of the split it resizes', () => {
    const { root } = split('cols')
    expect(computeLayout(root).dividers[0]!.splitId).toBe(root.id)
  })

  test('leaves come back in the same order the Layers rail lists panels', () => {
    const { root, id } = split('cols')
    const nested = splitPanel(root, listPanels(root)[1]!.id, 'rows', id)
    if (!nested) throw new Error('split failed')
    expect(computeLayout(nested.root).leaves.map((l) => l.panel.id)).toEqual(
      listPanels(nested.root).map((p) => p.id),
    )
  })

  test('nested rects still tile the frame exactly, with no gap or overlap', () => {
    const { root, id } = split('cols', 0.3)
    const a = splitPanel(root, listPanels(root)[0]!.id, 'rows', id)
    if (!a) throw new Error('split failed')
    const b = splitPanel(a.root, listPanels(a.root)[2]!.id, 'cols', id)
    if (!b) throw new Error('split failed')

    const { leaves } = computeLayout(b.root)
    expect(leaves).toHaveLength(4)
    const area = leaves.reduce((sum, l) => sum + (l.rect.w * l.rect.h) / 100, 0)
    expect(area).toBeCloseTo(100, 6)
    for (const l of leaves) {
      expect(l.rect.x + l.rect.w).toBeLessThanOrEqual(100.000001)
      expect(l.rect.y + l.rect.h).toBeLessThanOrEqual(100.000001)
    }
  })

  test('produces one divider per split', () => {
    const { root, id } = split('cols')
    const nested = splitPanel(root, listPanels(root)[0]!.id, 'rows', id)
    if (!nested) throw new Error('split failed')
    expect(computeLayout(nested.root).dividers).toHaveLength(2)
  })
})

describe('insetStyle', () => {
  const rect = { x: 25, y: 0, w: 50, h: 100 }

  test('with no gutter the panel sits on plain percentages', () => {
    expect(insetStyle(rect, 0)).toEqual({
      left: '25%',
      top: '0%',
      width: '50%',
      height: '100%',
    })
  })

  test('a gutter insets every side by half, so neighbours end up a full gutter apart', () => {
    expect(insetStyle(rect, 16)).toEqual({
      left: 'calc(25% + calc(var(--bnbr-u) * 8))',
      top: 'calc(0% + calc(var(--bnbr-u) * 8))',
      width: 'calc(50% - calc(var(--bnbr-u) * 16))',
      height: 'calc(100% - calc(var(--bnbr-u) * 16))',
    })
  })
})

describe('resolveFrameHeight', () => {
  const base: Omit<BannerBreakpoint, 'root'> = {
    sizeMode: 'ratio',
    designHeight: 420,
    frameHeight: 80,
    frameHeightUnit: 'vh',
    gutter: 0,
    bg: '#fff',
  }

  test('ratio mode uses the design height, not the frame height', () => {
    expect(resolveFrameHeight({ ...base, sizeMode: 'ratio' }, 'laptop')).toBe(420)
  })

  test('fit/cover in px uses the frame height as given', () => {
    expect(
      resolveFrameHeight(
        { ...base, sizeMode: 'fit', frameHeightUnit: 'px', frameHeight: 500 },
        'laptop',
      ),
    ).toBe(500)
  })

  test('fit/cover in vh resolves against the nominal screen height of the device', () => {
    // Laptop screen height is 800px, so 80% is 640.
    expect(
      resolveFrameHeight(
        { ...base, sizeMode: 'fit', frameHeightUnit: 'vh', frameHeight: 80 },
        'laptop',
      ),
    ).toBe(640)
  })

  test('the same viewport share resolves differently per device', () => {
    const vh = { ...base, sizeMode: 'cover' as const, frameHeightUnit: 'vh' as const, frameHeight: 80 }
    expect(resolveFrameHeight(vh, 'mobile')).not.toBe(resolveFrameHeight(vh, 'laptop'))
  })

  test('never returns a height below the 120px floor in ratio mode', () => {
    expect(resolveFrameHeight({ ...base, sizeMode: 'ratio', designHeight: 10 }, 'laptop')).toBe(120)
  })

  test('never returns a height below the 120px floor in fit/cover vh mode either', () => {
    // `ratio` and `fit`/`cover` floor through two independent Math.max calls,
    // so the ratio case passing does not prove this one does too. 1% of the
    // laptop's 800px nominal screen height is 8px, well under the floor.
    expect(
      resolveFrameHeight(
        { ...base, sizeMode: 'fit', frameHeightUnit: 'vh', frameHeight: 1 },
        'laptop',
      ),
    ).toBe(120)
  })
})
