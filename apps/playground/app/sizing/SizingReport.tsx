'use client'

/*
 * A self-checking harness for the scale-like-a-picture sizing model.
 *
 * happy-dom silently drops any inline style whose value is
 * `calc(var(--bnbr-u) * n)` (its CALC_REGEXP rejects nested parens), so every
 * unit test upstream of this route can only assert on what the renderer
 * *emits* as markup, never on what a browser does with it. This component is
 * the one place the model is checked against real, computed layout: it reads
 * `getComputedStyle` and `getBoundingClientRect` on the page's four wrappers
 * and prints what it found, in the same pass/fail-table shape as
 * IsolationReport on /hostile.
 *
 * Two things are checked:
 *
 *   1. Proportional scaling — the 1280px and 1640px wrappers must differ by
 *      exactly the ratio of their widths (1640 / 1280 = 1.28125) in frame
 *      height, heading font-size, and panel padding, within half a pixel of
 *      the *exact* product — not the brief's rounded display values.
 *   2. Container-driven breakpoints — each wrapper must show exactly one of
 *      the three emitted `.bnbr-bp` trees, and it must be the one its own
 *      width calls for, read from `display` via getComputedStyle rather than
 *      inferred from the style attribute or assumed from the width alone.
 */

import { useEffect, useState } from 'react'

import { WRAPPER_WIDTHS, type WrapperWidth } from './widths'

/** Which of the three CSS-only breakpoint trees each width is expected to show. */
const EXPECTED_BP: Record<WrapperWidth, string> = {
  1280: 'laptop',
  1640: 'laptop',
  980: 'tablet',
  500: 'mobile',
}

/**
 * Exact expected values for the default template's laptop tree, at the two
 * widths the proportional-scaling check compares. 1640 / 1280 = 1.28125
 * exactly, so these are the exact products — 420 * 1.28125 = 538.125, etc. —
 * not the brief table's rounded display values.
 */
const EXPECTED_SCALE: Record<
  1280 | 1640,
  { frameHeight: number; headingFontSize: number; panelPadding: number }
> = {
  1280: { frameHeight: 420, headingFontSize: 46, panelPadding: 40 },
  1640: { frameHeight: 538.125, headingFontSize: 58.9375, panelPadding: 51.25 },
}

/** Half a pixel, per the brief. */
const TOLERANCE = 0.5

interface Measurement {
  width: WrapperWidth
  /** The single `data-bp` visible by computed `display`, or a diagnostic string. */
  visibleBp: string
  frameHeight: number | null
  headingFontSize: number | null
  panelPadding: number | null
}

/**
 * Measures one wrapper.
 *
 * Selectors, for anyone querying the live page directly:
 *   `[data-sizing-wrapper="<width>"]`            — the fixed-width box itself
 *   `[data-sizing-wrapper="<width>"] .bnbr-bp[data-bp="laptop|tablet|mobile"]`
 *                                                 — one of the three emitted trees
 *   `.bnbr-frame`   inside the visible tree      — frame height
 *   `.bnbr-heading` inside the visible tree      — heading font-size
 *   `.bnbr-stack`   inside the visible tree      — panel padding (all four
 *                                                   sides are equal; padding-top
 *                                                   is read)
 * `.bnbr-bp`, `.bnbr-frame`, `.bnbr-heading` and `.bnbr-stack` are the
 * package's own stable class names, already used the same way by
 * ViewportReadout on /render — not DOM structure guessed for this page.
 */
function measure(width: WrapperWidth): Measurement {
  const wrapper = document.querySelector<HTMLElement>(`[data-sizing-wrapper="${width}"]`)
  if (!wrapper) {
    return { width, visibleBp: 'WRAPPER NOT FOUND', frameHeight: null, headingFontSize: null, panelPadding: null }
  }

  const trees = [...wrapper.querySelectorAll<HTMLElement>('.bnbr-bp')]
  const visible = trees.filter((tree) => getComputedStyle(tree).display !== 'none')

  let visibleBp: string
  if (visible.length === 0) visibleBp = 'NONE VISIBLE'
  else if (visible.length > 1) visibleBp = `MULTIPLE (${visible.map((t) => t.dataset.bp).join(', ')})`
  else visibleBp = visible[0]?.dataset.bp ?? 'UNLABELLED'

  const tree = visible.length === 1 ? visible[0] : undefined
  const frame = tree?.querySelector<HTMLElement>('.bnbr-frame') ?? null
  const heading = tree?.querySelector<HTMLElement>('.bnbr-heading') ?? null
  const stack = tree?.querySelector<HTMLElement>('.bnbr-stack') ?? null

  return {
    width,
    visibleBp,
    frameHeight: frame ? frame.getBoundingClientRect().height : null,
    headingFontSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : null,
    panelPadding: stack ? parseFloat(getComputedStyle(stack).paddingTop) : null,
  }
}

interface BpCheck {
  what: string
  expected: string
  actual: string
  pass: boolean
}

interface ScaleCheck {
  what: string
  expected: string
  actual: string
  pass: boolean
}

const fmt = (n: number | null): string => (n === null ? 'MISSING' : n.toFixed(3))

function buildBpChecks(measurements: Measurement[]): BpCheck[] {
  return measurements.map((m) => ({
    what: `the ${m.width}px container selects the ${EXPECTED_BP[m.width]} tree`,
    expected: EXPECTED_BP[m.width],
    actual: m.visibleBp,
    pass: m.visibleBp === EXPECTED_BP[m.width],
  }))
}

function scaleCheck(
  label: string,
  key: 'frameHeight' | 'headingFontSize' | 'panelPadding',
  measurements: Measurement[],
): ScaleCheck {
  const at1280 = measurements.find((m) => m.width === 1280)?.[key] ?? null
  const at1640 = measurements.find((m) => m.width === 1640)?.[key] ?? null
  const { [key]: expected1280 } = EXPECTED_SCALE[1280]
  const { [key]: expected1640 } = EXPECTED_SCALE[1640]

  const pass =
    at1280 !== null &&
    at1640 !== null &&
    Math.abs(at1280 - expected1280) <= TOLERANCE &&
    Math.abs(at1640 - expected1640) <= TOLERANCE

  return {
    what: `${label} scales ${expected1280} → ${expected1640} between 1280px and 1640px (×1.28125)`,
    expected: `${expected1280} → ${expected1640} (±${TOLERANCE}px)`,
    actual: `${fmt(at1280)} → ${fmt(at1640)}`,
    pass,
  }
}

export function SizingReport() {
  const [measurements, setMeasurements] = useState<Measurement[] | null>(null)

  useEffect(() => {
    // Two frames: one for layout, one for the stylesheet — and the container
    // queries it drives — to have settled. Same pattern as IsolationReport.
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setMeasurements(WRAPPER_WIDTHS.map((width) => measure(width)))
      }),
    )
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!measurements) return <p>Measuring computed styles…</p>

  const bpChecks = buildBpChecks(measurements)
  const scaleChecks: ScaleCheck[] = [
    scaleCheck('frame height', 'frameHeight', measurements),
    scaleCheck('heading font-size', 'headingFontSize', measurements),
    scaleCheck('panel padding', 'panelPadding', measurements),
  ]

  const failures = [...bpChecks, ...scaleChecks].filter((c) => !c.pass)
  const total = bpChecks.length + scaleChecks.length

  return (
    <div>
      <div
        className={failures.length === 0 ? 'verdict-pass' : 'verdict-fail'}
        data-testid="verdict"
        data-failures={failures.length}
      >
        {failures.length === 0
          ? `PASS — all ${total} sizing checks hold.`
          : `FAIL — ${failures.length} of ${total} sizing checks broke: ` +
            failures.map((f) => f.what).join('; ')}
      </div>

      <section style={{ marginTop: 24 }}>
        <h3>Raw measurements</h3>
        <table className="report">
          <thead>
            <tr>
              <th>Width</th>
              <th>Visible data-bp</th>
              <th>Frame height (px)</th>
              <th>Heading font-size (px)</th>
              <th>Panel padding (px)</th>
            </tr>
          </thead>
          <tbody>
            {measurements.map((m) => (
              <tr key={m.width}>
                <td>{m.width}</td>
                <td>{m.visibleBp}</td>
                <td>{fmt(m.frameHeight)}</td>
                <td>{fmt(m.headingFontSize)}</td>
                <td>{fmt(m.panelPadding)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Container-driven breakpoints</h3>
        <table className="report">
          <thead>
            <tr>
              <th>Check</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {bpChecks.map((c) => (
              <tr key={c.what}>
                <td>{c.what}</td>
                <td>{c.expected}</td>
                <td>{c.actual}</td>
                <td className={c.pass ? 'pass' : 'fail'}>{c.pass ? 'PASS' : 'FAIL'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Proportional scaling (1280px → 1640px)</h3>
        <table className="report">
          <thead>
            <tr>
              <th>Check</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {scaleChecks.map((c) => (
              <tr key={c.what}>
                <td>{c.what}</td>
                <td>{c.expected}</td>
                <td>{c.actual}</td>
                <td className={c.pass ? 'pass' : 'fail'}>{c.pass ? 'PASS' : 'FAIL'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
