/*
 * The isolation guarantee, enforced mechanically.
 *
 * This package ships compiled Tailwind CSS. Tailwind's Preflight resets `*`,
 * `html`, `body`, and every form element, and its theme variables land on
 * `:root` - all of which would reach straight into the consuming application
 * and restyle it. The build is configured to prevent that, but configuration
 * drifts silently. These tests parse the actual built CSS and fail the build if
 * a single selector could ever match an element outside our own subtree.
 *
 * If one of these fails, do not relax the test. The whole point of the package
 * is that mounting it cannot change the host page.
 */
import postcss, { type Rule } from 'postcss'
import { beforeAll, describe, expect, test } from 'vitest'
import { BUILDER_SCOPE, RENDERER_SCOPE, compileCss } from '../../scripts/build-css.mjs'

/** At-rules whose child selectors are keyframe stops, not element selectors. */
const KEYFRAME_AT_RULES = new Set(['keyframes', '-webkit-keyframes'])

/** postcss's parent chain is loosely typed; only `type` and `name` matter here. */
interface AncestorLike {
  type?: string
  name?: string
  parent?: AncestorLike | undefined
}

function isInsideKeyframes(rule: Rule): boolean {
  let parent = rule.parent as AncestorLike | undefined
  while (parent) {
    if (parent.type === 'atrule' && KEYFRAME_AT_RULES.has(String(parent.name).toLowerCase())) {
      return true
    }
    parent = parent.parent
  }
  return false
}

/** The raw text of the `@layer bnb-firewall` block, or null when absent. */
function firewallBlock(css: string): string | null {
  const root = postcss.parse(css)
  let found: string | null = null
  root.walkAtRules('layer', (at) => {
    if (at.params.trim() === 'bnb-firewall' && at.nodes) found = at.toString()
  })
  return found
}

/** Selectors of the rules inside the firewall layer specifically. */
function firewallSelectors(css: string): string[] {
  const root = postcss.parse(css)
  const found: string[] = []
  root.walkAtRules('layer', (at) => {
    if (at.params.trim() !== 'bnb-firewall') return
    at.walkRules((rule) => {
      for (const selector of rule.selectors) found.push(selector.trim())
    })
  })
  return found
}

/** Every selector in the sheet that targets elements, flattened. */
function selectorsOf(css: string): string[] {
  const root = postcss.parse(css)
  const found: string[] = []
  root.walkRules((rule) => {
    if (isInsideKeyframes(rule)) return
    for (const selector of rule.selectors) found.push(selector.trim())
  })
  return found
}

describe('builder.css', () => {
  let css = ''
  let selectors: string[] = []

  beforeAll(async () => {
    css = await compileCss('builder')
    selectors = selectorsOf(css)
  }, 120_000)

  test('the pipeline actually produced a stylesheet', () => {
    expect(css.length).toBeGreaterThan(1_000)
    expect(selectors.length).toBeGreaterThan(20)
  })

  test('every selector is confined to the builder scope', () => {
    const escapees = selectors.filter((s) => !s.includes(BUILDER_SCOPE))
    expect(escapees).toEqual([])
  })

  test('never resets the universal selector, which would restyle the host page', () => {
    const universal = selectors.filter((s) => s === '*' || s.startsWith('*,') || s === '*::before')
    expect(universal).toEqual([])
  })

  test('never styles html or body', () => {
    const globals = selectors.filter((s) => /(^|[\s>+~,])(html|body)([\s.:[]|$)/.test(s))
    expect(globals).toEqual([])
  })

  test('declares no variables on :root, so host tokens are untouched', () => {
    expect(selectors.filter((s) => s.includes(':root'))).toEqual([])
    expect(css).not.toMatch(/:root\s*[,{]/)
  })

  test('defines its theme variables on the scope root instead', () => {
    const themeRule = selectors.find((s) => s === BUILDER_SCOPE)
    expect(themeRule).toBe(BUILDER_SCOPE)
    expect(css).toMatch(/--bnb-background/)
  })

  test('carries a dark palette that the host cannot trigger by accident', () => {
    // A bare `.dark` would let any host class named `dark` flip our theme.
    expect(selectors.filter((s) => s === '.dark')).toEqual([])
    expect(selectors.some((s) => s.includes('bnb-dark'))).toBe(true)
  })

  test('emits real Tailwind utilities, proving the compile ran rather than no-opping', () => {
    // A scoped bare utility class can only have come from Tailwind's generator;
    // asserting on `display: flex` alone would also pass on hand-written CSS.
    const utilities = selectors.filter((s) => /^\.bnb-root \.[a-z]/.test(s))
    expect(utilities.length).toBeGreaterThan(5)
  })

  /*
   * These pin behaviour verified in a real browser on the hostile playground
   * page. Both depend on cascade-layer ORDER rather than on any declaration, so
   * an innocent-looking reorder breaks them with no visible error - which is
   * exactly why they are asserted here.
   */
  test('orders the firewall layer after the utilities it must yield to', () => {
    /*
     * Tailwind emits its own `@layer properties;` statement, so take the
     * declaration that actually names our layers rather than the first one.
     */
    const declaration = [...css.matchAll(/@layer\s+([^;{]+);/g)]
      .map((m) => m[1]!)
      .find((params) => params.includes('bnb-firewall'))
    expect(declaration, 'no @layer order declaration naming bnb-firewall').toBeTruthy()
    const order = declaration!.split(',').map((s) => s.trim())
    // Important declarations resolve earlier-layer-wins, so utilities must come
    // before the firewall or every component would be flattened by it.
    expect(order).toContain('bnb-firewall')
    expect(order.indexOf('utilities')).toBeLessThan(order.indexOf('bnb-firewall'))
    expect(order.indexOf('theme')).toBeLessThan(order.indexOf('bnb-firewall'))
  })

  test('the firewall exempts the renderer subtree', () => {
    /*
     * `!important` beats inline style. Banner elements are styled from inline
     * style driven by the document, so a firewall reaching into `.bnbr` would
     * silently flatten the user's design - overlay opacity, link decoration,
     * button letter-spacing. Every rule inside the firewall layer must exclude
     * that subtree.
     */
    const rules = firewallSelectors(css)
    expect(rules.length, 'no rules found inside @layer bnb-firewall').toBeGreaterThan(0)
    for (const selector of rules) {
      expect(selector, `${selector} does not exempt the renderer scope`).toContain(RENDERER_SCOPE)
    }
  })

  test('the firewall marks its declarations important, or it cannot beat the host', () => {
    const layer = firewallBlock(css)
    expect(layer).toBeTruthy()
    // A non-important firewall would lose to unlayered host CSS entirely.
    const declarations = [...layer!.matchAll(/[a-z-]+\s*:\s*[^;]+;/g)].map((m) => m[0])
    expect(declarations.length).toBeGreaterThan(10)
    expect(declarations.filter((d) => !d.includes('!important'))).toEqual([])
  })

  test('the canvas selection outline survives the firewall that blanks outlines', () => {
    /*
     * The firewall neutralises `outline` across the editor, and an important
     * declaration beats a normal one in any layer. So while the selection rules
     * were normal, selecting a panel drew nothing: the editor looked like it had
     * ignored the click. Nothing failed loudly, which is exactly why this is
     * asserted rather than left to be noticed.
     */
    for (const state of ['data-selected', 'data-hovered']) {
      let outline: { important: boolean } | undefined
      postcss.parse(css).walkRules((rule) => {
        if (isInsideKeyframes(rule)) return
        if (!rule.selector.includes('bnb-selectable') || !rule.selector.includes(state)) return
        rule.walkDecls('outline', (declaration) => {
          outline = { important: Boolean(declaration.important) }
        })
      })
      expect(outline, `no .bnb-selectable[${state}] outline rule found`).toBeTruthy()
      expect(
        outline!.important,
        `the ${state} outline must be important, or the firewall blanks it`,
      ).toBe(true)
    }
  })

  test('registers only Tailwind-namespaced custom properties globally', () => {
    /*
     * `@property` cannot be scoped - it registers a custom property for the
     * whole document. Tailwind emits a handful for its transform and border
     * helpers. Those are safe because they are `--tw-` namespaced and carry the
     * same meaning in any Tailwind build, so a host that also uses Tailwind
     * registers them identically. Anything NOT so namespaced would be a genuine
     * leak into the host's custom property space, and must not appear.
     */
    const registered = [...css.matchAll(/@property\s+(--[\w-]+)/g)].map((m) => m[1])
    expect(registered.length).toBeGreaterThan(0)
    expect(registered.filter((name) => !name?.startsWith('--tw-'))).toEqual([])
  })
})

describe('renderer.css', () => {
  let css = ''
  let selectors: string[] = []

  beforeAll(async () => {
    css = await compileCss('renderer')
    selectors = selectorsOf(css)
  }, 120_000)

  test('every selector is confined to the renderer scope', () => {
    expect(selectors.filter((s) => !s.includes(RENDERER_SCOPE))).toEqual([])
  })

  test('never resets the universal selector or document elements', () => {
    expect(selectors.filter((s) => s === '*' || /(^|[\s>+~,])(html|body)\b/.test(s))).toEqual([])
  })

  test('declares nothing on :root', () => {
    expect(css).not.toMatch(/:root\s*[,{]/)
  })

  test('stays small enough to sit on a public page without thought', () => {
    // A hard ceiling. The renderer lands on marketing pages where every kilobyte
    // is measured, so growth here should be a deliberate decision.
    expect(css.length).toBeLessThan(12_000)
  })

  test('free placement outranks every element rule that sets position', () => {
    /*
     * `.bnbr-free` and `.bnbr-button` (and heading, link, image, icon) all end up
     * at the same specificity once the build scopes them, so the one written
     * last wins. `.bnbr-free` used to be written first, which meant a freely
     * placed element computed to `position: relative` and was offset from its
     * place in the flex stack rather than pinned to a percentage of the panel:
     * the inspector's X and Y changed and the element landed somewhere else.
     *
     * Nothing about that fails loudly, so the order is asserted here.
     */
    let freeIndex = -1
    const laterPositioned: string[] = []
    postcss.parse(css).walkRules((rule) => {
      if (isInsideKeyframes(rule)) return
      const index = rule.source?.start?.offset ?? -1
      if (rule.selector.includes('bnbr-free')) {
        freeIndex = index
        return
      }
      if (freeIndex === -1) return
      // A rule after `.bnbr-free` that also sets `position` would override it.
      rule.walkDecls('position', () => {
        if (rule.selector.split(',').some((s) => /\.bnbr-(heading|text|button|link|image|icon)\b/.test(s))) {
          laterPositioned.push(rule.selector.trim())
        }
      })
    })
    expect(freeIndex, 'no .bnbr-free rule in the built renderer CSS').toBeGreaterThan(-1)
    expect(laterPositioned, 'these element rules would override .bnbr-free').toEqual([])
  })

  test('contains no Tailwind utility classes, being hand-written', () => {
    // Tailwind's escaped-colon variants are the giveaway, e.g. `.md\:flex`.
    expect(css).not.toMatch(/\\:/)
  })
})
