/*
 * The renderer a consumer ships on their own pages.
 *
 *   import { BannerRenderer } from 'react-bannerkit/renderer'
 *   import 'react-bannerkit/renderer.css'
 *
 * No "use client": this component and everything it renders except the carousel
 * works on the server, so a banner is present in the initial HTML.
 */
import type { CSSProperties, ReactNode } from 'react'

import { computeLayout, insetStyle, resolveHeight } from '../core/layout'
import { normalizeTemplate } from '../core/normalize'
import { BREAKPOINT_ORDER, type BannerBreakpoint, type BannerElement, type BannerTemplate, type BreakpointName } from '../core/types'
import { PanelView } from './PanelView'
import type { ElementContext } from './ElementView'

export interface BannerRendererProps {
  /** The template to render. Repaired rather than trusted - see normalizeTemplate. */
  template: BannerTemplate
  /**
   * Renders only this layout instead of letting CSS choose.
   *
   * Useful when the host already knows the device - server-side UA detection, a
   * native webview - or inside the editor, which renders one breakpoint at a
   * time. Leave it unset on a normal page.
   */
  breakpoint?: BreakpointName
  className?: string
  style?: CSSProperties
  /** Tag for heading elements. `p` by default; see the note below. */
  headingTag?: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  /** Supply your own icon rendering, e.g. from lucide-react. */
  renderIcon?: (glyph: string) => ReactNode
  /**
   * Called when a link, button, or clickable image is activated. Use it for
   * analytics, or to route with your framework's router instead of navigating.
   */
  onElementClick?: (element: BannerElement, context: { breakpoint: BreakpointName }) => void
  /** Suppresses navigation. The editor canvas uses this; pages should not. */
  inert?: boolean
  /*
   * Editor hooks, unused on a normal page. They let the editor attach selection
   * and dragging to the real elements instead of overlaying hit boxes on them.
   */
  onElementPointerDown?:
    | ((element: BannerElement, panelId: string, event: React.PointerEvent) => void)
    | undefined
  onPanelPointerDown?: ((panelId: string, event: React.PointerEvent) => void) | undefined
  selectedElementId?: string | undefined
  /** Accessible name for the banner region. */
  label?: string
}

function frameHeight(breakpoint: BannerBreakpoint, device: BreakpointName): string {
  /*
   * Viewport mode emits real `vh` and lets the browser resolve it. The editor
   * canvas resolves it against a nominal screen height instead, because it has
   * to draw a truthful preview inside a few hundred pixels - that is what
   * `resolveHeight` is for, and it is deliberately not used here.
   */
  if (breakpoint.heightMode === 'vh') return `${breakpoint.vh}vh`
  return `${resolveHeight(breakpoint, device)}px`
}

interface BannerFrameProps {
  breakpoint: BannerBreakpoint
  device: BreakpointName
  context: ElementContext
  eager: boolean
}

function BannerFrame({ breakpoint, device, context, eager }: BannerFrameProps) {
  const { leaves } = computeLayout(breakpoint.root)
  return (
    <div
      className="bnbr-frame"
      style={{
        height: frameHeight(breakpoint, device),
        backgroundColor: breakpoint.bg,
      }}
    >
      {leaves.map(({ panel, rect }) => (
        <PanelView
          key={panel.id}
          panel={panel}
          style={insetStyle(rect, breakpoint.gutter)}
          context={context}
          eager={eager}
        />
      ))}
    </div>
  )
}

export function BannerRenderer({
  template,
  breakpoint,
  className,
  style,
  headingTag = 'p',
  renderIcon,
  onElementClick,
  inert,
  label,
  onElementPointerDown,
  onPanelPointerDown,
  selectedElementId,
}: BannerRendererProps) {
  /*
   * Repair, never trust. The template arrives from the consumer's database and
   * may predate this build, have been hand-edited, or be a different shape
   * entirely. A banner must not be able to throw on the page it sits on.
   */
  const document_ = normalizeTemplate(template)

  const rootClass = className ? `bnbr ${className}` : 'bnbr'

  const contextFor = (device: BreakpointName): ElementContext => ({
    renderIcon,
    /*
     * `p` by default. Emitting an `<h1>`/`<h2>` would splice this banner into the
     * host page's heading outline at a level the package cannot know, which
     * breaks heading-order for screen reader users more often than it helps.
     * Consumers who know where the banner sits should pass the right tag.
     */
    headingTag,
    inert,
    onElementPointerDown,
    onPanelPointerDown,
    selectedElementId,
    onActivate: onElementClick
      ? (element) => onElementClick(element, { breakpoint: device })
      : undefined,
  })

  if (breakpoint) {
    return (
      <div className={rootClass} style={style} role="region" aria-label={label ?? document_.name}>
        <div className="bnbr-bp-fixed" data-bp={breakpoint}>
          <BannerFrame
            breakpoint={document_.breakpoints[breakpoint]}
            device={breakpoint}
            context={contextFor(breakpoint)}
            eager
          />
        </div>
      </div>
    )
  }

  /*
   * All three layouts are emitted and media queries in renderer.css choose
   * between them.
   *
   * The alternative - measuring the container and rendering one tree - cannot be
   * server-rendered: it either guesses and snaps to the right layout on
   * hydration, or renders nothing and shifts the page. Both cost LCP and CLS on
   * exactly the pages banners live on. Three small trees cost DOM nodes, which
   * are cheap, and buy a correct first paint.
   *
   * `eager` is false for every tree here: the browser cannot be told which one a
   * media query will reveal, so no background is marked high priority rather
   * than eagerly fetching three heroes. Consumers who know the device can pass
   * `breakpoint` and get the eager path above.
   */
  return (
    <div className={rootClass} style={style} role="region" aria-label={label ?? document_.name}>
      {BREAKPOINT_ORDER.map((device) => (
        <div key={device} className="bnbr-bp" data-bp={device}>
          <BannerFrame
            breakpoint={document_.breakpoints[device]}
            device={device}
            context={contextFor(device)}
            eager={false}
          />
        </div>
      ))}
    </div>
  )
}
