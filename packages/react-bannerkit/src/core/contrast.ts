/*
 * Picking a text colour that can actually be read.
 *
 * A new element used to take a fixed light colour, which is right on the dark
 * photographic panels a banner usually starts from and invisible the moment you
 * add one to a light panel - which is exactly what splitting a panel gives you.
 * Adding a heading and seeing nothing appear is the kind of thing that reads as
 * a broken editor.
 */

/** Near-black and near-white from the default palette. */
export const INK = '#201f1d'
export const PAPER = '#f8f4f4'

/** Parses `#rgb` and `#rrggbb`. Returns null for anything else. */
function parseHex(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value)
  if (short) {
    return {
      r: Number.parseInt(short[1]! + short[1]!, 16),
      g: Number.parseInt(short[2]! + short[2]!, 16),
      b: Number.parseInt(short[3]! + short[3]!, 16),
    }
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (!long) return null
  return {
    r: Number.parseInt(long[1]!, 16),
    g: Number.parseInt(long[2]!, 16),
    b: Number.parseInt(long[3]!, 16),
  }
}

/**
 * Relative luminance, per WCAG, so the decision matches how a person perceives
 * brightness rather than a naive channel average.
 */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/*
 * Anything unparseable counts as dark. A background can legitimately be a
 * gradient, a CSS variable, `transparent` over a photograph, or a colour space
 * this does not read - and a banner's default background is a dark image, so
 * light text is the safer guess.
 */
export function isDark(color: string): boolean {
  const rgb = parseHex(color)
  if (!rgb) return true
  return relativeLuminance(rgb) < 0.45
}

/** The colour a new element should use to be legible on `background`. */
export function readableTextColor(background: string): string {
  return isDark(background) ? PAPER : INK
}
