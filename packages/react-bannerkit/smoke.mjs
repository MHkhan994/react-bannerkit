/* Uses the published tarball exactly as a consumer would: by package name. */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { createDefaultTemplate, normalizeTemplate, CURRENT_SCHEMA_VERSION } from 'react-bannerkit'
import { BannerRenderer } from 'react-bannerkit/renderer'
import { createRequire } from 'node:module'

const checks = []
const check = (name, fn) => {
  try { const detail = fn(); checks.push(['PASS', name, detail ?? '']) }
  catch (e) { checks.push(['FAIL', name, e.message]) }
}

check('root entry exports document helpers', () => {
  if (typeof createDefaultTemplate !== 'function') throw new Error('missing createDefaultTemplate')
  return `schema v${CURRENT_SCHEMA_VERSION}`
})

check('creates and normalizes a template', () => {
  const t = createDefaultTemplate({ name: 'Smoke' })
  const round = normalizeTemplate(JSON.parse(JSON.stringify(t)))
  if (round.name !== 'Smoke') throw new Error('round trip lost the name')
  return `${Object.keys(round.breakpoints).length} breakpoints`
})

check('normalize survives garbage', () => {
  const t = normalizeTemplate('not a template')
  if (!t.breakpoints.laptop.root) throw new Error('no root')
  return 'no throw'
})

check('renderer server-renders all three layouts', () => {
  const html = renderToStaticMarkup(
    React.createElement(BannerRenderer, { template: createDefaultTemplate({ name: 'Smoke' }) }),
  )
  const trees = (html.match(/class="bnbr-bp"/g) || []).length
  if (trees !== 3) throw new Error(`expected 3 trees, got ${trees}`)
  if (!html.includes('A season of new arrivals')) throw new Error('no heading in markup')
  return `${trees} trees, ${html.length} bytes of HTML`
})

check('renderer honours the breakpoint prop', () => {
  const html = renderToStaticMarkup(
    React.createElement(BannerRenderer, {
      template: createDefaultTemplate({ name: 'Smoke' }),
      breakpoint: 'mobile',
    }),
  )
  if ((html.match(/class="bnbr-bp"/g) || []).length !== 0) throw new Error('emitted responsive trees')
  if (!html.includes('bnbr-bp-fixed')) throw new Error('no pinned tree')
  return 'one pinned layout'
})

check('renderer entry is a client module', () => {
  const require = createRequire(import.meta.url)
  const fs = require('fs')
  const path = require.resolve('react-bannerkit/renderer')
  const src = fs.readFileSync(path, 'utf8')
  if (!/^\s*['"]use client['"]/.test(src)) throw new Error('missing use client directive')
  return 'use client present'
})

check('root entry is NOT a client module', () => {
  const require = createRequire(import.meta.url)
  const fs = require('fs')
  const src = fs.readFileSync(require.resolve('react-bannerkit'), 'utf8')
  if (/use client/.test(src)) throw new Error('root entry became a client module')
  return 'server-safe'
})

check('renderer bundle has no editor dependencies', () => {
  const require = createRequire(import.meta.url)
  const fs = require('fs')
  const dir = require('path').dirname(require.resolve('react-bannerkit/renderer'))
  const all = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(dir + '/' + f, 'utf8')).join('')
  for (const bad of ['@radix-ui', 'lucide-react', 'tailwind', 'bnb-root']) {
    if (all.includes(bad)) throw new Error(`renderer bundle references ${bad}`)
  }
  return 'clean'
})

check('renderer.css is resolvable and scoped', () => {
  const require = createRequire(import.meta.url)
  const fs = require('fs')
  const css = fs.readFileSync(require.resolve('react-bannerkit/renderer.css'), 'utf8')
  if (!css.includes('.bnbr')) throw new Error('no scope class')
  if (/:root\s*[,{]/.test(css)) throw new Error('declares on :root')
  return `${(css.length / 1024).toFixed(1)} kB`
})

for (const [status, name, detail] of checks) {
  console.log(`${status === 'PASS' ? '  ok  ' : ' FAIL '} ${name}${detail ? '  -> ' + detail : ''}`)
}
const failed = checks.filter(c => c[0] === 'FAIL').length
console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed ? 1 : 0)
