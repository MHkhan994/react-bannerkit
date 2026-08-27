import Link from 'next/link'

const ROUTES = [
  {
    href: '/hostile',
    title: 'Isolation proof',
    blurb:
      'A deliberately hostile host page that measures live computed styles to prove the package cannot affect the host and the host cannot affect the package.',
  },
]

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>react-bannerkit playground</h1>
      <p style={{ color: '#57534e', marginBottom: 32 }}>
        Development harness. Each route exercises the package the way a consumer would.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 16 }}>
        {ROUTES.map((route) => (
          <li key={route.href} style={{ border: '1px solid #e7e5e4', borderRadius: 8, padding: 16 }}>
            <Link href={route.href} style={{ fontSize: 18, fontWeight: 600 }}>
              {route.title}
            </Link>
            <p style={{ color: '#57534e', marginTop: 4 }}>{route.blurb}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
