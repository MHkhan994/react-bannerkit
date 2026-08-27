'use client'

/*
 * The one interactive part of the renderer.
 *
 * Slides are stacked absolute layers rather than a scrolling track, because each
 * slide owns its own background and its own content and they cross-fade in
 * place.
 *
 * Timing differs deliberately from the prototype, which ran a single 120ms
 * interval over the whole tree and advanced every carousel from it. That is fine
 * for a prototype and wrong for a component: it re-rendered the entire banner
 * twenty times a second whether anything had changed or not. Here each carousel
 * owns one timer, sized to its own interval, and only that carousel re-renders.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { BannerPanel } from '../core/types'
import { Background, Stack } from './PanelView'
import { ElementView, type ElementContext } from './ElementView'

/** Matches the media query in renderer.css, so JS and CSS agree. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

export interface CarouselProps {
  panel: BannerPanel
  context: ElementContext
  eager: boolean
  /**
   * Pins the visible slide. The editor uses this so the canvas shows the slide
   * being edited instead of playing on its own.
   */
  activeSlide?: number
  onSlideChange?: (index: number) => void
}

export function Carousel({
  panel,
  context,
  eager,
  activeSlide,
  onSlideChange,
}: CarouselProps) {
  const count = panel.slides.length
  const [internal, setInternal] = useState(0)
  const [hovered, setHovered] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const controlled = activeSlide !== undefined
  const active = Math.min(controlled ? activeSlide : internal, Math.max(0, count - 1))

  const goTo = useCallback(
    (index: number) => {
      const next = ((index % count) + count) % count
      if (!controlled) setInternal(next)
      onSlideChange?.(next)
    },
    [controlled, count, onSlideChange],
  )

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = active + direction
      if (next < 0) return goTo(panel.loop ? count - 1 : 0)
      if (next >= count) return goTo(panel.loop ? 0 : count - 1)
      return goTo(next)
    },
    [active, count, goTo, panel.loop],
  )

  /*
   * One timer, restarted whenever anything that affects timing changes. Autoplay
   * is off entirely under `prefers-reduced-motion`: unrequested movement is a
   * genuine accessibility problem, not a nicety.
   */
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (controlled || !panel.autoplay || reducedMotion || count < 2) return
    if (hovered && panel.pauseHover) return
    if (!panel.loop && active >= count - 1) return

    const timer = window.setInterval(() => {
      const next = activeRef.current + 1
      if (next >= count) {
        if (!panel.loop) return
        setInternal(0)
        return
      }
      setInternal(next)
    }, panel.interval)

    return () => window.clearInterval(timer)
  }, [
    active,
    controlled,
    count,
    hovered,
    panel.autoplay,
    panel.interval,
    panel.loop,
    panel.pauseHover,
    reducedMotion,
  ])

  const transition = reducedMotion
    ? undefined
    : `opacity ${panel.speed}ms ease, transform ${panel.speed}ms cubic-bezier(.4,0,.2,1)`

  return (
    <div
      className="bnbr-carousel"
      onMouseEnter={panel.pauseHover ? () => setHovered(true) : undefined}
      onMouseLeave={panel.pauseHover ? () => setHovered(false) : undefined}
      aria-roledescription="carousel"
    >
      {panel.slides.map((slide, index) => {
        const isActive = index === active
        const offset = panel.transition === 'slide' ? (index - active) * 100 : 0
        return (
          <div
            key={slide.id}
            className="bnbr-slide"
            data-active={isActive}
            aria-hidden={isActive ? undefined : 'true'}
            style={{
              opacity: panel.transition === 'slide' || isActive ? 1 : 0,
              transform: offset === 0 ? undefined : `translateX(${offset}%)`,
              transition,
              zIndex: isActive ? 2 : 1,
            }}
          >
            <Background
              mode={slide.mode}
              color={slide.bg}
              src={slide.img}
              // Only the visible slide's image is worth fetching eagerly.
              eager={eager && isActive}
            />
            {slide.href ? (
              <a
                className="bnbr-slide-link"
                href={slide.href}
                tabIndex={isActive ? undefined : -1}
                onClick={context.inert ? (event) => event.preventDefault() : undefined}
              >
                <Stack panel={panel} elements={slide.elements} context={context} />
              </a>
            ) : (
              <Stack panel={panel} elements={slide.elements} context={context} />
            )}
          </div>
        )
      })}

      {panel.arrows && count > 1 ? (
        <>
          <button
            type="button"
            className="bnbr-nav"
            data-dir="prev"
            aria-label="Previous slide"
            onClick={() => step(-1)}
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            className="bnbr-nav"
            data-dir="next"
            aria-label="Next slide"
            onClick={() => step(1)}
          >
            <Chevron direction="right" />
          </button>
        </>
      ) : null}

      {panel.pagination !== 'none' && count > 1 ? (
        <div className="bnbr-dots" role="tablist" aria-label="Choose slide">
          {panel.slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              className="bnbr-dot"
              data-style={panel.pagination}
              data-active={index === active}
              aria-selected={index === active}
              aria-label={`Slide ${index + 1}`}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}

      {panel.counter && count > 1 ? (
        <div className="bnbr-counter" aria-hidden="true">
          {active + 1} / {count}
        </div>
      ) : null}
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}
