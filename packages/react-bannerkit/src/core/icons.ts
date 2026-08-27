/*
 * The icon set, shared by the builder's picker and the renderer.
 *
 * A deliberate constraint: the icon element can only use a glyph from this map.
 *
 * The alternative was to let the builder pick from all of `lucide-react`, which
 * would mean the renderer needed lucide too - a large dependency on a public
 * marketing page, for one small decorative element. Worse, tree-shaking cannot
 * help when the glyph name is only known at runtime from the document, so the
 * whole set would ship.
 *
 * So the renderer inlines these paths and stays dependency-free, and the builder
 * offers exactly what the renderer can draw. Consumers who need a glyph that is
 * not here pass `renderIcon` to `<BannerRenderer>` and supply their own.
 *
 * Paths are hand-authored on a 24x24 grid to be drawn with `currentColor`,
 * `fill="none"`, `stroke-width="2"`, and round caps and joins.
 */

export interface IconSpec {
  label: string
  path: string
}

export const ICONS: Record<string, IconSpec> = {
  ArrowRight: { label: 'Arrow right', path: 'M4 12h16M14 6l6 6-6 6' },
  ArrowLeft: { label: 'Arrow left', path: 'M20 12H4M10 6l-6 6 6 6' },
  ChevronRight: { label: 'Chevron right', path: 'M9 5l7 7-7 7' },
  ChevronDown: { label: 'Chevron down', path: 'M5 9l7 7 7-7' },
  Check: { label: 'Check', path: 'M4 12.5l5 5L20 6.5' },
  Plus: { label: 'Plus', path: 'M12 4v16M4 12h16' },
  X: { label: 'Close', path: 'M5 5l14 14M19 5L5 19' },
  Star: {
    label: 'Star',
    path: 'M12 3l2.9 5.9 6.1.9-4.5 4.3 1.1 6.4L12 17.6 6.4 20.5l1.1-6.4L3 9.8l6.1-.9z',
  },
  Heart: {
    label: 'Heart',
    path: 'M12 20s-7-4.4-7-9.3A4.2 4.2 0 0112 8a4.2 4.2 0 017 2.7c0 4.9-7 9.3-7 9.3z',
  },
  Sparkle: { label: 'Sparkle', path: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' },
  Tag: { label: 'Tag', path: 'M4 4h7l9 9-7 7-9-9zM7.5 7.5h.01' },
  Gift: { label: 'Gift', path: 'M4 10h16v10H4zM4 10V7h16v3M12 7v13M8 7a2 2 0 110-4c2.5 0 4 4 4 4M16 7a2 2 0 100-4c-2.5 0-4 4-4 4' },
  Truck: { label: 'Truck', path: 'M3 6h10v10H3zM13 10h4l3 3v3h-7M6.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3M17.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3' },
  Mail: { label: 'Mail', path: 'M3 6h18v12H3zM3 7l9 6 9-6' },
  Search: { label: 'Search', path: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4' },
  Play: { label: 'Play', path: 'M7 4l12 8-12 8z' },
  Clock: { label: 'Clock', path: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2' },
  ExternalLink: { label: 'External link', path: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6' },
  Book: { label: 'Book', path: 'M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5zM20 18v3H6.5' },
  Quote: { label: 'Quote', path: 'M9 7H5v5h4v5H5M19 7h-4v5h4v5h-4' },
}

/** The default glyph for a new icon element. */
export const DEFAULT_ICON = 'Star'

export const ICON_NAMES: readonly string[] = Object.keys(ICONS)

/** Resolves a stored glyph name to a drawable path, falling back to the default. */
export function iconPath(glyph: string): string {
  return (ICONS[glyph] ?? ICONS[DEFAULT_ICON]!).path
}
