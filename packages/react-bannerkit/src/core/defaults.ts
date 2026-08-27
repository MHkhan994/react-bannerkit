import { makeId, type IdFactory } from './ids'
import {
  BREAKPOINT_ORDER,
  CURRENT_SCHEMA_VERSION,
  DEVICES,
  type BannerBreakpoint,
  type BannerElement,
  type BannerElementType,
  type BannerPanel,
  type BannerSlide,
  type BannerTemplate,
  type BreakpointName,
} from './types'

/*
 * Default palette for a new banner. These are plain values, not theme tokens:
 * a banner has to look the same in the editor and on the consuming page, so it
 * can never inherit colour from whatever surrounds it.
 */
const INK = '#201f1d'
const PAPER = '#f8f4f4'
const SURFACE = '#eae9e9'
const UMBER = '#3a270d'
const ACCENT = '#e1ad66'

/** Swatches offered in the inspector colour rows. */
export const DEFAULT_SWATCHES: readonly { value: string; label: string }[] = [
  { value: PAPER, label: 'Paper' },
  { value: INK, label: 'Ink' },
  { value: '#b68235', label: 'Accent' },
  { value: '#7d5411', label: 'Accent deep' },
  { value: SURFACE, label: 'Surface' },
  { value: UMBER, label: 'Umber' },
]

/*
 * A 1x1 transparent GIF, used as the placeholder image source. A brand-new
 * template has to render without reaching for a bundled asset the consumer
 * does not have, which is what the prototype relied on.
 */
export const PLACEHOLDER_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function createElement(type: BannerElementType, id: IdFactory = makeId): BannerElement {
  switch (type) {
    case 'heading':
      return {
        id: id(),
        type: 'heading',
        text: 'A season of new arrivals',
        fs: 46,
        weight: 400,
        align: 'left',
        measure: 26,
        color: PAPER,
      }
    case 'text':
      return {
        id: id(),
        type: 'text',
        text: 'Hand-bound editions, gathered through the spring and set out for the first time.',
        fs: 16,
        weight: 400,
        align: 'left',
        measure: 44,
        color: SURFACE,
      }
    case 'button':
      return {
        id: id(),
        type: 'button',
        text: 'Browse the collection',
        href: '',
        variant: 'primary',
        fs: 14,
        radius: 4,
        color: PAPER,
      }
    case 'link':
      return {
        id: id(),
        type: 'link',
        text: 'See the full catalogue',
        href: '',
        underline: true,
        fs: 14,
        color: ACCENT,
      }
    case 'image':
      return {
        id: id(),
        type: 'image',
        src: PLACEHOLDER_IMAGE,
        alt: '',
        width: 42,
        fit: 'cover',
        radius: 2,
        plate: false,
        plateColor: SURFACE,
        href: '',
      }
    case 'overlay':
      return { id: id(), type: 'overlay', mode: 'gradient', opacity: 0.42, color: INK }
    case 'spacer':
      return { id: id(), type: 'spacer', size: 18 }
    case 'icon':
      return { id: id(), type: 'icon', glyph: 'Star', fs: 26, color: ACCENT }
  }
}

function createSlide(id: IdFactory, bg: string): BannerSlide {
  return { id: id(), mode: 'color', bg, img: PLACEHOLDER_IMAGE, href: '', elements: [] }
}

export interface CreatePanelOptions {
  /** Seed the panel with an overlay, heading, body copy, and a button. */
  filled?: boolean
  background?: string
}

export function createPanel(id: IdFactory = makeId, options: CreatePanelOptions = {}): BannerPanel {
  const { filled = false, background = UMBER } = options
  return {
    id: id(),
    kind: 'panel',
    type: 'single',
    bgMode: 'color',
    bg: background,
    img: PLACEHOLDER_IMAGE,
    href: '',
    pad: 40,
    gap: 14,
    alignX: 'flex-start',
    alignY: 'center',
    radius: 0,
    borderW: 0,
    borderColor: ACCENT,
    autoplay: true,
    interval: 4000,
    transition: 'fade',
    speed: 500,
    arrows: true,
    pagination: 'dots',
    counter: false,
    loop: true,
    pauseHover: true,
    /*
     * Two slides exist up front so switching to carousel mode has somewhere to
     * go. They stay inert while type is 'single'.
     */
    slides: [createSlide(id, UMBER), createSlide(id, INK)],
    elements: filled
      ? [
          createElement('overlay', id),
          createElement('heading', id),
          createElement('text', id),
          createElement('button', id),
        ]
      : [],
  }
}

/*
 * Per-breakpoint type scale for a brand-new template. A 46px heading that looks
 * right on a laptop is unreadable at 390px, so the default template ships
 * already tuned rather than leaving the user to discover the problem.
 */
const RESPONSIVE_TUNING: Record<
  BreakpointName,
  { pad: number; heading: number; body: number; measure: number }
> = {
  laptop: { pad: 40, heading: 46, body: 16, measure: 26 },
  tablet: { pad: 32, heading: 38, body: 15, measure: 24 },
  mobile: { pad: 24, heading: 30, body: 14, measure: 18 },
}

function createBreakpoint(name: BreakpointName, id: IdFactory): BannerBreakpoint {
  const device = DEVICES[name]
  const tuning = RESPONSIVE_TUNING[name]
  const root = createPanel(id, { filled: true })
  root.pad = tuning.pad
  for (const el of root.elements) {
    if (el.type === 'heading') {
      el.fs = tuning.heading
      el.measure = tuning.measure
    }
    if (el.type === 'text') {
      el.fs = tuning.body
      el.measure = tuning.measure + 16
    }
  }
  return {
    height: device.height,
    heightMode: 'fixed',
    vh: 100,
    gutter: 0,
    bg: SURFACE,
    root,
  }
}

export interface CreateTemplateOptions {
  name?: string
  description?: string
  id?: IdFactory
  /** ISO timestamp. Injectable so tests and snapshots stay deterministic. */
  createdAt?: string
}

/*
 * The template used when BannerBuilder is given no `template` prop. It is
 * deliberately a filled single panel rather than an empty one: a first-run
 * editor that renders something real is far easier to understand than a blank
 * rectangle.
 */
export function createDefaultTemplate(options: CreateTemplateOptions = {}): BannerTemplate {
  const id = options.id ?? makeId
  const breakpoints = {} as Record<BreakpointName, BannerBreakpoint>
  for (const name of BREAKPOINT_ORDER) breakpoints[name] = createBreakpoint(name, id)
  return {
    version: CURRENT_SCHEMA_VERSION,
    id: id(),
    name: options.name ?? 'Untitled banner',
    description: options.description ?? '',
    createdAt: options.createdAt ?? new Date().toISOString(),
    breakpoints,
  }
}
