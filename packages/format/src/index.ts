// @lepara/format: LEparagliding 3.29 input files as typed objects. Pure
// functions over text, without dependencies: browsers, Workers and Node.
export { DESIGN_FILE, locateLep, parseLep } from './read-design.ts';
export type { FieldPosition } from './read-design.ts';
export { writeLep } from './write-design.ts';
export { airfoilFormat, parseAirfoil, writeAirfoil } from './airfoil.ts';
export type { LepAirfoil, Point } from './airfoil.ts';
export { validate, validateDesign } from './validate.ts';
export type { LepProject } from './validate.ts';
export { readProject } from './project.ts';
export {
  DXF2D_DEFAULTS,
  DXF3D_DEFAULTS,
  LINE_TYPES_DEFAULTS,
  PARTS_SEPARATION_DEFAULTS,
  SECTIONS,
} from './sections.ts';
export type { ProjectReading } from './project.ts';
export type { Diagnostic, Result } from './result.ts';
export type * from './model.ts';
