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
import type { BannerTemplate } from '../core/types'
import { BannerRenderer } from './BannerRenderer'

const ids = () => createSequentialIdFactory('t')
const template = (overrides?: (t: BannerTemplate) => void): BannerTemplate => {
  const t = createDefaultTemplate({ id: ids(), createdAt: '2026-01-01T00:00:00.000Z' })
  overrides?.(t)
  return t
}

const bp = (name: string) => document.querySelector(`.bnbr-bp[data-bp="${name}"]`)

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

  test('gives each layout the height its breakpoint asks for', () => {
    const t = template((x) => {
      x.breakpoints.laptop.height = 500
      x.breakpoints.mobile.height = 300
    })
    render(<BannerRenderer template={t} />)
    expect(bp('laptop')?.querySelector('.bnbr-frame')).toHaveProperty('style')
    const laptopFrame = bp('laptop')!.querySelector<HTMLElement>('.bnbr-frame')!
    const mobileFrame = bp('mobile')!.querySelector<HTMLElement>('.bnbr-frame')!
    expect(laptopFrame.style.height).toBe('500px')
    expect(mobileFrame.style.height).toBe('300px')
  })

  test('expresses a viewport height in vh, letting the browser resolve it', () => {
    const t = template((x) => {
      x.breakpoints.laptop.heightMode = 'vh'
      x.breakpoints.laptop.vh = 60
    })
    render(<BannerRenderer template={t} />)
    const frame = bp('laptop')!.querySelector<HTMLElement>('.bnbr-frame')!
    expect(frame.style.height).toBe('60vh')
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
    render(<BannerRenderer template={t} />)
    const stack = bp('laptop')!.querySelector<HTMLElement>('.bnbr-stack')!
    expect(stack.style.padding).toBe('0px')
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
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const panel = document.querySelector<HTMLElement>('.bnbr-panel')!
    const stack = document.querySelector<HTMLElement>('.bnbr-stack')!
    expect(panel.style.padding).toBe('')
    expect(stack.style.padding).toBe('40px')
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
    expect(stack.style.gap).toBe('22px')
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
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const panel = document.querySelector<HTMLElement>('.bnbr-panel')!
    expect(panel.style.left).toBe('calc(0% + 8px)')
    expect(panel.style.width).toBe('calc(100% - 16px)')
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
    render(<BannerRenderer template={template()} breakpoint="laptop" />)
    const heading = document.querySelector<HTMLElement>('.bnbr-heading')!
    expect(heading.textContent).toBe('A season of new arrivals')
    expect(heading.style.fontSize).toBe('46px')
    expect(heading.style.fontWeight).toBe('400')
    expect(heading.style.maxWidth).toBe('26ch')
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
    render(<BannerRenderer template={t} breakpoint="laptop" />)
    const spacer = document.querySelector<HTMLElement>('.bnbr-spacer')!
    expect(spacer.style.height).toBe('18px')
    expect(spacer.textContent).toBe('')
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
