// pre-data.txt and section 1: the rib table that the native user copies from
// geometry-out.txt into leparagliding.txt.
import type { LepDesign } from '@lepara/format';
import {
  PREPROCESSOR_EXAMPLE,
  type GeometryResult,
  type PreprocessorInput,
} from '@lepara/preprocessor';
import { SHAPE_DEFAULTS, fromShape, shapeOfRibs, type WingShape } from './shape.ts';

/** The rib columns the preprocessor generates; applying it keeps the others. */
export const GENERATED_COLUMNS = ['number', 'x', 'yLE', 'yTE', 'xp', 'z', 'beta'] as const;

/**
 * The native preprocessor writes the rib table with F7.2, which the user
 * copies into leparagliding.txt: generated values are rounded the same way.
 */
const f72 = (value: number) => (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100;
/** Half the last digit of F7.2, with some room for floating-point error. */
const TOLERANCE = 0.005 + 1e-9;
const rounded = <T extends Record<string, number>>(rib: T): T =>
  Object.fromEntries(Object.entries(rib).map(([key, value]) => [key, f72(value)])) as T;

/**
 * Section 1 with the cells and rib table of `result`, keeping the other
 * columns of the existing ribs by row. New rows take the preprocessor's
 * washin settings, and no rotation in an 11-column table.
 */
export function applyGeometry(
  design: Pick<LepDesign, 'geometry'>,
  result: GeometryResult,
): LepDesign['geometry'] {
  const g = design.geometry;
  const rotation = g.ribColumns === 11 ? { rotZ: 0, rotZPosition: 0 } : {};
  return {
    ...g,
    cells: result.cells,
    ribCount: result.cells + 1,
    ribs: result.ribs.map(({ rotationPoint, washin, ...generated }, i) => ({
      ...(g.ribs.at(i) ?? { rotationPoint, washin, ...rotation }),
      ...rounded(generated),
    })),
  };
}

/** Section 1 has the rib table of `result`, as written by the native preprocessor or by `applyGeometry`. */
export function isGeneratedGeometry(
  design: Pick<LepDesign, 'geometry'>,
  result: GeometryResult,
): boolean {
  const g = design.geometry;
  return (
    g.cells === result.cells &&
    g.ribCount === result.cells + 1 &&
    g.ribs.length === result.ribs.length &&
    g.ribs.every((rib, i) =>
      GENERATED_COLUMNS.every((key) => Math.abs(rib[key] - result.ribs[i][key]) <= TOLERANCE),
    )
  );
}

/** `shape` with the settings the rib table of section 1 gives: the others stay. */
export function fitShape(shape: WingShape, design: Pick<LepDesign, 'geometry'>): WingShape {
  const { ribs, cells } = design.geometry;
  return { ...shape, ...shapeOfRibs(ribs, cells) };
}

/** The parameters a new pre-data.txt starts from: the default shape, with the wing name of section 1. */
export function newPreData(design: Pick<LepDesign, 'geometry'>): PreprocessorInput {
  const input = fromShape(SHAPE_DEFAULTS, PREPROCESSOR_EXAMPLE);
  return { ...input, name: design.geometry.wingName.trim() || input.name };
}
