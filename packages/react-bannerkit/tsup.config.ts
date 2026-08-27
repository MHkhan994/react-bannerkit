import { defineConfig } from 'tsup'

/*
 * One package, several entries. The split is load-bearing rather than cosmetic:
 * a consumer importing only `react-bannerkit/renderer` must not pull in the
 * editor's shadcn/Radix tree. ESM is code-split so the shared core lands in one
 * chunk both entries reference, instead of being duplicated into each.
 *
 * The `'use client'` directive is stamped onto the renderer entry afterwards by
 * scripts/stamp-directives.mjs, which also verifies the result. See that file
 * for why it is a separate step and what it costs.
 */
export default defineConfig((options) => ({
  entry: {
    index: 'src/index.ts',
    renderer: 'src/renderer/index.ts',
    builder: 'src/builder/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: !options.watch,
  treeshake: true,
  splitting: true,
  external: ['react', 'react-dom', 'zod'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
}))
