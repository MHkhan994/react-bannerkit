'use client'

import { BannerBuilder } from 'react-bannerkit/builder'
import 'react-bannerkit/builder.css'
import 'react-bannerkit/renderer.css'

/*
 * The real editor, mounted inside the hostile host's global CSS.
 *
 * The existing /hostile page proves the boundary with static stand-in markup,
 * which cannot catch a host rule that breaks the *canvas* - the frame is sized
 * by inline style and scaled by a transform, and neither is something the
 * static probe exercises. This page mounts the actual component so the geometry
 * can be measured under attack.
 */
export function HostileBuilder() {
  return (
    <div style={{ height: 640, border: '2px solid rgb(120 53 15)' }}>
      <BannerBuilder theme="light" />
    </div>
  )
}
