/*
 * react-bannerkit - root entry.
 *
 * Types and document helpers only. No React, no DOM: this entry is safe to
 * import from a server route, a migration script, or an edge function that
 * needs to validate or transform a stored template.
 *
 *   import { BannerBuilder }  from 'react-bannerkit/builder'   // the editor
 *   import { BannerRenderer } from 'react-bannerkit/renderer'  // the output
 */

export type {
  AlignMain,
  BackgroundMode,
  BannerBreakpoint,
  BannerElement,
  BannerElementType,
  BannerNode,
  BannerPanel,
  BannerPosition,
  BannerSlide,
  BannerSplit,
  BannerTemplate,
  BreakpointName,
  ButtonElement,
  ButtonVariant,
  CarouselPagination,
  CarouselTransition,
  DeviceSpec,
  FontWeight,
  FrameHeightUnit,
  HeadingElement,
  IconElement,
  ImageElement,
  ImageFit,
  LinkElement,
  OverlayElement,
  OverlayMode,
  PanelKind,
  Rect,
  SizeMode,
  SpacerElement,
  SplitDirection,
  TextAlign,
  TextElement,
} from './core/types'

export { BREAKPOINT_ORDER, CURRENT_SCHEMA_VERSION, DEVICES, designWidthOf } from './core/types'

export {
  DEFAULT_SWATCHES,
  PLACEHOLDER_IMAGE,
  createDefaultTemplate,
  createElement,
  createPanel,
} from './core/defaults'
export type { CreatePanelOptions, CreateTemplateOptions } from './core/defaults'

export { createSequentialIdFactory, makeId } from './core/ids'
export type { IdFactory } from './core/ids'

export { normalizeTemplate } from './core/normalize'
export type { NormalizeOptions } from './core/normalize'

export {
  MAX_RATIO,
  MIN_RATIO,
  clampRatio,
  cloneNode,
  countPanels,
  findNode,
  findPanel,
  findParentSplit,
  listPanels,
  removePanel,
  replacePanel,
  setSplitRatio,
  splitPanel,
  updatePanel,
} from './core/tree'
export type { PanelPatch, SplitResult } from './core/tree'

export { MIN_BANNER_HEIGHT, computeLayout, insetStyle, resolveFrameHeight } from './core/layout'
export type { Layout, LayoutDivider, LayoutLeaf, InsetStyle } from './core/layout'
