// pre-data.txt and section 1: the rib table that the native user copies from
// geometry-out.txt into leparagliding.txt.
import type { LepDesign } from '@lepara/format';
import {
  PREPROCESSOR_EXAMPLE,
  generateGeometry,
  type GeometryResult,
  type PreprocessorInput,
} from '@lepara/preprocessor';
import { SHAPE_DEFAULTS, SHAPE_LIMITS, fromShape, shapeOfRibs, type WingShape } from './shape.ts';

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

type RibColumn = 'x' | 'yLE' | 'yTE' | 'xp' | 'z';

/**
 * The settings a rib table does not give, each with the columns it moves
 * most: cells first, since the others are compared rib by rib.
 */
const FITTED: readonly [keyof WingShape, readonly RibColumn[]][] = [
  ['cellUniformity', ['x']],
  ['tipCurl', ['xp', 'z']],
  ['leadingEdgeRoundness', ['yLE']],
  ['trailingEdgeRoundness', ['yTE']],
];
/** The roundness moves the chords, which the cells follow: a second round settles them. */
const ROUNDS = 2;
/** Golden-section steps: 12 narrow a setting to under 1% of its range. */
const STEPS = 12;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/** The value of `key` within its limits that gives the least `error`, by golden-section search. */
function minimize(key: keyof WingShape, error: (value: number) => number): number {
  let [a, b] = SHAPE_LIMITS[key];
  let c = b - GOLDEN * (b - a);
  let d = a + GOLDEN * (b - a);
  let [ec, ed] = [error(c), error(d)];
  for (let i = 0; i < STEPS; i++)
    if (ec < ed) {
      [b, d, ed] = [d, c, ec];
      c = b - GOLDEN * (b - a);
      ec = error(c);
    } else {
      [a, c, ec] = [c, d, ed];
      d = a + GOLDEN * (b - a);
      ed = error(d);
    }
  return (a + b) / 2;
}

/**
 * `shape` with the settings the rib table of section 1 gives, and the
 * others set to follow its cells, vault and edges as closely as they can.
 * Without a valid table, its whole vault or its cell count within the
 * limits, the others stay.
 */
export function fitShape(shape: WingShape, design: Pick<LepDesign, 'geometry'>): WingShape {
  const { ribs, cells } = design.geometry;
  const given = shapeOfRibs(ribs, cells);
  let fitted: WingShape = { ...shape, ...given };
  if (
    given.cells !== cells ||
    !ribs.every((rib) => Number.isFinite(rib.xp) && Number.isFinite(rib.z))
  )
    return fitted;
  /** The squared distance of the `columns` the shape generates to those of the table. */
  const error = (candidate: WingShape, columns: readonly RibColumn[]) => {
    const result = generateGeometry(fromShape(candidate, PREPROCESSOR_EXAMPLE));
    if (!result.ok || result.value.ribs.length !== ribs.length) return Infinity;
    return result.value.ribs.reduce(
      (sum, rib, i) =>
        sum + columns.reduce((s, column) => s + (rib[column] - ribs[i][column]) ** 2, 0),
      0,
    );
  };
  for (let round = 0; round < ROUNDS; round++)
    for (const [key, columns] of FITTED)
      fitted = {
        ...fitted,
        [key]: minimize(key, (value) => error({ ...fitted, [key]: value }, columns)),
      };
  return fitted;
}

/** The parameters a new pre-data.txt starts from: the default shape, with the wing name of section 1. */
export function newPreData(design: Pick<LepDesign, 'geometry'>): PreprocessorInput {
  const input = fromShape(SHAPE_DEFAULTS, PREPROCESSOR_EXAMPLE);
  return { ...input, name: design.geometry.wingName.trim() || input.name };
}
