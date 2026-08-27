import { describe, expect, test } from 'vitest'
import { createDefaultTemplate, createElement, createPanel } from './defaults'
import { CURRENT_SCHEMA_VERSION, DEVICES } from './types'
import type { BannerNode, BannerTemplate } from './types'

/** A deterministic id factory, so tests can assert on exact ids. */
function seq(prefix = 'id') {
  let n = 0
  return () => `${prefix}${++n}`
}

/** Every id anywhere in the document, so we can prove they are unique. */
function collectIds(t: BannerTemplate): string[] {
  const ids: string[] = [t.id]
  const walk = (node: BannerNode): void => {
    ids.push(node.id)
    if (node.kind === 'split') {
      walk(node.a)
      walk(node.b)
      return
    }
    for (const el of node.elements) ids.push(el.id)
    for (const slide of node.slides) {
      ids.push(slide.id)
      for (const el of slide.elements) ids.push(el.id)
    }
  }
  for (const bp of Object.values(t.breakpoints)) walk(bp.root)
  return ids
}

describe('createElement', () => {
  test('an overlay has no position, because it always covers the panel', () => {
    const el = createElement('overlay', seq())
    expect(el.type).toBe('overlay')
    expect('pos' in el).toBe(false)
  })

  test('a heading carries the typography fields the inspector edits', () => {
    const el = createElement('heading', seq())
    expect(el).toMatchObject({
      type: 'heading',
      weight: 400,
      align: 'left',
    })
    if (el.type !== 'heading') throw new Error('expected a heading')
    expect(el.fs).toBeGreaterThan(0)
    expect(el.measure).toBeGreaterThan(0)
    expect(el.text.length).toBeGreaterThan(0)
  })

  test('takes its id from the supplied factory', () => {
    expect(createElement('spacer', seq('el')).id).toBe('el1')
  })
})

describe('createPanel', () => {
  test('is an empty single panel with two slides ready for carousel mode', () => {
    const p = createPanel(seq())
    expect(p.kind).toBe('panel')
    expect(p.type).toBe('single')
    expect(p.elements).toEqual([])
    expect(p.slides).toHaveLength(2)
  })

  test('a filled panel leads with the overlay so text stays legible', () => {
    const p = createPanel(seq(), { filled: true })
    expect(p.elements[0]?.type).toBe('overlay')
    expect(p.elements.map((e) => e.type)).toEqual(['overlay', 'heading', 'text', 'button'])
  })
})

describe('createDefaultTemplate', () => {
  test('is stamped with the current schema version', () => {
    expect(createDefaultTemplate().version).toBe(CURRENT_SCHEMA_VERSION)
  })

  test('opens with one panel per breakpoint, as the empty state promises', () => {
    const t = createDefaultTemplate()
    for (const name of ['laptop', 'tablet', 'mobile'] as const) {
      expect(t.breakpoints[name].root.kind).toBe('panel')
    }
  })

  test('each breakpoint starts at its device default height', () => {
    const t = createDefaultTemplate()
    expect(t.breakpoints.laptop.height).toBe(DEVICES.laptop.height)
    expect(t.breakpoints.mobile.height).toBe(DEVICES.mobile.height)
  })

  test('mobile gets smaller type and tighter padding than laptop', () => {
    const t = createDefaultTemplate()
    const headingOf = (node: BannerNode) => {
      if (node.kind === 'split') throw new Error('expected a leaf panel')
      const h = node.elements.find((e) => e.type === 'heading')
      if (h?.type !== 'heading') throw new Error('expected a heading')
      return h
    }
    const laptop = t.breakpoints.laptop.root
    const mobile = t.breakpoints.mobile.root
    expect(headingOf(mobile).fs).toBeLessThan(headingOf(laptop).fs)
    if (laptop.kind === 'split' || mobile.kind === 'split') throw new Error('expected leaves')
    expect(mobile.pad).toBeLessThan(laptop.pad)
  })

  test('every id in the document is unique', () => {
    const ids = collectIds(createDefaultTemplate())
    expect(ids.length).toBeGreaterThan(20)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('survives a JSON round trip unchanged, since consumers store it as JSON', () => {
    const t = createDefaultTemplate()
    expect(JSON.parse(JSON.stringify(t))).toEqual(t)
  })

  test('accepts a name and description', () => {
    const t = createDefaultTemplate({ name: 'Homepage hero', description: 'Above the fold.' })
    expect(t.name).toBe('Homepage hero')
    expect(t.description).toBe('Above the fold.')
  })
})
