// An extension, without a native equivalent: a few settings that set every parameter.
import { generateGeometry, wingArea } from './geometry.ts';
import type { GeneratedRib, GeometryResult, PreprocessorInput, Vault } from './model.ts';
import { cellCount } from './validate.ts';

/**
 * A few settings that set every parameter of pre-data.txt: elliptic edges
 * without corrections, four vault arcs and cells proportional to chord.
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
  /** Total vault angle (deg), and the share of it in the tip arc. */
  readonly tipAngle: number;
  readonly tipCurl: number;
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
  tipAngle: [40, 120],
  tipCurl: [0.1, 0.7],
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
  tipAngle: 90,
  tipCurl: 0.39,
  cells: 50,
  cellUniformity: 0.7,
};

/** A part of the parameters that a shape can replace. */
export type ShapePart = Exclude<keyof PreprocessorInput, 'name'>;

/** Shares of the vault length per arc, and of the inner angle per inner arc, as in the 1.6 example. */
const ARC_LENGTHS = [0.35, 0.33, 0.21, 0.11] as const;
const INNER_ANGLES = [0.28, 0.37, 0.35] as const;

/** An edge ellipse's recession at the tip, over its vertical radius. */
const depth = (roundness: number) => 1 - Math.sqrt(1 - roundness ** 2);
/** To 0.01 cm or degree, as the documented example. */
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (key: keyof WingShape, value: number) =>
  Math.min(SHAPE_LIMITS[key][1], Math.max(SHAPE_LIMITS[key][0], value));

/** The shape of valid parameters, clamped to the limits; the ones it cannot express keep a default. */
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
    area: clamp('area', result.metrics.flatArea),
    aspectRatio: clamp('aspectRatio', result.metrics.flatAspectRatio),
    taper: clamp('taper', (tipTE - tipLE) / chord),
    sweep: clamp('sweep', loss > 0 ? tipLE / loss : 0.5),
    leadingEdgeRoundness: clamp('leadingEdgeRoundness', input.halfSpan / le.a),
    trailingEdgeRoundness: clamp('trailingEdgeRoundness', input.halfSpan / te.a),
    tipAngle: clamp('tipAngle', tipAngle),
    tipCurl: clamp('tipCurl', arcs ? arcs[3].angle / tipAngle : 0.4),
    cells: clamp('cells', cellCount(d)),
    cellUniformity: clamp(
      'cellUniformity',
      d.mode === 2 || d.mode === 3 ? d.coefficient : d.mode === 1 ? 1 : 0.7,
    ),
  };
}

/**
 * The shape of a rib table as section 1 of leparagliding.txt has it (half
 * wing from the center, before Wing scale): its area, aspect ratio, taper,
 * sweep, vault angle and cells, clamped to the limits. The other settings
 * keep SHAPE_DEFAULTS, and so does a table without a positive chord.
 */
export function shapeOfRibs(
  ribs: readonly Pick<GeneratedRib, 'x' | 'yLE' | 'yTE' | 'beta'>[],
  cells: number,
): WingShape {
  const center = ribs[0];
  const tip = ribs.at(-1);
  const valid = ribs.every(
    (rib) => [rib.x, rib.yLE, rib.yTE, rib.beta].every(Number.isFinite) && rib.yTE > rib.yLE,
  );
  const area = valid && ribs.length > 1 ? wingArea(ribs, 'x') : 0;
  if (!center || !tip || !(area > 0) || !Number.isInteger(cells)) return SHAPE_DEFAULTS;
  const chord = center.yTE - center.yLE;
  const tipChord = tip.yTE - tip.yLE;
  const loss = chord - tipChord;
  return {
    ...SHAPE_DEFAULTS,
    area: clamp('area', area),
    aspectRatio: clamp('aspectRatio', (tip.x / 50) ** 2 / area),
    taper: clamp('taper', tipChord / chord),
    sweep: loss > 0 ? clamp('sweep', (tip.yLE - center.yLE) / loss) : SHAPE_DEFAULTS.sweep,
    tipAngle: tip.beta > 0 ? clamp('tipAngle', tip.beta) : SHAPE_DEFAULTS.tipAngle,
    cells: clamp('cells', cells),
  };
}

/** The parameters of `shape`, rounded, with the name and correction starts of `base`. */
export function fromShape(shape: WingShape, base: PreprocessorInput): PreprocessorInput {
  const halfSpan = round(50 * Math.sqrt(shape.area * shape.aspectRatio));
  const arc = (i: number) => {
    const angle = round(
      shape.tipAngle * (i < 3 ? (1 - shape.tipCurl) * INNER_ANGLES[i] : shape.tipCurl),
    );
    return { radius: round((ARC_LENGTHS[i] * halfSpan) / ((angle * Math.PI) / 180)), angle };
  };
  // `r` rounds the final parameters, after the chord is found without rounding.
  const withChord = (chord: number, r = (value: number) => value): PreprocessorInput => {
    const loss = (1 - shape.taper) * chord;
    const leB = r((shape.sweep * loss) / depth(shape.leadingEdgeRoundness));
    const teB = r(((1 - shape.sweep) * loss) / depth(shape.trailingEdgeRoundness));
    const start = (x: number) => r(Math.min(x, halfSpan / 2));
    return {
      name: base.name,
      halfSpan,
      leadingEdge: {
        ...base.leadingEdge,
        a: r(halfSpan / shape.leadingEdgeRoundness),
        b: leB,
        x1: start(base.leadingEdge.x1),
        x2: start(base.leadingEdge.x2),
        correction1: 0,
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
      vault: { mode: 2, arcs: [arc(0), arc(1), arc(2), arc(3)] },
      distribution: { mode: 3, cells: shape.cells, coefficient: shape.cellUniformity },
    };
  };
  // Cell positions follow the chord ratios: the area is proportional to the central chord.
  const unit = withChord(100);
  const result = generateGeometry(unit);
  return withChord(result.ok ? (100 * shape.area) / result.value.metrics.flatArea : 100, round);
}

/** Two parameter sets equal within rounding. */
const close = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number'
    ? Math.abs(a - b) <= 0.015
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
