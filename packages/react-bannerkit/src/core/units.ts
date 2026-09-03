/*
 * Design pixels.
 *
 * Every size in a banner document is expressed in the pixels of the design it
 * was authored in - 1280 wide for laptop by default. At render time the whole
 * design scales with its container, so those numbers cannot be emitted as `px`;
 * they are emitted as multiples of `--bnbr-u`, the scale unit the frame computes
 * from the container's width.
 *
 * At the authored width `--bnbr-u` is exactly `1px`, so a document renders at its
 * literal numbers in the editor canvas and grows or shrinks from there.
 */

/** A design-px value as a length that scales with the banner. */
export function du(n: number): string {
  return `calc(var(--bnbr-u) * ${n})`
}
