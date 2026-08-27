/** @type {import('next').NextConfig} */
export default {
  // The package is consumed exactly as a published package would be: through its
  // exports map, from dist. No source aliasing, so the playground exercises the
  // real build output rather than a convenience path consumers will not have.
  reactStrictMode: true,
}
