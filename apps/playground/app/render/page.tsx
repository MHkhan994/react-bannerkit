import { createDefaultTemplate, splitPanel, updatePanel } from 'react-bannerkit'
import { BannerRenderer } from 'react-bannerkit/renderer'
import 'react-bannerkit/renderer.css'

import { ViewportReadout } from './ViewportReadout'

export const metadata = {
  title: 'Renderer — react-bannerkit',
}

/*
 * The renderer on a plain page, the way a consumer would use it.
 *
 * Note what this page does NOT import: builder.css. The renderer has to stand on
 * its own with only renderer.css, and this route is what proves it.
 *
 * This is a server component, and the templates are built here on the server, so
 * `view-source` should already contain the banner markup. That is the whole point
 * of the CSS-only breakpoint strategy - the correct layout is present on first
 * paint rather than chosen after hydration.
 */

/** A template with two panels side by side, so the layout maths is visible. */
function splitTemplate() {
  const t = createDefaultTemplate({ name: 'Split hero', createdAt: '2026-01-01T00:00:00.000Z' })
  for (const name of ['laptop', 'tablet', 'mobile'] as const) {
    const bp = t.breakpoints[name]
    const result = splitPanel(bp.root, bp.root.id, name === 'mobile' ? 'rows' : 'cols')
    if (result) {
      bp.root = updatePanel(result.root, result.panel.id, { bg: '#b68235' })
      bp.gutter = 8
    }
  }
  return t
}

/** A carousel, to exercise the one client component in the renderer. */
function carouselTemplate() {
  const t = createDefaultTemplate({ name: 'Carousel hero', createdAt: '2026-01-01T00:00:00.000Z' })
  for (const name of ['laptop', 'tablet', 'mobile'] as const) {
    const bp = t.breakpoints[name]
    bp.root = updatePanel(bp.root, bp.root.id, { type: 'carousel', interval: 2000, counter: true })
  }
  return t
}

const SECTIONS = [
  { id: 'default', title: 'Default template', template: createDefaultTemplate({ name: 'Default', createdAt: '2026-01-01T00:00:00.000Z' }) },
  { id: 'split', title: 'Two panels with an 8px gutter', template: splitTemplate() },
  { id: 'carousel', title: 'Carousel, 2s interval', template: carouselTemplate() },
]

export default function RenderPage() {
  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 80px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Renderer</h1>
      <p style={{ color: '#57534e', marginBottom: 24, fontSize: 14 }}>
        Server-rendered, with only <code>renderer.css</code> loaded. Resize across 768px and 1024px:
        the layout should change with no flash and no shift.
      </p>

      <ViewportReadout />

      {SECTIONS.map((section) => (
        <section key={section.id} id={section.id} style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8, color: '#57534e' }}>{section.title}</h2>
          <div data-banner={section.id}>
            <BannerRenderer template={section.template} headingTag="h3" />
          </div>
        </section>
      ))}

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8, color: '#57534e' }}>
          Pinned to mobile with the breakpoint prop
        </h2>
        <div data-banner="pinned" style={{ maxWidth: 390 }}>
          <BannerRenderer template={SECTIONS[0]!.template} breakpoint="mobile" headingTag="h3" />
        </div>
      </section>
    </main>
  )
}
