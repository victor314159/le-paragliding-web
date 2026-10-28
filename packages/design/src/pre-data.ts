// pre-data.txt and section 1: the rib table that the native user copies from
// geometry-out.txt into leparagliding.txt.
import type { LepDesign, RibGeometry } from '@lepara/format';
import {
  PREPROCESSOR_EXAMPLE,
  generateGeometry,
  type GeometryResult,
  type PreprocessorInput,
} from '@lepara/preprocessor';
import {
  SHAPE_DEFAULTS,
  SHAPE_LIMITS,
  clamp,
  depth,
  fromShape,
  shapeOfRibs,
  vaultArcs,
  type WingShape,
} from './shape.ts';

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
 * The settings a rib table does not give, but the leading edge's and the
 * vault's, each with the columns it moves most: cells first, since the
 * others are compared rib by rib.
 */
const FITTED: readonly [keyof WingShape, readonly RibColumn[]][] = [
  ['cellUniformity', ['x']],
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
 * The leading edge settings closest to a rib table's edge. Over the half span
 * and the recession at the tip, the edge depends on them alone, and on the
 * drop linearly: least squares give the drop of each roundness and start.
 * None without a recession at the tip.
 */
function fitLeadingEdge(ribs: readonly Pick<RibGeometry, 'x' | 'yLE'>[]): Partial<WingShape> {
  const [center, tip] = [ribs[0], ribs.at(-1)!];
  const tipLE = tip.yLE - center.yLE;
  if (!(tipLE > 0) || !(tip.x > 0)) return {};
  const points = ribs.map((rib) => [rib.x / tip.x, (rib.yLE - center.yLE) / tipLE] as const);
  /** The drop of a roundness and start, and its error: the recession is ellipse + drop·(curve − ellipse). */
  const fit = (roundness: number, start: number) => {
    const at = points.map(([t, recession]) => {
      const ellipse = (1 - Math.sqrt(1 - (roundness * t) ** 2)) / depth(roundness);
      const curve = t > start ? ((t - start) / (1 - start)) ** 2 : 0;
      return { offset: recession - ellipse, slope: curve - ellipse };
    });
    const sum = (f: (point: (typeof at)[number]) => number) =>
      at.reduce((total, point) => total + f(point), 0);
    const den = sum((p) => p.slope ** 2);
    const drop = clamp('leadingEdgeDrop', den > 0 ? sum((p) => p.offset * p.slope) / den : 0);
    return { drop, error: sum((p) => (p.offset - drop * p.slope) ** 2) };
  };
  const roundnessAt = (start: number) =>
    minimize('leadingEdgeRoundness', (roundness) => fit(roundness, start).error);
  const start = minimize('leadingEdgeDropStart', (s) => fit(roundnessAt(s), s).error);
  const roundness = roundnessAt(start);
  return {
    leadingEdgeRoundness: roundness,
    leadingEdgeDrop: fit(roundness, start).drop,
    leadingEdgeDropStart: start,
  };
}

/**
 * The vault settings closest to a rib table's vault. Over the half span, the
 * vault depends on them alone, and each rib is at its x along the arcs: its
 * position follows from the angle it reaches there.
 */
function fitVault(ribs: readonly Pick<RibGeometry, 'x' | 'xp' | 'z'>[]): Partial<WingShape> {
  const span = ribs.at(-1)!.x;
  if (!(span > 0)) return {};
  const error = (vault: Pick<WingShape, 'tipAngle' | 'tipCurl' | 'centerArc'>) => {
    const arcs = vaultArcs(vault).map(({ length, angle }) => ({
      length,
      angle: (angle * Math.PI) / 180,
    }));
    return ribs.reduce((sum, rib) => {
      // An arc from inclination a to b over a length l, of radius l / (b - a).
      let [xp, z, at, inclination] = [0, 0, rib.x / span, 0];
      for (const arc of arcs) {
        const length = Math.min(at, arc.length);
        const next = inclination + (arc.angle * length) / arc.length;
        const radius = arc.length / arc.angle;
        xp += radius * (Math.sin(next) - Math.sin(inclination));
        z += radius * (Math.cos(inclination) - Math.cos(next));
        [at, inclination] = [at - length, next];
      }
      return sum + (xp - rib.xp / span) ** 2 + (z - rib.z / span) ** 2;
    }, 0);
  };
  const centerAt = (tipAngle: number, tipCurl: number) =>
    minimize('centerArc', (centerArc) => error({ tipAngle, tipCurl, centerArc }));
  const curlAt = (tipAngle: number) =>
    minimize('tipCurl', (tipCurl) =>
      error({ tipAngle, tipCurl, centerArc: centerAt(tipAngle, tipCurl) }),
    );
  const tipAngle = minimize('tipAngle', (angle) => {
    const tipCurl = curlAt(angle);
    return error({ tipAngle: angle, tipCurl, centerArc: centerAt(angle, tipCurl) });
  });
  const tipCurl = curlAt(tipAngle);
  return { tipAngle, tipCurl, centerArc: centerAt(tipAngle, tipCurl) };
}

/**
 * `shape` with the settings the rib table of section 1 gives, and the
 * others set to follow its cells, vault and edges as closely as they can.
 * Each part needs its columns: without a valid planform the others stay,
 * without its whole vault the vault's, and without its cell count within the
 * limits the cells' and trailing edge's.
 */
export function fitShape(shape: WingShape, design: Pick<LepDesign, 'geometry'>): WingShape {
  const { ribs, cells } = design.geometry;
  const given = shapeOfRibs(ribs, cells);
  if (given.area === undefined) return { ...shape, ...given };
  let fitted: WingShape = {
    ...shape,
    ...given,
    ...fitLeadingEdge(ribs),
    ...(ribs.every((rib) => Number.isFinite(rib.xp) && Number.isFinite(rib.z)) && fitVault(ribs)),
  };
  // The others are compared with the ribs Auto generates: the same count.
  if (given.cells !== cells) return fitted;
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
