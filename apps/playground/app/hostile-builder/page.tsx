import '../hostile/hostile.css'

import { HostileBuilder } from './HostileBuilder'

export const metadata = {
  title: 'Hostile host + editor — react-bannerkit',
}

export default function HostileBuilderPage() {
  return (
    <div className="host-page">
      <h1>Editor inside the hostile host</h1>
      <p>
        The same global CSS as <code>/hostile</code>, with the real editor mounted in it.
      </p>
      <HostileBuilder />
    </div>
  )
}
