/*
 * Turning whatever came out of the database into a document the renderer can
 * trust.
 *
 * This is the package's blast shield. A stored template can be older than the
 * installed version, hand-edited, truncated, or from a completely different
 * system, and none of that may throw an exception on a marketing page. Every
 * function here therefore takes `unknown` and returns something valid.
 *
 * It is deliberately dependency-free so it can live in the renderer entry.
 * Consumers who want schema errors rather than repairs should use the zod
 * schemas from `react-bannerkit/schema` instead, on the server.
 */
import {
  createDefaultTemplate,
  createElement,
  createPanel,
  PLACEHOLDER_IMAGE,
} from './defaults'
import { makeId, type IdFactory } from './ids'
import { clampRatio } from './tree'
import {
  BREAKPOINT_ORDER,
  CURRENT_SCHEMA_VERSION,
  DEVICES,
  type AlignMain,
  type BackgroundMode,
  type BannerBreakpoint,
  type BannerElement,
  type BannerElementType,
  type BannerNode,
  type BannerPanel,
  type BannerSlide,
  type BannerTemplate,
  type BreakpointName,
  type ButtonVariant,
  type CarouselPagination,
  type CarouselTransition,
  type FontWeight,
  type HeightMode,
  type ImageFit,
  type OverlayMode,
  type PanelKind,
  type SplitDirection,
  type TextAlign,
} from './types'

export interface NormalizeOptions {
  id?: IdFactory
  createdAt?: string
  /** Called for anything discarded or repaired, so a builder can surface it. */
  onWarn?: (message: string) => void
}

/* ------------------------------------------------------------------ scalars */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)

/** A colour is passed through as an opaque string: CSS accepts far more than hex. */
const color = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

const WEIGHTS: readonly FontWeight[] = [300, 400, 500, 600, 700, 800]
function weight(v: unknown): FontWeight {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10)
  return WEIGHTS.includes(n as FontWeight) ? (n as FontWeight) : 400
}

const ALIGNS: readonly AlignMain[] = ['flex-start', 'center', 'flex-end']
const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right']
const BG_MODES: readonly BackgroundMode[] = ['photo', 'color']
const FITS: readonly ImageFit[] = ['cover', 'contain']
const VARIANTS: readonly ButtonVariant[] = ['primary', 'solid', 'ghost']
const OVERLAY_MODES: readonly OverlayMode[] = ['solid', 'gradient']
const TRANSITIONS: readonly CarouselTransition[] = ['fade', 'slide', 'none']
const PAGINATIONS: readonly CarouselPagination[] = ['dots', 'bars', 'none']
const HEIGHT_MODES: readonly HeightMode[] = ['fixed', 'vh']
const PANEL_KINDS: readonly PanelKind[] = ['single', 'carousel']
const DIRECTIONS: readonly SplitDirection[] = ['cols', 'rows']
const ELEMENT_TYPES: readonly BannerElementType[] = [
  'heading',
  'text',
  'button',
  'link',
  'image',
  'overlay',
  'spacer',
  'icon',
]

/** Free placement is clamped to 0-96% so a dragged element can never leave its panel. */
function position(v: unknown): { x: number; y: number } | undefined {
  if (!isRecord(v)) return undefined
  if (v.x === undefined && v.y === undefined) return undefined
  return { x: num(v.x, 0, 0, 96), y: num(v.y, 0, 0, 96) }
}

/* ----------------------------------------------------------------- elements */

function normalizeElement(
  input: unknown,
  id: IdFactory,
  warn: (m: string) => void,
): BannerElement | null {
  if (!isRecord(input)) {
    warn('Dropped an element that was not an object.')
    return null
  }
  const type = input.type
  if (typeof type !== 'string' || !(ELEMENT_TYPES as readonly string[]).includes(type)) {
    warn(`Dropped an element of unknown type "${String(type)}".`)
    return null
  }

  const base = createElement(type as BannerElementType, id)
  const elId = str(input.id, base.id)
  const pos = position(input.pos)
  const placed = <T extends object>(el: T): T => (pos ? { ...el, pos } : el)

  switch (base.type) {
    case 'heading':
    case 'text':
      return placed({
        ...base,
        id: elId,
        text: str(input.text, base.text),
        fs: num(input.fs, base.fs, 8, 200),
        weight: weight(input.weight ?? base.weight),
        align: oneOf(input.align, TEXT_ALIGNS, base.align),
        measure: num(input.measure, base.measure, 4, 200),
        color: color(input.color, base.color),
      })
    case 'button':
      return placed({
        ...base,
        id: elId,
        text: str(input.text, base.text),
        href: str(input.href, base.href),
        variant: oneOf(input.variant, VARIANTS, base.variant),
        fs: num(input.fs, base.fs, 8, 64),
        radius: num(input.radius, base.radius, 0, 99),
        color: color(input.color, base.color),
      })
    case 'link':
      return placed({
        ...base,
        id: elId,
        text: str(input.text, base.text),
        href: str(input.href, base.href),
        underline: bool(input.underline, base.underline),
        fs: num(input.fs, base.fs, 8, 64),
        color: color(input.color, base.color),
      })
    case 'image':
      return placed({
        ...base,
        id: elId,
        src: str(input.src, base.src) || PLACEHOLDER_IMAGE,
        alt: str(input.alt, base.alt),
        width: num(input.width, base.width, 1, 100),
        fit: oneOf(input.fit, FITS, base.fit),
        radius: num(input.radius, base.radius, 0, 99),
        plate: bool(input.plate, base.plate),
        plateColor: color(input.plateColor, base.plateColor),
        href: str(input.href, base.href),
      })
    case 'overlay':
      // Overlays cover the panel by definition, so they carry no position.
      return {
        ...base,
        id: elId,
        mode: oneOf(input.mode, OVERLAY_MODES, base.mode),
        opacity: num(input.opacity, base.opacity, 0, 1),
        color: color(input.color, base.color),
      }
    case 'spacer':
      return placed({ ...base, id: elId, size: num(input.size, base.size, 0, 400) })
    case 'icon':
      return placed({
        ...base,
        id: elId,
        glyph: str(input.glyph, base.glyph),
        fs: num(input.fs, base.fs, 8, 200),
        color: color(input.color, base.color),
      })
  }
}

function normalizeElements(
  input: unknown,
  id: IdFactory,
  warn: (m: string) => void,
): BannerElement[] {
  if (!Array.isArray(input)) return []
  const out: BannerElement[] = []
  for (const raw of input) {
    const el = normalizeElement(raw, id, warn)
    if (el) out.push(el)
  }
  // An overlay only makes sense behind everything else, and the editor relies on
  // it being first, so enforce that here rather than trusting stored order.
  return [...out.filter((e) => e.type === 'overlay'), ...out.filter((e) => e.type !== 'overlay')]
}

/* ------------------------------------------------------------------- panels */

function normalizeSlide(input: unknown, id: IdFactory, warn: (m: string) => void): BannerSlide {
  const raw = isRecord(input) ? input : {}
  return {
    id: str(raw.id, id()),
    mode: oneOf(raw.mode, BG_MODES, 'color'),
    bg: color(raw.bg, '#201f1d'),
    img: str(raw.img, PLACEHOLDER_IMAGE),
    href: str(raw.href, ''),
    elements: normalizeElements(raw.elements, id, warn),
  }
}

/*
 * The prototype stored pagination as `dots: boolean` plus `dotStyle`. One
 * three-state field replaces them; documents written against the old shape are
 * folded forward here.
 */
function pagination(raw: Record<string, unknown>, fallback: CarouselPagination): CarouselPagination {
  if (raw.pagination !== undefined) return oneOf(raw.pagination, PAGINATIONS, fallback)
  if (raw.dots === false) return 'none'
  if (raw.dots === true) return oneOf(raw.dotStyle, PAGINATIONS, 'dots')
  return fallback
}

function normalizePanel(input: unknown, id: IdFactory, warn: (m: string) => void): BannerPanel {
  const raw = isRecord(input) ? input : {}
  const base = createPanel(id)
  const slides = Array.isArray(raw.slides)
    ? raw.slides.map((s) => normalizeSlide(s, id, warn))
    : base.slides
  return {
    id: str(raw.id, base.id),
    kind: 'panel',
    type: oneOf(raw.type, PANEL_KINDS, base.type),
    bgMode: oneOf(raw.bgMode, BG_MODES, base.bgMode),
    bg: color(raw.bg, base.bg),
    img: str(raw.img, base.img),
    href: str(raw.href, base.href),
    pad: num(raw.pad, base.pad, 0, 400),
    gap: num(raw.gap, base.gap, 0, 200),
    alignX: oneOf(raw.alignX, ALIGNS, base.alignX),
    alignY: oneOf(raw.alignY, ALIGNS, base.alignY),
    radius: num(raw.radius, base.radius, 0, 400),
    borderW: num(raw.borderW, base.borderW, 0, 40),
    borderColor: color(raw.borderColor, base.borderColor),
    autoplay: bool(raw.autoplay, base.autoplay),
    interval: num(raw.interval, base.interval, 200, 120_000),
    transition: oneOf(raw.transition, TRANSITIONS, base.transition),
    speed: num(raw.speed, base.speed, 0, 5_000),
    arrows: bool(raw.arrows, base.arrows),
    pagination: pagination(raw, base.pagination),
    counter: bool(raw.counter, base.counter),
    loop: bool(raw.loop, base.loop),
    pauseHover: bool(raw.pauseHover, base.pauseHover),
    // A carousel with no slides would render nothing at all.
    slides: slides.length > 0 ? slides : base.slides,
    elements: normalizeElements(raw.elements, id, warn),
  }
}

function normalizeNode(input: unknown, id: IdFactory, warn: (m: string) => void): BannerNode {
  const raw = isRecord(input) ? input : {}
  if (raw.kind !== 'split') return normalizePanel(raw, id, warn)

  // A split needs both branches to mean anything. With one branch present it
  // collapses to that branch; with neither it becomes a plain panel.
  const hasA = raw.a !== undefined && raw.a !== null
  const hasB = raw.b !== undefined && raw.b !== null
  if (!hasA && !hasB) {
    warn('A split had no branches and was replaced with a single panel.')
    return normalizePanel({}, id, warn)
  }
  if (!hasA || !hasB) {
    warn('A split was missing a branch and collapsed to the branch that remained.')
    return normalizeNode(hasA ? raw.a : raw.b, id, warn)
  }
  return {
    id: str(raw.id, id()),
    kind: 'split',
    dir: oneOf(raw.dir, DIRECTIONS, 'cols'),
    ratio: clampRatio(num(raw.ratio, 0.5, -Infinity, Infinity)),
    a: normalizeNode(raw.a, id, warn),
    b: normalizeNode(raw.b, id, warn),
  }
}

function normalizeBreakpoint(
  input: unknown,
  name: BreakpointName,
  id: IdFactory,
  warn: (m: string) => void,
): BannerBreakpoint {
  const raw = isRecord(input) ? input : {}
  return {
    // `h` and `hMode` are the names the design handoff documented.
    height: num(raw.height ?? raw.h, DEVICES[name].height, 40, 4_000),
    heightMode: oneOf(raw.heightMode ?? raw.hMode, HEIGHT_MODES, 'fixed'),
    vh: num(raw.vh, 100, 10, 100),
    gutter: num(raw.gutter, 0, 0, 48),
    bg: color(raw.bg, '#eae9e9'),
    root: normalizeNode(raw.root, id, warn),
  }
}

/* ----------------------------------------------------------------- template */

/*
 * Repairs an unknown value into a valid template. Never throws.
 *
 * Missing pieces are filled from the defaults, out-of-range numbers are
 * clamped, and anything unrecognisable is dropped with a warning. The result is
 * idempotent: normalizing an already-normal template returns an equal document,
 * so a save loop cannot make a template drift.
 */
export function normalizeTemplate(input: unknown, options: NormalizeOptions = {}): BannerTemplate {
  const id = options.id ?? makeId
  const warn = options.onWarn ?? (() => {})

  if (!isRecord(input)) {
    if (input !== undefined && input !== null) {
      warn('The template was not an object, so a default template was used instead.')
    }
    const fallback: { name?: string; description?: string; id: IdFactory; createdAt?: string } = { id }
    if (options.createdAt !== undefined) fallback.createdAt = options.createdAt
    return createDefaultTemplate(fallback)
  }

  const version = num(input.version, 0, 0, Number.MAX_SAFE_INTEGER)
  if (version > CURRENT_SCHEMA_VERSION) {
    warn(
      `This template was written by a newer version of react-bannerkit (schema ${version}, ` +
        `this build understands ${CURRENT_SCHEMA_VERSION}). Unknown fields will be dropped if it is saved.`,
    )
  }

  // `bps` and `desc` are the names the design handoff documented.
  const rawBreakpoints = isRecord(input.breakpoints)
    ? input.breakpoints
    : isRecord(input.bps)
      ? input.bps
      : {}

  const breakpoints = {} as Record<BreakpointName, BannerBreakpoint>
  for (const name of BREAKPOINT_ORDER) {
    breakpoints[name] = normalizeBreakpoint(rawBreakpoints[name], name, id, warn)
  }

  const created = input.createdAt ?? input.created
  return {
    version: CURRENT_SCHEMA_VERSION,
    id: str(input.id, id()),
    name: str(input.name, 'Untitled banner'),
    description: str(input.description ?? input.desc, ''),
    createdAt: str(created, options.createdAt ?? new Date().toISOString()),
    breakpoints,
  }
}
