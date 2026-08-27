'use client'

import { useCallback, useRef, useState } from 'react'
import type { BannerTemplate } from 'react-bannerkit'
import { BannerBuilder } from 'react-bannerkit/builder'
import 'react-bannerkit/builder.css'
import 'react-bannerkit/renderer.css'

/*
 * A consumer's admin page.
 *
 * Exercises the whole documented API: an optional template, the debounced
 * `onChange`, an async `onSave` that can fail, and `onUploadImage`. The counters
 * are here so the debounce and the save states can be observed rather than
 * assumed.
 */
export function BuilderHarness() {
  const [changeCount, setChangeCount] = useState(0)
  const [lastChange, setLastChange] = useState<string>('—')
  const [saved, setSaved] = useState<BannerTemplate | null>(null)
  const [failNextSave, setFailNextSave] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')
  const changes = useRef(0)

  const onChange = useCallback((template: BannerTemplate) => {
    changes.current += 1
    setChangeCount(changes.current)
    setLastChange(`${template.name} · ${new Date().toISOString().slice(11, 19)}`)
  }, [])

  const onSave = useCallback(
    async (template: BannerTemplate) => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      if (failNextSave) {
        setFailNextSave(false)
        throw new Error('The server said no. Try again.')
      }
      setSaved(template)
    },
    [failNextSave],
  )

  const onUploadImage = useCallback(async (file: File) => {
    // A stand-in for a real upload: read the file and hand back a data URL.
    await new Promise((resolve) => setTimeout(resolve, 400))
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read that file.'))
      reader.readAsDataURL(file)
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'Georgia, serif' }}>
      {/* The host's own chrome, in the host's own style. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 16px',
          borderBottom: '2px solid #d6d3d1',
          background: '#fafaf9',
          fontSize: 14,
        }}
      >
        <strong>Host admin</strong>
        <span data-testid="change-count">onChange calls: {changeCount}</span>
        <span data-testid="last-change">last: {lastChange}</span>
        <span data-testid="saved-name">saved: {saved ? saved.name : 'never'}</span>
        <label style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={failNextSave}
            onChange={(event) => setFailNextSave(event.target.checked)}
          />
          fail next save
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          theme
          <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
            <option value="light">light</option>
            <option value="dark">dark</option>
            <option value="system">system</option>
          </select>
        </label>
      </header>

      <div style={{ flex: 1, minHeight: 0 }} data-testid="builder-host">
        <BannerBuilder
          theme={theme}
          onChange={onChange}
          onSave={onSave}
          onUploadImage={onUploadImage}
        />
      </div>
    </div>
  )
}
