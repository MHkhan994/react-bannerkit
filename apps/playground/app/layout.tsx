import type { ReactNode } from 'react'

export const metadata = {
  title: 'react-bannerkit playground',
  description: 'Development harness for the react-bannerkit package.',
}

/*
 * Intentionally bare: no global stylesheet, no font loading, no reset. Each
 * route brings its own CSS so the hostile page can establish its own hostile
 * baseline without the layout having already normalised anything.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
