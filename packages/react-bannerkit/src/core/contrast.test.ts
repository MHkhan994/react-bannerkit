import { describe, expect, test } from 'vitest'
import { INK, PAPER, isDark, readableTextColor } from './contrast'

describe('isDark', () => {
  test.each([
    ['#000000', true],
    ['#201f1d', true],
    ['#3a270d', true],
    ['#ffffff', false],
    ['#eae9e9', false],
    ['#f8f4f4', false],
  ])('%s -> dark: %s', (color, expected) => {
    expect(isDark(color)).toBe(expected)
  })

  test('understands three-digit hex', () => {
    expect(isDark('#000')).toBe(true)
    expect(isDark('#fff')).toBe(false)
  })

  test('treats a colour it cannot parse as dark, matching the banner defaults', () => {
    // Banners default to dark photographic backgrounds, so light text is the
    // safer guess when the value is a gradient, a CSS function, or nonsense.
    expect(isDark('var(--brand)')).toBe(true)
    expect(isDark('')).toBe(true)
  })

  test('transparent is treated as dark, since a photo usually sits behind it', () => {
    expect(isDark('transparent')).toBe(true)
  })
})

describe('readableTextColor', () => {
  test('puts dark text on a light panel', () => {
    expect(readableTextColor('#eae9e9')).toBe(INK)
  })

  test('puts light text on a dark panel', () => {
    expect(readableTextColor('#3a270d')).toBe(PAPER)
  })
})
