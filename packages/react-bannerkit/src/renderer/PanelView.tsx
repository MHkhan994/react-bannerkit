/*
 * Rendering one panel: its background, its box, and the stack of elements in it.
 *
 * A panel is either `single` - one background and one stack - or a `carousel`,
 * where every slide owns its own background and its own stack. The carousel is a
 * separate client component; everything here renders on the server.
 */
import type { CSSProperties, ReactNode } from 'react'

import type { BannerPanel, BannerSlide } from '../core/types'
import { Carousel } from './Carousel'
import { ElementView, type ElementContext } from './ElementView'

/**
 * The element stack.
 *
 * Padding lives here rather than on the panel, so that content is inset while
 * the background stays full-bleed. On a carousel it also means each slide's
 * background fills the panel while its content is inset.
 */
export function Stack({
  panel,
  elements,
  context,
}: {
  panel: BannerPanel
  elements: BannerSlide['elements']
  context: ElementContext
}) {
  const style: CSSProperties = {
    padding: `${panel.pad}px`,
    gap: `${panel.gap}px`,
    alignItems: panel.alignX,
    justifyContent: panel.alignY,
  }
  return (
    <div className="bnbr-stack" style={style}>
      {elements.map((element) => (
        <ElementView key={element.id} element={element} context={context} />
      ))}
    </div>
  )
}

/**
 * A panel or slide background.
 *
 * Photo backgrounds render as a real `<img>` rather than a CSS
 * `background-image`, so the browser can discover it in the initial HTML and
 * prioritise it. On a banner, the background usually *is* the LCP element, and a
 * CSS background cannot be preloaded or given `fetchpriority`.
 */
export function Background({
  mode,
  color,
  src,
  eager,
}: {
  mode: 'photo' | 'color'
  color: string
  src: string
  /** True for the layout the viewport will actually show. */
  eager: boolean
}) {
  if (mode !== 'photo') return null
  return (
    <img
      className="bnbr-bg"
      src={src}
      // Decorative: a background carries no information the text does not.
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      // eslint-disable-next-line react/no-unknown-property
      fetchPriority={eager ? 'high' : 'low'}
      decoding="async"
      style={{ backgroundColor: color }}
    />
  )
}

export interface PanelViewProps {
  panel: BannerPanel
  /** Absolute position of this panel within the frame, already gutter-inset. */
  style: CSSProperties
  context: ElementContext
  /** True for the layout the viewport will actually show. */
  eager: boolean
}

export function PanelView({ panel, style, context, eager }: PanelViewProps) {
  // Every element below knows which panel it is in without consulting the DOM.
  const panelContext: ElementContext = { ...context, panelId: panel.id }

  const boxStyle: CSSProperties = {
    ...style,
    ...(panel.bgMode === 'color' ? { backgroundColor: panel.bg } : {}),
    borderRadius: panel.radius ? `${panel.radius}px` : undefined,
    ...(panel.borderW ? { border: `${panel.borderW}px solid ${panel.borderColor}` } : {}),
  }

  const body: ReactNode =
    panel.type === 'carousel' ? (
      <Carousel panel={panel} context={panelContext} eager={eager} />
    ) : (
      <>
        <Background mode={panel.bgMode} color={panel.bg} src={panel.img} eager={eager} />
        <Stack panel={panel} elements={panel.elements} context={panelContext} />
      </>
    )

  /*
   * A single panel with a destination becomes one big link. A carousel does not:
   * its destinations are per slide, and wrapping the whole thing would swallow
   * the arrows and the pagination dots.
   */
  if (panel.type === 'single' && panel.href) {
    return (
      <a
        className="bnbr-panel"
        data-bnb-panel={panel.id}
        style={boxStyle}
        href={panel.href}
        onClick={context.inert ? (event) => event.preventDefault() : undefined}
      >
        {body}
      </a>
    )
  }

  return (
    <div className="bnbr-panel" data-bnb-panel={panel.id} style={boxStyle}>
      {body}
    </div>
  )
}
