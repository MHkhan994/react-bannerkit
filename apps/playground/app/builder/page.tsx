import { BuilderHarness } from './BuilderHarness'

export const metadata = {
  title: 'Builder — react-bannerkit',
}

/*
 * The editor, embedded the way a consumer would embed it: inside an existing
 * admin page that has its own header and its own styling.
 *
 * The surrounding chrome is deliberately styled with the host's own CSS so that
 * the boundary is visible - the editor should look like itself, and the page
 * around it should look like itself.
 */
export default function BuilderPage() {
  return <BuilderHarness />
}
