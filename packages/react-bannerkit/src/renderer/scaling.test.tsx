/*
 * Every size in a banner must scale with the container.
 *
 * A value someone forgot to convert does not throw and does not look wrong in
 * the editor, where the scale unit is exactly 1px - it only misbehaves on a
 * consumer's page, at a width nobody tested. So the check is mechanical: no
 * scaling property may emit a literal `px`.
 *
 * This reads the server-rendered HTML string rather than mounting into a DOM
 * (as `@vitest-environment happy-dom` plus `render()` would do), because
 * happy-dom's CSSStyleDeclaration validates length-typed properties with a
 * `calc()` regex that does not allow nested parentheses. `calc(var(--bnbr-u)
 * * 46)` fails that regex and is silently dropped rather than stored, so a
 * DOM-based read of `.style.fontSize` (or even `getAttribute('style')`, which
 * reads back the same validated state) comes back empty regardless of what
 * the renderer actually emitted - the exact thing this test exists to check.
 * `renderToStaticMarkup` builds the style string directly from the element
 * tree with no such validation, so it reflects reality.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createDefaultTemplate, createElement } from '../core/defaults'
import type { BannerTemplate, ButtonElement, IconElement, ImageElement, LinkElement } from '../core/types'
import { BannerRenderer } from './BannerRenderer'

/*
 * Properties whose values come from the document and must therefore scale.
 *
 * `border` is listed alongside `border-width` and `border-radius`: the
 * membership check below is `property === p || property.startsWith(p)`, and
 * `'border'` does not satisfy either of those against `'border-width'` or
 * `'border-radius'` (it is a prefix of neither - they are prefixes of it).
 * Without `'border'` itself in the list, the `border: 1px solid …` shorthand
 * ElementView emits for buttons and the image plate would slip past this
 * test unnoticed - exactly the two spots most likely to be missed.
 */
const SCALING_PROPERTIES = [
  'font-size',
  'padding',
  'gap',
  'border-radius',
  'border-width',
  'border',
  'width',
  'height',
  'left',
  'top',
]

/** Every `style="..."` attribute value in a rendered HTML string. */
function inlineStyles(html: string): string[] {
  return [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]!)
}

/** Every scaling-property offender (a literal `px`) across a rendered HTML string. */
function pxOffenders(html: string): string[] {
  const offenders: string[] = []
  for (const style of inlineStyles(html)) {
    for (const declaration of style.split(';')) {
      const [property, value] = declaration.split(':').map((s) => s.trim())
      if (!property || !value) continue
      if (!SCALING_PROPERTIES.some((p) => property === p || property.startsWith(p))) continue
      // A vh frame height is a real viewport length and is allowed to be one.
      if (value.includes('vh')) continue
      if (/\d+px/.test(value)) offenders.push(`${property}: ${value}`)
    }
  }
  return offenders
}

/**
 * Extracts one element's opening tag from server-rendered HTML, for asserting
 * on its inline style without ambiguity when several elements share a style
 * property name.
 */
function openTag(html: string, className: string): string {
  const match = html.match(new RegExp(`<[a-z][a-z0-9]*\\b[^>]*class="${className}(?:\\s[^"]*)?"[^>]*>`))
  if (!match) throw new Error(`no element with class "${className}" in rendered output`)
  return match[0]
}

/*
 * `createDefaultTemplate()` only ever produces `overlay` / `heading` / `text`
 * / `button` elements, a `button.variant` of `'primary'`, and a panel with
 * `radius: 0` / `borderW: 0`. That leaves five conversions with no coverage
 * at all: `link`'s font size, `icon`'s width/height, an image's border-radius
 * and plate border, the `'ghost'` button border, and the panel's own
 * border-radius and border - the last pair doubly hidden, since both are
 * emitted only when the source value is truthy, so a zero radius/borderW
 * never even reaches the style object.
 *
 * Built by cloning the default template rather than a from-scratch literal:
 * every other field the type requires (carousel settings, slides, the other
 * two breakpoints) stays populated with a valid value this test doesn't care
 * about, and only the panel box and the element list are overridden.
 */
function scalingFixtureTemplate(): BannerTemplate {
  const t = structuredClone(createDefaultTemplate({ name: 'Scale fixture' }))
  const root = t.breakpoints.laptop.root
  if (root.kind !== 'panel') throw new Error('expected a panel')

  root.radius = 12
  root.borderW = 3

  const link = createElement('link') as LinkElement
  link.fs = 18

  const icon = createElement('icon') as IconElement
  icon.fs = 32

  const image = createElement('image') as ImageElement
  image.plate = true
  image.radius = 8

  const button = createElement('button') as ButtonElement
  button.variant = 'ghost'

  root.elements = [link, icon, image, button]
  return t
}

describe('design pixels', () => {
  it('emits no literal px for any property driven by the document', () => {
    const html = renderToStaticMarkup(
      <BannerRenderer template={createDefaultTemplate({ name: 'Scale' })} breakpoint="laptop" />,
    )
    expect(pxOffenders(html)).toEqual([])
  })

  it('scales a heading with the unit rather than pinning it', () => {
    const html = renderToStaticMarkup(
      <BannerRenderer template={createDefaultTemplate({ name: 'Scale' })} breakpoint="laptop" />,
    )
    const headingTag = html.match(/<[a-z][a-z0-9]*\b[^>]*class="bnbr-heading[^"]*"[^>]*>/)?.[0]
    expect(headingTag).toContain('calc(var(--bnbr-u) *')
  })

  describe('branches the default template never exercises', () => {
    it('emits no literal px either, for a link, an icon, a plated image, a ghost button, or a bordered panel', () => {
      const html = renderToStaticMarkup(
        <BannerRenderer template={scalingFixtureTemplate()} breakpoint="laptop" />,
      )
      expect(pxOffenders(html)).toEqual([])
    })

    it('scales a link font size', () => {
      const html = renderToStaticMarkup(
        <BannerRenderer template={scalingFixtureTemplate()} breakpoint="laptop" />,
      )
      expect(openTag(html, 'bnbr-link')).toContain('font-size:calc(var(--bnbr-u) * 18)')
    })

    it('scales an icon glyph in both dimensions', () => {
      const html = renderToStaticMarkup(
        <BannerRenderer template={scalingFixtureTemplate()} breakpoint="laptop" />,
      )
      const iconTag = openTag(html, 'bnbr-icon')
      expect(iconTag).toContain('width:calc(var(--bnbr-u) * 32)')
      expect(iconTag).toContain('height:calc(var(--bnbr-u) * 32)')
    })

    it('scales an image border-radius and its plate border', () => {
      const html = renderToStaticMarkup(
        <BannerRenderer template={scalingFixtureTemplate()} breakpoint="laptop" />,
      )
      const imageTag = openTag(html, 'bnbr-image')
      expect(imageTag).toContain('border-radius:calc(var(--bnbr-u) * 8)')
      expect(imageTag).toContain('border:calc(var(--bnbr-u) * 6) solid')
    })

    it('scales a ghost button border, even though it draws no colour', () => {
      const html = renderToStaticMarkup(
        <BannerRenderer template={scalingFixtureTemplate()} breakpoint="laptop" />,
      )
      expect(openTag(html, 'bnbr-button')).toContain('border:calc(var(--bnbr-u) * 1) solid transparent')
    })

    it('scales a panel border-radius and border, which a zero value would hide entirely', () => {
      const html = renderToStaticMarkup(
        <BannerRenderer template={scalingFixtureTemplate()} breakpoint="laptop" />,
      )
      const panelTag = openTag(html, 'bnbr-panel')
      expect(panelTag).toContain('border-radius:calc(var(--bnbr-u) * 12)')
      expect(panelTag).toContain('border:calc(var(--bnbr-u) * 3) solid')
    })
  })
})
