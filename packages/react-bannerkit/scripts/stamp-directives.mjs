/*
 * Stamps `'use client'` onto the entries that need it, and verifies the result.
 *
 * Why this exists, and what it costs
 * ----------------------------------
 * `<Carousel>` uses hooks, so it has to sit behind a client boundary. Ideally
 * only the carousel would cross that boundary and `<BannerRenderer>` would stay
 * a server component. In practice the carousel is bundled into the renderer
 * entry, so the boundary lands on the whole entry: importing
 * `react-bannerkit/renderer` puts its JavaScript in the client bundle even for a
 * banner with no carousel.
 *
 * Two alternatives were tried and rejected:
 *
 *   - Preserving per-module directives with an esbuild plugin. The carousel is
 *     only imported by the renderer, so it never becomes its own chunk, and the
 *     directive hoists to the entry regardless.
 *   - Publishing the carousel as its own entry and self-referencing it from the
 *     renderer. That keeps the boundary tight but relies on package
 *     self-resolution and invites dual-package problems for a saving of a few
 *     kilobytes.
 *
 * What this does NOT cost is the thing that actually mattered. A client
 * component is still server-rendered, so the banner is complete in the initial
 * HTML and the CSS-only breakpoint strategy still gives a correct first paint
 * with no layout shift. The cost is bundle size, not LCP or CLS.
 *
 * `index` is deliberately left alone: it is types and pure functions, and must
 * stay importable from a server route or an edge function.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIRECTIVE = "'use client';"
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

/** Entry basenames that must carry the directive. */
const CLIENT_ENTRIES = ['renderer', 'builder']
/** Entry basenames that must NOT carry it, so they stay runtime-agnostic. */
const SERVER_ENTRIES = ['index']

const entryFile = (name) => [`${name}.js`, `${name}.cjs`]

async function stamp(file) {
  const path = join(dist, file)
  const source = await readFile(path, 'utf8')
  if (/^\s*(['"])use client\1/.test(source)) return false
  await writeFile(path, `${DIRECTIVE}\n${source}`, 'utf8')
  return true
}

async function main() {
  const present = new Set(await readdir(dist))
  const stamped = []

  for (const name of CLIENT_ENTRIES) {
    for (const file of entryFile(name)) {
      if (!present.has(file)) throw new Error(`[stamp-directives] expected ${file} in dist`)
      if (await stamp(file)) stamped.push(file)
    }
  }

  /* Verify, rather than assume. A silent failure here surfaces as a confusing
   * "useState only works in a Client Component" error in someone else's app. */
  for (const name of CLIENT_ENTRIES) {
    for (const file of entryFile(name)) {
      const source = await readFile(join(dist, file), 'utf8')
      if (!/^\s*(['"])use client\1/.test(source)) {
        throw new Error(`[stamp-directives] ${file} is missing the use client directive`)
      }
    }
  }

  for (const name of SERVER_ENTRIES) {
    for (const file of entryFile(name)) {
      if (!present.has(file)) continue
      const source = await readFile(join(dist, file), 'utf8')
      if (/use client/.test(source)) {
        throw new Error(
          `[stamp-directives] ${file} must not be a client module: it has to stay importable from a server route`,
        )
      }
    }
  }

  console.log(
    `[stamp-directives] ${stamped.length ? stamped.join(', ') : 'nothing'} stamped; boundaries verified`,
  )
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
