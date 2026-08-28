'use client'

/*
 * A self-checking isolation harness.
 *
 * "It looked fine when I tried it" is not evidence. This component reads real
 * computed styles out of the live document and asserts them in both directions:
 *
 *   host   - elements belonging to the hostile page must keep the hostile page's
 *            styling, proving nothing the package ships reached out.
 *   editor - elements inside `.bnb-root` must keep the package's styling,
 *            proving the hostile page's aggressive CSS did not reach in.
 *
 * The verdict is rendered on the page, so a browser check is a pass/fail read
 * rather than an eyeball judgement.
 */

import { useEffect, useState } from 'react'

type Direction = 'host' | 'editor'

interface Check {
  direction: Direction
  what: string
  selector: string
  property: string
  /** Passes when the computed value satisfies this. */
  expect: (value: string) => boolean
  /** Human-readable form of the expectation, for the report. */
  expected: string
}

const contains = (needle: string) => (value: string) =>
  value.toLowerCase().includes(needle.toLowerCase())
const equals = (target: string) => (value: string) => value.trim() === target

const CHECKS: Check[] = [
  /* ---- the package must not reach out into the host page ---- */
  {
    direction: 'host',
    what: 'host body keeps its serif font',
    selector: '#host-body-probe',
    property: 'font-family',
    expect: contains('Georgia'),
    expected: 'contains Georgia',
  },
  {
    direction: 'host',
    what: 'host body keeps its 18px base size',
    selector: '#host-body-probe',
    property: 'font-size',
    expect: equals('18px'),
    expected: '18px',
  },
  {
    direction: 'host',
    what: 'host keeps its content-box reset',
    selector: '#host-box-probe',
    property: 'box-sizing',
    expect: equals('content-box'),
    expected: 'content-box',
  },
  {
    direction: 'host',
    what: 'host h1 keeps its weight and size',
    selector: '#host-heading',
    property: 'font-size',
    expect: equals('44px'),
    expected: '44px',
  },
  {
    direction: 'host',
    what: 'host h1 keeps its margin collapse behaviour',
    selector: '#host-heading',
    property: 'font-weight',
    expect: equals('900'),
    expected: '900',
  },
  {
    direction: 'host',
    what: 'host button keeps its dashed border',
    selector: '#host-button',
    property: 'border-top-style',
    expect: equals('dashed'),
    expected: 'dashed',
  },
  {
    direction: 'host',
    what: 'host button keeps its unusual cursor',
    selector: '#host-button',
    property: 'cursor',
    expect: equals('help'),
    expected: 'help',
  },
  {
    direction: 'host',
    what: 'host button keeps its own font',
    selector: '#host-button',
    property: 'font-family',
    expect: (v) => !v.toLowerCase().includes('system-ui'),
    expected: 'not the package UI font',
  },
  {
    direction: 'host',
    what: 'host input keeps its monospace font',
    selector: '#host-input',
    property: 'font-family',
    expect: contains('Courier'),
    expected: 'contains Courier',
  },
  {
    direction: 'host',
    what: 'host list keeps its square markers',
    selector: '#host-list',
    property: 'list-style-type',
    expect: equals('square'),
    expected: 'square',
  },
  {
    direction: 'host',
    what: 'host paragraph keeps its bottom margin',
    selector: '#host-para',
    property: 'margin-bottom',
    expect: equals('18px'),
    expected: '18px',
  },
  {
    direction: 'host',
    what: 'the host owns the meaning of its own .flex class',
    selector: '#host-flex',
    property: 'display',
    expect: equals('block'),
    expected: 'block (host definition wins outside the editor)',
  },

  /* ---- the host page must not reach into the package ---- */
  {
    direction: 'editor',
    what: 'editor uses border-box despite the host content-box reset',
    selector: '#editor-box-probe',
    property: 'box-sizing',
    expect: equals('border-box'),
    expected: 'border-box',
  },
  {
    direction: 'editor',
    what: 'editor uses its own UI font, not the host serif',
    selector: '#editor-root',
    property: 'font-family',
    expect: (v) => !v.toLowerCase().includes('georgia'),
    expected: 'not Georgia',
  },
  {
    direction: 'editor',
    what: 'editor heading is reset to inherit, not the host 44px',
    selector: '#editor-heading',
    property: 'font-size',
    expect: (v) => v !== '44px',
    expected: 'not 44px',
  },
  {
    direction: 'editor',
    what: 'editor button loses the host dashed border',
    selector: '#editor-button',
    property: 'border-top-style',
    expect: (v) => v !== 'dashed',
    expected: 'not dashed',
  },
  {
    direction: 'editor',
    what: 'editor button gets a pointer cursor, not the host help cursor',
    selector: '#editor-button',
    property: 'cursor',
    expect: equals('pointer'),
    expected: 'pointer',
  },
  {
    direction: 'editor',
    what: 'editor input loses the host monospace font',
    selector: '#editor-input',
    property: 'font-family',
    expect: (v) => !v.toLowerCase().includes('courier'),
    expected: 'not Courier',
  },
  {
    direction: 'editor',
    what: 'editor list loses the host square markers',
    selector: '#editor-list',
    property: 'list-style-type',
    expect: equals('none'),
    expected: 'none',
  },
  {
    direction: 'editor',
    what: 'editor paragraph margin is reset to zero',
    selector: '#editor-para',
    property: 'margin-bottom',
    expect: equals('0px'),
    expected: '0px',
  },
  {
    direction: 'editor',
    // This is the hard one: the host declares `.flex { display: block
    // !important }`. Only marking the utilities layer important beats it.
    what: 'a scoped utility beats a host !important rule of the same name',
    selector: '#editor-flex',
    property: 'display',
    expect: equals('flex'),
    expected: 'flex (survives host !important)',
  },
  {
    direction: 'editor',
    what: 'the editor palette resolves from its own tokens',
    selector: '#editor-root',
    property: 'background-color',
    expect: (v) => v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent',
    expected: 'an opaque colour from --bnb-background',
  },
  {
    direction: 'editor',
    // The host's `button { text-transform: uppercase }` reached our buttons and
    // shouted at the user. An element selector, not a class collision - the
    // reset never mentioned text-transform, so nothing stopped it.
    what: 'host element-selector styling cannot shout at the user',
    selector: '#editor-button',
    property: 'text-transform',
    expect: equals('none'),
    expected: 'none (host says uppercase)',
  },
  {
    direction: 'editor',
    // The host's `.flex { outline: 3px solid red }` drew a red box round our
    // layout: a colliding class name setting a property our utility omits.
    what: 'a colliding host class cannot decorate properties our utility omits',
    selector: '#editor-flex',
    property: 'outline-style',
    expect: equals('none'),
    expected: 'none (host draws a red outline)',
  },
  {
    direction: 'editor',
    what: 'host text-decoration cannot reach editor links',
    selector: '#editor-link',
    property: 'text-decoration-line',
    expect: equals('none'),
    expected: 'none (host says underline wavy)',
  },

  /* ---- the firewall must not reach into rendered banners ---- */
  {
    direction: 'editor',
    /*
     * The firewall neutralises `opacity`, and `!important` beats inline style.
     * Banner elements are styled almost entirely from inline style driven by the
     * document, so if the firewall reached into `.bnbr` it would silently
     * flatten every overlay the user had set. It excludes that subtree; this
     * proves the exclusion holds.
     */
    what: 'a rendered overlay keeps the opacity the document set',
    selector: '#banner-overlay',
    property: 'opacity',
    expect: equals('0.42'),
    expected: '0.42 from inline style, not flattened to 1',
  },
  {
    direction: 'editor',
    what: 'rendered banner text keeps its letter-spacing',
    selector: '#banner-button',
    property: 'letter-spacing',
    expect: (v) => v !== 'normal',
    expected: 'the value renderer.css sets, not normal',
  },
  {
    /*
     * The mirror of the two checks above, and a real leak rather than a
     * hypothetical one: this host sets `button { text-transform: uppercase }`,
     * and it shouted every banner's call to action on a consumer's site.
     *
     * The firewall cannot fix it, because it exempts `.bnbr` on purpose - it
     * works with `!important`, which would beat the inline style the document
     * drives banners with. renderer.css defends its own elements instead, with
     * normal declarations that outrank a host element selector while still
     * yielding to the template.
     */
    direction: 'editor',
    what: 'a host element rule cannot restyle rendered banner text',
    selector: '#banner-button',
    property: 'text-transform',
    expect: equals('none'),
    expected: 'none, not the host’s uppercase',
  },
]

interface Result extends Check {
  actual: string
  pass: boolean
}

export function IsolationReport() {
  const [results, setResults] = useState<Result[] | null>(null)

  useEffect(() => {
    // Two frames: one for layout, one for the stylesheet to have settled.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setResults(
          CHECKS.map((check) => {
            const node = document.querySelector(check.selector)
            if (!node) {
              return { ...check, actual: 'ELEMENT NOT FOUND', pass: false }
            }
            const actual = getComputedStyle(node).getPropertyValue(check.property)
            return { ...check, actual, pass: check.expect(actual) }
          }),
        )
      }),
    )
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!results) return <p>Measuring computed styles…</p>

  const failures = results.filter((r) => !r.pass)
  const byDirection = (d: Direction) => results.filter((r) => r.direction === d)

  return (
    <div>
      <div
        className={failures.length === 0 ? 'verdict-pass' : 'verdict-fail'}
        data-testid="verdict"
        data-failures={failures.length}
      >
        {failures.length === 0
          ? `PASS — all ${results.length} isolation checks hold in both directions.`
          : `FAIL — ${failures.length} of ${results.length} isolation checks broke: ` +
            failures.map((f) => f.what).join('; ')}
      </div>

      {(['host', 'editor'] as const).map((direction) => (
        <section key={direction} style={{ marginTop: 24 }}>
          <h2>
            {direction === 'host'
              ? 'The package must not reach out'
              : 'The host must not reach in'}
          </h2>
          <table className="report">
            <thead>
              <tr>
                <th>Check</th>
                <th>Property</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {byDirection(direction).map((r) => (
                <tr key={r.what}>
                  <td>{r.what}</td>
                  <td>{r.property}</td>
                  <td>{r.expected}</td>
                  <td>{r.actual}</td>
                  <td className={r.pass ? 'pass' : 'fail'}>{r.pass ? 'PASS' : 'FAIL'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
