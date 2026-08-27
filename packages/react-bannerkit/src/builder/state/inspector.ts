/*
 * The inspector, as data.
 *
 * Given the editor state, this produces the list of controls the right-hand
 * panel should show and the action each one dispatches. Keeping it a pure
 * function means the entire field set - which controls appear for which
 * selection, what their bounds are, what they write - is asserted directly,
 * and the React component that draws it stays a dumb renderer of descriptors.
 *
 * The field set follows the design handoff closely; it was iterated with the
 * user and the labels and copy are deliberate.
 */
import { DEFAULT_SWATCHES } from '../../core/defaults'
import { ICONS } from '../../core/icons'
import { countPanels, listPanels } from '../../core/tree'
import type {
  BannerElement,
  BannerPanel,
  BannerSlide,
  FontWeight,
} from '../../core/types'
import {
  activeHost,
  currentBreakpoint,
  selectedElement,
  selectedPanel,
  slideCursorOf,
  template,
  type EditorAction,
  type EditorState,
} from './reducer'

/* -------------------------------------------------------------------- types */

interface FieldBase {
  label: string
  /** Right-aligned secondary text: a current value, a unit, or a caveat. */
  hint?: string | undefined
}

export interface TextField extends FieldBase {
  kind: 'text'
  value: string
  placeholder?: string | undefined
  onChange: (value: string) => EditorAction
}

export interface TextareaField extends FieldBase {
  kind: 'textarea'
  value: string
  rows: number
  placeholder?: string | undefined
  onChange: (value: string) => EditorAction
}

export interface RangeField extends FieldBase {
  kind: 'range'
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => EditorAction
}

export interface NumberField extends FieldBase {
  kind: 'number'
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => EditorAction
}

export interface SegmentedField<T = string | number | boolean> extends FieldBase {
  kind: 'segmented'
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => EditorAction
}

export interface ColorField extends FieldBase {
  kind: 'color'
  value: string
  swatches: readonly { value: string; label: string }[]
  /** Adds a transparent swatch, drawn as a checkerboard. */
  allowTransparent?: boolean | undefined
  onChange: (value: string) => EditorAction
}

export interface ImageField extends FieldBase {
  kind: 'image'
  value: string
  onChange: (value: string) => EditorAction
}

export interface IconField extends FieldBase {
  kind: 'icon'
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => EditorAction
}

export type Field =
  | TextField
  | TextareaField
  | RangeField
  | NumberField
  | SegmentedField<string>
  | SegmentedField<number>
  | SegmentedField<boolean>
  | ColorField
  | ImageField
  | IconField

export interface InspectorModel {
  /** Small uppercase line above the title. */
  kicker: string
  title: string
  /** An explanation shown under the title, when there is something to explain. */
  note?: string | undefined
  fields: Field[]
  /** False when deleting would leave the banner with no panels. */
  canDelete: boolean
}

/* ------------------------------------------------------------------ helpers */

const px = (n: number) => `${n}px`

const ON_OFF: readonly { value: boolean; label: string }[] = [
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
]

const WEIGHTS: readonly { value: FontWeight; label: string }[] = [
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Black' },
]

const ICON_OPTIONS = Object.entries(ICONS).map(([value, spec]) => ({ value, label: spec.label }))

/** Patches the selected element. */
const el = (patch: Record<string, unknown>): EditorAction => ({ type: 'updateElement', patch })

/* --------------------------------------------------------- template fields */

function templateFields(state: EditorState): InspectorModel {
  const doc = template(state)
  const bp = currentBreakpoint(state)
  const fields: Field[] = [
    {
      kind: 'text',
      label: 'Template name',
      value: doc.name,
      placeholder: 'Homepage hero',
      onChange: (value) => ({ type: 'replaceTemplate', template: { ...doc, name: value } }),
    },
    {
      kind: 'textarea',
      label: 'Description',
      hint: 'optional',
      rows: 3,
      value: doc.description,
      placeholder: 'Where this banner runs, and who it speaks to.',
      onChange: (value) => ({ type: 'replaceTemplate', template: { ...doc, description: value } }),
    },
    {
      kind: 'segmented',
      label: 'Height mode',
      value: bp.heightMode,
      options: [
        { value: 'fixed', label: 'Fixed' },
        { value: 'vh', label: 'Viewport' },
      ],
      onChange: (value) => ({
        type: 'updateBreakpoint',
        patch: { heightMode: value as 'fixed' | 'vh' },
      }),
    },
  ]

  /*
   * Only one of these is ever shown. Offering both would leave the user guessing
   * which one the banner is actually using.
   */
  if (bp.heightMode === 'vh') {
    fields.push({
      kind: 'range',
      label: 'Share of screen',
      hint: `${bp.vh}% of screen`,
      value: bp.vh,
      min: 10,
      max: 100,
      step: 5,
      onChange: (value) => ({ type: 'updateBreakpoint', patch: { vh: value } }),
    })
  } else {
    fields.push({
      kind: 'number',
      label: 'Height',
      hint: 'px',
      value: bp.height,
      min: 120,
      max: 2000,
      step: 10,
      onChange: (value) => ({ type: 'updateBreakpoint', patch: { height: value } }),
    })
  }

  fields.push(
    {
      kind: 'range',
      label: 'Space between panels',
      hint: px(bp.gutter),
      value: bp.gutter,
      min: 0,
      max: 48,
      step: 1,
      onChange: (value) => ({ type: 'updateBreakpoint', patch: { gutter: value } }),
    },
    {
      kind: 'color',
      label: 'Colour behind panels',
      // Transparent is meaningful here: it is what shows through the gutter.
      allowTransparent: true,
      value: bp.bg,
      swatches: DEFAULT_SWATCHES,
      onChange: (value) => ({ type: 'updateBreakpoint', patch: { bg: value } }),
    },
  )

  return {
    kicker: 'Template',
    title: 'Template settings',
    fields,
    canDelete: false,
  }
}

/* ------------------------------------------------------------ panel fields */

function panelFields(state: EditorState, panel: BannerPanel): InspectorModel {
  const index = listPanels(currentBreakpoint(state).root).findIndex((p) => p.id === panel.id)
  const slide = slideCursorOf(state, panel)
  const isCarousel = panel.type === 'carousel'
  const canDelete = countPanels(currentBreakpoint(state).root) > 1

  const fields: Field[] = [
    {
      kind: 'segmented',
      label: 'Banner type',
      hint: isCarousel ? `editing slide ${slide + 1}` : undefined,
      value: panel.type,
      options: [
        { value: 'single', label: 'Single image' },
        { value: 'carousel', label: 'Carousel' },
      ],
      onChange: (value) => ({
        type: 'updatePanel',
        patch: { type: value as 'single' | 'carousel' },
      }),
    },
    {
      kind: 'segmented',
      label: 'Background',
      value: isCarousel ? (panel.slides[slide]?.mode ?? 'color') : panel.bgMode,
      options: [
        { value: 'photo', label: 'Image' },
        { value: 'color', label: 'Colour' },
      ],
      onChange: (value: string): EditorAction =>
        isCarousel
          ? {
              type: 'updatePanel',
              patch: {
                slides: panel.slides.map((s, i) =>
                  i === slide ? { ...s, mode: value as 'photo' | 'color' } : s,
                ),
              },
            }
          : { type: 'updatePanel', patch: { bgMode: value as 'photo' | 'color' } },
    },
    {
      kind: 'color',
      label: 'Background colour',
      value: isCarousel ? (panel.slides[slide]?.bg ?? panel.bg) : panel.bg,
      swatches: DEFAULT_SWATCHES,
      onChange: (value): EditorAction =>
        isCarousel
          ? {
              type: 'updatePanel',
              patch: {
                slides: panel.slides.map((s, i) => (i === slide ? { ...s, bg: value } : s)),
              },
            }
          : { type: 'updatePanel', patch: { bg: value } },
    },
    {
      kind: 'image',
      label: isCarousel ? `Image — slide ${slide + 1}` : 'Background image',
      hint: 'JPG or PNG',
      value: isCarousel ? (panel.slides[slide]?.img ?? panel.img) : panel.img,
      onChange: (value): EditorAction =>
        isCarousel
          ? {
              type: 'updatePanel',
              patch: {
                slides: panel.slides.map((s, i) =>
                  i === slide ? { ...s, img: value, mode: 'photo' as const } : s,
                ),
              },
            }
          : { type: 'updatePanel', patch: { img: value, bgMode: 'photo' } },
    },
    {
      kind: 'range',
      label: 'Corner radius',
      hint: px(panel.radius),
      value: panel.radius,
      min: 0,
      max: 48,
      step: 1,
      onChange: (value) => ({ type: 'updatePanel', patch: { radius: value } }),
    },
    {
      kind: 'range',
      label: 'Border width',
      hint: px(panel.borderW),
      value: panel.borderW,
      min: 0,
      max: 12,
      step: 1,
      onChange: (value) => ({ type: 'updatePanel', patch: { borderW: value } }),
    },
    {
      kind: 'color',
      label: 'Border colour',
      value: panel.borderColor,
      swatches: DEFAULT_SWATCHES,
      onChange: (value) => ({ type: 'updatePanel', patch: { borderColor: value } }),
    },
    {
      kind: 'range',
      label: 'Padding',
      hint: px(panel.pad),
      value: panel.pad,
      min: 0,
      max: 96,
      step: 1,
      onChange: (value) => ({ type: 'updatePanel', patch: { pad: value } }),
    },
    {
      kind: 'range',
      label: 'Gap',
      hint: px(panel.gap),
      value: panel.gap,
      min: 0,
      max: 48,
      step: 1,
      onChange: (value) => ({ type: 'updatePanel', patch: { gap: value } }),
    },
    {
      kind: 'segmented',
      label: 'Horizontal',
      value: panel.alignX,
      options: [
        { value: 'flex-start', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'flex-end', label: 'Right' },
      ],
      onChange: (value) => ({
        type: 'updatePanel',
        patch: { alignX: value as BannerPanel['alignX'] },
      }),
    },
    {
      kind: 'segmented',
      label: 'Vertical',
      value: panel.alignY,
      options: [
        { value: 'flex-start', label: 'Top' },
        { value: 'center', label: 'Middle' },
        { value: 'flex-end', label: 'Bottom' },
      ],
      onChange: (value) => ({
        type: 'updatePanel',
        patch: { alignY: value as BannerPanel['alignY'] },
      }),
    },
  ]

  if (isCarousel) {
    fields.push(
      {
        kind: 'segmented',
        label: 'Autoplay',
        value: panel.autoplay,
        options: ON_OFF,
        onChange: (value) => ({ type: 'updatePanel', patch: { autoplay: value } }),
      },
      {
        kind: 'range',
        label: 'Slide duration',
        hint: `${(panel.interval / 1000).toFixed(1)}s`,
        value: panel.interval,
        min: 1000,
        max: 12000,
        step: 500,
        onChange: (value) => ({ type: 'updatePanel', patch: { interval: value } }),
      },
      {
        kind: 'segmented',
        label: 'Transition',
        value: panel.transition,
        options: [
          { value: 'fade', label: 'Fade' },
          { value: 'slide', label: 'Slide' },
          { value: 'none', label: 'Cut' },
        ],
        onChange: (value) => ({
          type: 'updatePanel',
          patch: { transition: value as BannerPanel['transition'] },
        }),
      },
      {
        kind: 'range',
        label: 'Transition speed',
        hint: `${panel.speed}ms`,
        value: panel.speed,
        min: 100,
        max: 1600,
        step: 50,
        onChange: (value) => ({ type: 'updatePanel', patch: { speed: value } }),
      },
      {
        kind: 'segmented',
        label: 'Loop',
        hint: 'wrap past the last slide',
        value: panel.loop,
        options: ON_OFF,
        onChange: (value) => ({ type: 'updatePanel', patch: { loop: value } }),
      },
      {
        kind: 'segmented',
        label: 'Pause on hover',
        value: panel.pauseHover,
        options: ON_OFF,
        onChange: (value) => ({ type: 'updatePanel', patch: { pauseHover: value } }),
      },
      {
        kind: 'segmented',
        label: 'Arrows',
        value: panel.arrows,
        options: [
          { value: true, label: 'Show' },
          { value: false, label: 'Hide' },
        ],
        onChange: (value) => ({ type: 'updatePanel', patch: { arrows: value } }),
      },
      {
        kind: 'segmented',
        label: 'Pagination',
        value: panel.pagination,
        options: [
          { value: 'dots', label: 'Dots' },
          { value: 'bars', label: 'Bars' },
          { value: 'none', label: 'None' },
        ],
        onChange: (value) => ({
          type: 'updatePanel',
          patch: { pagination: value as BannerPanel['pagination'] },
        }),
      },
      {
        kind: 'segmented',
        label: 'Slide counter',
        hint: `1 / ${panel.slides.length}`,
        value: panel.counter,
        options: [
          { value: true, label: 'Show' },
          { value: false, label: 'Hide' },
        ],
        onChange: (value) => ({ type: 'updatePanel', patch: { counter: value } }),
      },
      {
        kind: 'text',
        label: `Slide ${slide + 1} links to`,
        hint: 'whole slide clickable',
        value: panel.slides[slide]?.href ?? '',
        onChange: (value) => ({
          type: 'updatePanel',
          patch: {
            slides: panel.slides.map((s, i) => (i === slide ? { ...s, href: value } : s)),
          },
        }),
      },
    )
  } else {
    fields.push({
      kind: 'text',
      label: 'Banner links to',
      hint: 'optional',
      value: panel.href,
      onChange: (value) => ({ type: 'updatePanel', patch: { href: value } }),
    })
  }

  return {
    kicker: isCarousel ? `Carousel · slide ${slide + 1} of ${panel.slides.length}` : 'Panel',
    title: `Panel ${index + 1}`,
    ...(canDelete
      ? {}
      : { note: 'A banner needs at least one panel, so this one cannot be deleted.' }),
    fields,
    canDelete,
  }
}

/* ---------------------------------------------------------- element fields */

const ELEMENT_TITLES: Record<BannerElement['type'], string> = {
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  link: 'Link',
  image: 'Image',
  overlay: 'Overlay',
  spacer: 'Spacer',
  icon: 'Icon',
}

function elementFields(
  state: EditorState,
  panel: BannerPanel,
  host: BannerPanel | BannerSlide,
  element: BannerElement,
): InspectorModel {
  const index = listPanels(currentBreakpoint(state).root).findIndex((p) => p.id === panel.id)
  const slide = slideCursorOf(state, panel)
  const fields: Field[] = []

  /*
   * An overlay always covers its panel, so a position would be meaningless. Every
   * other element can be dragged free of the stack.
   */
  if (element.type !== 'overlay') {
    const pos = element.pos
    fields.push({
      kind: 'segmented',
      label: 'Position',
      hint: pos
        ? `${Math.round(pos.x)}%, ${Math.round(pos.y)}%`
        : 'drag on the canvas to place freely',
      value: Boolean(pos),
      options: [
        { value: false, label: 'In stack' },
        { value: true, label: 'Free' },
      ],
      onChange: (value: boolean): EditorAction => ({
        type: 'setElementPosition',
        pos: value ? (pos ?? { x: 12, y: 12 }) : null,
      }),
    })
    if (pos) {
      fields.push(
        {
          kind: 'range',
          label: 'X',
          hint: `${Math.round(pos.x)}%`,
          value: pos.x,
          min: 0,
          max: 96,
          step: 1,
          onChange: (value) => ({ type: 'setElementPosition', pos: { ...pos, x: value } }),
        },
        {
          kind: 'range',
          label: 'Y',
          hint: `${Math.round(pos.y)}%`,
          value: pos.y,
          min: 0,
          max: 96,
          step: 1,
          onChange: (value) => ({ type: 'setElementPosition', pos: { ...pos, y: value } }),
        },
      )
    }
  }

  switch (element.type) {
    case 'heading':
    case 'text':
      fields.push(
        {
          kind: 'textarea',
          label: 'Content',
          rows: 3,
          value: element.text,
          onChange: (value) => el({ text: value }),
        },
        {
          kind: 'range',
          label: 'Size',
          hint: px(element.fs),
          value: element.fs,
          min: 11,
          max: 84,
          step: 1,
          onChange: (value) => el({ fs: value }),
        },
        {
          kind: 'segmented',
          label: 'Weight',
          value: element.weight,
          options: WEIGHTS,
          onChange: (value) => el({ weight: value }),
        },
        {
          kind: 'segmented',
          label: 'Align',
          value: element.align,
          options: [
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ],
          onChange: (value) => el({ align: value }),
        },
        {
          kind: 'range',
          label: 'Measure',
          // Line length in characters is what actually governs readability.
          hint: `${element.measure}ch`,
          value: element.measure,
          min: 12,
          max: 60,
          step: 1,
          onChange: (value) => el({ measure: value }),
        },
        {
          kind: 'color',
          label: 'Colour',
          value: element.color,
          swatches: DEFAULT_SWATCHES,
          onChange: (value) => el({ color: value }),
        },
      )
      break

    case 'button':
      fields.push(
        { kind: 'text', label: 'Label', value: element.text, onChange: (v) => el({ text: v }) },
        {
          kind: 'text',
          label: 'Destination',
          hint: 'leave empty for a plain button',
          value: element.href,
          onChange: (v) => el({ href: v }),
        },
        {
          kind: 'segmented',
          label: 'Style',
          value: element.variant,
          options: [
            { value: 'primary', label: 'Outlined' },
            { value: 'solid', label: 'Filled' },
            { value: 'ghost', label: 'Ghost' },
          ],
          onChange: (v) => el({ variant: v }),
        },
        {
          kind: 'range',
          label: 'Size',
          hint: px(element.fs),
          value: element.fs,
          min: 11,
          max: 24,
          step: 1,
          onChange: (v) => el({ fs: v }),
        },
        {
          kind: 'range',
          label: 'Corner',
          hint: px(element.radius),
          value: element.radius,
          min: 0,
          max: 24,
          step: 1,
          onChange: (v) => el({ radius: v }),
        },
        {
          kind: 'color',
          label: 'Colour',
          value: element.color,
          swatches: DEFAULT_SWATCHES,
          onChange: (v) => el({ color: v }),
        },
      )
      break

    case 'link':
      fields.push(
        { kind: 'text', label: 'Label', value: element.text, onChange: (v) => el({ text: v }) },
        { kind: 'text', label: 'Destination', value: element.href, onChange: (v) => el({ href: v }) },
        {
          kind: 'segmented',
          label: 'Underline',
          value: element.underline,
          options: ON_OFF,
          onChange: (v) => el({ underline: v }),
        },
        {
          kind: 'range',
          label: 'Size',
          hint: px(element.fs),
          value: element.fs,
          min: 10,
          max: 24,
          step: 1,
          onChange: (v) => el({ fs: v }),
        },
        {
          kind: 'color',
          label: 'Colour',
          value: element.color,
          swatches: DEFAULT_SWATCHES,
          onChange: (v) => el({ color: v }),
        },
      )
      break

    case 'image':
      fields.push(
        { kind: 'image', label: 'Image', value: element.src, onChange: (v) => el({ src: v }) },
        {
          kind: 'text',
          label: 'Alt text',
          // The handoff had no alt field at all; an image element is content.
          hint: 'describe the image',
          value: element.alt,
          onChange: (v) => el({ alt: v }),
        },
        {
          kind: 'range',
          label: 'Width',
          hint: `${element.width}%`,
          value: element.width,
          min: 10,
          max: 100,
          step: 1,
          onChange: (v) => el({ width: v }),
        },
        {
          kind: 'segmented',
          label: 'Fit',
          value: element.fit,
          options: [
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
          ],
          onChange: (v) => el({ fit: v }),
        },
        {
          kind: 'range',
          label: 'Corner',
          hint: px(element.radius),
          value: element.radius,
          min: 0,
          max: 24,
          step: 1,
          onChange: (v) => el({ radius: v }),
        },
        {
          kind: 'segmented',
          label: 'Plate mat',
          value: element.plate,
          options: ON_OFF,
          onChange: (v) => el({ plate: v }),
        },
        {
          kind: 'color',
          label: 'Mat colour',
          value: element.plateColor,
          swatches: DEFAULT_SWATCHES,
          onChange: (v) => el({ plateColor: v }),
        },
        {
          kind: 'text',
          label: 'Links to',
          hint: 'optional',
          value: element.href,
          onChange: (v) => el({ href: v }),
        },
      )
      break

    case 'overlay':
      fields.push(
        {
          kind: 'segmented',
          label: 'Mode',
          value: element.mode,
          options: [
            { value: 'solid', label: 'Flat' },
            { value: 'gradient', label: 'Gradient' },
          ],
          onChange: (v) => el({ mode: v }),
        },
        {
          kind: 'range',
          label: 'Opacity',
          hint: `${Math.round(element.opacity * 100)}%`,
          value: element.opacity,
          min: 0,
          max: 1,
          step: 0.02,
          onChange: (v) => el({ opacity: v }),
        },
        {
          kind: 'color',
          label: 'Colour',
          value: element.color,
          swatches: DEFAULT_SWATCHES,
          onChange: (v) => el({ color: v }),
        },
      )
      break

    case 'spacer':
      fields.push({
        kind: 'range',
        label: 'Height',
        hint: px(element.size),
        value: element.size,
        min: 4,
        max: 120,
        step: 1,
        onChange: (v) => el({ size: v }),
      })
      break

    case 'icon':
      fields.push(
        {
          kind: 'icon',
          label: 'Glyph',
          // Limited to what the renderer can draw without an icon dependency.
          hint: `${ICON_OPTIONS.length} available`,
          value: element.glyph,
          options: ICON_OPTIONS,
          onChange: (v) => el({ glyph: v }),
        },
        {
          kind: 'range',
          label: 'Size',
          hint: px(element.fs),
          value: element.fs,
          min: 14,
          max: 72,
          step: 1,
          onChange: (v) => el({ fs: v }),
        },
        {
          kind: 'color',
          label: 'Colour',
          value: element.color,
          swatches: DEFAULT_SWATCHES,
          onChange: (v) => el({ color: v }),
        },
      )
      break
  }

  const kicker =
    panel.type === 'carousel'
      ? `Panel ${index + 1} · slide ${slide + 1} element`
      : `Panel ${index + 1} element`

  return {
    kicker,
    title: ELEMENT_TITLES[element.type],
    fields,
    canDelete: true,
  }
}

/* --------------------------------------------------------------- entry point */

/**
 * Priority order, as the design specifies: the selected element, else the
 * selected panel, else the template.
 */
export function inspectorModel(state: EditorState): InspectorModel {
  const panel = selectedPanel(state)
  const element = selectedElement(state)
  const host = activeHost(state)

  if (panel && element && host) return elementFields(state, panel, host, element)
  if (panel) return panelFields(state, panel)
  return templateFields(state)
}
