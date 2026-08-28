/*
 * The last gate before publishing.
 *
 * `pnpm test` runs against source. This runs against the *tarball*, installed by
 * package name into a throwaway project outside the workspace - which is the
 * only way to catch the class of bug that exists solely in the published
 * artefact: a wrong `exports` path, a file missing from `files`, a lost
 * `'use client'` directive, or editor code that leaked into the renderer bundle.
 *
 *   node scripts/smoke-tarball.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workDir = join(tmpdir(), 'react-bannerkit-smoke')

const run = (command, args, cwd) =>
  execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })

/*
 * Written to a file and run by Node, so it is a real consumer rather than
 * something with privileged access to the source tree.
 */
const CONSUMER = String.raw`
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { createDefaultTemplate, normalizeTemplate, CURRENT_SCHEMA_VERSION } from 'react-bannerkit'
import { BannerRenderer } from 'react-bannerkit/renderer'
import {
  BannerBuilder,
  createEditorState,
  editorReducer,
  inspectorModel,
} from 'react-bannerkit/builder'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const results = []
const check = (name, fn) => {
  try {
    results.push(['ok', name, fn() ?? ''])
  } catch (e) {
    results.push(['FAIL', name, e.message])
  }
}

/*
 * The ESM file an export condition points at.
 *
 * 'require.resolve' picks the 'require' condition and hands back the CJS build,
 * whose dependencies are 'require()' calls rather than imports - walking from
 * there silently found one file and declared the graph clean. Reading the
 * exports map gets the ESM entry a bundler would actually take.
 */
function esmEntry(subpath) {
  const packageJsonPath = require.resolve('react-bannerkit/package.json')
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const target = pkg.exports[subpath]?.import?.default
  if (!target) throw new Error('no ESM export for ' + subpath)
  return resolve(dirname(packageJsonPath), target)
}

/*
 * Everything reachable from one entry, following relative imports of both kinds.
 *
 * Reading every .js file in dist would be wrong now that the builder ships
 * alongside: the builder legitimately depends on tailwind-merge, and a
 * directory-wide scan would blame the renderer for it.
 */
function reachableFrom(entry) {
  const seen = new Set()
  const queue = [entry]
  let source = ''
  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(file, 'utf8')
    source += text
    const relative = [
      ...text.matchAll(/from\s*['"](\.[^'"]+)['"]/g),
      ...text.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g),
    ]
    for (const match of relative) queue.push(resolve(dirname(file), match[1]))
  }
  return { source, files: seen.size }
}

check('root entry exports the document helpers', () => {
  if (typeof createDefaultTemplate !== 'function') throw new Error('missing createDefaultTemplate')
  return 'schema v' + CURRENT_SCHEMA_VERSION
})

check('a template survives a JSON round trip', () => {
  const t = createDefaultTemplate({ name: 'Smoke' })
  const round = normalizeTemplate(JSON.parse(JSON.stringify(t)))
  if (round.name !== 'Smoke') throw new Error('round trip lost the name')
  return Object.keys(round.breakpoints).length + ' breakpoints'
})

check('normalize survives garbage instead of throwing', () => {
  if (!normalizeTemplate('not a template').breakpoints.laptop.root) throw new Error('no root')
  return 'no throw'
})

check('renderer server-renders all three layouts', () => {
  const html = renderToStaticMarkup(
    React.createElement(BannerRenderer, { template: createDefaultTemplate({ name: 'Smoke' }) }),
  )
  const trees = (html.match(/class="bnbr-bp"/g) || []).length
  if (trees !== 3) throw new Error('expected 3 trees, got ' + trees)
  if (!html.includes('A season of new arrivals')) throw new Error('no heading in markup')
  return trees + ' trees, ' + html.length + ' bytes of HTML'
})

check('renderer honours the breakpoint prop', () => {
  const html = renderToStaticMarkup(
    React.createElement(BannerRenderer, {
      template: createDefaultTemplate({ name: 'Smoke' }),
      breakpoint: 'mobile',
    }),
  )
  if ((html.match(/class="bnbr-bp"/g) || []).length !== 0) {
    throw new Error('emitted responsive trees anyway')
  }
  if (!html.includes('bnbr-bp-fixed')) throw new Error('no pinned tree')
  return 'one pinned layout'
})

check('renderer entry carries the client boundary', () => {
  const src = readFileSync(require.resolve('react-bannerkit/renderer'), 'utf8')
  if (!/^\s*['"]use client['"]/.test(src)) throw new Error('missing use client directive')
  return 'use client present'
})

check('root entry stays server-safe', () => {
  const src = readFileSync(require.resolve('react-bannerkit'), 'utf8')
  if (/use client/.test(src)) throw new Error('root entry became a client module')
  return 'server-safe'
})

check('nothing the editor needs reaches the renderer bundle', () => {
  const { source, files } = reachableFrom(esmEntry('./renderer'))
  // A one-file graph would mean the walk found nothing to follow, which is how
  // this check quietly passed while reading only the entry.
  if (files < 2) throw new Error('the import walk followed nothing: ' + files + ' file')
  for (const forbidden of [
    '@radix-ui',
    'lucide-react',
    'tailwind-merge',
    'class-variance-authority',
    'bnb-root',
    'bnb-shell',
  ]) {
    if (source.includes(forbidden)) {
      throw new Error('renderer graph references ' + forbidden)
    }
  }
  return files + ' modules, clean'
})

check('builder entry exports the editor and its state layer', () => {
  if (typeof BannerBuilder !== 'function') throw new Error('BannerBuilder is not a component')
  for (const fn of [createEditorState, editorReducer, inspectorModel]) {
    if (typeof fn !== 'function') throw new Error('the state layer is not exported')
  }
  return 'component + reducer + inspector'
})

check('the editor state layer works with no DOM at all', () => {
  // Proves the reducer really is pure: this runs in plain Node.
  const editor = createEditorState(createDefaultTemplate({ name: 'Smoke' }))
  const id = editor.history.present.breakpoints.laptop.root.id
  const split = editorReducer(editor, { type: 'splitPanel', panelId: id, dir: 'cols' })
  if (inspectorModel(split).title !== 'Panel 2') {
    throw new Error('the new panel was not selected')
  }
  const undone = editorReducer(split, { type: 'undo' })
  if (undone.history.present.breakpoints.laptop.root.kind !== 'panel') {
    throw new Error('undo did not remove the split')
  }
  return 'split, inspect, undo'
})

check('builder entry carries the client boundary', () => {
  const src = readFileSync(require.resolve('react-bannerkit/builder'), 'utf8')
  if (!/^\s*['"]use client['"]/.test(src)) throw new Error('missing use client directive')
  return 'use client present'
})

check('builder.css is resolvable and fully scoped', () => {
  const css = readFileSync(require.resolve('react-bannerkit/builder.css'), 'utf8')
  if (!css.includes('.bnb-root')) throw new Error('no scope class')
  if (/:root\s*[,{]/.test(css)) throw new Error('declares variables on :root')
  if (!css.includes('bnb-firewall')) throw new Error('the isolation firewall is missing')
  return (css.length / 1024).toFixed(1) + ' kB'
})

check('builder.css alone is enough to lay a banner out', () => {
  /*
   * The editor draws real banners, so builder.css ships the renderer's rules
   * too. An app that imported only builder.css got an editor that looked right
   * in every respect except that panels were never positioned: they stacked
   * down the page instead of dividing the banner, and splitting looked like it
   * was adding blank space. Nothing errored, so nothing caught it.
   */
  const css = readFileSync(require.resolve('react-bannerkit/builder.css'), 'utf8')
  if (!css.includes('.bnbr-panel')) throw new Error('no .bnbr-panel rules in builder.css')
  if (!/\.bnbr-panel\s*\{[^}]*position:\s*absolute/.test(css)) {
    throw new Error('builder.css does not position banner panels')
  }
  return 'panels positioned without a second import'
})

check('the editor server-renders without throwing', () => {
  // It is a client component, but Next still renders it during SSR of any page
  // that embeds it, so it must not depend on the DOM being there.
  const html = renderToStaticMarkup(React.createElement(BannerBuilder, {}))
  if (!html.includes('bnb-root')) throw new Error('no scope class in the markup')
  if (!html.includes('bnb-shell')) throw new Error('the shell did not render')
  return html.length + ' bytes of HTML'
})

check('renderer.css resolves and is scoped', () => {
  const css = readFileSync(require.resolve('react-bannerkit/renderer.css'), 'utf8')
  if (!css.includes('.bnbr')) throw new Error('no scope class')
  if (/:root\s*[,{]/.test(css)) throw new Error('declares variables on :root')
  return (css.length / 1024).toFixed(1) + ' kB'
})

for (const [status, name, detail] of results) {
  console.log((status === 'ok' ? '  ok   ' : ' FAIL  ') + name + (detail ? '  -> ' + detail : ''))
}
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed')
process.exit(failed ? 1 : 0)
`

function main() {
  console.log('[smoke] packing…')
  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })
  run('npm', ['pack', '--pack-destination', JSON.stringify(workDir)], packageRoot)

  const tarball = readdirSync(workDir).find((f) => f.endsWith('.tgz'))
  if (!tarball) throw new Error('npm pack produced no tarball')
  console.log(`[smoke] installing ${tarball} into ${workDir}`)

  writeFileSync(
    join(workDir, 'package.json'),
    JSON.stringify(
      { name: 'bannerkit-smoke', private: true, version: '1.0.0', type: 'module' },
      null,
      2,
    ),
  )
  writeFileSync(join(workDir, 'smoke.mjs'), CONSUMER)

  // Plain npm, not pnpm: a consumer's install must not depend on our workspace.
  run('npm', ['install', '--silent', `./${tarball}`, 'react@19', 'react-dom@19'], workDir)

  console.log('[smoke] running consumer checks\n')
  process.stdout.write(run('node', ['smoke.mjs'], workDir))
}

try {
  main()
  console.log('\n[smoke] the published artefact works when installed by name')
} catch (error) {
  console.error('\n[smoke] FAILED')
  console.error(error.stdout ?? '')
  console.error(error.stderr ?? error.message ?? error)
  process.exit(1)
}
