/*
 * react-bannerkit/builder
 *
 * The editor. Import its stylesheet once:
 *   import 'react-bannerkit/builder.css'
 */
export { BannerBuilder } from './BannerBuilder'
export type { BannerBuilderProps } from './BannerBuilder'

// The state layer is exported so a consumer can drive the editor from their own
// chrome, or build a custom inspector against the same field descriptors.
export {
  createEditorState,
  editorReducer,
  activeHost,
  currentBreakpoint,
  selectedElement,
  selectedPanel,
  slideCursorOf,
  template,
} from './state/reducer'
export type { EditorAction, EditorState, EditorView, Selection } from './state/reducer'
export { inspectorModel } from './state/inspector'
export type { Field, InspectorModel } from './state/inspector'
export { canRedo, canUndo } from './state/history'
