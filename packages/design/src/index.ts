export {
  SHAPE_DEFAULTS,
  SHAPE_LIMITS,
  fromShape,
  shapeLosses,
  shapeOf,
  shapeOfRibs,
  type RibShape,
  type ShapePart,
  type WingShape,
} from './shape.ts';
export { wingMetrics, type WingMetrics } from './metrics.ts';
export {
  GENERATED_COLUMNS,
  applyGeometry,
  fitShape,
  isGeneratedGeometry,
  newPreData,
} from './pre-data.ts';
export { SEAM_CONVENTIONS, type EndSeam, type RibSeamLayer } from './seam-conventions.ts';
