// The playground runs its OWN Tailwind build, deliberately. The hostile page
// needs a second, conflicting Tailwind in the document to prove the package's
// scoped CSS cannot be reached by it, and vice versa.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
