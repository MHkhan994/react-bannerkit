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
import { gzipSync } from 'node:zlib'
import postcss, { type Rule } from 'postcss'
import { beforeAll, describe, expect, test } from 'vitest'
import { BUILDER_SCOPE, RENDERER_SCOPE, compileCss, composeCss } from '../../scripts/build-css.mjs'

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

/**
 * True when `node` is nested inside an at-rule named `name` (e.g. `'supports'`
 * for `@supports`), at any depth.
 *
 * Walks the actual parsed tree rather than matching text, on purpose: a regex
 * scanning for `@supports {...}` in the raw CSS string is fooled by anything
 * that merely mentions the at-rule in passing - a comment quoting it in prose,
 * for instance, which is exactly what vacuated this guard once already.
 */
function isInsideAtRule(node: { parent?: AncestorLike | undefined }, name: string): boolean {
  let parent = node.parent as AncestorLike | undefined
  while (parent) {
    if (parent.type === 'atrule' && String(parent.name).toLowerCase() === name) return true
    parent = parent.parent
  }
  return false
}

/**
 * True when `node` sits inside any at-rule at all, so it is conditional rather
 * than the sheet's unconditional default.
 *
 * The companion to `isInsideAtRule` for guards that care only *that* a
 * declaration is guarded, not by what.
 */
function isInsideAnyAtRule(node: { parent?: AncestorLike | undefined }): boolean {
  let parent = node.parent as AncestorLike | undefined
  while (parent) {
    if (parent.type === 'atrule') return true
    parent = parent.parent
  }
  return false
}

/** Every declaration of `prop` in the sheet, as `{ selector, value, important }`. */
function declarationsOf(
  css: string,
  prop: string,
): { selector: string; value: string; important: boolean }[] {
  const found: { selector: string; value: string; important: boolean }[] = []
  postcss.parse(css).walkDecls(prop, (decl) => {
    found.push({
      selector: (decl.parent as { selector?: string } | undefined)?.selector ?? '?',
      value: decl.value.trim(),
      important: Boolean(decl.important),
    })
  })
  return found
}

/** `params` of every at-rule named `name`, e.g. every `@container` condition. */
function atRuleParams(css: string, name: string): string[] {
  const found: string[] = []
  postcss.parse(css).walkAtRules(name, (at) => {
    found.push(at.params.trim())
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
    // Read as a declaration rather than as text: a comment naming the token
    // would satisfy a substring match without the token being declared, which
    // is how three other guards in this file were vacuated.
    const declared = declarationsOf(css, '--bnb-background')
    expect(declared, 'the palette token --bnb-background is never declared').not.toEqual([])
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
     * statement that actually names our layers rather than the first one.
     *
     * Read from the parsed at-rules for the usual reason: prose quoting an
     * `@layer a, b;` line would satisfy a text match without any layer order
     * being declared. A statement at-rule has no block, which is what
     * distinguishes it from the `@layer bnb-firewall { ... }` block below.
     */
    const statements: string[] = []
    postcss.parse(css).walkAtRules('layer', (at) => {
      if (at.nodes === undefined) statements.push(at.params.trim())
    })
    const declaration = statements.find((params) => params.includes('bnb-firewall'))
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
    /*
     * Walked rather than matched with a `prop: value;` regex over the layer's
     * text, which was wrong in both directions: comments inside the layer
     * discuss declarations in prose, so one that happened to quote `outline:
     * none` padded the count, and one that quoted a whole declaration without
     * `!important` would have failed the test over nothing at all. `walkDecls`
     * never visits a Comment node.
     */
    const declarations: string[] = []
    const notImportant: string[] = []
    postcss.parse(css).walkAtRules('layer', (at) => {
      if (at.params.trim() !== 'bnb-firewall' || !at.nodes) return
      at.walkDecls((decl) => {
        declarations.push(`${decl.prop}: ${decl.value}`)
        // A non-important firewall would lose to unlayered host CSS entirely.
        if (!decl.important) notImportant.push(`${decl.prop}: ${decl.value}`)
      })
    })
    expect(declarations.length, 'no declarations found inside @layer bnb-firewall').toBeGreaterThan(
      10,
    )
    expect(notImportant, 'these firewall declarations would lose to unlayered host CSS').toEqual([])
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

  test('centres its dialogs without depending on auto margins', () => {
    /*
     * A modal dialog is centred by the UA stylesheet with auto margins, and
     * practically every application resets those: Tailwind's Preflight and any
     * hand-rolled `* { margin: 0 }` both match `dialog`, and author CSS beats the
     * UA sheet. The dialog then sits in the top-left corner of the viewport,
     * which is what a real integration reported.
     *
     * Specificity cannot win that argument either - a host reset is usually
     * unlayered, and unlayered normal declarations beat every layered one - so
     * the centring must not go through `margin` at all.
     */
    let rule: Rule | undefined
    postcss.parse(css).walkRules((candidate) => {
      if (rule) return
      if (candidate.selector.includes('bnb-dialog') && !candidate.selector.includes('::backdrop')) {
        rule = candidate
      }
    })
    expect(rule, 'no .bnb-dialog rule found').toBeTruthy()

    const declared = new Set<string>()
    rule!.walkDecls((declaration) => {
      declared.add(declaration.prop)
    })
    for (const property of ['position', 'top', 'left', 'translate']) {
      expect(declared.has(property), `.bnb-dialog must set ${property} to centre itself`).toBe(true)
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
    const registered = atRuleParams(css, 'property')
    expect(registered.length, 'no @property registrations found at all').toBeGreaterThan(0)
    expect(
      registered.filter((name) => !name.startsWith('--tw-')),
      'these custom properties are registered globally outside the --tw- namespace',
    ).toEqual([])
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
    /*
     * The `calc(var(--bnbr-u) * n)` form every design size now takes is
     * systematically ~6x longer than the `Npx` literal it replaced, so the raw
     * source overstates what actually ships - this ceiling is loose on purpose.
     * The gzip ceiling below, not this one, is the assertion with real teeth.
     */
    expect(css.length).toBeLessThan(16_000)
  })

  test('gzips small enough to sit on a public page without thought', () => {
    // `calc(var(--bnbr-u) * ` repeats 20+ times and compresses to almost
    // nothing, so this is what the size budget actually has to answer to.
    expect(gzipSync(css).length).toBeLessThan(5_000)
  })

  test('carousel chrome and button padding scale with the banner', () => {
    /*
     * Anything sized in literal px inside the renderer stops scaling, so a
     * carousel arrow stays 34px on a banner that has doubled.
     *
     * Walking the parsed declarations, rather than scanning raw text line by
     * line, is what keeps this guard honest: comments (including one that
     * quotes `--bnbr-u: 1px` verbatim in prose) are Comment nodes, and a
     * `@container ... (max-width: 1023.98px)` condition lives in the at-rule's
     * params, not in a declaration - neither is ever visited by `walkDecls`, so
     * neither needs a textual skip that could coincidentally swallow something
     * real. The breakpoint conditions test the container's own width, and
     * expressing that in `--bnbr-u` would be circular, since the unit is
     * derived from the very width being tested - so they must stay literal
     * regardless.
     *
     * Only a pill's `border-radius: 999px`, the nav's `backdrop-filter:
     * blur(2px)` blur radius, and the `--bnbr-u: 1px` no-support fallback
     * itself are genuinely not design sizes.
     */
    const ALLOWED = [/^border-radius:\s*999px$/, /^backdrop-filter:\s*blur\(\d+px\)$/]
    const offenders: string[] = []
    postcss.parse(css).walkDecls((decl) => {
      if (!/\d+(\.\d+)?px/.test(decl.value)) return
      if (decl.prop === '--bnbr-u' && decl.value.trim() === '1px') return
      const declaration = `${decl.prop}: ${decl.value}`
      if (ALLOWED.some((re) => re.test(declaration))) return
      offenders.push(declaration)
    })
    expect(offenders).toEqual([])
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

  test('selects breakpoints from the container, not the viewport', () => {
    /*
     * The positive half reads the parsed at-rules, because a comment in this
     * stylesheet explains the mechanism by naming `@container bnbr-root` - and
     * a text match on that was satisfied by the prose alone. Replacing both
     * real at-rules with viewport media queries left it passing; only the
     * negative half below still bit.
     */
    const named = atRuleParams(css, 'container').filter((params) => /^bnbr-root\b/.test(params))
    expect(
      named,
      'no `@container bnbr-root (...)` at-rule: breakpoints are not chosen by the container',
    ).not.toEqual([])
    // A viewport media query here would make the banner wrong in any column
    // narrower than the window.
    expect(css).not.toMatch(/@media[^{]*width/)
  })

  test('shows the laptop tree when @container is unsupported', () => {
    /*
     * `.bnbr-bp { display: none }` plus `@container` rules to reveal one means a
     * browser without container query support matches nothing and renders a
     * blank banner. The laptop tree must be visible by default and overridden -
     * which means the rule making it visible must sit at the TOP LEVEL of the
     * sheet, not nested inside `@container` (or any other at-rule) itself.
     *
     * Checked structurally, not textually: a regex looking for the selector
     * followed eventually by `display: block` passes even when that pair sits
     * nested inside `@container`, because text position doesn't encode nesting.
     * That is precisely the bug this guard exists to catch, so it cannot be a
     * regex match on proximity alone.
     */
    let topLevelBlockFound = false
    postcss.parse(css).walkRules((rule) => {
      if (topLevelBlockFound) return
      if (!rule.selectors.some((s) => /\.bnbr-bp\[data-bp=['"]laptop['"]\]/.test(s))) return
      if (rule.parent?.type !== 'root') return
      rule.walkDecls('display', (decl) => {
        if (decl.value.trim() === 'block') topLevelBlockFound = true
      })
    })
    expect(
      topLevelBlockFound,
      'no top-level .bnbr-bp[data-bp="laptop"] rule declares display: block',
    ).toBe(true)
  })

  test('guards the scale unit with @supports, not a fallback declaration', () => {
    /*
     * Two declarations of a custom property do NOT give a fallback: a custom
     * property value is not parsed at declaration time, so the cqw version always
     * wins and only fails later, when substitution makes the *using* property
     * invalid at computed-value time. The guard has to be @supports.
     *
     * Checked structurally, via the parsed tree, rather than by stripping
     * `@supports { ... }` out of the raw text first: a text-scanning regex is
     * fooled by anything else in the file that mentions the at-rule - a comment
     * quoting it in prose extends the "skip to the next `{`" scan and can gobble
     * up (and thereby hide) a real, unguarded declaration sitting right after it.
     * That happened once already; walking the tree instead makes it structurally
     * impossible for prose to change what counts as "inside".
     */
    const guards = atRuleParams(css, 'supports').filter((params) =>
      /^\(container-type:\s*inline-size\)$/.test(params),
    )
    expect(guards, 'no `@supports (container-type: inline-size)` at-rule').not.toEqual([])
    const unguarded: string[] = []
    postcss.parse(css).walkDecls((decl) => {
      if (!/\d+cq[whib]/.test(decl.value)) return
      if (!isInsideAtRule(decl, 'supports')) {
        const selector = (decl.parent as { selector?: string } | undefined)?.selector ?? '?'
        unguarded.push(`${selector} { ${decl.prop}: ${decl.value} }`)
      }
    })
    expect(unguarded, 'container-query-unit declarations found outside @supports').toEqual([])
  })

  test('defaults the scale unit to one real pixel', () => {
    /*
     * Structural, and this one has to be: the declaration it looks for sits
     * three lines above a comment that quotes `--bnbr-u: 1px` verbatim in
     * prose, and comments survive the build. As a regex over the raw text this
     * guard could not fail - deleting the real declaration and leaving the
     * comment still matched - which is the sixth time on this branch that a
     * comment has satisfied an assertion about the syntax it discusses.
     *
     * What it must prove is not that the string appears but that the default is
     * *unconditional*. Nested inside any at-rule it would not be a default at
     * all, and a browser that skipped that at-rule would resolve every
     * `calc(var(--bnbr-u) * n)` against nothing: font sizes fall back to
     * inherited and panel geometry collapses.
     */
    const unconditional: string[] = []
    postcss.parse(css).walkDecls('--bnbr-u', (decl) => {
      if (decl.value.trim() !== '1px' || isInsideAnyAtRule(decl)) return
      unconditional.push((decl.parent as { selector?: string } | undefined)?.selector ?? '?')
    })
    expect(
      unconditional.length,
      'no unconditional `--bnbr-u: 1px` declaration in the built renderer CSS',
    ).toBeGreaterThan(0)
  })

  test('gives a fit/cover frame a height without container-query support, as ratio gets one', () => {
    /*
     * The other half of the same asymmetry as the `aspect-ratio` test below,
     * and it was missing.
     *
     * Everything that gives a `fit`/`cover` frame a box - the absolute
     * positioning, the centring, the width, the height - lived inside
     * `@supports (container-type: inline-size)`. Skip that block and the frame
     * keeps only `position: relative; width: 100%` with absolutely positioned
     * children: zero height, a blank banner, inside a wrapper that has already
     * reserved `frameHeight`. Precisely the failure the laptop-default rule and
     * the unguarded `aspect-ratio` exist to prevent, reintroduced by the two
     * newer modes.
     *
     * So an unguarded height has to exist. The test does not care what the
     * @supports block later does with it - that is the real box - only that
     * something outside the guard gives the frame a size to fall back to.
     */
    const outside: string[] = []
    postcss.parse(css).walkRules((rule) => {
      const targetsFittedFrame = rule.selectors.some(
        (s) => /\[data-size-mode=['"](fit|cover)['"]\]/.test(s) && s.includes('.bnbr-frame'),
      )
      if (!targetsFittedFrame || isInsideAnyAtRule(rule)) return
      rule.walkDecls('height', (decl) => {
        outside.push(`${rule.selector.trim()} { height: ${decl.value} }`)
      })
    })
    expect(
      outside.length,
      'no unguarded height on the fit/cover frame: a browser without container queries gets a blank banner',
    ).toBeGreaterThan(0)
  })

  test('keeps aspect-ratio unconditional, since it needs no container-query support', () => {
    /*
     * Unlike `cqw`/`cqh`, `aspect-ratio` works in every browser that supports
     * `container-type` at all - and in plenty that don't. Nested inside the
     * `@supports (container-type: inline-size)` guard anyway, a browser without
     * container-query support would get a `ratio` frame with no aspect-ratio,
     * `width: 100%`, absolutely positioned children, and zero height: the same
     * blank banner the laptop-default rule above exists to prevent, reintroduced
     * by the other half of this same mechanism.
     */
    const declarations: Rule[] = []
    postcss.parse(css).walkDecls('aspect-ratio', (decl) => {
      if (decl.parent?.type === 'rule') declarations.push(decl.parent as Rule)
    })
    expect(declarations.length, 'no aspect-ratio declaration found in renderer.css').toBeGreaterThan(0)
    const guarded = declarations.filter((rule) => isInsideAtRule(rule, 'supports'))
    expect(
      guarded.map((r) => r.selector),
      'aspect-ratio nested inside @supports would blank the banner in unsupported browsers',
    ).toEqual([])
  })
})

/*
 * What a consumer who follows the README actually loads for the editor.
 *
 * These exist because of a real integration failure: an app imported only
 * `builder.css`, and the editor came up looking entirely correct except that
 * `.bnbr-panel` never received `position: absolute`. Panels stacked down the
 * page instead of dividing the banner, so splitting appeared to add blank space
 * below it. Nothing threw, and every piece of editor chrome was perfect, which
 * is what made it read as a bug in the split rather than a missing stylesheet.
 */
describe('the shipped builder.css', () => {
  let css = ''

  beforeAll(async () => {
    css = await composeCss('builder')
  }, 120_000)

  test('reserves the canvas scrollbar gutter, so its width cannot oscillate', () => {
    /*
     * The canvas is measured to decide how far the frame is scaled down, and it
     * is also the element that scrolls. Without a reserved gutter those two
     * facts fight: a vertical scrollbar takes width out of the box, a narrower
     * box means a smaller frame, a smaller frame may no longer need the
     * scrollbar, and the width changes back. Reserving the space means the
     * measurement is the same either way.
     *
     * Structural rather than a text match - `scrollbar-gutter` appears in the
     * prose above the declaration too, and on this branch six assertions have
     * already been satisfied by a comment quoting the syntax they searched for.
     */
    let reserved = false
    postcss.parse(css).walkRules((rule) => {
      if (!rule.selector.includes('bnb-canvas')) return
      rule.walkDecls('scrollbar-gutter', (decl) => {
        if (decl.value.trim().startsWith('stable')) reserved = true
      })
    })
    expect(reserved, 'no `scrollbar-gutter: stable` on the canvas scroll container').toBe(true)
  })

  test('carries the renderer rules, so the editor needs no second import', () => {
    const panel = selectorsOf(css).find((s) => s.includes('bnbr-panel'))
    expect(panel, 'no .bnbr-panel rule in the shipped builder stylesheet').toBeTruthy()

    // The specific declaration whose absence caused the failure.
    let absolute = false
    postcss.parse(css).walkRules((rule) => {
      if (!rule.selector.includes('bnbr-panel')) return
      rule.walkDecls('position', (d) => {
        if (d.value === 'absolute') absolute = true
      })
    })
    expect(absolute, '.bnbr-panel must be positioned by builder.css alone').toBe(true)
  })

  test('still cannot match anything outside the package, scope for scope', () => {
    /*
     * Bundling the renderer rules widens what builder.css contains, but not what
     * it can reach: every selector must still sit under one of our two scopes.
     */
    const escapees = selectorsOf(css).filter(
      (s) => !s.includes(BUILDER_SCOPE) && !s.includes(RENDERER_SCOPE),
    )
    expect(escapees).toEqual([])
  })
})
