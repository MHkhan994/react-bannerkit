/**
 * Id generation is injected rather than imported, for two reasons: tests need
 * deterministic ids, and consumers occasionally need ids that are unique across
 * a database rather than just within one document.
 */
export type IdFactory = () => string

/**
 * Short, collision-resistant enough for ids scoped to a single document.
 * Uses crypto.randomUUID where available and falls back to Math.random.
 */
export const makeId: IdFactory = () => {
  const c = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

/** A deterministic factory, mainly for tests and snapshots. */
export function createSequentialIdFactory(prefix = 'n'): IdFactory {
  let n = 0
  return () => prefix + String(++n)
}
