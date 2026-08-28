/*
 * Compiles the package's two stylesheets and guarantees they cannot escape
 * their own subtree.
 *
 * The isolation problem this solves: a package that ships Tailwind normally
 * ships Preflight too, which resets `*`, `html`, `body`, and every form
 * element in the consuming application, and Tailwind's theme variables are
 * declared on `:root`. Both reach straight out of the component and restyle
 * the host page.
 *
 * Three things prevent that here:
 *   1. Preflight is never imported. `builder.css` pulls in `theme.css` and
 *      `utilities.css` explicitly and nothing else.
 *   2. A hand-written reset in `@layer bnb-base` does Preflight's job, scoped.
 *      This also stops host styles bleeding *in*, which Preflight would not.
 *   3. Every emitted selector is rewritten to sit under the scope class, and
 *      `:root` is rewritten to the scope class as well.
 *
 * Step 3 is what `src/css/isolation.test.ts` verifies against the real output.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import prefixSelector from 'postcss-prefix-selector'

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, '..')

/** The editor mounts inside this class. Nothing in builder.css may match outside it. */
export const BUILDER_SCOPE = '.bnb-root'

/** Rendered banners sit inside this class, in the editor and on the host's page alike. */
export const RENDERER_SCOPE = '.bnbr'

const ENTRIES = {
  builder: { from: 'src/builder/builder.css', to: 'dist/builder.css', scope: BUILDER_SCOPE, tailwind: true },
  renderer: { from: 'src/renderer/renderer.css', to: 'dist/renderer.css', scope: RENDERER_SCOPE, tailwind: false },
}

/** Selectors that are already ours, and must not be scoped a second time. */
function alreadyScoped(selector, scope) {
  return selector === scope || selector.startsWith(`${scope}.`) || selector.startsWith(`${scope} `) ||
    selector.startsWith(`${scope}:`) || selector.startsWith(`${scope}[`) || selector.startsWith(`${scope}>`)
}

function isKeyframeStop(rule) {
  let parent = rule?.parent
  while (parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true
    parent = parent.parent
  }
  return false
}

function scopePlugin(scope) {
  return prefixSelector({
    prefix: scope,
    transform(prefix, selector, prefixedSelector, _filePath, rule) {
      // `from`, `to`, and `50%` are animation stops, not elements.
      if (isKeyframeStop(rule)) return selector

      /*
       * Tailwind declares its theme variables on `:root`. Rewriting them onto
       * the scope class is the single most important transform here: left
       * alone, every `--color-*` and `--spacing-*` token would be installed
       * globally on the host document.
       */
      if (selector === ':root' || selector === ':host' || selector === 'html' || selector === 'body') {
        return prefix
      }

      if (alreadyScoped(selector, prefix)) return selector

      return prefixedSelector
    },
  })
}

/**
 * Compiles one entry and returns the CSS as a string.
 * @param {'builder' | 'renderer'} name
 */
export async function compileCss(name) {
  const entry = ENTRIES[name]
  if (!entry) throw new Error(`Unknown CSS entry: ${name}`)

  const from = join(packageRoot, entry.from)
  const source = await readFile(from, 'utf8')
  const plugins = entry.tailwind ? [tailwindcss(), scopePlugin(entry.scope)] : [scopePlugin(entry.scope)]

  const result = await postcss(plugins).process(source, { from, map: false })
  for (const warning of result.warnings()) {
    console.warn(`[build-css] ${warning.toString()}`)
  }
  return result.css
}

/*
 * The editor draws real banners - on its canvas and in preview - so it needs the
 * renderer's rules as well as its own. They are appended to `builder.css` rather
 * than left as a second import a consumer has to remember.
 *
 * This is not a convenience. Importing only `builder.css` used to produce an
 * editor that looked entirely correct except that `.bnbr-panel` never got
 * `position: absolute`: panels stacked down the page instead of laying out side
 * by side, so splitting appeared to add blank space below the banner rather than
 * to divide it. Nothing errored, and the chrome around it was perfect, which
 * made it read as a bug in the split.
 *
 * The renderer block is appended verbatim, still scoped to `.bnbr` rather than
 * to the editor's `.bnb-root`, so a banner is styled identically wherever it is
 * rendered. A consumer who imports both stylesheets just gets these rules twice,
 * byte for byte, which changes nothing.
 */
const SELF_SUFFICIENT_NOTE = `\n/* --- react-bannerkit: renderer rules, included so the editor is self-contained --- */\n`

/**
 * The stylesheet as it is actually shipped, which for the builder means its own
 * rules plus the renderer's. Tests assert against this rather than `compileCss`
 * so they see what a consumer sees.
 * @param {'builder' | 'renderer'} name
 */
export async function composeCss(name) {
  if (name !== 'builder') return compileCss(name)
  const [builder, renderer] = await Promise.all([compileCss('builder'), compileCss('renderer')])
  return builder + SELF_SUFFICIENT_NOTE + renderer
}

async function main() {
  for (const [name, entry] of Object.entries(ENTRIES)) {
    const css = await composeCss(name)
    const out = join(packageRoot, entry.to)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, css, 'utf8')
    const kb = (Buffer.byteLength(css, 'utf8') / 1024).toFixed(1)
    const note = name === 'builder' ? ` (+ ${RENDERER_SCOPE} rules)` : ''
    console.log(`[build-css] ${entry.to}  ${kb} kB  scoped to ${entry.scope}${note}`)
  }
}

// Only run the build when invoked directly, so tests can import compileCss.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
