import { describe, expect, test } from 'vitest'
import { createDefaultTemplate } from './defaults'
import { createSequentialIdFactory } from './ids'
import { normalizeTemplate } from './normalize'
import { CURRENT_SCHEMA_VERSION } from './types'

const opts = () => ({ id: createSequentialIdFactory('n'), createdAt: '2026-01-01T00:00:00.000Z' })

describe('normalizeTemplate: hostile input', () => {
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['a string', 'not a template'],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['a nested mess', { breakpoints: { laptop: { root: { kind: 'split' } } } }],
  ])('survives %s and returns a usable template', (_label, input) => {
    const t = normalizeTemplate(input, opts())
    expect(t.version).toBe(CURRENT_SCHEMA_VERSION)
    expect(t.breakpoints.laptop.root).toBeTruthy()
    expect(t.breakpoints.tablet.root).toBeTruthy()
    expect(t.breakpoints.mobile.root).toBeTruthy()
  })

  test('never throws, because a bad row in a database must not take down the page', () => {
    const nasty: unknown[] = [Number.NaN, () => {}, Symbol('x'), new Map(), { breakpoints: null }]
    for (const input of nasty) expect(() => normalizeTemplate(input, opts())).not.toThrow()
  })
})

describe('normalizeTemplate: a valid document', () => {
  test('leaves a freshly created template unchanged', () => {
    const t = createDefaultTemplate(opts())
    expect(normalizeTemplate(t, opts())).toEqual(t)
  })

  test('is idempotent, so repeated saves cannot drift', () => {
    const once = normalizeTemplate({ name: 'Hero' }, opts())
    expect(normalizeTemplate(once, opts())).toEqual(once)
  })

  test('preserves the values it is given', () => {
    const t = createDefaultTemplate(opts())
    t.name = 'Spring sale'
    t.breakpoints.mobile.gutter = 12
    const out = normalizeTemplate(t, opts())
    expect(out.name).toBe('Spring sale')
    expect(out.breakpoints.mobile.gutter).toBe(12)
  })
})

describe('normalizeTemplate: filling gaps', () => {
  test('supplies a breakpoint that is missing entirely', () => {
    const t = createDefaultTemplate(opts()) as unknown as Record<string, unknown>
    const bps = t.breakpoints as unknown as Record<string, unknown>
    delete bps.mobile
    expect(normalizeTemplate(t, opts()).breakpoints.mobile.root.kind).toBe('panel')
  })

  test('defaults a panel field that a newer version added', () => {
    const t = createDefaultTemplate(opts())
    const root = t.breakpoints.laptop.root as unknown as Record<string, unknown>
    delete root.pagination
    delete root.pauseHover
    const out = normalizeTemplate(t, opts()).breakpoints.laptop.root
    if (out.kind === 'split') throw new Error('expected a panel')
    expect(out.pagination).toBe('dots')
    expect(out.pauseHover).toBe(true)
  })

  test('gives an id to a node that arrived without one', () => {
    const t = createDefaultTemplate(opts())
    const root = t.breakpoints.laptop.root as unknown as Record<string, unknown>
    delete root.id
    expect(normalizeTemplate(t, opts()).breakpoints.laptop.root.id).toBeTruthy()
  })
})

describe('normalizeTemplate: clamping', () => {
  test('pulls a split ratio back inside its usable range', () => {
    const t = normalizeTemplate(
      {
        breakpoints: {
          laptop: {
            root: {
              kind: 'split',
              dir: 'cols',
              ratio: 4,
              a: { kind: 'panel' },
              b: { kind: 'panel' },
            },
          },
        },
      },
      opts(),
    )
    const root = t.breakpoints.laptop.root
    if (root.kind !== 'split') throw new Error('expected a split')
    expect(root.ratio).toBe(0.85)
  })

  test('clamps overlay opacity to 0 to 1', () => {
    const t = createDefaultTemplate(opts())
    const root = t.breakpoints.laptop.root
    if (root.kind === 'split') throw new Error('expected a panel')
    const overlay = root.elements[0] as unknown as Record<string, unknown>
    overlay.opacity = 9
    const out = normalizeTemplate(t, opts()).breakpoints.laptop.root
    if (out.kind === 'split') throw new Error('expected a panel')
    const el = out.elements[0]
    if (el?.type !== 'overlay') throw new Error('expected an overlay')
    expect(el.opacity).toBe(1)
  })

  test('clamps a free position to the draggable area', () => {
    const t = createDefaultTemplate(opts())
    const root = t.breakpoints.laptop.root
    if (root.kind === 'split') throw new Error('expected a panel')
    const heading = root.elements.find((e) => e.type === 'heading') as unknown as Record<string, unknown>
    heading.pos = { x: -20, y: 500 }
    const out = normalizeTemplate(t, opts()).breakpoints.laptop.root
    if (out.kind === 'split') throw new Error('expected a panel')
    const el = out.elements.find((e) => e.type === 'heading')
    expect(el?.pos).toEqual({ x: 0, y: 96 })
  })

  test('clamps the gutter to its 0 to 48 range', () => {
    const t = createDefaultTemplate(opts())
    t.breakpoints.laptop.gutter = 900
    expect(normalizeTemplate(t, opts()).breakpoints.laptop.gutter).toBe(48)
  })
})

describe('normalizeTemplate: bad content', () => {
  test('drops an element of an unknown type and says so', () => {
    const warnings: string[] = []
    const t = createDefaultTemplate(opts())
    const root = t.breakpoints.laptop.root
    if (root.kind === 'split') throw new Error('expected a panel')
    const before = root.elements.length
    ;(root.elements as unknown[]).push({ id: 'x', type: 'video' })
    const out = normalizeTemplate(t, { ...opts(), onWarn: (m) => warnings.push(m) })
    const panel = out.breakpoints.laptop.root
    if (panel.kind === 'split') throw new Error('expected a panel')
    expect(panel.elements).toHaveLength(before)
    expect(warnings.join(' ')).toContain('video')
  })

  test('a carousel always ends up with at least one slide to show', () => {
    const t = createDefaultTemplate(opts())
    const root = t.breakpoints.laptop.root as unknown as Record<string, unknown>
    root.type = 'carousel'
    root.slides = []
    const out = normalizeTemplate(t, opts()).breakpoints.laptop.root
    if (out.kind === 'split') throw new Error('expected a panel')
    expect(out.slides.length).toBeGreaterThanOrEqual(1)
  })

  test('a split missing a branch degrades to the branch it still has', () => {
    const t = normalizeTemplate(
      {
        breakpoints: {
          laptop: {
            root: { kind: 'split', dir: 'cols', ratio: 0.5, a: { kind: 'panel', pad: 7 } },
          },
        },
      },
      opts(),
    )
    const root = t.breakpoints.laptop.root
    expect(root.kind).toBe('panel')
    if (root.kind === 'split') throw new Error('expected a panel')
    expect(root.pad).toBe(7)
  })
})

describe('normalizeTemplate: legacy documents', () => {
  test('reads the field names the design handoff documented', () => {
    const legacy = {
      id: 'old',
      name: 'Homepage hero',
      desc: 'Runs above the fold.',
      created: 'Aug 26, 2026',
      bps: {
        laptop: { h: 500, hMode: 'fixed', vh: 100, gutter: 8, bg: '#eee', root: { kind: 'panel' } },
      },
    }
    const t = normalizeTemplate(legacy, opts())
    expect(t.name).toBe('Homepage hero')
    expect(t.description).toBe('Runs above the fold.')
    expect(t.breakpoints.laptop.height).toBe(500)
    expect(t.breakpoints.laptop.gutter).toBe(8)
  })

  test('folds the old dots plus dotStyle pair into one pagination value', () => {
    const bars = normalizeTemplate(
      { bps: { laptop: { root: { kind: 'panel', dots: true, dotStyle: 'bars' } } } },
      opts(),
    ).breakpoints.laptop.root
    if (bars.kind === 'split') throw new Error('expected a panel')
    expect(bars.pagination).toBe('bars')

    const off = normalizeTemplate(
      { bps: { laptop: { root: { kind: 'panel', dots: false, dotStyle: 'dots' } } } },
      opts(),
    ).breakpoints.laptop.root
    if (off.kind === 'split') throw new Error('expected a panel')
    expect(off.pagination).toBe('none')
  })
})
