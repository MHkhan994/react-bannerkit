/*
 * Shared between page.tsx (a server component) and SizingReport.tsx (client).
 *
 * It cannot live inside SizingReport.tsx: everything a 'use client' module
 * exports becomes an opaque client reference when a server component imports
 * it, even a plain constant array — `WRAPPER_WIDTHS.map` throws
 * "is not a function" at prerender time. A plain module has no such boundary.
 */

/** The four fixed widths the page renders the template at, in the brief's order. */
export const WRAPPER_WIDTHS = [1280, 1640, 980, 500] as const
export type WrapperWidth = (typeof WRAPPER_WIDTHS)[number]
