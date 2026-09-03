// @vitest-environment happy-dom
/*
 * The renderer's contract.
 *
 * Two properties matter more than anything else here, because this component
 * lands on public marketing pages:
 *
 *   1. It must never throw. A template comes out of a database, and a bad row
 *      cannot be allowed to take down the page it sits on.
 *   2. It must render correctly on the server, on first paint, with no
 *      measurement and no layout effect - otherwise it costs LCP and CLS.
 */
import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import '../test/setup'

import { createDefaultTemplate, createElement, createPanel } from '../core/defaults'
import { createSequentialIdFactory } from '../core/ids'
import { splitPanel, updatePanel } from '../core/tree'
import { DEVICES, designWidthOf, type BannerTemplate } from '../core/types'
import { BannerRenderer } from './BannerRenderer'

const ids = () => createSequentialIdFactory('t')
const template = (overrides?: (t: BannerTemplate) => void): BannerTemplate => {
  const t = createDefaultTemplate({ id: ids(), createdAt: '2026-01-01T00:00:00.000Z' })
  overrides?.(t)
  return t
}

const bp = (name: string) => document.querySelector(`.bnbr-bp[data-bp="${name}"]`)

/*
 * Extracts one element's opening tag from server-rendered HTML, for asserting
 * on its inline style.
 *
 * Several assertions below read a `calc()`-wrapped design-px value (e.g.
 * `calc(var(--bnbr-u) * 40)`) rather than a plain px string. happy-dom's
 * CSSStyleDeclaration validates length-typed properties with a `calc()`
 * regex that does not allow nested parentheses, so setting that value via
 * `render()` + `.style.foo` (or even `getAttribute('style')`, which reads
 * back the same validated state) gets silently dropped instead of stored -
 * the DOM never has the value to report. Reading the SSR string instead
 * reflects what the renderer actually emitted.
 */
function openTag(html: string, className: string): string {
  const match = html.match(new RegExp(`<[a-z][a-z0-9]*\\b[^>]*class="${className}(?:\\s[^"]*)?"[^>]*>`))
  if (!match) throw new Error(`no element with class "${className}" in rendered output`)
  return match[0]
}

describe('breakpoints', () => {
  test('emits all three layouts so CSS can choose without JavaScript', () => {
    render(<BannerRenderer template={template()} />)
    expect(bp('laptop')).toBeTruthy()
    expect(bp('tablet')).toBeTruthy()
    expect(bp('mobile')).toBeTruthy()
  })

  test('emits only the named layout when the consumer picks one', () => {
    render(<BannerRenderer template={template()} breakpoint="mobile" />)
    expect(document.querySelectorAll('.bnbr-bp').length).toBe(0)
    const only = document.querySelectorAll('.bnbr-bp-fixed')
    expect(only.length).toBe(1)
    expect(only[0]!.getAttribute('data-bp')).toBe('mobile')
  })

  test('exposes each ratio layout\'s design height as a custom property, not an inline height', () => {
    /*
     * `ratio` gets its height from `aspect-ratio` in renderer.css, driven by
     * `--bnbr-dw`/`--bnbr-dh`. An inline height here would fight `aspect-ratio`
     * and pin the frame to design px instead of letting it scale.
     */
    const t = template((x) => {
      x.breakpoints.laptop.designHeight = 500
      x.breakpoints.mobile.designHeight = 300
    })
    render(<BannerRenderer template={t} />)
    const laptopWrapper = bp('laptop') as HTMLElement
    const mobileWrapper = bp('mobile') as HTMLElement
    expect(laptopWrapper.style.getPropertyValue('--bnbr-dh')).toBe('500')
    expect(mobileWrapper.style.getPropertyValue('--bnbr-dh')).toBe('300')
    expect(laptopWrapper.style.height).toBe('')
    expect(laptopWrapper.querySelector<HTMLElement>('.bnbr-frame')!.style.height).toBe('')
  })

  test('sizes the fit/cover wrapper in vh, letting the browser resolve it', () => {
    /*
     * `fit`/`cover` have no intrinsic height - the frame inside is absolutely
     * positioned - so the wrapper (`.bnbr-bp`), not `.bnbr-frame`, carries the
     * height.
     */
    const t = template((x) => {
      x.breakpoints.laptop.sizeMode = 'fit'
      x.breakpoints.laptop.frameHeightUnit = 'vh'
      x.breakpoints.laptop.frameHeight = 60
    })
    render(<BannerRenderer template={t} />)
    const wrapper = bp('laptop') as HTMLElement
    expect(wrapper.style.height).toBe('60vh')
    expect(wrapper.querySelector<HTMLElement>('.bnbr-frame')!.style.height).toBe('')
  })

  test('gives every sizing wrapper its data-size-mode and scale variables, responsive and pinned alike', () => {
    /*
     * Every `@supports` rule in renderer.css keys off `data-size-mode`, and
     * `--bnbr-dw`/`--bnbr-dh` feed every scale calculation. Missing either on
     * either wrapper type - `.bnbr-bp` or `.bnbr-bp-fixed` - would leave that
     * path unscaled with nothing failing loudly, since a missing custom
     * property just resolves to nothing rather than throwing.
     */
    const t = template()

    const responsive = render(<BannerRenderer template={t} />)
    const laptop = bp('laptop') as HTMLElement
    expect(laptop.getAttribute('data-size-mode')).toBe(t.breakpoints.laptop.sizeMode)
    expect(laptop.style.getPropertyValue('--bnbr-dw')).toBe(String(designWidthOf(t, 'laptop')))
    expect(laptop.style.getPropertyValue('--bnbr-dh')).toBe(String(t.breakpoints.laptop.designHeight))
    responsive.unmount()

    render(<BannerRenderer template={t} breakpoint="tablet" />)
    const fixed = document.querySelector('.bnbr-bp-fixed') as HTMLElement
    expect(fixed.getAttribute('data-size-mode')).toBe(t.breakpoints.tablet.sizeMode)
    expect(fixed.style.getPropertyValue('--bnbr-dw')).toBe(String(designWidthOf(t, 'tablet')))
    expect(fixed.style.getPropertyValue('--bnbr-dh')).toBe(String(t.breakpoints.tablet.designHeight))
    // Sanity: the default template really does use the built-in device width.
    expect(designWidthOf(t, 'tablet')).toBe(DEVICES.tablet.width)
  })
})

describe('server rendering', () => {
  test('renders to static markup with no client work at all', () => {
    const html = renderToStaticMarkup(<BannerRenderer template={template()} />)
    expect(html).toContain('bnbr-frame')
    expect(html).toContain('A season of new arrivals')
  })

  test('the markup is complete on the server, not filled in on hydration', () => {
    // Three trees, each with the heading: nothing waits for a media query in JS.
    const html = renderToStaticMarkup(<BannerRenderer template={template()} />)
    expect(html.match(/A season of new arrivals/g)).toHaveLength(3)
  })
})

describe('resilience', () => {
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nonsense'],
    ['an empty object', {}],
    ['a broken tree', { breakpoints: { laptop: { root: { kind: 'split' } } } }],
  ])('renders something sane when given %s instead of a template', (_label, input) => {
    expect(() =>
      renderToStaticMarkup(<BannerRenderer template={input as never} />),
    ).not.toThrow()
  })

  test('repairs an out-of-range value rather than rendering it', () => {
    const t = template((x) => {
      const root = x.breakpoints.laptop.root as unknown as Record<string, unknown>
      root.pad = -50
    })
    const html = renderToStaticMarkup(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(openTag(html, 'bnbr-stack')).toContain('padding:calc(var(--bnbr-u) * 0)')
  })
})

describe('padding sits on the stack, not the panel', () => {
  /*
   * Padding has to inset the content without insetting the background: a hero
   * photo is full-bleed and the text is not. Putting padding on the panel would
   * push the background image in by the same amount, and for a carousel it would
   * inset every slide's background too.
   */
  test('insets the content but not the background image', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { pad: 40, bgMode: 'photo', img: 'https://example.test/hero.jpg' },
      )
    })
    const html = renderToStaticMarkup(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(openTag(html, 'bnbr-panel')).not.toContain('padding')
    expect(openTag(html, 'bnbr-stack')).toContain('padding:calc(var(--bnbr-u) * 40)')
  })

  test('carries the panel alignment and gap onto the stack', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { alignX: 'center', alignY: 'flex-end', gap: 22 },
      )
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const stack = document.querySelector<HTMLElement>('.bnbr-stack')!
    expect(stack.style.alignItems).toBe('center')
    expect(stack.style.justifyContent).toBe('flex-end')
    expect(stack.style.gap).toBe('calc(var(--bnbr-u) * 22)')
  })
})

describe('accessibility', () => {
  /*
   * The design handoff gave images no alt text at all. An image element is
   * content, not decoration, so it needs one - and a banner is exactly the kind
   * of component that ends up carrying a product name or a price.
   */
  test('an image renders the alt text the document carries', () => {
    const t = template((x) => {
      const root = x.breakpoints.laptop.root
      if (root.kind === 'split') throw new Error('expected a panel')
      const image = createElement('image', ids())
      if (image.type === 'image') {
        image.src = 'https://example.test/book.jpg'
        image.alt = 'A hand-bound clothbound edition'
      }
      root.elements = [image]
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(screen.getByAltText('A hand-bound clothbound edition')).toBeTruthy()
  })

  test('a panel background image is marked decorative, since the text carries the meaning', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { bgMode: 'photo', img: 'https://example.test/hero.jpg' },
      )
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(document.querySelector('img.bnbr-bg')!.getAttribute('alt')).toBe('')
  })

  test('renders the heading as a paragraph by default, leaving the host document outline alone', () => {
    render(<BannerRenderer template={template()} breakpoint="laptop" />)
    expect(document.querySelector('.bnbr-heading')!.tagName).toBe('P')
    expect(document.querySelector('h1, h2, h3')).toBeNull()
  })

  test('promotes the heading to a real heading when the consumer asks', () => {
    render(<BannerRenderer template={template()} breakpoint="laptop" headingTag="h2" />)
    expect(document.querySelector('.bnbr-heading')!.tagName).toBe('H2')
  })
})

describe('panel geometry', () => {
  test('positions a lone panel across the whole frame', () => {
    render(<BannerRenderer template={template()} breakpoint="laptop" />)
    const panel = document.querySelector<HTMLElement>('.bnbr-panel')!
    expect(panel.style.left).toBe('0%')
    expect(panel.style.width).toBe('100%')
    expect(panel.style.height).toBe('100%')
  })

  test('splits two panels down the middle', () => {
    const t = template((x) => {
      const root = x.breakpoints.laptop.root
      const result = splitPanel(root, root.id, 'cols', ids())
      if (result) x.breakpoints.laptop.root = result.root
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const panels = document.querySelectorAll<HTMLElement>('.bnbr-panel')
    expect(panels).toHaveLength(2)
    expect(panels[0]!.style.left).toBe('0%')
    expect(panels[0]!.style.width).toBe('50%')
    expect(panels[1]!.style.left).toBe('50%')
  })

  test('insets panels by half the gutter so neighbours sit a full gutter apart', () => {
    const t = template((x) => {
      x.breakpoints.laptop.gutter = 16
    })
    const html = renderToStaticMarkup(<BannerRenderer template={t} breakpoint="laptop" />)
    const panelTag = openTag(html, 'bnbr-panel')
    expect(panelTag).toContain('left:calc(0% + calc(var(--bnbr-u) * 8))')
    expect(panelTag).toContain('width:calc(100% - calc(var(--bnbr-u) * 16))')
  })

  /*
   * `bg` has two jobs and two boxes to do them in, and until now it was only
   * declared on one of them.
   *
   * It fills the gutter, which is inset *inside* the frame - the assertion
   * below this one. Under `fit` it is also the letterbox: the frame is the
   * scaled design box, centred inside a wrapper that reserves `frameHeight`, so
   * the margin above and below the design belongs to the wrapper. With only the
   * frame painted, that margin was transparent and the host page showed through
   * it - measured as two 79px bands of whatever colour the page happened to be,
   * on a claim both the README and `types.ts` make explicitly.
   *
   * Asserted on the server-rendered string rather than through the DOM because
   * the wrapper's other declarations are `calc(var(--bnbr-u) * n)` lengths that
   * happy-dom drops, and reading a style attribute back reads the same
   * validated state.
   */
  test.each(['ratio', 'fit', 'cover'] as const)(
    'paints the frame colour on the sizing wrapper as well as the frame, in %s',
    (sizeMode) => {
      const t = template((x) => {
        x.breakpoints.laptop.sizeMode = sizeMode
        x.breakpoints.laptop.frameHeight = 800
        x.breakpoints.laptop.frameHeightUnit = 'px'
        x.breakpoints.laptop.bg = 'rgb(1, 2, 3)'
      })
      const html = renderToStaticMarkup(<BannerRenderer template={t} breakpoint="laptop" />)
      expect(openTag(html, 'bnbr-bp-fixed')).toContain('background-color:rgb(1, 2, 3)')
      expect(openTag(html, 'bnbr-frame')).toContain('background-color:rgb(1, 2, 3)')
    },
  )

  test('paints it on the responsive wrappers too, which is where a migrated vh document lands', () => {
    const t = template((x) => {
      x.breakpoints.mobile.sizeMode = 'fit'
      x.breakpoints.mobile.frameHeightUnit = 'vh'
      x.breakpoints.mobile.frameHeight = 100
      x.breakpoints.mobile.bg = 'rgb(4, 5, 6)'
    })
    render(<BannerRenderer template={t} />)
    const wrapper = bp('mobile') as HTMLElement
    expect(wrapper.style.backgroundColor).toBe('rgb(4, 5, 6)')
  })

  test('shows the frame colour, which is what fills the gutter', () => {
    const t = template((x) => {
      x.breakpoints.laptop.bg = 'rgb(1, 2, 3)'
      x.breakpoints.laptop.gutter = 8
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const frame = document.querySelector<HTMLElement>('.bnbr-frame')!
    expect(frame.style.backgroundColor).toBe('rgb(1, 2, 3)')
  })
})

describe('elements', () => {
  test('never emits a document id, because every element appears three times', () => {
    /*
     * All three breakpoints are in the DOM at once, so an element id used as an
     * HTML id would be duplicated and any `getElementById` or `#anchor` would
     * resolve to whichever tree happened to come first.
     */
    render(<BannerRenderer template={template()} />)
    const withIds = document.querySelectorAll('.bnbr [id]')
    expect(withIds).toHaveLength(0)
    expect(document.querySelectorAll('[data-bnb-el]').length).toBeGreaterThan(0)
  })

  test('renders the overlay first and keeps it out of the way of clicks', () => {
    render(<BannerRenderer template={template()} breakpoint="laptop" />)
    const overlay = document.querySelector<HTMLElement>('.bnbr-overlay')!
    expect(overlay).toBeTruthy()
    expect(overlay.style.opacity).toBe('0.42')
  })

  test('applies the typography the document asked for', () => {
    const html = renderToStaticMarkup(<BannerRenderer template={template()} breakpoint="laptop" />)
    expect(html).toContain('A season of new arrivals')
    const headingTag = openTag(html, 'bnbr-heading')
    expect(headingTag).toContain('font-size:calc(var(--bnbr-u) * 46)')
    expect(headingTag).toContain('font-weight:400')
    expect(headingTag).toContain('max-width:26ch')
  })

  test('renders a button with a destination as a real link', () => {
    const t = template((x) => {
      const root = x.breakpoints.laptop.root
      if (root.kind === 'split') throw new Error('expected a panel')
      const button = root.elements.find((e) => e.type === 'button')
      if (button?.type === 'button') button.href = '/collection'
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const link = screen.getByRole('link', { name: 'Browse the collection' })
    expect(link.getAttribute('href')).toBe('/collection')
  })

  test('renders a button without a destination as a button, not a dead link', () => {
    render(<BannerRenderer template={template()} breakpoint="laptop" />)
    // The default template's button has no href.
    expect(screen.queryByRole('link', { name: 'Browse the collection' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Browse the collection' })).toBeTruthy()
  })

  test('lifts a freely positioned element out of the stack', () => {
    const t = template((x) => {
      const root = x.breakpoints.laptop.root
      if (root.kind === 'split') throw new Error('expected a panel')
      const heading = root.elements.find((e) => e.type === 'heading')
      if (heading) heading.pos = { x: 12, y: 34 }
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const heading = document.querySelector<HTMLElement>('.bnbr-heading')!
    expect(heading.classList.contains('bnbr-free')).toBe(true)
    expect(heading.style.left).toBe('12%')
    expect(heading.style.top).toBe('34%')
  })

  test('renders a spacer with no visible decoration', () => {
    const t = template((x) => {
      const root = x.breakpoints.laptop.root
      if (root.kind === 'split') throw new Error('expected a panel')
      root.elements = [createElement('spacer', ids())]
    })
    const html = renderToStaticMarkup(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(openTag(html, 'bnbr-spacer')).toContain('height:calc(var(--bnbr-u) * 18)')
    expect(html.match(/<div[^>]*class="bnbr-spacer"[^>]*>([\s\S]*?)<\/div>/)?.[1]).toBe('')
  })
})

describe('panel background and links', () => {
  test('renders a photo background as a real img so the browser can prioritise it', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { bgMode: 'photo', img: 'https://example.test/hero.jpg' },
      )
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const img = document.querySelector<HTMLImageElement>('img.bnbr-bg')!
    expect(img.getAttribute('src')).toBe('https://example.test/hero.jpg')
    expect(img.getAttribute('alt')).toBe('')
  })

  test('uses a flat colour when that is what the panel asks for', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { bgMode: 'color', bg: 'rgb(9, 9, 9)' },
      )
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(document.querySelector('img.bnbr-bg')).toBeNull()
    const panel = document.querySelector<HTMLElement>('.bnbr-panel')!
    expect(panel.style.backgroundColor).toBe('rgb(9, 9, 9)')
  })

  test('makes a whole panel clickable when it has a destination', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { href: '/sale' },
      )
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const anchor = document.querySelector<HTMLAnchorElement>('a.bnbr-panel')
    expect(anchor?.getAttribute('href')).toBe('/sale')
  })
})

describe('carousel', () => {
  const carousel = () =>
    template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { type: 'carousel', autoplay: false },
      )
    })

  test('stacks every slide, so each can hold its own background and content', () => {
    render(<BannerRenderer template={carousel()} breakpoint="laptop" />)
    expect(document.querySelectorAll('.bnbr-slide')).toHaveLength(2)
  })

  test('marks exactly one slide active on first paint', () => {
    render(<BannerRenderer template={carousel()} breakpoint="laptop" />)
    const active = [...document.querySelectorAll('.bnbr-slide')].filter(
      (s) => s.getAttribute('data-active') === 'true',
    )
    expect(active).toHaveLength(1)
  })

  test('hides inactive slides from assistive technology', () => {
    render(<BannerRenderer template={carousel()} breakpoint="laptop" />)
    const inactive = document.querySelector('.bnbr-slide[data-active="false"]')
    expect(inactive?.getAttribute('aria-hidden')).toBe('true')
  })

  test('renders arrows and pagination when the panel asks for them', () => {
    render(<BannerRenderer template={carousel()} breakpoint="laptop" />)
    expect(document.querySelectorAll('.bnbr-nav')).toHaveLength(2)
    expect(document.querySelectorAll('.bnbr-dot')).toHaveLength(2)
  })

  test('omits pagination entirely when it is turned off', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = updatePanel(
        x.breakpoints.laptop.root,
        x.breakpoints.laptop.root.id,
        { type: 'carousel', autoplay: false, pagination: 'none', arrows: false },
      )
    })
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    expect(document.querySelectorAll('.bnbr-dots')).toHaveLength(0)
    expect(document.querySelectorAll('.bnbr-nav')).toHaveLength(0)
  })

  test('a single panel renders no carousel chrome at all', () => {
    render(<BannerRenderer template={template()} breakpoint="laptop" />)
    expect(document.querySelector('.bnbr-carousel')).toBeNull()
    expect(document.querySelector('.bnbr-nav')).toBeNull()
  })
})

describe('the renderer is not the editor', () => {
  test('carries no Tailwind utility classes, so builder.css is never needed', () => {
    const html = renderToStaticMarkup(<BannerRenderer template={template()} />)
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/))
    const foreign = classes.filter((c) => c && !c.startsWith('bnbr'))
    expect(foreign).toEqual([])
  })

  test('accepts a className without losing its own scope class', () => {
    render(<BannerRenderer template={template()} className="my-banner" />)
    const root = document.querySelector('.bnbr')!
    expect(root.classList.contains('my-banner')).toBe(true)
    expect(root.classList.contains('bnbr')).toBe(true)
  })

  test('renders a panel with no elements without complaint', () => {
    const t = template((x) => {
      x.breakpoints.laptop.root = createPanel(ids())
    })
    expect(() =>
      renderToStaticMarkup(<BannerRenderer template={t} breakpoint="laptop" />),
    ).not.toThrow()
  })
})
