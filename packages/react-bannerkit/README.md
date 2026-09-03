<p align="center">
  <img src="./react-bannerkit-logo.png" alt="react-bannerkit" width="360" />
</p>

# react-bannerkit

A visual banner template builder and renderer for React.

Split a banner into panels, fill each panel with content, tune three independent
breakpoint layouts, and ship the result with a renderer that has no dependencies
beyond React.

See the [getting started guide](https://react-bannerkit-doc.vercel.app/docs/getting-started).

```bash
npm install react-bannerkit
```

`react` and `react-dom` are peer dependencies (18.2+ or 19).

## The two components

```tsx
// The editor, for your admin screens.
import { BannerBuilder } from 'react-bannerkit/builder'
import 'react-bannerkit/builder.css'

// The output, for your public pages.
import { BannerRenderer } from 'react-bannerkit/renderer'
import 'react-bannerkit/renderer.css'
```

They are separate entry points on purpose: a page that only renders a banner
never pulls the editor into its bundle.

## Editing

```tsx
<BannerBuilder
  template={template}                       // optional; omit for a default
  onChange={(t) => setDraft(t)}             // debounced
  onSave={async (t) => { await api.save(t) }}
  onUploadImage={async (file) => (await upload(file)).url}
  theme="light"
/>
```

Give it a height — it fills its container:

```tsx
<div style={{ height: '100vh' }}>
  <BannerBuilder … />
</div>
```

| Prop | Type | Notes |
| --- | --- | --- |
| `template` | `BannerTemplate` | Optional. Omitted, a default template is created. Repaired rather than trusted. |
| `onChange` | `(t) => void` | Fires on a trailing debounce once edits settle, so dragging a slider calls you once rather than sixty times. |
| `onSave` | `(t) => void \| Promise<void>` | Fires only on Save (or Ctrl/Cmd+S). Return a promise and the button shows progress; throw and the message is shown and announced. |
| `onUploadImage` | `(file: File) => Promise<string>` | Resolve the URL to store. Without it, images become object URLs and the editor says they will not persist. |
| `theme` | `'light' \| 'dark' \| 'system'` | Self-contained palette; see [Theming](#theming). |
| `debounceMs` | `number` | Default 300. |
| `className`, `style` | | Merged onto the root; the `bnb-root` scope class is always kept. |

**Keyboard:** Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z for undo and redo, Ctrl/Cmd+S to
save, Escape to deselect, arrow keys to nudge a freely placed element (Shift for
10× steps), and arrow keys on a focused divider to resize it. The listener is
bound to the editor, not the document, so an admin page's own shortcuts keep
working.

### What the editor does

- **Panels.** Split any panel into columns or rows, drag the divider to resize,
  delete a panel to give its space back to its sibling. A banner always keeps at
  least one panel, and the inspector says so rather than just disabling a button.
- **Elements.** Heading, text, button, link, image, overlay, spacer, icon. Drag
  one out of the stack to place it freely anywhere in its panel.
- **Carousels.** Turn a panel into a carousel and every slide gets its own
  background and its own content. Converting copies what was already there onto
  slide one.
- **Three breakpoints.** Laptop, tab, and mobile each hold a fully independent
  layout, height, gutter, and frame colour — so mobile is a design, not a
  squeeze. Copy one screen's layout to another when you want a starting point.
- **Undo/redo** over everything, with a whole drag collapsing into one step.
- **Preview** renders the real `<BannerRenderer>`, not a lookalike.
- **JSON in and out** for moving templates between environments.

### Driving it yourself

The state layer is exported, so you can put the editor's chrome in your own shell
or build a custom inspector:

```ts
import { createEditorState, editorReducer, inspectorModel } from 'react-bannerkit/builder'

let state = createEditorState(template)
state = editorReducer(state, { type: 'splitPanel', panelId, dir: 'cols' })
const fields = inspectorModel(state) // the controls for the current selection
```

It is a plain reducer with no React in it, which is why the editor's behaviour is
testable without a DOM.

## Rendering

```tsx
export default function Hero({ template }) {
  return <BannerRenderer template={template} headingTag="h2" />
}
```

Works in a React Server Component tree, in the Pages Router, in Vite, and in
Remix. The banner is present in the server HTML, so there is no flash and no
layout shift while JavaScript loads.

| Prop | Type | Notes |
| --- | --- | --- |
| `template` | `BannerTemplate` | Required. A malformed template renders a sane fallback instead of throwing. |
| `breakpoint` | `'laptop' \| 'tablet' \| 'mobile'` | Renders only this layout. Omit it and CSS picks. |
| `headingTag` | `'h1'…'h4' \| 'p'` | Defaults to `p`. See [Headings](#headings). |
| `renderIcon` | `(glyph: string) => ReactNode` | Supply your own icon set. |
| `onElementClick` | `(element, { breakpoint }) => void` | For analytics, or to route with your own router. |
| `label` | `string` | Accessible name for the banner region. Defaults to the template name. |
| `className`, `style` | | Merged onto the root; the `bnbr` scope class is always kept. |

### Responsive behaviour

By default the renderer emits **all three layouts** and lets a CSS **container
query** choose between them — evaluated against the width of the box the
banner itself is given, not the browser viewport. A banner dropped into a
500px sidebar on a 1920px monitor gets the mobile tree; the same banner
spanning a wide column gets the laptop tree even in a narrow browser window.
The thresholds are `mobile` below 768px of container width, `tablet` up to
1023.98px, `laptop` above.

This is deliberate, for two reasons. First, measuring the container in
JavaScript and rendering one tree cannot be server-rendered — it either
guesses and snaps to the right layout on hydration, or renders nothing and
shifts the page. Both cost LCP and CLS on exactly the pages banners live on.
Three small trees cost DOM nodes, which are cheap, and buy a correct first
paint. Second, a component that can sit in a sidebar, a modal, or a
multi-column grid has no fixed relationship to the viewport at all — the
container is the only box that answers "how much room does this banner
actually have."

The laptop tree is visible by default, so a browser without `@container`
support still shows a banner instead of nothing — the query is simply ignored.

If you already know the device — server-side UA detection, a native webview —
pass `breakpoint`. That path also marks the panel background `fetchpriority="high"`,
which the CSS-driven path cannot do safely.

### Scaling

A breakpoint is authored at a fixed pixel size — its **design width** — and
every number in the document (font sizes, padding, gutters, radii, …) is a
design-pixel value relative to that width. None of it is emitted as `px` at
render time: it comes out as a multiple of `--bnbr-u`, a CSS custom property
the frame computes from the *container's* width with `cqw`. Give the banner
more room and `--bnbr-u` grows, and every value in the layout grows with it in
proportion — no JavaScript ever measures anything.

Each breakpoint picks how its design fills the frame with `sizeMode`:

| Mode | Behaviour |
| --- | --- |
| `ratio` (default) | The frame's height follows its width. `designHeight` fixes the aspect ratio, so the whole design scales uniformly in both axes. |
| `fit` | The frame has a fixed `frameHeight`; the design is scaled to fit inside it and letterboxed, with `bg` showing in the margin. |
| `cover` | The frame has a fixed `frameHeight`; the design is scaled to fill it and the overflowing edges are cropped. |

`frameHeight` is read only by `fit` and `cover`, and its unit (`frameHeightUnit`,
`'px' | 'vh'`) can be `vh` — useful for a hero banner meant to fill most of the
viewport regardless of its own design width.

The design width itself defaults to the device width the breakpoint is named
after (1280 for laptop, 834 for tablet, 390 for mobile). A template can
override any of them with `designWidths`, for a design authored at a different
canvas size.

## The document model

A template holds three fully independent layouts. Each is a binary tree: a node
is either a **split** (two children and a ratio) or a **panel** (a leaf).

```ts
BannerTemplate  { version, id, name, description, createdAt, designWidths?, breakpoints }
BannerBreakpoint{ sizeMode, designHeight, frameHeight, frameHeightUnit, gutter, bg, root }
BannerNode      = BannerSplit | BannerPanel
BannerSplit     { dir: 'cols' | 'rows', ratio, a, b }
BannerPanel     { type: 'single' | 'carousel', …, slides[], elements[] }
BannerElement   = heading | text | button | link | image | overlay | spacer | icon
```

Plain JSON: store it in a column, send it over the wire, `JSON.parse` it back.

### Never trust, always repair

```ts
import { normalizeTemplate } from 'react-bannerkit'

const safe = normalizeTemplate(rowFromDatabase) // never throws
```

Fills missing fields, clamps out-of-range numbers, drops unrecognisable
elements, and migrates older documents. Both components run it on every render,
because a bad row in a database must not take down the page it sits on. Pass
`onWarn` to see what was repaired.

The root entry is pure functions and types — no React, no DOM — so it is safe to
import from a server route, a migration script, or an edge function.

## CSS isolation

This is the part the package is really about. A component library that ships
Tailwind is normally its host's worst CSS citizen: Preflight resets the host's
`*`, `html`, `body`, and form elements, and theme variables land on `:root`.

Four mechanisms prevent that, and a test suite parses the built CSS and fails the
build if any of them regress:

1. **Preflight is never imported.** Only `theme.css` and `utilities.css`.
2. **Every emitted selector is rewritten under `.bnb-root`,** `:root` included,
   so not one variable is installed globally.
3. **The utilities layer is marked `important`.** Cascade layers reverse
   precedence for important declarations, and that is the only thing that beats a
   host's unlayered CSS. The scoped reset is deliberately *unlayered* for the
   mirror-image reason.
4. **A firewall layer, declared last,** neutralises decoration properties the
   reset does not mention. A host's `button { text-transform: uppercase }` and
   `.flex { outline: … }` both reached in before it existed.

**No portals.** The two overlays use the native `<dialog>` element rather than a
portalled one, so nothing is ever appended to `document.body` where the scope
cannot follow it. Focus trapping, Escape, and the backdrop come from the browser.

**The honest limitation:** the firewall's property list is curated, so a host
that sets something unusual through a class name colliding with a Tailwind
utility can still get through. Closing that completely needs Tailwind's
`prefix()`, which would mean rewriting every class string in the package.

Nothing is global except a handful of Tailwind's own `--tw-*` `@property`
registrations, which carry the same meaning in any Tailwind build.

## Theming

The editor ships a complete light and dark palette and does not read your design
tokens — it cannot know whether you use shadcn, and inheriting half a theme looks
worse than owning a whole one. Override any variable to match your brand:

```css
.bnb-root {
  --bnb-primary: oklch(0.55 0.24 264);
  --bnb-ring: oklch(0.55 0.24 264);
  --bnb-radius: 0.25rem;
}
```

Banner fonts are set on the renderer:

```css
.bnbr {
  --bnbr-font-heading: 'Playfair Display', Georgia, serif;
  --bnbr-font-body: Inter, system-ui, sans-serif;
}
```

Everything else about a banner — colour, size, weight, spacing — comes from the
template, so it looks the same wherever it is rendered.

## Headings

`headingTag` defaults to `p`. Emitting an `<h1>` or `<h2>` would splice the
banner into your page's heading outline at a level the package cannot know, which
breaks heading order for screen reader users more often than it helps. You know
where the banner sits, so you should pick.

Image elements carry `alt` text from the document. Panel *background* images are
decorative and always render `alt=""`.

## Accessibility notes

- Carousel autoplay is disabled entirely under `prefers-reduced-motion: reduce`,
  and transitions go with it.
- Inactive slides are `aria-hidden` with `pointer-events: none`, and links inside
  them leave the tab order.
- A button with a destination renders as `<a>`; one without renders as
  `<button>`. An anchor with no `href` is not focusable and is announced as plain
  text, so it would be unreachable.
- Segmented controls are radio groups, so arrow keys move between options and
  they take a single tab stop.
- New elements are given a colour that contrasts with the panel behind them,
  rather than a fixed default that disappears on a light panel.
- The save state is announced via `aria-live`, so a failure is not something only
  sighted users learn about.

## Icons

The icon element draws from a curated set of 20 glyphs inlined into the renderer,
so it stays dependency-free. A glyph name is only known at runtime, which defeats
tree-shaking — depending on a full icon library would ship all of it to a public
page.

```tsx
import { ICON_NAMES } from 'react-bannerkit/renderer'
```

Pass `renderIcon` to use your own set.

## Entry points

| Import | Contains |
| --- | --- |
| `react-bannerkit` | Types, `createDefaultTemplate`, `normalizeTemplate`, tree and layout helpers. No React. |
| `react-bannerkit/builder` | `<BannerBuilder>` and the editor state layer. |
| `react-bannerkit/renderer` | `<BannerRenderer>`, `<Carousel>`, the icon set. |
| `react-bannerkit/builder.css` | The editor's stylesheet. Includes the renderer's rules, because the editor draws real banners on its canvas and in preview — so this is the only import an admin screen needs. |
| `react-bannerkit/renderer.css` | The renderer's stylesheet, ~4.4 kB gzipped (13 kB raw), no Tailwind. Needed on pages that use `<BannerRenderer>` without the editor. |

The renderer entry contains no editor code — a build-time check walks its import
graph and fails if any appears.

## Upgrading to 0.1.5

This release replaces the old fixed-1280px-canvas renderer with the scaling
model described in [Scaling](#scaling): a banner now grows and shrinks
proportionally with whatever box it is given, and the three breakpoint trees
are chosen by a container query against the banner's own width rather than a
media query against the browser viewport — see
[Responsive behaviour](#responsive-behaviour).

**Breaking changes:**

| Removed | Replacement |
| --- | --- |
| `HeightMode` (type) | `SizeMode` — `'ratio' \| 'fit' \| 'cover'`, replacing `'fixed' \| 'vh'` |
| `resolveHeight` (function) | `resolveFrameHeight` |

Both are gone from the package entirely, so importing either one is a build
error, not a runtime surprise. `BannerBreakpoint` changed shape to match:
`height`, `heightMode`, and `vh` are replaced by `sizeMode`, `designHeight`,
`frameHeight`, and `frameHeightUnit` — see [The document model](#the-document-model).

**Stored templates need no action.** `normalizeTemplate` migrates a document
saved by 0.1.x the first time it is read: `heightMode: 'fixed'` becomes
`sizeMode: 'ratio'`, and `heightMode: 'vh'` becomes `sizeMode: 'fit'` (with
`designHeight` derived from the device's nominal screen height and the old
`vh` percentage, so the proportions the author was looking at are preserved).
The migrated document reports `version: 2`. Nothing needs to be re-saved for a
banner to keep rendering correctly; saving again after any edit persists the
migrated shape.

## Licence

MIT
