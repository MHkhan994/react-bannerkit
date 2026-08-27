import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    /*
     * Node by default: the core is pure functions and the CSS guard reads files,
     * so most of the suite needs no DOM. Component tests opt into jsdom with a
     * `// @vitest-environment jsdom` docblock, which keeps the fast tests fast.
     */
    environment: 'node',
    globals: false,
  },
})
