# Banner sizing model: from fixed height to a scaled design

Status: approved in discussion, not yet implemented
Target version: `react-bannerkit@0.1.5`

## The problem

A banner authored at 1280 x 620 renders wrong in a host container of any other
width, and the failure is silent.

The renderer is already fluid horizontally — `.bnbr-frame` is `width: 100%` — so
in a 1640px container the banner fills 1640. What does not change is everything
else:

- **Height stays 620px.** The aspect ratio shifts from 2.06:1 to 2.65:1, so the
  composition stretches horizontally.
- **Every px inside stays literal.** `fs`, `pad`, `gap`, `gutter`, spacer size,
  icon size, radius and border width are absolute. A 46px heading stays 46px, so
  it reads proportionally smaller than the author placed it.

Panel rects and free-element positions are percentages and scale correctly. So
half the document scales with the container and half does not. That inconsistency
is the bug; the fixed height is only its most visible symptom.

A second, related defect: the three layouts are selected by `@media` queries,
which measure the **viewport**. A banner in a 500px sidebar on a 1920px monitor
gets the laptop design, and once scaling is proportional that renders a 46px
heading at 18px.

## Decisions

| Question | Decision |
|---|---|
| Behaviour in a wider container | **Scale like a picture.** Everything scales proportionally; the editor becomes an exact preview |
| Layout selection | **Container width**, via CSS container queries |
| Full-height banners | **Kept**, as image-style `fit` and `cover` modes alongside `ratio` |
| Design width | **Fixed defaults** (1280 / 834 / 390) with an optional per-template override |
| Existing templates | **Auto-migrated**, in `normalizeTemplate`, at schema version 2 |
| Scaling mechanism | A CSS custom property (`--bnbr-u`) multiplied by each design-px value |

### Why not `transform: scale()`

It cannot be driven from CSS alone. `scale()` takes a number, and CSS cannot
divide a length by a length to produce one, so the factor would have to come from
JavaScript measurement. That forfeits server rendering and reintroduces the
layout shift the three-tree design exists to prevent. It also scales focus rings
and hit areas, which should stay constant.

### Why not a font-size cascade

Expressing everything in `em` off a computed root font size works, but it
overloads font-size semantics and makes padding, gaps, borders and positions hard
to reason about.

## Schema, version 2

```ts
export type SizeMode = 'ratio' | 'fit' | 'cover'

export interface BannerBreakpoint {
  /** How the design is fitted into the space the host gives it. */
  sizeMode: SizeMode
  /**
   * The design's own height, in design px. With the design width this fixes the
   * aspect ratio. Stored rather than a derived float so that a value the author
   * typed round-trips exactly.
   */
  designHeight: number
  /** The frame's height. Read only by 'fit' and 'cover'. */
  frameHeight: number
  frameHeightUnit: 'px' | 'vh'
  /** Space between panels, in design px, so it scales with everything else. */
  gutter: number
  bg: string
  root: BannerNode
}

export interface BannerTemplate {
  // ...unchanged fields
  /** Overrides the built-in design widths. Omitted entries fall back. */
  designWidths?: Partial<Record<BreakpointName, number>>
}

export const DESIGN_WIDTHS: Record<BreakpointName, number> = {
  laptop: 1280,
  tablet: 834,
  mobile: 390,
}

export const CURRENT_SCHEMA_VERSION = 2
```

`heightMode` and `vh` are removed.

### What each mode means

- **`ratio`** — height is `width / (designWidth / designHeight)`. The design
  scales with the container in both axes. The default, and what a hero banner
  wants.
- **`fit`** — the frame is `100% x frameHeight`. The whole design is scaled to sit
  inside it, letterboxed, with `bg` showing in the margin.
- **`cover`** — the frame is `100% x frameHeight`. The design is scaled to fill
  it, with the overflowing edges cropped.

## Migration

Runs in `normalizeTemplate`, which never throws, so a v1 row from a consumer's
database keeps working after upgrade.

| v1 | v2 |
|---|---|
| `heightMode: 'fixed'`, `height: H` | `sizeMode: 'ratio'`, `designHeight: H` |
| `heightMode: 'vh'`, `vh: V` | `sizeMode: 'fit'`, `frameHeight: V`, `frameHeightUnit: 'vh'`, `designHeight: round(DEVICES[bp].screenHeight * V / 100)` |

`vh` templates deliberately land on `fit` rather than `ratio`. "60% of the
viewport height" has no ratio expression, because a ratio banner's height comes
from its width; `fit` preserves what the author actually asked for, and deriving
`designHeight` from the device's nominal screen height preserves the proportions
they were looking at while authoring.

Clamps: `designHeight` and `frameHeight` both `MIN_BANNER_HEIGHT`–4000 px (120 is
the existing floor, already enforced by the inspector), `frameHeight` 10–100 when
the unit is `vh`, `designWidths` entries 320–3840. An unknown `sizeMode` falls
back to `ratio`. Migration must be idempotent, as the existing normalizer is.

## The CSS mechanism

One inherited custom property carries the scale; every design-px value multiplies
it.

```css
.bnbr-frame {
  --bnbr-u: 1px;                             /* fallback, see below */
  --bnbr-u: calc(100cqw / var(--bnbr-dw));   /* ratio */
}
```

`--bnbr-dw` and `--bnbr-dh` are unitless numbers set inline per tree from the
document. Dividing a length by a number yields a length, and multiplying a length
by a number yields a length, so the whole scheme is valid CSS arithmetic with no
`@property` registration required.

The three modes differ only in how `--bnbr-u` is computed:

```css
/* ratio */
--bnbr-u: calc(100cqw / var(--bnbr-dw));

/* fit */
--bnbr-u: min(calc(100cqw / var(--bnbr-dw)), calc(100cqh / var(--bnbr-dh)));

/* cover */
--bnbr-u: max(calc(100cqw / var(--bnbr-dw)), calc(100cqh / var(--bnbr-dh)));
```

### Two nested containers

```
.bnbr        container-type: inline-size, container-name: bnbr-root
  .bnbr-bp   container-type: inline-size   (ratio)
             container-type: size          (fit / cover — cqh requires it)
    .bnbr-frame   --bnbr-u, aspect-ratio or explicit size
```

The root container drives breakpoint selection; the per-tree container drives
scaling. `container-type: size` needs a definite height, which `fit` and `cover`
always have because `frameHeight` is set on `.bnbr-bp`.

`fit` and `cover` centre the design inside the frame with `position` and `inset`,
never `margin: auto`. A host reset of `* { margin: 0 }` is near-universal and
unlayered, and unlayered normal declarations beat every layered one — this is the
same failure that put the editor's dialogs in the top-left corner.

### Graceful degradation

Two fallbacks. The second is free; the first needs an explicit guard.

1. **`@supports` is required — the two-declaration trick does not work here.**
   Custom property values are not parsed at declaration time, so
   `--bnbr-u: calc(100cqw / …)` is a *valid token sequence* on any browser and
   always wins over an earlier `--bnbr-u: 1px`. The failure only surfaces at
   substitution, where it makes the *using* property invalid at computed-value
   time — `font-size` would fall back to inherited, not to `1px`. So the scaling
   declarations sit inside `@supports (container-type: inline-size)` and the
   `1px` default stands on its own outside it:

```css
.bnbr-frame { --bnbr-u: 1px; }

@supports (container-type: inline-size) {
  [data-size-mode='ratio'] > .bnbr-frame {
    --bnbr-u: calc(100cqw / var(--bnbr-dw));
  }
}
```

   Registering `--bnbr-u` with `@property` and an `initial-value` would also work,
   but `@property` registrations are global, and the isolation guard rightly
   fails on any global custom property that is not `--tw-` namespaced.

2. The laptop tree is visible by default and `@container` rules override it.
   Unsupported `@container` blocks are simply ignored, so this half really is
   free:

```css
.bnbr-bp { display: none }
.bnbr-bp[data-bp='laptop'] { display: block }
@container bnbr-root (width < 1024px) { /* reveal tablet, hide laptop */ }
@container bnbr-root (width < 768px)  { /* reveal mobile, hide tablet */ }
```

Without this, a browser that does not support `@container` would match no rule
and show a blank banner.

### What does not scale

**Focus rings** and the **hairline between panels** stay in real px. A focus ring
that grows with the banner is an accessibility regression, and it is the one
thing that should look identical everywhere.

## Renderer changes

New `core/units.ts`, pure and React-free, shared by renderer and editor:

```ts
/** A design-px value as a length that scales with the banner. */
export const du = (n: number) => `calc(var(--bnbr-u) * ${n})`
```

| File | Change |
|---|---|
| `core/types.ts` | `SizeMode`, reshaped `BannerBreakpoint`, `DESIGN_WIDTHS`, `designWidths`, version 2 |
| `core/normalize.ts` | the migration above, plus clamps and validation |
| `core/layout.ts` | `insetStyle` emits the gutter through `du`; `resolveHeight` becomes `frameMetrics`, returning design size and frame size separately |
| `renderer/BannerRenderer.tsx` | sets `--bnbr-dw`, `--bnbr-dh`, `data-size-mode` and the frame's height rule |
| `renderer/PanelView.tsx` | padding, gap, radius, border width through `du` |
| `renderer/ElementView.tsx` | `fs`, spacer size, icon size through `du`; `measure` stays in `ch`, which tracks font size and so scales already |
| `renderer/renderer.css` | `@media` to `@container`; the mode rules; literals (button padding, carousel arrows, dots, counter) to `u` multiples |

The `breakpoint` prop survives unchanged: pinning one tree is still useful for
server-side UA detection, native webviews, and the editor canvas.

## Editor changes

The top bar's `Height · Fixed | Viewport · [420] px` becomes `Size · Ratio | Fit |
Cover`, with the field following the mode:

- **Ratio**: `Design height [620] px`
- **Fit / Cover**: `Design height [620] px` and `Frame height [60] [vh]`

Two heights in one mode is the awkward part of this UI. They are genuinely
different things — the shape of the design, and the slot it is poured into — and
naming them plainly beats collapsing them into one clever control.

**The canvas barely changes.** It already renders at the device width inside a
transform-scaled wrapper, so `100cqw` resolves to the design width, `--bnbr-u`
computes to `1px`, and elements render at exactly their authored px before the
existing transform scales the result to fit. Counter-scaled toolbars and divider
grab areas keep working untouched. In `fit` and `cover` the canvas sizes its box
to `designWidth x frameHeight`, so letterboxing and cropping are visible while
authoring.

Also: `Template settings` gains the optional **Design width** override, the canvas
label becomes `Laptop · 1280 × 620`, and the "This breakpoint" copy in the left
rail needs rewording because it currently describes height.

## Testing

| Level | What |
|---|---|
| `core` unit | table-driven v1 to v2 migration; clamps; `designWidths` validation; ratio derivation; idempotence |
| CSS guard | the `1px` fallback is declared *before* the `cqw` version; the laptop tree is visible without `@container`; no stray literal px in `renderer.css` outside a documented allowlist |
| renderer unit | every scaling property emits `calc(var(--bnbr-u) * n)` and never `npx` — this is what catches a value someone forgot to convert |
| browser | the acceptance check, below |
| tarball smoke | schema v2 round-trips; both entries still work |

### Acceptance check

The one that answers the original report. Render a single template into
containers of 1280 and 1640 and assert the second is **exactly 1.28125×** the
first — frame height, heading font size, and panel padding, each read from
`getComputedStyle`, not from the style attribute.

Reading back the style attribute is what made three earlier bugs look fixed when
they were not. Only computed values and `getBoundingClientRect` count.

Second browser check: the same banner in a 500px container selects the **mobile**
tree, not a shrunken laptop one.

A new playground route, `/sizing`, renders one template at several container
widths simultaneously so this is visible rather than only asserted.

## Risks and non-goals

- **Container queries create containment.** `container-type` makes the element a
  containing block for absolutely positioned descendants. Panels are positioned
  against `.bnbr-frame`, which sits inside, so this is unaffected — but it must be
  checked on the hostile-host page rather than assumed.
- **A missed px value fails silently.** One element type left unconverted simply
  does not scale, and nothing errors. The renderer unit test above exists
  specifically for this.
- **Unbounded growth is accepted.** A 1280 design in a 2400px container scales
  1.875×. Capping was offered and declined; a host that wants a ceiling can set
  `max-width` on its own wrapper.
- **Not in scope**: per-breakpoint switch thresholds as document data (they stay
  1024 / 768), a fourth breakpoint, and any change to how elements themselves are
  authored.

## Versioning

`0.1.5`, following the published `0.1.4`.

The schema change is breaking in the sense that the stored shape changes, but
migration is automatic and runs on read, so no consumer touches their data and no
consumer's code changes. A patch bump is the user's call and is defensible on
that basis; the alternative reading is that pre-1.0 convention treats the minor
as the breaking slot, which would make it `0.2.0`. Recorded here so the choice is
visible rather than accidental.

The README needs a short migration note describing the new sizing control and the
fact that old templates convert on read.
