import { describe, expect, test } from 'vitest'
import { createDefaultTemplate } from '../../core/defaults'
import { createSequentialIdFactory } from '../../core/ids'
import { findPanel, listPanels } from '../../core/tree'
import { inspectorModel, type Field } from './inspector'
import { createEditorState, editorReducer, template, type EditorAction, type EditorState } from './reducer'

const ids = () => createSequentialIdFactory('i')
const start = () => createEditorState(createDefaultTemplate({ id: ids() }), ids())
const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state)
const rootId = (s: EditorState) => template(s).breakpoints[s.breakpoint].root.id

const labels = (state: EditorState) => inspectorModel(state).fields.map((f) => f.label)
const field = (state: EditorState, label: string): Field => {
  const found = inspectorModel(state).fields.find((f) => f.label === label)
  if (!found) throw new Error(`no field labelled "${label}" in [${labels(state).join(', ')}]`)
  return found
}

/** Applies a field's change and returns the resulting state. */
function change(state: EditorState, label: string, value: never): EditorState {
  const target = field(state, label)
  if (!('onChange' in target)) throw new Error(`field "${label}" has no onChange`)
  return editorReducer(state, target.onChange(value))
}

describe('with the template selected', () => {
  test('shows the template settings', () => {
    const s = start()
    const model = inspectorModel(s)
    expect(model.title).toBe('Template settings')
    expect(labels(s)).toContain('Template name')
    expect(labels(s)).toContain('Space between panels')
  })

  test('editing the name updates the document', () => {
    const s = change(start(), 'Template name', 'Spring sale' as never)
    expect(template(s).name).toBe('Spring sale')
  })

  test('offers a pixel height in fixed mode and a share of the screen in viewport mode', () => {
    const fixed = start()
    expect(labels(fixed)).toContain('Height')
    expect(labels(fixed)).not.toContain('Share of screen')

    const viewport = change(fixed, 'Height mode', 'vh' as never)
    expect(labels(viewport)).toContain('Share of screen')
    expect(labels(viewport)).not.toContain('Height')
  })

  test('the gutter field is bounded to the range the renderer honours', () => {
    const gutter = field(start(), 'Space between panels')
    expect(gutter.kind).toBe('range')
    if (gutter.kind !== 'range') throw new Error('expected a range')
    expect([gutter.min, gutter.max]).toEqual([0, 48])
  })

  test('the frame colour offers transparent, since that is what shows in the gutter', () => {
    const colour = field(start(), 'Colour behind panels')
    if (colour.kind !== 'color') throw new Error('expected a colour field')
    expect(colour.allowTransparent).toBe(true)
  })
})

describe('with a panel selected', () => {
  const withPanel = () => {
    const s = start()
    return run(s, { type: 'selectPanel', panelId: rootId(s) })
  }

  test('names the panel by its position in the layout', () => {
    const s = start()
    const split = editorReducer(s, { type: 'splitPanel', panelId: rootId(s), dir: 'cols' })
    const second = listPanels(template(split).breakpoints.laptop.root)[1]!
    const model = inspectorModel(editorReducer(split, { type: 'selectPanel', panelId: second.id }))
    expect(model.title).toBe('Panel 2')
  })

  test('shows the box and alignment controls', () => {
    const s = withPanel()
    expect(labels(s)).toEqual(
      expect.arrayContaining(['Banner type', 'Background', 'Padding', 'Gap', 'Horizontal', 'Vertical']),
    )
  })

  test('hides the carousel controls until the panel is a carousel', () => {
    const single = withPanel()
    expect(labels(single)).not.toContain('Autoplay')

    const carousel = change(single, 'Banner type', 'carousel' as never)
    expect(labels(carousel)).toEqual(
      expect.arrayContaining(['Autoplay', 'Slide duration', 'Transition', 'Loop', 'Pagination']),
    )
  })

  test('a single panel gets one destination; a carousel gets one per slide', () => {
    const single = withPanel()
    expect(labels(single)).toContain('Banner links to')

    const carousel = change(single, 'Banner type', 'carousel' as never)
    expect(labels(carousel)).not.toContain('Banner links to')
    expect(labels(carousel)).toContain('Slide 1 links to')
  })

  test('the slide destination follows the slide being edited', () => {
    const s = withPanel()
    const carousel = change(s, 'Banner type', 'carousel' as never)
    const panelId = rootId(s)
    const onSlideTwo = editorReducer(carousel, { type: 'setSlideCursor', panelId, slide: 1 })
    expect(labels(onSlideTwo)).toContain('Slide 2 links to')
  })

  test('explains why the last panel cannot be deleted', () => {
    const model = inspectorModel(withPanel())
    expect(model.canDelete).toBe(false)
    expect(model.note).toMatch(/at least one panel/i)
  })

  test('allows deleting once there is more than one panel', () => {
    const s = start()
    const split = editorReducer(s, { type: 'splitPanel', panelId: rootId(s), dir: 'cols' })
    expect(inspectorModel(split).canDelete).toBe(true)
  })

  test('changing the background mode to colour keeps the colour field usable', () => {
    const s = change(withPanel(), 'Background', 'color' as never)
    const panel = findPanel(template(s).breakpoints.laptop.root, rootId(s))!
    expect(panel.bgMode).toBe('color')
    expect(labels(s)).toContain('Background colour')
  })
})

describe('with an element selected', () => {
  const selectFirst = (type: string) => {
    const s = start()
    const id = rootId(s)
    const panel = findPanel(template(s).breakpoints.laptop.root, id)!
    const element = panel.elements.find((e) => e.type === type)
    if (!element) throw new Error(`no ${type} in the default template`)
    return run(s, { type: 'selectElement', panelId: id, elementId: element.id })
  }

  test('titles the inspector with the element type', () => {
    expect(inspectorModel(selectFirst('heading')).title).toBe('Heading')
  })

  test('shows the typography fields for a heading', () => {
    expect(labels(selectFirst('heading'))).toEqual(
      expect.arrayContaining(['Content', 'Size', 'Weight', 'Align', 'Measure', 'Colour']),
    )
  })

  test('editing content writes straight to the document', () => {
    const s = change(selectFirst('heading'), 'Content', 'New words' as never)
    const panel = findPanel(template(s).breakpoints.laptop.root, rootId(s))!
    const heading = panel.elements.find((e) => e.type === 'heading')
    expect(heading?.type === 'heading' && heading.text).toBe('New words')
  })

  test('an overlay cannot be positioned freely, because it covers the panel', () => {
    expect(labels(selectFirst('overlay'))).not.toContain('Position')
  })

  test('other elements offer a position, with coordinates only once free', () => {
    const inStack = selectFirst('heading')
    expect(labels(inStack)).toContain('Position')
    expect(labels(inStack)).not.toContain('X')

    const free = change(inStack, 'Position', true as never)
    expect(labels(free)).toEqual(expect.arrayContaining(['X', 'Y']))
  })

  test('returning to the stack removes the coordinates again', () => {
    const free = change(selectFirst('heading'), 'Position', true as never)
    const back = change(free, 'Position', false as never)
    expect(labels(back)).not.toContain('X')
  })

  test('a button offers a destination and a style', () => {
    const s = start()
    const id = rootId(s)
    const panel = findPanel(template(s).breakpoints.laptop.root, id)!
    const button = panel.elements.find((e) => e.type === 'button')!
    const selected = run(s, { type: 'selectElement', panelId: id, elementId: button.id })
    expect(labels(selected)).toEqual(expect.arrayContaining(['Label', 'Destination', 'Style']))
  })

  test('an image offers alt text, because the handoff had none', () => {
    const s = start()
    const id = rootId(s)
    const withImage = run(
      s,
      { type: 'selectPanel', panelId: id },
      { type: 'addElement', elementType: 'image' },
    )
    expect(labels(withImage)).toContain('Alt text')
  })

  test('an icon offers a glyph picker limited to what the renderer can draw', () => {
    const s = start()
    const withIcon = run(
      s,
      { type: 'selectPanel', panelId: rootId(s) },
      { type: 'addElement', elementType: 'icon' },
    )
    const glyph = field(withIcon, 'Glyph')
    expect(glyph.kind).toBe('icon')
    if (glyph.kind !== 'icon') throw new Error('expected an icon field')
    expect(glyph.options.length).toBeGreaterThan(10)
  })
})

describe('every field is wired to a real action', () => {
  test('no field silently does nothing', () => {
    /*
     * A field that renders but is not connected looks like a broken editor and
     * is easy to introduce when adding a control. Walking every field of every
     * selection and applying its change catches that immediately.
     */
    const s = start()
    const id = rootId(s)
    const states: EditorState[] = [
      s,
      run(s, { type: 'selectPanel', panelId: id }),
      run(s, { type: 'selectPanel', panelId: id }, { type: 'updatePanel', patch: { type: 'carousel' } }),
    ]
    const panel = findPanel(template(s).breakpoints.laptop.root, id)!
    for (const element of panel.elements) {
      states.push(run(s, { type: 'selectElement', panelId: id, elementId: element.id }))
    }

    /*
     * Feeds each field a value of its own shape. The cast is unavoidable: a
     * field's value type and its handler's parameter type always agree, but the
     * Field union cannot express that correlation, so TypeScript sees a union of
     * incompatible call signatures.
     */
    const exercise = (f: Field): EditorAction => {
      const call = f.onChange as (value: unknown) => EditorAction
      if (f.kind === 'segmented') {
        const first = f.options[0]
        if (!first) throw new Error(`${f.label} has no options`)
        return call(first.value)
      }
      return call(f.value)
    }

    for (const state of states) {
      for (const f of inspectorModel(state).fields) {
        expect(typeof f.onChange, `${f.label} onChange`).toBe('function')
        const action = exercise(f)
        expect(action, `${f.label} produced no action`).toBeTruthy()
        expect(() => editorReducer(state, action), `${f.label} threw`).not.toThrow()
      }
    }
  })
})
