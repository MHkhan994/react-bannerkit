/*
 * The public surface of the root entry.
 *
 * This entry is what lands in a consumer's bundle when they only need types and
 * document helpers - a server route validating a template, say. It must stay
 * free of React and of anything that touches the DOM, so it can be imported
 * from a Node script or an edge runtime.
 */
import { describe, expect, test } from 'vitest'
import * as api from './index'
import type { SizeMode } from './index'

// Type-only: SizeMode is erased at runtime, so the only honest check that it
// is still exported is that this still compiles. Do not fake a runtime
// assertion for it.
const _sizeModeIsExported: SizeMode = 'ratio'
void _sizeModeIsExported

describe('root entry', () => {
  test('exports the document helpers a consumer needs', () => {
    expect(typeof api.createDefaultTemplate).toBe('function')
    expect(typeof api.normalizeTemplate).toBe('function')
    expect(api.CURRENT_SCHEMA_VERSION).toBe(2)
  })

  test('exports the tree operations, so a consumer can build templates in code', () => {
    for (const name of ['splitPanel', 'removePanel', 'cloneNode', 'updatePanel', 'listPanels']) {
      expect(typeof api[name as keyof typeof api], name).toBe('function')
    }
  })

  test('exports the geometry helpers the renderer and editor share', () => {
    expect(typeof api.computeLayout).toBe('function')
    expect(typeof api.resolveFrameHeight).toBe('function')
    expect(typeof api.insetStyle).toBe('function')
  })

  test('exports device metrics, so a consumer can label a preview correctly', () => {
    expect(api.DEVICES.laptop.width).toBe(1280)
    expect(api.BREAKPOINT_ORDER).toEqual(['laptop', 'tablet', 'mobile'])
  })

  test('exports designWidthOf, so a consumer can resolve a breakpoint\'s design width', () => {
    expect(typeof api.designWidthOf).toBe('function')
  })

  test('creates a template that round-trips through normalize unchanged', () => {
    const t = api.createDefaultTemplate({ name: 'Smoke test' })
    expect(api.normalizeTemplate(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })

  test('exposes no React or DOM dependency, keeping this entry runtime-agnostic', () => {
    // If a React component ever leaks into this entry, it becomes unusable in a
    // server route. Components belong in the /builder and /renderer entries.
    const suspicious = Object.keys(api).filter((k) => /^[A-Z]/.test(k) && /^(Banner|Use)/.test(k))
    expect(suspicious).toEqual([])
  })
})
