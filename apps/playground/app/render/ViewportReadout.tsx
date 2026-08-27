'use client'

/*
 * Reports which breakpoint layout is actually visible, measured from the DOM.
 *
 * This exists so the responsive behaviour can be checked as a fact rather than a
 * squint: at any width, exactly one layout must be visible, and it must be the
 * one the media queries in renderer.css name.
 */
import { useEffect, useState } from 'react'

interface Reading {
  width: number
  visible: string[]
  expected: string
}

function expectedFor(width: number): string {
  if (width <= 767) return 'mobile'
  if (width <= 1023) return 'tablet'
  return 'laptop'
}

export function ViewportReadout() {
  const [reading, setReading] = useState<Reading | null>(null)

  useEffect(() => {
    const measure = () => {
      const trees = [...document.querySelectorAll<HTMLElement>('[data-banner="default"] .bnbr-bp')]
      const visible = trees
        .filter((tree) => getComputedStyle(tree).display !== 'none')
        .map((tree) => tree.dataset.bp ?? '?')
      setReading({ width: window.innerWidth, visible, expected: expectedFor(window.innerWidth) })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  if (!reading) return null

  const ok = reading.visible.length === 1 && reading.visible[0] === reading.expected

  return (
    <div
      data-testid="viewport-readout"
      data-ok={ok}
      data-visible={reading.visible.join(',')}
      data-expected={reading.expected}
      style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13,
        padding: '10px 14px',
        border: `2px solid ${ok ? '#15803d' : '#b91c1c'}`,
        background: ok ? '#f0fdf4' : '#fef2f2',
        color: ok ? '#15803d' : '#b91c1c',
        borderRadius: 6,
      }}
    >
      {reading.width}px wide — visible layout: {reading.visible.join(', ') || 'none'} — expected:{' '}
      {reading.expected} {ok ? '✓' : '✗'}
    </div>
  )
}
