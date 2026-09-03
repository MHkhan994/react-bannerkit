import { describe, expect, it } from 'vitest'

import { du } from './units'

describe('du', () => {
  it('expresses a design pixel value as a multiple of the scale unit', () => {
    expect(du(46)).toBe('calc(var(--bnbr-u) * 46)')
  })

  it('keeps zero explicit rather than collapsing it', () => {
    // `0` is a valid gap and must still be a length, not an empty string.
    expect(du(0)).toBe('calc(var(--bnbr-u) * 0)')
  })

  it('survives a fractional value, which half-gutters produce', () => {
    expect(du(7.5)).toBe('calc(var(--bnbr-u) * 7.5)')
  })
})
