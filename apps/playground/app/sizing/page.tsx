import './sizing.css'
import 'react-bannerkit/renderer.css'

import { createDefaultTemplate } from 'react-bannerkit'
import { BannerRenderer } from 'react-bannerkit/renderer'

import { SizingReport } from './SizingReport'
import { WRAPPER_WIDTHS } from './widths'

export const metadata = {
  title: 'Sizing — react-bannerkit acceptance check',
}

/*
 * The acceptance check for the sizing model.
 *
 * Every design-pixel value a rendered banner emits is a multiple of
 * `--bnbr-u`, computed from its container's width with `cqw`, and the three
 * breakpoint layouts are chosen by container queries rather than viewport
 * media queries. This route is the only place that mechanism is checked
 * against a real browser's layout rather than markup a test asserts on — see
 * SizingReport for why.
 *
 * The same template renders inside four fixed-width wrappers, unchanged
 * between them, with no `breakpoint` prop — so which of the three layouts
 * each one shows is entirely up to the container queries in renderer.css,
 * not this page.
 */
const template = createDefaultTemplate({
  name: 'Sizing check',
  createdAt: '2026-01-01T00:00:00.000Z',
})

export default function SizingPage() {
  return (
    <main className="sizing-page">
      <h1>Sizing model acceptance check</h1>
      <p>
        One template, four fixed-width containers — <strong>1280</strong>, <strong>1640</strong>,{' '}
        <strong>980</strong> and <strong>500</strong> px. Each wrapper carries{' '}
        <code>data-sizing-wrapper=&quot;&lt;width&gt;&quot;</code>. No breakpoint is pinned, so
        renderer.css&apos;s container queries pick the layout for each one, and SizingReport below
        measures what actually rendered with <code>getComputedStyle</code> and{' '}
        <code>getBoundingClientRect</code>.
      </p>

      <div className="sizing-wrappers">
        {WRAPPER_WIDTHS.map((width) => (
          <div key={width} className="sizing-column">
            <h2>{width}px wide</h2>
            <div data-sizing-wrapper={width} className="sizing-wrapper" style={{ width }}>
              <BannerRenderer template={template} headingTag="h3" />
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Sizing report</h2>
      <SizingReport />
    </main>
  )
}
