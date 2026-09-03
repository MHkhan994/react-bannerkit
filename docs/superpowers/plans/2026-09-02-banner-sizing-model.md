# Banner Sizing Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a banner scale like a picture, so a design authored at 1280 × 620 renders in shape in a host container of any width.

**Architecture:** Every design-px value in the document is emitted as a multiple of one inherited CSS custom property, `--bnbr-u`, which is computed from the container's width with `cqw`. The three breakpoint layouts are selected by container queries rather than viewport media queries, so a banner is correct in a sidebar as well as a full-bleed hero. Three sizing modes — `ratio`, `fit`, `cover` — give the frame image-like semantics. All of it is pure CSS, so the renderer stays server-renderable with no measurement and no layout shift.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), React 18/19, Vitest + happy-dom, PostCSS with `postcss-prefix-selector`, Tailwind v4 (editor only), tsup, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-01-banner-sizing-model-design.md`

## Global Constraints

- **Do not run `git commit`.** The user commits. Each task ends with a verification step instead. Leave changes in the working tree.
- Package root for every path below: `packages/react-bannerkit/`.
- Verification command for most tasks: `pnpm run typecheck && pnpm exec vitest run`.
- `tsconfig` uses `exactOptionalPropertyTypes`, so an optional property must be omitted, never assigned `undefined`. Use conditional spread: `...(x !== undefined ? { x } : {})`.
- `noUncheckedIndexedAccess` is on — index access yields `T | undefined`.
- `normalizeTemplate` must never throw and must be idempotent.
- The renderer entry must not import anything from `builder/`.
- Minimum banner height is the existing `MIN_BANNER_HEIGHT = 120` in `src/core/layout.ts`. Do not introduce a second floor.
- Scaling must be pure CSS. No `ResizeObserver`, no measurement, in the renderer.
- Assertions about layout must read `getComputedStyle` or `getBoundingClientRect`. Reading back a style attribute proves nothing — that mistake produced three false "verified" claims in this codebase already.

---

### Task 1: The design-pixel helper

A one-function module every later task depends on. Doing it first means the name and signature are fixed before six files start calling it.

**Files:**
- Create: `src/core/units.ts`
- Test: `src/core/units.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `du(n: number): string` — returns `calc(var(--bnbr-u) * <n>)`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import { du } from './units'

describe('du', () => {
  it('expresses a design pixel value as a multiple of the scale unit', () => {
    expect(du(46)).toBe('calc(var(--bnbr-u) * 46)')
  })

  it('keeps zero explicit rather than collapsing it', () => {
    // `0` is a valid gap and must still be a length, not an empty string.
    expect(du(0)).toBe('calc(var(--bnbr-u) * 0)')
  })

  it('survives a fractional value, which half-gutters produce', () => {
    expect(du(7.5)).toBe('calc(var(--bnbr-u) * 7.5)')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run src/core/units.test.ts`
Expected: FAIL — cannot resolve `./units`.

- [ ] **Step 3: Write the module**

```ts
/*
 * Design pixels.
 *
 * Every size in a banner document is expressed in the pixels of the design it
 * was authored in - 1280 wide for laptop by default. At render time the whole
 * design scales with its container, so those numbers cannot be emitted as `px`;
 * they are emitted as multiples of `--bnbr-u`, the scale unit the frame computes
 * from the container's width.
 *
 * At the authored width `--bnbr-u` is exactly `1px`, so a document renders at its
 * literal numbers in the editor canvas and grows or shrinks from there.
 */

/** A design-px value as a length that scales with the banner. */
export function du(n: number): string {
  return `calc(var(--bnbr-u) * ${n})`
}
```

- [ ] **Step 4: Run the test again**

Run: `pnpm exec vitest run src/core/units.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `pnpm run typecheck && pnpm exec vitest run`
Expected: typecheck clean, all tests pass.

---

### Task 2: Schema version 2 and the migration

The whole document shape changes here, and every consumer of `heightMode` is updated in the same task so the tree stays green. No scaling behaviour yet — after this task the package renders exactly as it does today, on the new schema.

**Files:**
- Modify: `src/core/types.ts` (`BannerBreakpoint` ~line 217, `BannerTemplate` ~line 230, `HeightMode` ~line 39, `DeviceSpec` ~line 241)
- Modify: `src/core/normalize.ts` (`HEIGHT_MODES` line 92, `normalizeBreakpoint` lines 308-324, template normalizer)
- Modify: `src/core/defaults.ts` (lines 193-196)
- Modify: `src/core/layout.ts` (`resolveHeight`)
- Modify: `src/renderer/BannerRenderer.tsx` (`frameHeight`, lines 54-63)
- Modify: `src/builder/parts/Canvas.tsx` (`frameMetrics`)
- Modify: `src/builder/parts/TopBar.tsx` (lines 55-85)
- Modify: `src/builder/state/inspector.ts` (lines 171-211)
- Test: `src/core/normalize.test.ts` (extend)

**Interfaces:**
- Consumes: nothing from Task 1
- Produces:
  - `type SizeMode = 'ratio' | 'fit' | 'cover'`
  - `type FrameHeightUnit = 'px' | 'vh'`
  - `interface BannerBreakpoint { sizeMode; designHeight; frameHeight; frameHeightUnit; gutter; bg; root }`
  - `BannerTemplate.designWidths?: Partial<Record<BreakpointName, number>>`
  - `designWidthOf(template: BannerTemplate, name: BreakpointName): number`
  - `CURRENT_SCHEMA_VERSION = 2`
  - `resolveFrameHeight(bp: BannerBreakpoint, device: BreakpointName): number` — replaces `resolveHeight`

**Deviation from the spec, on purpose:** the spec names a `DESIGN_WIDTHS` constant. `DEVICES[name].width` already holds exactly those numbers, so a second copy would be two sources of truth for one fact. Use the `designWidthOf` helper over `DEVICES` instead.

- [ ] **Step 1: Write the failing migration tests**

Add to `src/core/normalize.test.ts`:

```ts
describe('schema v1 to v2 migration', () => {
  it('turns a fixed-height breakpoint into a ratio one', () => {
    const out = normalizeTemplate({
      version: 1,
      breakpoints: { laptop: { height: 620, heightMode: 'fixed' } },
    })
    const bp = out.breakpoints.laptop
    expect(bp.sizeMode).toBe('ratio')
    expect(bp.designHeight).toBe(620)
    expect(out.version).toBe(2)
  })

  it('turns a viewport-height breakpoint into a fit one', () => {
    // 'N% of the viewport' has no ratio expression, so it becomes a frame the
    // design is fitted into. designHeight comes from the nominal screen height
    // so the authored proportions survive.
    const out = normalizeTemplate({
      version: 1,
      breakpoints: { laptop: { height: 420, heightMode: 'vh', vh: 60 } },
    })
    const bp = out.breakpoints.laptop
    expect(bp.sizeMode).toBe('fit')
    expect(bp.frameHeight).toBe(60)
    expect(bp.frameHeightUnit).toBe('vh')
    expect(bp.designHeight).toBe(480) // round(800 * 0.6)
  })

  it('reads the design handoff short names too', () => {
    const out = normalizeTemplate({ breakpoints: { laptop: { h: 500, hMode: 'fixed' } } })
    expect(out.breakpoints.laptop.designHeight).toBe(500)
  })

  it('is idempotent, so normalising twice changes nothing', () => {
    const once = normalizeTemplate({
      version: 1,
      breakpoints: { laptop: { height: 620, heightMode: 'fixed' } },
    })
    expect(normalizeTemplate(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('clamps a silly design height to the existing floor', () => {
    const out = normalizeTemplate({ breakpoints: { laptop: { designHeight: 2 } } })
    expect(out.breakpoints.laptop.designHeight).toBe(120)
  })

  it('falls back to ratio for an unknown size mode', () => {
    const out = normalizeTemplate({ breakpoints: { laptop: { sizeMode: 'wat' } } })
    expect(out.breakpoints.laptop.sizeMode).toBe('ratio')
  })

  it('keeps valid design width overrides and drops junk', () => {
    const out = normalizeTemplate({ designWidths: { laptop: 1440, tablet: 'no', mobile: 10 } })
    expect(out.designWidths).toEqual({ laptop: 1440, mobile: 320 })
  })

  it('omits designWidths entirely when none are usable', () => {
    const out = normalizeTemplate({ designWidths: { laptop: 'nope' } })
    expect('designWidths' in out).toBe(false)
  })
})

describe('designWidthOf', () => {
  it('uses the device default when no override exists', () => {
    expect(designWidthOf(createDefaultTemplate(), 'laptop')).toBe(1280)
  })

  it('prefers a template override', () => {
    const t = normalizeTemplate({ designWidths: { laptop: 1440 } })
    expect(designWidthOf(t, 'laptop')).toBe(1440)
    expect(designWidthOf(t, 'mobile')).toBe(390)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm exec vitest run src/core/normalize.test.ts`
Expected: FAIL — `sizeMode` undefined, `designWidthOf` not exported.

- [ ] **Step 3: Reshape the types**

In `src/core/types.ts`, delete `export type HeightMode = 'fixed' | 'vh'` (line 39) and add:

```ts
export type SizeMode = 'ratio' | 'fit' | 'cover'
export type FrameHeightUnit = 'px' | 'vh'
```

Replace `BannerBreakpoint`:

```ts
export interface BannerBreakpoint {
  /**
   * How the design is fitted into the space the host gives it.
   *
   * `ratio`  - height follows width; the design scales in both axes.
   * `fit`    - the frame is `100% x frameHeight`; the design sits inside it,
   *            letterboxed, with `bg` showing in the margin.
   * `cover`  - the frame is `100% x frameHeight`; the design fills it and the
   *            overflowing edges are cropped.
   */
  sizeMode: SizeMode
  /**
   * The design's own height, in design px. With the design width this fixes the
   * aspect ratio. Stored rather than a derived ratio float so a value the author
   * typed round-trips exactly instead of coming back as 619.9998.
   */
  designHeight: number
  /** The frame's height. Read only by `fit` and `cover`. */
  frameHeight: number
  frameHeightUnit: FrameHeightUnit
  /** Space between panels, in design px, so it scales with everything else. */
  gutter: number
  /** Shows through the gutter, and in the margin under `fit`. `'transparent'` is allowed. */
  bg: string
  root: BannerNode
}
```

Add to `BannerTemplate`, above `breakpoints`:

```ts
  /**
   * Overrides the built-in design widths per breakpoint.
   *
   * The design width is what every px in the document is relative to, so
   * changing it rescales the whole design. Omitted entries fall back to
   * `DEVICES[name].width`.
   */
  designWidths?: Partial<Record<BreakpointName, number>>
```

Update the `DeviceSpec.screenHeight` comment — it no longer previews `heightMode: 'vh'`; it now seeds `designHeight` when migrating a v1 viewport-height breakpoint. Bump `CURRENT_SCHEMA_VERSION` to `2`. Add:

```ts
/** The width a breakpoint's design is authored at, honouring a template override. */
export function designWidthOf(template: BannerTemplate, name: BreakpointName): number {
  return template.designWidths?.[name] ?? DEVICES[name].width
}
```

- [ ] **Step 4: Rewrite the breakpoint normalizer**

In `src/core/normalize.ts`, replace `HEIGHT_MODES` (line 92) with:

```ts
const SIZE_MODES: readonly SizeMode[] = ['ratio', 'fit', 'cover']
const FRAME_UNITS: readonly FrameHeightUnit[] = ['px', 'vh']
```

Replace `normalizeBreakpoint` (lines 308-324):

```ts
function normalizeBreakpoint(
  input: unknown,
  name: BreakpointName,
  id: IdFactory,
  warn: (m: string) => void,
): BannerBreakpoint {
  const raw = isRecord(input) ? input : {}
  const device = DEVICES[name]

  /*
   * v1 wrote `height` + `heightMode` + `vh`, and the design handoff before it
   * wrote `h` + `hMode`. Both are read here so a row saved by an older build
   * keeps working - that is the whole contract of this module.
   */
  const legacyMode = raw.heightMode ?? raw.hMode
  const wasViewportHeight = legacyMode === 'vh'
  const legacyHeight = raw.height ?? raw.h
  const legacyVh = num(raw.vh, 100, 10, 100)

  const sizeMode = oneOf(raw.sizeMode, SIZE_MODES, wasViewportHeight ? 'fit' : 'ratio')

  /*
   * A viewport-height banner has no authored height in design px, so it is
   * derived from the device's nominal screen height. That keeps the proportions
   * the author was actually looking at while they placed things.
   */
  const migratedDesignHeight = wasViewportHeight
    ? Math.round((device.screenHeight * legacyVh) / 100)
    : legacyHeight

  const frameHeightUnit = oneOf(raw.frameHeightUnit, FRAME_UNITS, wasViewportHeight ? 'vh' : 'px')

  return {
    sizeMode,
    designHeight: num(
      raw.designHeight ?? migratedDesignHeight,
      device.height,
      MIN_BANNER_HEIGHT,
      4_000,
    ),
    frameHeight:
      frameHeightUnit === 'vh'
        ? num(raw.frameHeight ?? legacyVh, 100, 10, 100)
        : num(raw.frameHeight ?? legacyHeight, device.height, MIN_BANNER_HEIGHT, 4_000),
    frameHeightUnit,
    gutter: num(raw.gutter, 0, 0, 48),
    bg: color(raw.bg, '#eae9e9'),
    root: normalizeNode(raw.root, id, warn),
  }
}
```

Import `MIN_BANNER_HEIGHT` from `./layout` (no cycle: `layout` imports only `./types`).

Add the design-width normalizer next to it:

```ts
/*
 * Only entries that are real numbers survive, and each is clamped to a width a
 * banner could plausibly be designed at. A junk entry is dropped rather than
 * defaulted, so `designWidthOf` falls back to the device width.
 */
function normalizeDesignWidths(input: unknown): Partial<Record<BreakpointName, number>> {
  if (!isRecord(input)) return {}
  const out: Partial<Record<BreakpointName, number>> = {}
  for (const name of BREAKPOINT_ORDER) {
    const value = input[name]
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[name] = Math.round(Math.min(3_840, Math.max(320, value)))
    }
  }
  return out
}
```

In the template normalizer, add it with a conditional spread — `exactOptionalPropertyTypes` forbids assigning `undefined`:

```ts
const designWidths = normalizeDesignWidths(raw.designWidths)
return {
  version: CURRENT_SCHEMA_VERSION,
  // ...existing fields
  ...(Object.keys(designWidths).length > 0 ? { designWidths } : {}),
  breakpoints: { /* ...unchanged */ },
}
```

- [ ] **Step 5: Update defaults**

In `src/core/defaults.ts`, replace lines 193-196:

```ts
    sizeMode: 'ratio',
    designHeight: device.height,
    frameHeight: device.height,
    frameHeightUnit: 'px',
    gutter: 0,
```

- [ ] **Step 6: Replace `resolveHeight`**

In `src/core/layout.ts`, replace `resolveHeight` with:

```ts
/**
 * The frame's height in px for a given device.
 *
 * In `ratio` mode the frame has no independent height - it is the design's own
 * height, and the renderer derives the real one from the container. The editor
 * canvas still needs a number to draw at, and the authored design height is the
 * truthful one. In `fit` and `cover` the frame does have its own height, and a
 * `vh` value is resolved against the device's nominal screen height so the
 * canvas can show a truthful preview inside a few hundred pixels.
 */
export function resolveFrameHeight(
  breakpoint: Omit<BannerBreakpoint, 'root'>,
  device: BreakpointName,
): number {
  if (breakpoint.sizeMode === 'ratio') {
    return Math.max(MIN_BANNER_HEIGHT, Math.round(breakpoint.designHeight))
  }
  const raw =
    breakpoint.frameHeightUnit === 'vh'
      ? (DEVICES[device].screenHeight * (breakpoint.frameHeight || 100)) / 100
      : breakpoint.frameHeight
  return Math.max(MIN_BANNER_HEIGHT, Math.round(raw))
}
```

- [ ] **Step 7: Update the four call sites**

`src/renderer/BannerRenderer.tsx` — replace `frameHeight()` (lines 54-63):

```ts
function frameHeightStyle(breakpoint: BannerBreakpoint): string | undefined {
  // `ratio` gets its height from `aspect-ratio` in CSS, not from a length here.
  if (breakpoint.sizeMode === 'ratio') return undefined
  return breakpoint.frameHeightUnit === 'vh'
    ? `${breakpoint.frameHeight}vh`
    : `${breakpoint.frameHeight}px`
}
```

Apply it to the `.bnbr-bp` wrapper rather than `.bnbr-frame`, since that wrapper is the sizing container in Task 3. For now keep passing it to the frame; Task 3 moves it.

`src/builder/parts/Canvas.tsx` — `frameMetrics` calls `resolveFrameHeight(bp, state.breakpoint)` and `designWidthOf(template(state), state.breakpoint)` instead of `DEVICES[...].width`.

`src/builder/parts/TopBar.tsx` (lines 55-85) — the segmented control becomes `Size` with `Ratio | Fit | Cover`, patching `{ sizeMode }`. The number input edits `designHeight` in `ratio` mode and `frameHeight` in the others, with `min` `120`/`10` and `max` `4000`/`100` depending on `frameHeightUnit`.

`src/builder/state/inspector.ts` (lines 171-211) — same change: the `Height mode` segmented field becomes `Size mode` over the three modes; the conditional block below it shows `Design height` always, plus `Frame height` when the mode is not `ratio`.

- [ ] **Step 8: Verify**

Run: `pnpm run typecheck && pnpm exec vitest run`
Expected: typecheck clean; all tests pass including the eight new migration tests. Existing tests that assert `heightMode` must be updated to the new field names, not deleted.

---

### Task 3: Container queries and the scale unit

The CSS mechanism. After this task a `ratio` banner genuinely scales with its container.

**Files:**
- Modify: `src/renderer/renderer.css` (`.bnbr` ~line 29, `.bnbr-bp` media queries lines 110-133, `.bnbr-frame` line 141)
- Modify: `src/renderer/BannerRenderer.tsx`
- Modify: `src/css/isolation.test.ts`

**Interfaces:**
- Consumes: `SizeMode`, `designWidthOf` from Task 2
- Produces: `.bnbr-bp[data-size-mode]` carrying `--bnbr-dw` / `--bnbr-dh`; `--bnbr-u` inherited by everything inside `.bnbr-frame`

- [ ] **Step 1: Write the failing CSS guard tests**

Add to the `renderer.css` describe block in `src/css/isolation.test.ts`:

```ts
test('selects breakpoints from the container, not the viewport', () => {
  expect(css).toMatch(/@container\s+bnbr-root/)
  // A viewport media query here would make the banner wrong in any column
  // narrower than the window.
  expect(css).not.toMatch(/@media[^{]*width/)
})

test('shows the laptop tree when @container is unsupported', () => {
  /*
   * `.bnbr-bp { display: none }` plus `@container` rules to reveal one means a
   * browser without container query support matches nothing and renders a blank
   * banner. The laptop tree must be visible by default and overridden.
   */
  expect(css).toMatch(/\.bnbr-bp\[data-bp=['"]laptop['"]\][^{]*\{[^}]*display:\s*block/)
})

test('guards the scale unit with @supports, not a fallback declaration', () => {
  /*
   * Two declarations of a custom property do NOT give a fallback: a custom
   * property value is not parsed at declaration time, so the cqw version always
   * wins and only fails later, when substitution makes the *using* property
   * invalid at computed-value time. The guard has to be @supports.
   */
  expect(css).toMatch(/@supports\s*\(container-type:\s*inline-size\)/)
  const cqwOutsideSupports = css
    .replace(/@supports\s*\(container-type:[^{]*\{[\s\S]*?\n\}/g, '')
    .includes('cqw')
  expect(cqwOutsideSupports, 'cqw used outside the @supports guard').toBe(false)
})

test('defaults the scale unit to one real pixel', () => {
  expect(css).toMatch(/--bnbr-u:\s*1px/)
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm exec vitest run src/css/isolation.test.ts`
Expected: FAIL on all four.

- [ ] **Step 3: Rewrite the breakpoint and frame CSS**

In `src/renderer/renderer.css`, make the root a named container:

```css
.bnbr {
  container-type: inline-size;
  container-name: bnbr-root;
  /* ...existing declarations unchanged */
}
```

Replace the three `@media` blocks (lines 110-133):

```css
/*
 * Which layout shows is decided by the width of the container the banner was
 * given, not the browser window. A banner in a 500px sidebar on a 1920px monitor
 * gets the mobile design, which is the whole point: with proportional scaling,
 * the laptop design in that space would render its 46px heading at 18px.
 *
 * The laptop tree is visible by default so that a browser without container
 * query support shows a banner rather than nothing - `@container` blocks it does
 * not understand are simply ignored.
 */
.bnbr-bp {
  display: none;
}

.bnbr-bp[data-bp='laptop'] {
  display: block;
}

@container bnbr-root (max-width: 1023.98px) {
  .bnbr-bp[data-bp='laptop'] { display: none; }
  .bnbr-bp[data-bp='tablet'] { display: block; }
}

@container bnbr-root (max-width: 767.98px) {
  .bnbr-bp[data-bp='tablet'] { display: none; }
  .bnbr-bp[data-bp='mobile'] { display: block; }
}
```

Add the sizing container and the scale unit:

```css
/*
 * The per-tree sizing container. `cqw` and `cqh` inside the frame resolve
 * against this box, and it is nearer than `bnbr-root`, so unnamed container
 * units pick it up without needing a name of their own.
 *
 * `fit` and `cover` need `cqh`, which requires `container-type: size` and a
 * definite height - which they always have, because `frameHeight` is set on
 * this element.
 */
.bnbr-bp[data-size-mode='ratio'] {
  container-type: inline-size;
}

.bnbr-bp[data-size-mode='fit'],
.bnbr-bp[data-size-mode='cover'] {
  container-type: size;
  position: relative;
  overflow: hidden;
}

.bnbr-frame {
  /* One real pixel until proven otherwise; see the @supports block below. */
  --bnbr-u: 1px;
  position: relative;
  width: 100%;
  overflow: hidden;
}

@supports (container-type: inline-size) {
  [data-size-mode='ratio'] > .bnbr-frame {
    --bnbr-u: calc(100cqw / var(--bnbr-dw));
    aspect-ratio: var(--bnbr-dw) / var(--bnbr-dh);
  }

  /* Whole design visible, letterboxed - `bg` shows in the margin. */
  [data-size-mode='fit'] > .bnbr-frame {
    --bnbr-u: min(calc(100cqw / var(--bnbr-dw)), calc(100cqh / var(--bnbr-dh)));
  }

  /* Design fills the frame; the overflowing edges are cropped. */
  [data-size-mode='cover'] > .bnbr-frame {
    --bnbr-u: max(calc(100cqw / var(--bnbr-dw)), calc(100cqh / var(--bnbr-dh)));
  }

  [data-size-mode='fit'] > .bnbr-frame,
  [data-size-mode='cover'] > .bnbr-frame {
    position: absolute;
    top: 50%;
    left: 50%;
    /*
     * Centred with `translate`, never `margin: auto`. A host reset of
     * `* { margin: 0 }` is near-universal and unlayered, and unlayered normal
     * declarations beat every layered one - the same failure that put this
     * package's dialogs in the top-left corner.
     */
    translate: -50% -50%;
    width: calc(var(--bnbr-u) * var(--bnbr-dw));
    height: calc(var(--bnbr-u) * var(--bnbr-dh));
  }
}
```

- [ ] **Step 4: Emit the variables from the renderer**

In `src/renderer/BannerRenderer.tsx`, `BannerFrame` gains the wrapper. Give `.bnbr-bp` (and `.bnbr-bp-fixed`) `data-size-mode`, the two custom properties, and — for `fit`/`cover` only — a height:

```ts
type SizingStyle = CSSProperties & {
  '--bnbr-dw': number
  '--bnbr-dh': number
}

function sizingStyle(breakpoint: BannerBreakpoint, designWidth: number): SizingStyle {
  return {
    '--bnbr-dw': designWidth,
    '--bnbr-dh': breakpoint.designHeight,
    ...(breakpoint.sizeMode === 'ratio'
      ? {}
      : {
          height:
            breakpoint.frameHeightUnit === 'vh'
              ? `${breakpoint.frameHeight}vh`
              : `${breakpoint.frameHeight}px`,
        }),
  }
}
```

The wrapper becomes:

```tsx
<div
  className="bnbr-bp"
  data-bp={device}
  data-size-mode={bp.sizeMode}
  style={sizingStyle(bp, designWidthOf(document_, device))}
>
```

`CSSProperties` has no room for custom properties, so widen the type as above rather than casting at the call site — the same pattern `dividerStyle` already uses in `Canvas.tsx`.

Remove the `height` style from `.bnbr-frame`; the frame now gets its height from `aspect-ratio` or from the `fit`/`cover` rules.

- [ ] **Step 5: Verify**

Run: `pnpm run typecheck && pnpm exec vitest run && pnpm run build:css`
Expected: typecheck clean, all tests pass including the four new guards, CSS builds.

- [ ] **Step 6: Prove the guard is not vacuous**

Temporarily move one `--bnbr-u: calc(...)` declaration outside the `@supports` block, re-run `pnpm exec vitest run src/css/isolation.test.ts`, and confirm the `@supports` test fails. Restore it.

This step is not optional. Three guards in this codebase have passed vacuously; a guard nobody has watched fail is not evidence.

---

### Task 4: Route every emitted px through `du()`

**Files:**
- Modify: `src/core/layout.ts` (`insetStyle`)
- Modify: `src/renderer/PanelView.tsx` (lines 31-32, 97-98)
- Modify: `src/renderer/ElementView.tsx` (lines 137, 153-157, 183, 215-216, 235, 242-243)
- Test: `src/renderer/scaling.test.tsx` (create)

**Interfaces:**
- Consumes: `du` from Task 1
- Produces: no new exports; `insetStyle` keeps its signature and return shape

- [ ] **Step 1: Write the failing test**

Create `src/renderer/scaling.test.tsx`:

```tsx
// @vitest-environment happy-dom
/*
 * Every size in a banner must scale with the container.
 *
 * A value someone forgot to convert does not throw and does not look wrong in
 * the editor, where the scale unit is exactly 1px - it only misbehaves on a
 * consumer's page, at a width nobody tested. So the check is mechanical: no
 * scaling property may emit a literal `px`.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createDefaultTemplate } from '../core/defaults'
import { BannerRenderer } from './BannerRenderer'

/** Properties whose values come from the document and must therefore scale. */
const SCALING_PROPERTIES = [
  'font-size',
  'padding',
  'gap',
  'border-radius',
  'border-width',
  'width',
  'height',
  'left',
  'top',
]

function inlineStyles(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[style]')].map((n) => n.getAttribute('style') ?? '')
}

describe('design pixels', () => {
  it('emits no literal px for any property driven by the document', () => {
    const { container } = render(
      <BannerRenderer template={createDefaultTemplate({ name: 'Scale' })} breakpoint="laptop" />,
    )
    const offenders: string[] = []
    for (const style of inlineStyles(container)) {
      for (const declaration of style.split(';')) {
        const [property, value] = declaration.split(':').map((s) => s.trim())
        if (!property || !value) continue
        if (!SCALING_PROPERTIES.some((p) => property === p || property.startsWith(p))) continue
        // A vh frame height is a real viewport length and is allowed to be one.
        if (value.includes('vh')) continue
        if (/\d+px/.test(value)) offenders.push(`${property}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('scales a heading with the unit rather than pinning it', () => {
    const { container } = render(
      <BannerRenderer template={createDefaultTemplate({ name: 'Scale' })} breakpoint="laptop" />,
    )
    const heading = container.querySelector('.bnbr-heading')
    expect(heading?.getAttribute('style')).toContain('calc(var(--bnbr-u) *')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run src/renderer/scaling.test.tsx`
Expected: FAIL, listing `font-size: 46px`, `padding: 40px`, `gap: 14px` and friends.

- [ ] **Step 3: Convert `insetStyle`**

In `src/core/layout.ts`:

```ts
export function insetStyle(rect: Rect, gutter: number): InsetStyle {
  if (gutter <= 0) {
    return {
      left: `${rect.x}%`,
      top: `${rect.y}%`,
      width: `${rect.w}%`,
      height: `${rect.h}%`,
    }
  }
  // The gutter is design px, so it scales with everything else.
  const half = gutter / 2
  return {
    left: `calc(${rect.x}% + ${du(half)})`,
    top: `calc(${rect.y}% + ${du(half)})`,
    width: `calc(${rect.w}% - ${du(gutter)})`,
    height: `calc(${rect.h}% - ${du(gutter)})`,
  }
}
```

Update `src/core/layout.test.ts` expectations from `calc(50% + 4px)` to `calc(50% + calc(var(--bnbr-u) * 4))`.

- [ ] **Step 4: Convert `PanelView`**

```ts
  const style: CSSProperties = {
    padding: du(panel.pad),
    gap: du(panel.gap),
    alignItems: panel.alignX,
    justifyContent: panel.alignY,
  }
```

and

```ts
    borderRadius: panel.radius ? du(panel.radius) : undefined,
    ...(panel.borderW ? { border: `${du(panel.borderW)} solid ${panel.borderColor}` } : {}),
```

- [ ] **Step 5: Convert `ElementView`**

Every listed line: `fontSize: du(element.fs)`, `borderRadius: du(element.radius)`,
`border: ... `${du(1)} solid ${element.color}``, the image plate `${du(6)} solid`,
`height: du(element.size)` for the spacer, `width`/`height: du(element.fs)` for the icon.

`maxWidth: ${element.measure}ch` stays as it is — `ch` tracks font size, which now scales, so it scales for free.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run src/renderer/scaling.test.tsx && pnpm exec vitest run`
Expected: both pass. The `BannerRenderer.test.tsx` and `layout.test.ts` suites will need expectation updates where they assert on px strings.

- [ ] **Step 7: Verify**

Run: `pnpm run typecheck && pnpm exec vitest run`

---

### Task 5: Convert the literals inside `renderer.css`

The stylesheet's own hard-coded sizes are as much part of the design as the document's.

**Files:**
- Modify: `src/renderer/renderer.css` (lines 208, 216, 281-345)
- Modify: `src/css/isolation.test.ts`

**Interfaces:**
- Consumes: `--bnbr-u` from Task 3
- Produces: nothing

- [ ] **Step 1: Write the failing guard**

```ts
test('carousel chrome and button padding scale with the banner', () => {
  /*
   * Anything sized in literal px inside the renderer stops scaling, so a
   * carousel arrow stays 34px on a banner that has doubled. Only the allowlist
   * below may be literal: hairlines and pill radii are deliberately constant.
   */
  const ALLOWED = [/border-radius:\s*999px/, /outline[^;]*px/, /blur\(\d+px\)/]
  const offenders: string[] = []
  for (const line of css.split('\n')) {
    if (!/\d+(\.\d+)?px/.test(line)) continue
    if (line.includes('--bnbr-u: 1px')) continue
    if (ALLOWED.some((re) => re.test(line))) continue
    offenders.push(line.trim())
  }
  expect(offenders).toEqual([])
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run src/css/isolation.test.ts`
Expected: FAIL, listing roughly twenty lines.

- [ ] **Step 3: Convert them**

Replace each literal with a `--bnbr-u` multiple, for example:

```css
.bnbr-button {
  padding: calc(var(--bnbr-u) * 10) calc(var(--bnbr-u) * 20);
}

.bnbr-link {
  text-underline-offset: calc(var(--bnbr-u) * 3);
}

.bnbr-nav {
  width: calc(var(--bnbr-u) * 34);
  height: calc(var(--bnbr-u) * 34);
  margin-top: calc(var(--bnbr-u) * -17);
  border-radius: 999px;
}
```

and likewise for the arrow insets (12), pagination (bottom 14, gap 7), dots (9), bars (26 × 3, radius 2), and the counter (right/bottom 14, padding 3 / 8, font-size 11).

`border-radius: 999px` stays literal — it is a pill, not a measurement.

- [ ] **Step 4: Verify**

Run: `pnpm exec vitest run && pnpm run build:css`
Expected: all pass; `dist/renderer.css` rebuilds.

---

### Task 6: The editor's sizing controls

**Files:**
- Modify: `src/builder/parts/TopBar.tsx`
- Modify: `src/builder/state/inspector.ts`
- Modify: `src/builder/parts/Canvas.tsx` (the `label`, `frameMetrics`)
- Modify: `src/builder/parts/LeftRail.tsx` ("This breakpoint" copy)
- Test: `src/builder/state/inspector.test.ts` (extend, create if absent)

**Interfaces:**
- Consumes: `SizeMode`, `designWidthOf`, `resolveFrameHeight` from Task 2
- Produces: no new exports

- [ ] **Step 1: Write the failing inspector tests**

```ts
describe('sizing fields', () => {
  it('offers the three sizing modes', () => {
    const model = inspectorModel(createEditorState(createDefaultTemplate()))
    const mode = model.fields.find((f) => f.label === 'Size mode')
    expect(mode?.kind).toBe('segmented')
    expect(mode && 'options' in mode && mode.options.map((o) => o.value)).toEqual([
      'ratio',
      'fit',
      'cover',
    ])
  })

  it('shows only the design height in ratio mode', () => {
    const model = inspectorModel(createEditorState(createDefaultTemplate()))
    const labels = model.fields.map((f) => f.label)
    expect(labels).toContain('Design height')
    expect(labels).not.toContain('Frame height')
  })

  it('shows both heights in fit mode, because they are different things', () => {
    let state = createEditorState(createDefaultTemplate())
    state = editorReducer(state, { type: 'updateBreakpoint', patch: { sizeMode: 'fit' } })
    const labels = inspectorModel(state).fields.map((f) => f.label)
    expect(labels).toContain('Design height')
    expect(labels).toContain('Frame height')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm exec vitest run src/builder/state/inspector.test.ts`

- [ ] **Step 3: Rework the inspector fields**

Replace the `Height mode` segmented field with:

```ts
    {
      kind: 'segmented',
      label: 'Size mode',
      value: bp.sizeMode,
      options: [
        { value: 'ratio', label: 'Ratio' },
        { value: 'fit', label: 'Fit' },
        { value: 'cover', label: 'Cover' },
      ],
      onChange: (value): EditorAction => ({
        type: 'updateBreakpoint',
        patch: { sizeMode: value as SizeMode },
      }),
    },
```

Then always push `Design height`, and push `Frame height` only when the mode is not `ratio`:

```ts
  fields.push({
    kind: 'number',
    label: 'Design height',
    hint: `px at ${designWidthOf(doc, state.breakpoint)} wide`,
    value: bp.designHeight,
    min: 120,
    max: 4000,
    step: 10,
    onChange: (value): EditorAction => ({
      type: 'updateBreakpoint',
      patch: { designHeight: value },
    }),
  })

  if (bp.sizeMode !== 'ratio') {
    /*
     * Two heights, named plainly. They are genuinely different things - the
     * shape of the design, and the slot it is poured into - and collapsing them
     * into one control would hide which is which.
     */
    fields.push({
      kind: 'number',
      label: 'Frame height',
      hint: bp.frameHeightUnit,
      value: bp.frameHeight,
      min: bp.frameHeightUnit === 'vh' ? 10 : 120,
      max: bp.frameHeightUnit === 'vh' ? 100 : 4000,
      step: bp.frameHeightUnit === 'vh' ? 5 : 10,
      onChange: (value): EditorAction => ({
        type: 'updateBreakpoint',
        patch: { frameHeight: value },
      }),
    })
  }
```

Add a `Design width` number field to the template section, patching `designWidths` for the current breakpoint, min 320, max 3840, with the hint `optional`.

- [ ] **Step 4: Mirror it in the top bar**

`TopBar.tsx` lines 55-85: the label becomes `Size`, the segmented control carries the three modes, and the number input edits `designHeight` in `ratio` mode, `frameHeight` otherwise, with the unit suffix reading `px` or `vh`.

- [ ] **Step 5: Update the canvas**

`Canvas.tsx` — the label becomes `${device.label} · ${designWidth} × ${bp.designHeight}`, and in `fit`/`cover` the frame box is sized `designWidth × resolveFrameHeight(...)` so the author sees letterboxing or cropping while working.

`LeftRail.tsx` — reword the "This breakpoint" paragraph; it currently says "Each screen keeps its own layout, height, and spacing" and should mention sizing rather than height.

- [ ] **Step 6: Verify**

Run: `pnpm run typecheck && pnpm exec vitest run`

---

### Task 7: Prove it in a browser

The acceptance check. Everything above can pass while the banner still renders wrong; only this task answers the original report.

**Files:**
- Create: `apps/playground/app/sizing/page.tsx`
- Create: `apps/playground/app/sizing/SizingReport.tsx`

**Interfaces:**
- Consumes: the built package
- Produces: a route rendering one template at 1280, 1640, 980 and 500 px, with a measured report

- [ ] **Step 1: Build and serve**

Run from the package: `pnpm run build`
Then from `apps/playground`: `pnpm exec next build && pnpm exec next start -p 3111`

The dev server does not work in this workspace — Console Ninja hooks the Node process and requests hang. Use a production build, which is closer to what consumers run anyway.

- [ ] **Step 2: Write the page**

Four fixed-width wrappers around the same template, each labelled, plus a report component that measures with `getComputedStyle` and prints a pass/fail table in the same style as `/hostile`.

- [ ] **Step 3: Assert proportional scaling**

In the browser, for the 1280 and 1640 wrappers, read frame height, heading `font-size`, and panel `padding`. Assert the ratio between them is `1640 / 1280 = 1.28125`, within half a pixel.

Expected, for the default template:

| Measure | at 1280 | at 1640 |
|---|---|---|
| frame height | 420 | 538.1 |
| heading font-size | 46 | 58.9 |
| panel padding | 40 | 51.25 |

- [ ] **Step 4: Assert container-driven breakpoints**

The 500px wrapper must render the tree with `data-bp="mobile"`, not a shrunken laptop one. Check `document.querySelector('[data-bp]:not([style*="display: none"])')` inside that wrapper, or read `display` from `getComputedStyle` on each of the three.

- [ ] **Step 5: Check the hostile host still holds**

Load `/hostile` and `/hostile-builder`. The isolation report must still be all-pass, and the editor canvas must still render correctly — `container-type` makes an element a containing block for absolutely positioned descendants, and although panels position against `.bnbr-frame` inside it, that must be observed rather than assumed.

- [ ] **Step 6: Check the console**

Zero errors and zero warnings on every route.

---

### Task 8: Documentation and release prep

**Files:**
- Modify: `packages/react-bannerkit/README.md`
- Modify: `packages/react-bannerkit/package.json` (version)
- Modify: `packages/react-bannerkit/scripts/smoke-tarball.mjs`

- [ ] **Step 1: Extend the tarball smoke check**

Add a check asserting the published `renderer.css` contains `@container` and `--bnbr-u`, and that a normalised v1 template comes back as `version: 2` with a `sizeMode`.

- [ ] **Step 2: Update the README**

Document the three sizing modes, the design-width concept, the container-query behaviour, and a short migration note: templates saved by 0.1.x convert on read, `heightMode: 'fixed'` becomes `ratio` and `heightMode: 'vh'` becomes `fit`.

Correct the responsive section, which currently says media queries choose between the trees at 768 and 1024 of *viewport* width.

- [ ] **Step 3: Bump the version**

Run: `npm pkg set version=0.1.5`

- [ ] **Step 4: Full gate**

Run: `pnpm run verify`
Expected: typecheck, all tests, build, `publint --strict`, `attw` across four resolution modes, and the tarball smoke check all pass.

- [ ] **Step 5: Hand back**

Report what changed and leave the tree uncommitted for the user to review.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: schema and migration to Task 2; the CSS mechanism, both containers and graceful degradation to Task 3; the `du` helper to Task 1; renderer conversions to Tasks 4 and 5; editor changes to Task 6; the acceptance check and `/sizing` route to Task 7; versioning and README to Task 8. The "what does not scale" rule is enforced by the allowlist in Task 5's guard.

**Deviations, both deliberate and both flagged in-place.** `DESIGN_WIDTHS` is replaced by a `designWidthOf` helper over the existing `DEVICES` table, because a second copy of 1280/834/390 would be two sources of truth. And the spec's height-clamp floor is the existing `MIN_BANNER_HEIGHT`, not a new constant.

**Type consistency.** `sizeMode`, `designHeight`, `frameHeight`, `frameHeightUnit`, `designWidths`, `designWidthOf`, `resolveFrameHeight`, `du`, `--bnbr-u`, `--bnbr-dw`, `--bnbr-dh` are used with the same names and types in every task that mentions them. `resolveHeight` is renamed once, in Task 2, and every later reference uses the new name.

**Known risk carried forward.** A missed px conversion fails silently and looks perfect in the editor, where the scale unit is exactly `1px`. Task 4's test is mechanical for that reason, and Task 3 Step 6 requires watching a guard fail before trusting it.
