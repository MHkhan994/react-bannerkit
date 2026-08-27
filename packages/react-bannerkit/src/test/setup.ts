/** Shared setup for component tests. Imported explicitly, not auto-loaded. */
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
