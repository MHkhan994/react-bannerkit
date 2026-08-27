/**
 * The serialisable banner document.
 *
 * Everything a consumer stores, passes to `<BannerBuilder>`, and hands to
 * `<BannerRenderer>` is described here. The document is the package's public
 * contract, so it is deliberately plain JSON: no class instances, no functions,
 * no `undefined`-vs-missing distinctions that would not survive a round trip
 * through `JSON.stringify`.
 *
 * Type names are all `Banner`-prefixed on purpose. `Element`, `Node`, and
 * `Text` are DOM globals; exporting those names from a `.d.ts` shadows them in
 * consumer code and produces baffling errors.
 */

/** Bumped whenever a stored document needs migrating. See `normalizeTemplate`. */
export const CURRENT_SCHEMA_VERSION = 1

export type BreakpointName = 'laptop' | 'tablet' | 'mobile'
export type SplitDirection = 'cols' | 'rows'
export type BannerElementType =
  | 'heading'
  | 'text'
  | 'button'
  | 'link'
  | 'image'
  | 'overlay'
  | 'spacer'
  | 'icon'

export type AlignMain = 'flex-start' | 'center' | 'flex-end'
export type TextAlign = 'left' | 'center' | 'right'
export type FontWeight = 300 | 400 | 500 | 600 | 700 | 800
export type ButtonVariant = 'primary' | 'solid' | 'ghost'
export type OverlayMode = 'solid' | 'gradient'
export type ImageFit = 'cover' | 'contain'
export type CarouselTransition = 'fade' | 'slide' | 'none'
export type CarouselPagination = 'dots' | 'bars' | 'none'
export type BackgroundMode = 'photo' | 'color'
export type HeightMode = 'fixed' | 'vh'
export type PanelKind = 'single' | 'carousel'

/** Free placement, as a percentage of the containing panel box. 0–96. */
export interface BannerPosition {
  x: number
  y: number
}

interface ElementBase {
  id: string
  /** Present only when the element has been dragged free of the flex stack. */
  pos?: BannerPosition
}

export interface HeadingElement extends ElementBase {
  type: 'heading'
  text: string
  fs: number
  weight: FontWeight
  align: TextAlign
  /** Line length in `ch`, which is what actually controls readability. */
  measure: number
  color: string
}

export interface TextElement extends ElementBase {
  type: 'text'
  text: string
  fs: number
  weight: FontWeight
  align: TextAlign
  measure: number
  color: string
}

export interface ButtonElement extends ElementBase {
  type: 'button'
  text: string
  href: string
  variant: ButtonVariant
  fs: number
  radius: number
  color: string
}

export interface LinkElement extends ElementBase {
  type: 'link'
  text: string
  href: string
  underline: boolean
  fs: number
  color: string
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  /**
   * Alternative text. An image element is content rather than decoration - it
   * often carries a product, a price, or a logo - so it needs one. Panel
   * *background* images are decorative and always render with `alt=""`.
   */
  alt: string
  /** Percentage of the panel's inner width. */
  width: number
  fit: ImageFit
  radius: number
  /** Draws a mat border around the image. */
  plate: boolean
  /**
   * Mat colour. Explicit rather than inherited from a theme token: a rendered
   * banner must look identical in the editor and on the host's page.
   */
  plateColor: string
  href: string
}

/** Always first in the stack, always `inset: 0`. Cannot be freely positioned. */
export interface OverlayElement {
  id: string
  type: 'overlay'
  mode: OverlayMode
  /** 0–1. */
  opacity: number
  color: string
}

export interface SpacerElement extends ElementBase {
  type: 'spacer'
  size: number
}

export interface IconElement extends ElementBase {
  type: 'icon'
  /** A `lucide-react` icon name, e.g. `ArrowRight`. */
  glyph: string
  fs: number
  color: string
}

export type BannerElement =
  | HeadingElement
  | TextElement
  | ButtonElement
  | LinkElement
  | ImageElement
  | OverlayElement
  | SpacerElement
  | IconElement

/** One slide of a carousel. Owns its own background and its own elements. */
export interface BannerSlide {
  id: string
  mode: BackgroundMode
  bg: string
  img: string
  /** Makes the whole slide clickable. */
  href: string
  elements: BannerElement[]
}

export interface BannerPanel {
  id: string
  kind: 'panel'
  type: PanelKind

  /* background */
  bgMode: BackgroundMode
  bg: string
  img: string
  /** Makes the whole panel clickable. Single panels only; carousels use per-slide `href`. */
  href: string

  /* box */
  pad: number
  gap: number
  alignX: AlignMain
  alignY: AlignMain
  radius: number
  borderW: number
  borderColor: string

  /* carousel — ignored when `type === 'single'` */
  autoplay: boolean
  /** Slide duration in ms. */
  interval: number
  transition: CarouselTransition
  /** Transition duration in ms. */
  speed: number
  arrows: boolean
  /**
   * One three-state control. The prototype stored this as `dots: boolean` plus
   * `dotStyle: 'dots' | 'bars'` and reconciled them at the inspector; two
   * fields for one control invites states that disagree.
   */
  pagination: CarouselPagination
  counter: boolean
  loop: boolean
  pauseHover: boolean
  slides: BannerSlide[]

  /** Used when `type === 'single'`. */
  elements: BannerElement[]
}

export interface BannerSplit {
  id: string
  kind: 'split'
  dir: SplitDirection
  /** Fraction of the axis given to `a`. Clamped to 0.15–0.85. */
  ratio: number
  a: BannerNode
  b: BannerNode
}

export type BannerNode = BannerSplit | BannerPanel

export interface BannerBreakpoint {
  /** Banner height in px. Used when `heightMode === 'fixed'`. */
  height: number
  heightMode: HeightMode
  /** Percentage of viewport height, 10–100. Used when `heightMode === 'vh'`. */
  vh: number
  /** Space between panels, 0–48px. */
  gutter: number
  /** Shows through the gutter. `'transparent'` is allowed. */
  bg: string
  root: BannerNode
}

export interface BannerTemplate {
  version: number
  id: string
  name: string
  description: string
  /** ISO 8601. A pre-formatted display date would be locale-bound and unsortable. */
  createdAt: string
  breakpoints: Record<BreakpointName, BannerBreakpoint>
}

/** Nominal device metrics, used to render the canvas truthfully. */
export interface DeviceSpec {
  label: string
  width: number
  /** Default banner height for a new template. */
  height: number
  /** Nominal screen height, so `heightMode: 'vh'` can be previewed. */
  screenHeight: number
}

export const DEVICES: Record<BreakpointName, DeviceSpec> = {
  laptop: { label: 'Laptop', width: 1280, height: 420, screenHeight: 800 },
  tablet: { label: 'Tab', width: 834, height: 380, screenHeight: 1112 },
  mobile: { label: 'Mobile', width: 390, height: 440, screenHeight: 844 },
}

export const BREAKPOINT_ORDER: readonly BreakpointName[] = ['laptop', 'tablet', 'mobile']

/** A `{x, y, w, h}` rect in percentages of the banner frame. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
