import './hostile.css'
// Both of the package's stylesheets, imported exactly as a consumer would. They
// are loaded together here on purpose: the editor renders banners inside itself,
// so the two sheets have to coexist without either reaching into the other.
import 'react-bannerkit/builder.css'
import 'react-bannerkit/renderer.css'

import { IsolationReport } from './IsolationReport'

export const metadata = {
  title: 'Hostile host — react-bannerkit isolation proof',
}

/*
 * The isolation proof page.
 *
 * The host here is as unfriendly as a real application gets: a global
 * content-box reset, restyled headings and form controls, a second Tailwind
 * build, and class names that collide with Tailwind's own - one of them with
 * !important. Both the host's sample markup and an editor-scoped probe are
 * rendered side by side, and IsolationReport measures the result.
 *
 * The two blocks use identical markup on purpose. Any visual difference between
 * them is the isolation boundary doing its job.
 */
export default function HostilePage() {
  return (
    <div className="host-page">
      <h1 id="host-heading">Hostile host page</h1>
      <p id="host-para">
        This page fights the package on purpose. It ships a global{' '}
        <code>* {'{ box-sizing: content-box }'}</code> reset, restyles every heading, button and
        input, runs its own Tailwind build, and redefines <code>.flex</code> as{' '}
        <code>display: block !important</code>. The report below reads live computed styles to
        check that neither side has affected the other.
      </p>

      <div id="host-body-probe">
        <div
          id="host-box-probe"
          style={{ width: 100, padding: 10, border: '5px solid transparent' }}
        />
      </div>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr', marginTop: 24 }}>
        <div>
          <h2>Host markup (outside the package)</h2>
          <div className="host-sample">
            <h1>Heading</h1>
            <p>
              A paragraph with a <a href="#none">wavy link</a> in it.
            </p>
            <button id="host-button" type="button">
              Host button
            </button>
            <input id="host-input" defaultValue="host input" />
            <ul id="host-list">
              <li>First item</li>
              <li>Second item</li>
            </ul>
            <div id="host-flex" className="flex">
              A div with class=&quot;flex&quot;
            </div>
          </div>
        </div>

        <div>
          <h2>Same markup inside .bnb-root</h2>
          {/*
            The scope class is all a consumer needs. Everything below inherits the
            package's reset and palette instead of the host's.
          */}
          <div id="editor-root" className="bnb-root" style={{ padding: 20 }}>
            <div id="editor-box-probe" className="border" style={{ width: 100, padding: 10 }} />
            <h1 id="editor-heading">Heading</h1>
            <p id="editor-para">
              A paragraph with a{' '}
              <a id="editor-link" href="#none">
                link
              </a>{' '}
              in it.
            </p>
            <button id="editor-button" type="button" className="rounded border px-3 py-1">
              Editor button
            </button>
            <input id="editor-input" defaultValue="editor input" className="border px-2 py-1" />
            <ul id="editor-list">
              <li>First item</li>
              <li>Second item</li>
            </ul>
            <div id="editor-flex" className="flex gap-2">
              <span>a div with</span>
              <span>class=&quot;flex&quot;</span>
            </div>

            {/*
              A stand-in for a rendered banner sitting inside the editor, as the
              canvas and preview both do. The firewall must NOT reach in here:
              banner styling is inline style from the document, and !important
              beats inline style, so a firewall that applied would flatten it.
            */}
            <div className="bnbr" style={{ marginTop: 12, position: 'relative', height: 60 }}>
              <div
                id="banner-overlay"
                className="bnbr-overlay"
                style={{ background: '#201f1d', opacity: 0.42 }}
              />
              <span id="banner-button" className="bnbr-button" style={{ color: '#f8f4f4' }}>
                Rendered button
              </span>
            </div>
          </div>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>Isolation report</h2>
      <IsolationReport />
    </div>
  )
}
