// Without a native equivalent: a few settings that set every parameter of pre-data.txt.
import type { RibGeometry } from '@lepara/format';
import {
  cellCount,
  generateGeometry,
  wingArea,
  type GeometryResult,
  type PreprocessorInput,
  type Vault,
} from '@lepara/preprocessor';

/**
 * A few settings that set every parameter of pre-data.txt: elliptic edges,
 * the leading edge with a tip drop, four vault arcs and cells proportional
 * to chord.
 */
export type WingShape = {
  /** Flat area (m²) and aspect ratio. */
  readonly area: number;
  readonly aspectRatio: number;
  /** Tip chord over central chord. */
  readonly taper: number;
  /** The share of the chord lost at the tip that the leading edge takes. */
  readonly sweep: number;
  /** Half span over the edge's ellipse radius: 1 gives a vertical tangent at the tip. */
  readonly leadingEdgeRoundness: number;
  readonly trailingEdgeRoundness: number;
  /**
   * The share of the leading edge's recession at the tip that its first
   * correction takes, square from a share of the half span.
   */
  readonly leadingEdgeDrop: number;
  readonly leadingEdgeDropStart: number;
  /** Total vault angle (deg), and the share of it in the tip arc. */
  readonly tipAngle: number;
  readonly tipCurl: number;
  /** The share of the other arcs' angle in the central arc. */
  readonly centerArc: number;
  readonly cells: number;
  /** The distribution coefficient: 0 for widths proportional to chord, 1 for uniform ones. */
  readonly cellUniformity: number;
};

/** The minimum and maximum of each setting. */
export const SHAPE_LIMITS: Readonly<Record<keyof WingShape, readonly [number, number]>> = {
  area: [10, 40],
  aspectRatio: [3, 8],
  taper: [0.1, 0.8],
  sweep: [0.05, 0.95],
  leadingEdgeRoundness: [0.4, 0.98],
  trailingEdgeRoundness: [0.4, 0.98],
  leadingEdgeDrop: [0, 0.4],
  leadingEdgeDropStart: [0.4, 0.9],
  tipAngle: [40, 120],
  tipCurl: [0.1, 0.7],
  centerArc: [0.1, 0.6],
  cells: [10, 99],
  cellUniformity: [0, 1],
};

/** The settings of the documented 1.6 example, rounded. */
export const SHAPE_DEFAULTS: WingShape = {
  area: 25,
  aspectRatio: 5.3,
  taper: 0.24,
  sweep: 0.72,
  leadingEdgeRoundness: 0.81,
  trailingEdgeRoundness: 0.64,
  leadingEdgeDrop: 0.32,
  leadingEdgeDropStart: 0.65,
  tipAngle: 90,
  tipCurl: 0.39,
  centerArc: 0.28,
  cells: 50,
  cellUniformity: 0.7,
};

/** A part of the parameters that a shape can replace. */
export type ShapePart = Exclude<keyof PreprocessorInput, 'name'>;

/**
 * Shares of the vault length per arc, and of the angle of the two middle
 * arcs per middle arc, as in the 1.6 example.
 */
const ARC_LENGTHS = [0.35, 0.33, 0.21, 0.11] as const;
const MIDDLE_ANGLES = [0.37 / 0.72, 0.35 / 0.72] as const;

/** The vault arcs of `shape`, by their share of the vault length and their angle (deg). */
export function vaultArcs(
  shape: Pick<WingShape, 'tipAngle' | 'tipCurl' | 'centerArc'>,
): { length: number; angle: number }[] {
  const inner = (1 - shape.tipCurl) * shape.tipAngle;
  const middle = (1 - shape.centerArc) * inner;
  return [
    shape.centerArc * inner,
    MIDDLE_ANGLES[0] * middle,
    MIDDLE_ANGLES[1] * middle,
    shape.tipCurl * shape.tipAngle,
  ].map((angle, i) => ({ length: ARC_LENGTHS[i], angle }));
}

/** An edge ellipse's recession at the tip, over its vertical radius. */
export const depth = (roundness: number) => 1 - Math.sqrt(1 - roundness ** 2);
/** To 0.01 cm or degree, as the documented example. */
const round = (value: number) => Math.round(value * 100) / 100;
export const clamp = (key: keyof WingShape, value: number) =>
  Math.min(SHAPE_LIMITS[key][1], Math.max(SHAPE_LIMITS[key][0], value));
/**
 * `value` clamped, but past a limit by the rounding of the parameters only:
 * the shape of parameters set at a limit reads back as the same parameters.
 */
const read = (key: keyof WingShape, value: number) => {
  const [min, max] = SHAPE_LIMITS[key];
  return Math.abs(clamp(key, value) - value) <= 1e-3 * (max - min) ? value : clamp(key, value);
};

/**
 * The shape of valid parameters, clamped to the limits but for rounding; the
 * ones it cannot express keep a default.
 */
export function shapeOf(input: PreprocessorInput, result: GeometryResult): WingShape {
  const { leadingEdge: le, trailingEdge: te, vault, distribution: d } = input;
  const chord = le.b + te.b - te.offset;
  // The central leading edge is at y = 0: tipLE is its recession.
  const tipLE = result.curves.leadingEdge.at(-1)![1];
  const tipTE = result.curves.trailingEdge.at(-1)![1];
  const loss = chord - (tipTE - tipLE);
  const arcs = vault.mode === 2 ? vault.arcs : undefined;
  const tipAngle = arcs?.reduce((sum, arc) => sum + arc.angle, 0) ?? result.ribs.at(-1)!.beta;
  return {
    area: read('area', result.metrics.flatArea),
    aspectRatio: read('aspectRatio', result.metrics.flatAspectRatio),
    taper: read('taper', (tipTE - tipLE) / chord),
    sweep: read('sweep', loss > 0 ? tipLE / loss : 0.5),
    leadingEdgeRoundness: read('leadingEdgeRoundness', input.halfSpan / le.a),
    trailingEdgeRoundness: read('trailingEdgeRoundness', input.halfSpan / te.a),
    leadingEdgeDrop: read('leadingEdgeDrop', tipLE > 0 ? le.correction1 / tipLE : 0),
    leadingEdgeDropStart: read('leadingEdgeDropStart', le.x1 / input.halfSpan),
    tipAngle: read('tipAngle', tipAngle),
    tipCurl: read('tipCurl', arcs ? arcs[3].angle / tipAngle : 0.4),
    centerArc: read('centerArc', arcs ? arcs[0].angle / (tipAngle - arcs[3].angle) : 0.28),
    cells: read('cells', cellCount(d)),
    cellUniformity: read(
      'cellUniformity',
      d.mode === 2 || d.mode === 3 ? d.coefficient : d.mode === 1 ? 1 : 0.7,
    ),
  };
}

/** The settings a rib table gives: the others are not in it. */
export type RibShape = Partial<
  Pick<WingShape, 'area' | 'aspectRatio' | 'taper' | 'sweep' | 'tipAngle' | 'cells'>
>;

/**
 * The settings of a rib table as section 1 of leparagliding.txt has it (half
 * wing from the center, before Wing scale): its area, aspect ratio, taper,
 * sweep, vault angle and cells, clamped to the limits. A table without a
 * positive chord gives none, and one without chord loss or vault angle no
 * sweep or tip angle.
 */
export function shapeOfRibs(
  ribs: readonly Pick<RibGeometry, 'x' | 'yLE' | 'yTE' | 'beta'>[],
  cells: number,
): RibShape {
  const center = ribs[0];
  const tip = ribs.at(-1);
  const valid = ribs.every(
    (rib) => [rib.x, rib.yLE, rib.yTE, rib.beta].every(Number.isFinite) && rib.yTE > rib.yLE,
  );
  const area = valid && ribs.length > 1 ? wingArea(ribs, 'x') : 0;
  if (!center || !tip || !(area > 0) || !Number.isInteger(cells)) return {};
  const chord = center.yTE - center.yLE;
  const tipChord = tip.yTE - tip.yLE;
  const loss = chord - tipChord;
  return {
    area: clamp('area', area),
    aspectRatio: clamp('aspectRatio', (tip.x / 50) ** 2 / area),
    taper: clamp('taper', tipChord / chord),
    ...(loss > 0 && { sweep: clamp('sweep', (tip.yLE - center.yLE) / loss) }),
    ...(tip.beta > 0 && { tipAngle: clamp('tipAngle', tip.beta) }),
    cells: clamp('cells', cells),
  };
}

/**
 * The parameters of `shape`, rounded, with the name and the unused correction
 * starts and exponents of `base`.
 */
export function fromShape(shape: WingShape, base: PreprocessorInput): PreprocessorInput {
  const halfSpan = round(50 * Math.sqrt(shape.area * shape.aspectRatio));
  const [a0, a1, a2, a3] = vaultArcs(shape).map(({ length, angle }) => ({
    radius: round((length * halfSpan) / ((round(angle) * Math.PI) / 180)),
    angle: round(angle),
  }));
  // `r` rounds the final parameters, after the chord is found without rounding.
  const withChord = (chord: number, r = (value: number) => value): PreprocessorInput => {
    const loss = (1 - shape.taper) * chord;
    // The tip drop takes its share of the leading edge's recession, rounded, and the ellipse the rest.
    const tipLE = shape.sweep * loss;
    const drop = r(shape.leadingEdgeDrop * tipLE);
    const leB = r((tipLE - drop) / depth(shape.leadingEdgeRoundness));
    const teB = r(((1 - shape.sweep) * loss) / depth(shape.trailingEdgeRoundness));
    const start = (x: number) => r(Math.min(x, halfSpan / 2));
    const x1 = r(shape.leadingEdgeDropStart * halfSpan);
    return {
      name: base.name,
      halfSpan,
      leadingEdge: {
        ...base.leadingEdge,
        a: r(halfSpan / shape.leadingEdgeRoundness),
        b: leB,
        x1,
        // The second correction is unused: its start only has to follow the first.
        x2: base.leadingEdge.x2 >= x1 && base.leadingEdge.x2 < halfSpan ? base.leadingEdge.x2 : x1,
        correction1: drop,
        exponent1: 2,
        correction2: 0,
      },
      trailingEdge: {
        ...base.trailingEdge,
        a: r(halfSpan / shape.trailingEdgeRoundness),
        b: teB,
        x1: start(base.trailingEdge.x1),
        correction: 0,
        offset: r(leB + teB - chord),
      },
      vault: { mode: 2, arcs: [a0, a1, a2, a3] },
      distribution: { mode: 3, cells: shape.cells, coefficient: shape.cellUniformity },
    };
  };
  // Cell positions follow the chord ratios: the area is proportional to the central chord.
  const unit = withChord(100);
  const result = generateGeometry(unit);
  return withChord(result.ok ? (100 * shape.area) / result.value.metrics.flatArea : 100, round);
}

/**
 * Two parameter sets equal within rounding: of each parameter to 0.01, and
 * of the half span, which the radii and heights amplify (0.01 cm of span
 * moves a 700 cm radius by 0.02 cm).
 */
const close = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) <= 0.015 + 1e-4 * Math.max(Math.abs(a), Math.abs(b))
    : typeof a === 'object' && typeof b === 'object' && a !== null && b !== null
      ? Object.keys(a).length === Object.keys(b).length &&
        Object.entries(a).every(([key, value]) => close(value, (b as Record<string, unknown>)[key]))
      : a === b;

const PARTS: readonly ShapePart[] = [
  'halfSpan',
  'leadingEdge',
  'trailingEdge',
  'vault',
  'distribution',
];

/**
 * Arcs by length and angle: an angle read back from rounded ones can round
 * 0.01 apart, which moves the radius of the same length by far more.
 */
const arcLengths = (vault: Vault) =>
  vault.mode === 2
    ? vault.arcs.map(({ radius, angle }) => ({ length: (radius * angle * Math.PI) / 180, angle }))
    : vault;

/** The parts of `input`, its parameters, that `shape` replaces: none when they are a shape's. */
export function shapeLosses(shape: WingShape, input: PreprocessorInput): ShapePart[] {
  const shaped = fromShape(shape, input);
  return PARTS.filter((part) =>
    part === 'vault'
      ? !close(arcLengths(shaped.vault), arcLengths(input.vault))
      : !close(shaped[part], input[part]),
  );
}
