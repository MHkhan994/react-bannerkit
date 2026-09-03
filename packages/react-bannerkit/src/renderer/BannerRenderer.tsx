/*
 * The renderer a consumer ships on their own pages.
 *
 *   import { BannerRenderer } from 'react-bannerkit/renderer'
 *   import 'react-bannerkit/renderer.css'
 *
 * No "use client": this component and everything it renders except the carousel
 * works on the server, so a banner is present in the initial HTML.
 */
import type { CSSProperties, ReactNode, Ref } from 'react'

import { computeLayout, insetStyle } from '../core/layout'
import { normalizeTemplate } from '../core/normalize'
import {
  BREAKPOINT_ORDER,
  designWidthOf,
  type BannerBreakpoint,
  type BannerElement,
  type BannerTemplate,
  type BreakpointName,
} from '../core/types'
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
  /**
   * The `.bnbr-frame` box, as the renderer actually laid it out.
   *
   * The editor draws its chrome, hit targets and divider maths against this
   * element rather than against a rectangle of its own: under `fit` and `cover`
   * the frame is letterboxed or cropped inside its wrapper by CSS, so a box the
   * editor computed from `designWidth x frameHeight` is the wrong one. Handing
   * the element out is what leaves the geometry with a single owner.
   *
   * Honoured only alongside an explicit `breakpoint`. The responsive path emits
   * all three trees and so has three frames; a single ref could only point at
   * one of them, and which one would be an accident of render order.
   */
  frameRef?: Ref<HTMLDivElement> | undefined
  /** Accessible name for the banner region. */
  label?: string
}

/*
 * `CSSProperties` has no room for custom properties, so the type is widened
 * here rather than cast at the call site - React passes anything beginning
 * with `--` straight through to the style attribute. Same pattern as
 * `dividerStyle` in the builder's `Canvas.tsx`.
 */
type SizingStyle = CSSProperties & {
  '--bnbr-dw': number
  '--bnbr-dh': number
}

/** Style for the `.bnbr-bp`/`.bnbr-bp-fixed` wrapper: the sizing container. */
function sizingStyle(breakpoint: BannerBreakpoint, designWidth: number): SizingStyle {
  return {
    '--bnbr-dw': designWidth,
    '--bnbr-dh': breakpoint.designHeight,
    /*
     * `bg` is painted on this wrapper *as well as* on the frame, because the two
     * boxes are not the same box and either one can be the visible edge of the
     * banner.
     *
     * The frame needs it: `bg` is what shows through the gutter, which is inset
     * *inside* the frame. The wrapper needs it too, because under `fit` the
     * frame is the letterboxed design box and the wrapper is the letterbox - so
     * the margin above and below the design belongs to the wrapper, and with
     * only the frame painted the host page showed through it. Both `types.ts`
     * and the README promise `bg` in that margin, and it was transparent.
     *
     * Declaring it unconditionally rather than only for `fit` is not laziness:
     * under `ratio` the frame is exactly the wrapper, and under `cover` the
     * frame is larger than the wrapper in both axes and cropped, so in both of
     * those modes the wrapper is completely covered and painting it changes
     * nothing. One declaration that is right everywhere beats a branch that has
     * to be re-reasoned each time a mode is added.
     */
    backgroundColor: breakpoint.bg,
    /*
     * `ratio` gets its height from `aspect-ratio` in renderer.css, driven by
     * these same two variables. `fit`/`cover` have no intrinsic height of their
     * own - the frame is absolutely positioned inside this wrapper - so the
     * wrapper needs an explicit height instead.
     */
    ...(breakpoint.sizeMode === 'ratio'
      ? {}
      : {
          height:
            breakpoint.frameHeightUnit === 'vh'
              ? `${breakpoint.frameHeight}vh`
              : `${breakpoint.frameHeight}px`,
        }),
  }
}

interface BannerFrameProps {
  breakpoint: BannerBreakpoint
  context: ElementContext
  eager: boolean
  frameRef?: Ref<HTMLDivElement> | undefined
}

function BannerFrame({ breakpoint, context, eager, frameRef }: BannerFrameProps) {
  const { leaves } = computeLayout(breakpoint.root)
  return (
    <div
      className="bnbr-frame"
      ref={frameRef}
      style={{
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
  frameRef,
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
    const bp = document_.breakpoints[breakpoint]
    return (
      <div className={rootClass} style={style} role="region" aria-label={label ?? document_.name}>
        <div
          className="bnbr-bp-fixed"
          data-bp={breakpoint}
          data-size-mode={bp.sizeMode}
          style={sizingStyle(bp, designWidthOf(document_, breakpoint))}
        >
          <BannerFrame
            breakpoint={bp}
            context={contextFor(breakpoint)}
            eager
            frameRef={frameRef}
          />
        </div>
      </div>
    )
  }

  /*
   * All three layouts are emitted and container queries in renderer.css choose
   * between them.
   *
   * The alternative - measuring the container and rendering one tree - cannot be
   * server-rendered: it either guesses and snaps to the right layout on
   * hydration, or renders nothing and shifts the page. Both cost LCP and CLS on
   * exactly the pages banners live on. Three small trees cost DOM nodes, which
   * are cheap, and buy a correct first paint.
   *
   * `eager` is false for every tree here: the browser cannot be told which one a
   * container query will reveal, so no background is marked high priority
   * rather than eagerly fetching three heroes. Consumers who know the device
   * can pass `breakpoint` and get the eager path above.
   */
  return (
    <div className={rootClass} style={style} role="region" aria-label={label ?? document_.name}>
      {BREAKPOINT_ORDER.map((device) => {
        const bp = document_.breakpoints[device]
        return (
          <div
            key={device}
            className="bnbr-bp"
            data-bp={device}
            data-size-mode={bp.sizeMode}
            style={sizingStyle(bp, designWidthOf(document_, device))}
          >
            <BannerFrame breakpoint={bp} context={contextFor(device)} eager={false} />
          </div>
        )
      })}
    </div>
  )
}
