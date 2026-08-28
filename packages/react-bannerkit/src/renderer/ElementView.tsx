/*
 * Rendering one banner element.
 *
 * Almost all styling here is inline, and that is on purpose. Every value comes
 * from the document, so it cannot live in a stylesheet - and keeping it inline
 * means a banner looks identical wherever it is rendered, with no dependency on
 * cascade order or on the host page's CSS.
 *
 * Nothing in this file uses a Tailwind class. The renderer entry must work with
 * only `renderer.css` loaded.
 */
import type { CSSProperties, ReactNode } from 'react'

import { iconPath } from '../core/icons'
import type { BannerElement } from '../core/types'

export interface ElementContext {
  /** Renders an icon glyph. Supplied by the consumer to use their own icon set. */
  renderIcon?: ((glyph: string) => ReactNode) | undefined
  /** Tag used for heading elements. `p` by default - see BannerRenderer. */
  headingTag?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | undefined
  /** Called when an interactive element is activated. */
  onActivate?: ((element: BannerElement) => void) | undefined
  /** True inside the editor canvas, where links must not navigate. */
  inert?: boolean | undefined
  /*
   * Editor hooks. Both are unset on a public page, so the renderer stays a plain
   * drawing surface; the editor uses them to make the real elements - rather than
   * invisible boxes floating over them - the things you click and drag.
   */
  onElementPointerDown?:
    | ((element: BannerElement, panelId: string, event: React.PointerEvent) => void)
    | undefined
  /*
   * Selecting a panel by pressing its body.
   *
   * This lives on the rendered panel rather than on the editor's chrome overlay
   * for a reason that cost a release: the overlay covers the whole panel, so
   * while it accepted pointer events it swallowed every press meant for the
   * elements underneath. The overlay is now inert to the pointer and the two
   * real targets - the panel and the element - carry their own handlers.
   */
  onPanelPointerDown?: ((panelId: string, event: React.PointerEvent) => void) | undefined
  selectedElementId?: string | undefined
  /*
   * The panel this element belongs to, injected by PanelView.
   *
   * Passed down rather than looked up from the DOM at event time: deriving it
   * with `closest()` inside the handler is one indirection too many and failed
   * silently, leaving a selection that pointed at no panel.
   */
  panelId?: string | undefined
}

/**
 * Free placement lifts the element out of the flex stack and pins it to a
 * percentage of the panel box, so it keeps its position when the panel resizes.
 */
function placement(element: BannerElement): { className: string; style: CSSProperties } {
  const pos = 'pos' in element ? element.pos : undefined
  if (!pos) return { className: '', style: {} }
  return { className: ' bnbr-free', style: { left: `${pos.x}%`, top: `${pos.y}%` } }
}

function overlayBackground(color: string, mode: 'solid' | 'gradient'): string {
  if (mode === 'solid') return color
  return `linear-gradient(105deg, ${color} 8%, color-mix(in srgb, ${color} 10%, transparent) 82%)`
}

interface ElementViewProps {
  element: BannerElement
  context: ElementContext
}

export function ElementView({ element, context }: ElementViewProps) {
  const {
    renderIcon,
    headingTag = 'p',
    onActivate,
    inert,
    onElementPointerDown,
    selectedElementId,
    panelId,
  } = context
  const place = placement(element)

  /*
   * `data-bnb-el` rather than `id`. All three breakpoint layouts are in the
   * document at once, so an element id used as an HTML id would appear three
   * times and any `getElementById` or `#anchor` would hit whichever tree came
   * first.
   */
  const identity: Record<string, unknown> = { 'data-bnb-el': element.id }

  /*
   * Overlays are excluded: they cover the whole panel, so making one draggable
   * would mean every click on the panel grabbed the overlay instead.
   */
  if (onElementPointerDown && panelId && element.type !== 'overlay') {
    identity.onPointerDown = (event: React.PointerEvent) =>
      onElementPointerDown(element, panelId, event)
    identity['data-bnb-draggable'] = true
  }
  if (selectedElementId === element.id) identity['data-bnb-selected'] = true

  const activate = onActivate
    ? (event: React.MouseEvent) => {
        if (inert) event.preventDefault()
        onActivate(element)
      }
    : inert
      ? (event: React.MouseEvent) => event.preventDefault()
      : undefined

  switch (element.type) {
    case 'overlay':
      return (
        <div
          {...identity}
          className="bnbr-overlay"
          style={{
            background: overlayBackground(element.color, element.mode),
            opacity: element.opacity,
          }}
        />
      )

    case 'heading':
    case 'text': {
      const Tag = element.type === 'heading' ? headingTag : 'p'
      return (
        <Tag
          {...identity}
          className={`bnbr-${element.type}${place.className}`}
          style={{
            ...place.style,
            fontSize: `${element.fs}px`,
            fontWeight: element.weight,
            color: element.color,
            textAlign: element.align,
            maxWidth: `${element.measure}ch`,
          }}
        >
          {element.text}
        </Tag>
      )
    }

    case 'button': {
      const solid = element.variant === 'solid'
      const style: CSSProperties = {
        ...place.style,
        fontSize: `${element.fs}px`,
        borderRadius: `${element.radius}px`,
        color: solid ? '#201f1d' : element.color,
        background: solid ? element.color : 'transparent',
        border: element.variant === 'ghost' ? '1px solid transparent' : `1px solid ${element.color}`,
      }
      const className = `bnbr-button${place.className}`

      /*
       * A button with a destination is a link; one without is a button. Not
       * cosmetic: an anchor with no href is not focusable and is announced as
       * plain text, so a screen reader user could not reach it at all.
       */
      if (element.href) {
        return (
          <a {...identity} className={className} style={style} href={element.href} onClick={activate}>
            {element.text}
          </a>
        )
      }
      return (
        <button {...identity} type="button" className={className} style={style} onClick={activate}>
          {element.text}
        </button>
      )
    }

    case 'link': {
      const style: CSSProperties = {
        ...place.style,
        fontSize: `${element.fs}px`,
        color: element.color,
        textDecoration: element.underline ? 'underline' : 'none',
      }
      const className = `bnbr-link${place.className}`
      if (!element.href) {
        return (
          <span {...identity} className={className} style={style}>
            {element.text}
          </span>
        )
      }
      return (
        <a {...identity} className={className} style={style} href={element.href} onClick={activate}>
          {element.text}
        </a>
      )
    }

    case 'image': {
      const image = (
        <img
          {...identity}
          className={`bnbr-image${place.className}`}
          src={element.src}
          alt={element.alt}
          loading="lazy"
          decoding="async"
          style={{
            ...place.style,
            width: `${element.width}%`,
            objectFit: element.fit,
            borderRadius: `${element.radius}px`,
            ...(element.plate ? { border: `6px solid ${element.plateColor}` } : {}),
          }}
        />
      )
      if (!element.href) return image
      return (
        <a href={element.href} className="bnbr-image-link" onClick={activate}>
          {image}
        </a>
      )
    }

    case 'spacer':
      // Purely structural, so it is hidden from assistive technology.
      return (
        <div
          {...identity}
          aria-hidden="true"
          className={`bnbr-spacer${place.className}`}
          style={{ ...place.style, height: `${element.size}px` }}
        />
      )

    case 'icon': {
      const style: CSSProperties = {
        ...place.style,
        width: `${element.fs}px`,
        height: `${element.fs}px`,
        color: element.color,
      }
      return (
        <span {...identity} className={`bnbr-icon${place.className}`} style={style} aria-hidden="true">
          {renderIcon ? (
            renderIcon(element.glyph)
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="100%"
              height="100%"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={iconPath(element.glyph)} />
            </svg>
          )}
        </span>
      )
    }
  }
}
