<p align="center">
  <img src="./react-bannerkit-logo.png" alt="react-bannerkit" width="360" />
</p>

<p align="center">
  <strong>react-bannerkit</strong> — a visual banner template builder and renderer for React.
  <br />
  Docs: <a href="https://react-bannerkit-doc.vercel.app/docs/getting-started">react-bannerkit-doc.vercel.app</a>
</p>

# Handoff: Banner Builder

## Overview

A visual banner-template builder for non-technical marketers. A user creates a named template, then edits it in a three-column editor: they split the banner into panels, fill each panel with elements (heading, text, button, link, image, overlay, spacer, icon), tune every element in a property inspector, switch between three independent breakpoint layouts (laptop / tab / mobile), and preview the result. Panels can be single-image banners or full carousels with per-slide content.

The target is an npm package built on Next.js + shadcn/ui.

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behaviour, not production code to copy. `Banner Builder.dc.html` runs in a small in-house component runtime (`support.js`); do not port that runtime. The task is to **recreate the design in the target codebase** using its own patterns: Next.js App Router, React, shadcn/ui primitives, Tailwind.

Open the HTML file in a browser to interact with the prototype. Read its logic class for exact behaviour (state shape, split algorithm, drag math, carousel timing) — the algorithms are sound and worth porting; the rendering is not.

## Fidelity

**High fidelity for behaviour and information architecture, medium for visual chrome.**

- Interaction model, control set, layout structure, labels, and copy: implement as specified. These were iterated with the user.
- Visual styling: the prototype uses an editorial "Classical" design system (serif tokens, gold accent, hairline rules) with Inter substituted for the UI. **Do not port those tokens.** Use shadcn/ui defaults and the consuming app's theme. Component mapping is given below.

Exact values are still documented under Design Tokens so the *proportions* survive the restyle (control heights, panel widths, type sizes on the canvas).

---

## Screens / Views

### 1. Templates list

**Purpose:** see existing templates, create a new one.

**Layout:** full-height column. Header bar (~52px, bottom hairline) with brand label left, "New template" button right. Body is a centred column, max-width 1000px, generous vertical padding.

**Empty state** (no templates): centred card, max-width 520px, centre-aligned, ~48px padding, stacked with ~16px gaps:
- Kicker: "No templates yet" — 10px, uppercase, 0.12em tracking, 55% text opacity
- Title: "Start with a blank template" — 38px, line-height 1.15
- Body: "Give it a name and, if it helps, a short description. Every new template opens with one banner panel ready to edit." — 14px/1.7, max-width 40ch, 68% opacity
- Primary button: "Create template"

**Populated state:** heading "Your templates" (42px), hairline, then one row per template. Row grid: `1.1fr 1.9fr auto auto`, 24px gap, 16px vertical padding, bottom hairline. Columns: name (23px semibold) + "Created <date>" kicker; description (14px/1.6, 68% opacity); a badge reading "N panels"; a secondary "Open editor" button.

**shadcn mapping:** `Button`, `Badge`, `Separator`, `Card` (empty state).

### 2. Create template dialog

Modal, 470px wide, backdrop at 44% ink.
- Title "New template" (29px semibold)
- Sub: "The template opens with one banner panel, ready for you to split and fill." (13px/1.65)
- Field "Template name" — required, placeholder "Homepage hero"
- Field "Description — optional" — textarea, 3 rows, placeholder "Where this banner runs, and who it speaks to."
- Footer right-aligned: "Cancel" (secondary), "Create template" (primary, **disabled while name is empty**)

On submit: create the template, go straight to the editor with the root panel selected.

**shadcn mapping:** `Dialog`, `Input`, `Textarea`, `Label`, `Button`.

### 3. Editor

**Shell:** `grid-template-columns: 224px 1fr 274px`, full viewport height, each column scrolls independently.

**Top bar** (~44px, tinted background, bottom hairline), left to right:
- "← Templates" ghost button
- Template name, 20px semibold, truncating
- Breakpoint segmented control: Laptop / Tab / Mobile
- Height group: label "Height", a Fixed / Viewport segmented control, a number input (70px), a unit label that reads "px" in Fixed mode and "% of screen" in Viewport mode
- Primary "Preview" button

**Left rail** (224px, 16px/12px padding, 24px between sections). Sections, each led by a 10px uppercase label:
1. **Add to selected panel** — 2-column grid of 8 buttons: Heading, Text, Button, Link, Image, Overlay, Spacer, Icon. All disabled with no panel selected, plus the note "Select a panel on the canvas first."
2. **Banner frame** — "Space between panels" slider (0–48px, value shown right of the label) and "Colour behind panels" swatch row (first swatch is transparent, rendered as a checkerboard).
3. **Layers** — a "Template settings" row (selects the template itself), then per panel: `Panel N` (carousels read `Panel N · carousel, slide M`); for carousels an indented row per slide `▸ Slide N · X items` (plus `· linked` / `· editing`); then the active host's elements, indented, labelled `— heading: A season of ne`, with `·free` appended when freely positioned. Element rows and (when >1 panel) panel rows carry an `×` delete.
4. **This breakpoint** — explanatory note, then "Copy to <other screen>" buttons.

**Canvas** (centre, tinted surface, scrolls both axes, contents centred via `margin: 0 auto` on a `flex-start` column — this matters: `align-items: center` clips an oversized frame):
- Small label above: `Laptop · 1280px × 420px` (adds `· 80% of screen` in viewport mode)
- The banner frame: device width × resolved height, `transform: scale(...)` with `transform-origin: top left`, wrapped in a div sized to the scaled dimensions
- Hint below: "Hover a panel for split controls. Drag a divider to resize, or drag an element to place it freely."

**Right inspector** (274px): kicker + title (e.g. "Panel 2 · slide 1 element" / "Heading"), hairline, then the field list for the current selection. Fields are label + optional right-aligned hint + control. Field kinds: text input, textarea, number, range slider, segmented button row, colour swatch row, file input.

### 4. Preview

Dark ground (`neutral-900`). Header row (max-width 1100px): template name + "Preview · Laptop · 1280px × 420px" left; breakpoint switch and "Back to editor" right. The banner renders scaled, with editing chrome gone: no outlines, no split tools, no drag, carousels autoplay.

---

## Interactions & Behavior

### Panel splitting (binary tree)

The banner layout is a binary tree. A node is either a **split** (`{kind:'split', dir:'cols'|'rows', ratio:0.5, a, b}`) or a **panel** (leaf).

- Hovering a panel (or selecting it) reveals a small floating toolbar, top-right inside the panel: split-into-columns, split-into-rows, delete.
- **Split**: replace the panel in its parent with a new split node whose `a` is the original panel and `b` is a fresh panel (background colour, no elements). Select the new panel.
- **Delete**: replace the parent split with the sibling subtree. **Hidden/disabled when only one panel remains** — a banner always has at least one panel. The inspector shows the reason: "A banner needs at least one panel, so this one cannot be deleted."
- Layout is computed by walking the tree with a `{x, y, w, h}` rect in percentages; leaves are absolutely positioned. Dividers are 6px hit strips drawn at each split boundary with `col-resize` / `row-resize` cursors.
- **Resize**: on mousedown capture the frame rect and the split's ratio; on mousemove set `ratio = clamp(0.15, 0.85, r0 + delta/span)`. Listeners live on `window` and are removed on mouseup.

### Panel spacing

A per-breakpoint `gutter` (0–48px). Each leaf is inset by half the gutter on every side:
`left: calc(x% + g/2px); top: calc(y% + g/2px); width: calc(w% - gpx); height: calc(h% - gpx)`.
The frame background (`bg`, default `#eae9e9`, or `transparent`) shows through the gaps. In the editor, transparent renders as a checkerboard; in preview it is genuinely transparent.

### Element placement and drag

Elements live in a flex column per panel (`align-items` = panel `alignX`, `justify-content` = panel `alignY`, `gap`, `padding`).

Any element except the overlay can be **dragged free of the stack**:
- On mousedown, capture the element node and its bounding rect **synchronously** (React nulls `currentTarget` after the handler returns — this was a real bug).
- After a 3px threshold, seed `el.pos = {x, y}` from the element's current position as a percentage of the panel box, then track the mouse, clamping to 0–96%.
- A positioned element renders `position: absolute; left: x%; top: y%` and stays put when the panel resizes.
- The inspector shows a Position control: **In stack / Free**, plus X and Y sliders when free. Switching back to In stack deletes `pos`.

### Carousels

A panel is `single` or `carousel`. A carousel holds `slides[]`; **each slide owns its own elements and background** — this is the core requirement. Converting a single panel to a carousel copies its current elements onto slide 1.

Selecting a slide (from the inspector slide list, a Layers slide row, or a dot on the canvas) sets which slide the toolbox, Layers, and inspector operate on.

Controls, all per panel:

| Control | Values | Default |
|---|---|---|
| Autoplay | on / off | on |
| Slide duration | 1000–12000ms, step 500 | 4000 |
| Transition | Fade / Slide / Cut | Fade |
| Transition speed | 100–1600ms, step 50 | 500 |
| Loop | on / off | on |
| Pause on hover | on / off | on |
| Arrows | show / hide | show |
| Pagination | Dots / Bars / None | Dots |
| Slide counter | show / hide | hide |
| Slide N links to | URL | — |

Rendering: **all slides are stacked** as absolutely positioned layers. Fade and Cut animate `opacity` (inactive layers at 0); Slide translates each layer by `(i - active) * 100%`. Transition string: `opacity <speed>ms ease, transform <speed>ms cubic-bezier(.4,0,.2,1)`. Inactive layers get `pointer-events: none`.

Playback in the prototype uses one 120ms ticker that advances each carousel by its own elapsed time, keyed by panel id, honouring `pauseHover` and stopping at the last slide when `loop` is off. **In production use one timer per carousel component instead.** Arrows and dots work in both editor and preview; in the editor they change the slide being edited.

### Responsive model

Three breakpoints, each holding a **fully independent layout tree** plus its own height, gutter, and frame colour. Switching breakpoints clears the selection.

**Copy between screens:** the left rail lists the other two screens ("Copy to Tab", "Copy to Mobile"). Picking one opens a confirmation dialog: "Copy Laptop to Mobile?" / "This replaces everything currently on Mobile with the Laptop layout — 3 panels, their content and the banner height. It cannot be undone." Confirming deep-clones the tree (fresh ids throughout), copies height/mode/gutter/frame colour, switches to that breakpoint, and clears the selection.

### Height

Per breakpoint: `hMode` is `fixed` (px, min 120) or `vh` (a 10–100% share of screen height). Viewport mode resolves against a nominal screen height per device — laptop 800, tab 1112, mobile 844 — so the canvas can show it truthfully. In the real renderer, emit `height: Nvh`.

### Links

Image elements have a "Links to" field. A single panel has "Banner links to"; a carousel has "Slide N links to" (whole slide clickable, flagged `· linked` in the slide list). Buttons and link elements carry their own destination.

### Selection rules

- Clicking a panel selects it (clears element selection); clicking an element selects the element and stops propagation.
- Toolbox additions go to the selected panel's **active host** (the panel itself, or its current slide for carousels). Overlays are unshifted to the front; everything else is pushed.
- The inspector shows, in priority order: selected element → selected panel → the template.

---

## State Management

```
app:      view: 'templates' | 'editor' | 'preview'
          templates: Template[]
          curId, bp: 'laptop'|'tablet'|'mobile'
          selPanel, selEl, hover, copyTo, dialog + draft name/desc

Template: { id, name, desc, created, bps: { laptop, tablet, mobile } }
Breakpoint: { h, hMode, vh, gutter, bg, root: Node }
Node:     Split { kind:'split', dir:'cols'|'rows', ratio, a, b }
        | Panel { id, type:'single'|'carousel',
                  bgMode:'photo'|'color', bg, img, href,
                  pad, gap, alignX, alignY, radius, borderW, borderColor,
                  autoplay, interval, transition, speed, arrows, dots,
                  dotStyle, counter, loop, pauseHover,
                  slide, slides: Slide[], elements: Element[] }
Slide:    { id, mode:'photo'|'color', bg, img, href, elements: Element[] }
Element:  { id, type, pos?: {x,y}, ...type-specific }
```

Element property sets:

- **heading / text** — `text, fs, weight (300–800), align, measure (ch), color`
- **button** — `text, href, variant: primary|solid|ghost, fs, radius, color`
- **link** — `text, href, underline, fs, color`
- **image** — `src, width (%), fit: cover|contain, radius, plate (bool), href`
- **overlay** — `mode: solid|gradient, opacity, color`; renders `inset: 0`, always first in the stack, `pointer-events: none` outside the editor
- **spacer** — `size`; shows a diagonal hatch in the editor only
- **icon** — `glyph, fs, color`

For the package, model this as a serialisable JSON document with a version field, and expose it as the package's public schema (`BannerTemplate`). Zod is a good fit. Suggested split: a headless `@you/banner-core` (schema, tree ops, layout math, migrations) and `@you/banner-builder-ui` (the editor, Next.js + shadcn) plus a lightweight `<BannerRenderer>` consumers ship on their own pages. Panels only ever need the renderer's CSS, so keep the runtime dependency-free.

---

## Design Tokens

Prototype values, for proportion. Restyle colours to shadcn's theme.

**Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48px. Panel columns 224 / 274px. Top bar ~44px. Divider hit area 6px. Carousel arrows 34px circles at 12px inset. Dots 9px circles or 26×3px bars, 7px apart, 14px from the bottom.

**Editor type:** section labels 10px uppercase 0.12em tracking at 55% opacity; field values and rows 12–13px; inspector title 21px; canvas label 11.5px. Never below 11px.

**Canvas defaults:** heading 46px/1.1 (mobile 30), body 16px/1.65 (mobile 14), button 14px with 10×20px padding and 4px radius, panel padding 40px (mobile 24), stack gap 14px, overlay gradient at 42% opacity.

**Controls:** inputs 13px, 7×9px padding, 4px radius, hairline border, 2px accent `:focus-visible` ring at 1px offset. Segmented buttons 12px, 5×10px padding; active = accent border, tinted background, accent text. Colour swatches 28px squares; the transparent swatch is a conic checkerboard.

**Prototype colours** (replace): ground `#f3f2f2`, surface `#eae9e9`, ink `#201f1d`, accent `#b68235`, umber `#3a270d`, paper `#f8f4f4`. Elevation is very soft.

**Type:** the prototype loads Inter 300–800 and uses it for both UI and canvas. Canvas text needs the full weight range — keep it.

**Motion:** transitions 160–500ms, `ease` or `cubic-bezier(.4,0,.2,1)`. No motion on selection outlines.

## Assets

- `assets/photo.jpg` — the placeholder photograph used for every image background and image element. Replace with your own asset pipeline.
- Image uploads in the prototype use `URL.createObjectURL` and are session-only. Production needs real upload + storage, and the "Or image path" fallback field should become a media-library picker.
- Icons: the prototype inlines four SVG paths (arrow, star, check, book). The design system calls for [Lucide](https://lucide.dev) — use `lucide-react`, and let the icon element pick from the full set.

## Files

- `Banner Builder.dc.html` — the full prototype: template markup, then the logic class (state, tree ops, drag, carousel timing, all field definitions). The logic class is the useful part.
- `support.js` — the in-house runtime the prototype needs to run. **Do not port.**
- `_ds/styles.css`, `_ds/readme.md` — the Classical design system the prototype was styled against, for reference only.
- `assets/photo.jpg` — placeholder image.

## Suggested first steps in Claude Code

1. Scaffold the monorepo, install shadcn, and port the **schema and tree operations** first (split, remove, clone, layout walk) with unit tests — they are the load-bearing logic.
2. Build `<BannerRenderer>` from the schema, headless of the editor. Verify against the prototype's preview mode.
3. Build the editor shell around it: breakpoint switch, canvas scaling, selection, inspector.
4. Add drag interactions last — divider resize, then free element placement.
