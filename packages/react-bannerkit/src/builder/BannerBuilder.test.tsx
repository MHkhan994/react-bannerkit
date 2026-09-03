// @vitest-environment happy-dom
/*
 * What the canvas measures itself against.
 *
 * The bug this file exists for: the width the frame is scaled to was measured
 * from the wrapper *around* the scrolling canvas, not from the canvas itself.
 * The two are the same width right up until the canvas grows a vertical
 * scrollbar - at which point the scrollbar takes ~15px out of the canvas's
 * content box while the wrapper stays exactly as wide as before. The frame kept
 * being drawn to the old width, so it no longer fitted, and a horizontal
 * scrollbar appeared underneath every banner tall enough to scroll. Measured in
 * Chrome at a 2000px design height: canvas clientWidth fell 841 -> 826 while the
 * canvas content stayed 841, overflowing by exactly the 15px the scrollbar took.
 *
 * happy-dom does no layout, so the overflow itself cannot be reproduced here.
 * What is asserted is the thing that made it possible: the element handed to the
 * ResizeObserver must be the element that scrolls, because only that element's
 * content box shrinks when a scrollbar appears in it.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BannerBuilder } from './BannerBuilder'

/** Every element handed to a ResizeObserver during a render. */
let observed: Element[] = []
const realResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  observed = []
  globalThis.ResizeObserver = class {
    observe(target: Element) {
      observed.push(target)
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  globalThis.ResizeObserver = realResizeObserver
  vi.restoreAllMocks()
})

describe('canvas sizing', () => {
  it('measures the element that scrolls, not the wrapper around it', () => {
    render(<BannerBuilder />)

    expect(observed, 'nothing was observed for canvas sizing').not.toHaveLength(0)
    /*
     * The wrapper cannot report the scrollbar, so measuring it is the defect.
     * `.bnb-canvas` is the scroll container; its content box is what the frame
     * actually has to fit inside.
     */
    const targets = observed.map((el) => el.className)
    expect(
      observed.some((el) => el.classList.contains('bnb-canvas')),
      `canvas sizing observed [${targets.join(' | ')}] - none of them is the scroll container`,
    ).toBe(true)
  })

  it('renders exactly one scroll container, so there is no ambiguity about which', () => {
    const { container } = render(<BannerBuilder />)
    expect(container.querySelectorAll('.bnb-canvas')).toHaveLength(1)
  })
})
