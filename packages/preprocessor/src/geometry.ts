// Port of Pere Casellas' preprocessor 1.6, with the documented oracle patches.
// Keep its sampling, piecewise interpolation and five distribution iterations.
import type { GeneratedRib, GeometryResult, Point, PreprocessorInput, Result } from './model.ts';
import { cellCount, validatePreprocessor } from './validate.ts';

type Segment = readonly [Point, Point];
const radians = Math.PI / 180;
/** Segments of each vault arc. */
const ARC_SEGMENTS = 99;
const length = ([a, b]: Segment) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const points = (segments: readonly Segment[]): Point[] => [
  ...segments.map(([a]) => a),
  segments.at(-1)![1],
];
const allFinite = (values: readonly number[]) => values.every(Number.isFinite);

function edges(input: PreprocessorInput, leading: boolean): Segment[] {
  const { halfSpan, leadingEdge: le, trailingEdge: te } = input;
  const { a, b } = leading ? le : te;
  const ellipse = (x: number) => b * Math.cos(Math.asin(x / a));
  const power = (at: number, from: number, correction: number, exponent: number) =>
    correction * ((at - from) / (halfSpan - from)) ** exponent;
  // Fortran y (down from the ellipse centre). The original chooses corrections
  // from the segment's START, even for its end.
  const y = leading
    ? (start: number, at: number) =>
        ellipse(at) -
        (start >= le.x1 ? power(at, le.x1, le.correction1, le.exponent1) : 0) -
        (start >= le.x2 ? power(at, le.x2, le.correction2, le.exponent2) : 0)
    : (start: number, at: number) =>
        te.offset -
        ellipse(at) -
        (start >= te.x1 ? power(at, te.x1, te.correction, te.exponent) : 0);
  const segments: Segment[] = [];
  for (let i = 0; i <= 157; i++) {
    const theta = i * 0.01;
    const x = a * Math.sin(theta);
    if (x >= halfSpan) break;
    const next = Math.min(halfSpan, a * Math.sin(Math.min(theta + 0.01, Math.PI / 2)));
    segments.push([
      [x, le.b - y(x, x)],
      [next, le.b - y(x, next)],
    ]);
  }
  return segments;
}

function vaultSegments(input: PreprocessorInput): Segment[] {
  const vault = input.vault;
  const segments: Segment[] = [];
  if (vault.mode === 1) {
    const y = (x: number) => vault.b * Math.sqrt(Math.max(0, 1 - (x / vault.a) ** 2));
    for (let i = 0; i < 300; i++) {
      const x = vault.a * Math.sin(((Math.PI / 2) * i) / 300);
      if (x >= vault.x1) break;
      const next = Math.min(vault.x1, vault.a * Math.sin(((Math.PI / 2) * (i + 1)) / 300));
      segments.push([
        [x, y(x)],
        [next, y(next)],
      ]);
    }
    const y1 = y(vault.x1);
    const point = (i: number): Point => {
      const at = y1 - (y1 / 100) * i;
      return [
        vault.a * Math.sqrt(Math.max(0, 1 - (at / vault.b) ** 2)) +
          vault.correction * (1 - (Math.cos(((y1 - at) * Math.PI) / y1) + 1) * 0.5),
        at,
      ];
    };
    for (let i = 0; i < 100; i++) segments.push([point(i), point(i + 1)]);
  } else {
    let angle = 0;
    let cx = 0;
    let cy = -400;
    let previousRadius = vault.arcs[0].radius;
    for (const arc of vault.arcs) {
      cx += (previousRadius - arc.radius) * Math.sin(angle * radians);
      cy += (previousRadius - arc.radius) * Math.cos(angle * radians);
      const point = (i: number): Point => {
        const theta = (angle + i * (arc.angle / ARC_SEGMENTS)) * radians;
        return [cx + arc.radius * Math.sin(theta), cy + arc.radius * Math.cos(theta)];
      };
      for (let i = 0; i < ARC_SEGMENTS; i++) segments.push([point(i), point(i + 1)]);
      angle += arc.angle;
      previousRadius = arc.radius;
    }
  }
  // The native program reconstructs a polyline from segment starts and the last end.
  const raw = points(segments);
  const total = segments.reduce((sum, segment) => sum + length(segment), 0);
  if (vault.mode === 1 && Math.abs(raw.at(-1)![1]) < 0.0001)
    raw[raw.length - 1] = [raw.at(-1)![0], 0];
  const scale = input.halfSpan / total;
  const center = raw[0][1];
  const scaled = raw.map(([x, y]): Point => [x * scale, (center - y) * scale]);
  return scaled.slice(0, -1).map((point, i): Segment => [point, scaled[i + 1]]);
}

function interpolate(segments: readonly Segment[], x: number): number {
  let value = NaN;
  for (const [a, b] of segments) {
    if (a[0] <= x && b[0] >= x) {
      const slope = (b[1] - a[1]) / (b[0] - a[0]);
      value = slope * x + (a[1] - slope * a[0]);
    }
  }
  return value;
}

/** Rib positions from cell widths, clamped and with the tip pinned to the half span (patch 002). */
function positions(widths: readonly number[], halfSpan: number): number[] {
  let x = widths[0] / 2;
  const xs = widths.map((width, i) => Math.min(i === 0 ? x : (x += width), halfSpan));
  xs[xs.length - 1] = halfSpan;
  return xs;
}

function cellWidths(input: PreprocessorInput, le: readonly Segment[], te: readonly Segment[]) {
  const d = input.distribution;
  const halfSpan = input.halfSpan;
  const cells = cellCount(d);
  const uniform = (2 * halfSpan) / cells;
  const normalize = (widths: readonly number[]) => {
    const factor =
      halfSpan / widths.reduce((sum, width, i) => (i === 0 ? width / 2 : sum + width), 0);
    return widths.map((width) => width * factor);
  };
  let widths = Array.from({ length: Math.floor(cells / 2) + 1 }, (_, i) =>
    i === 0 && cells % 2 === 0 ? 0 : uniform,
  );
  if (d.mode === 4) widths = normalize(d.widths);
  if (d.mode === 2) {
    const decrement = (2 * (1 - d.coefficient)) / cells;
    widths = normalize(
      widths.map((width, i) => width - decrement * uniform * (i + (cells % 2 ? 0.5 : 0))),
    );
  }
  if (d.mode === 3) {
    const chord = input.leadingEdge.b + input.trailingEdge.b - input.trailingEdge.offset;
    for (let iteration = 0; iteration < 5; iteration++) {
      widths = normalize(
        positions(widths, halfSpan).map((x, i) => {
          if (i === 0 && cells % 2 === 0) return 0;
          const local = Math.abs(interpolate(te, x) - interpolate(le, x));
          return (uniform * ((chord - local) * d.coefficient + local)) / chord;
        }),
      );
    }
  }
  return { cells, widths };
}

/**
 * Projected position, height and inclination at vault length x, as the original: the segment
 * whose (start, end] holds x. It never interpolates the first segment, so x there gives zeros
 * (exact at the centre, x = 0). The tip, or x beyond the vault, takes the end of the last one.
 */
function front(vault: readonly Segment[], x: number, tip: boolean) {
  const at = ([a, b]: Segment, ratio: number) => {
    const dx = b[0] - a[0];
    let beta = Math.atan((b[1] - a[1]) / (Math.abs(dx) <= 0.000001 ? dx + 0.00001 : dx)) / radians;
    if (beta === 90) beta += 0.001; // The native drawing also changes the exported angle.
    return { xp: a[0] + dx * ratio, z: a[1] + (b[1] - a[1]) * ratio, beta };
  };
  let distance = length(vault[0]);
  let result = { xp: 0, z: 0, beta: 0 };
  for (const segment of vault.slice(1)) {
    const next = distance + length(segment);
    if (distance < x && x <= next) result = at(segment, (x - distance) / (next - distance));
    distance = next;
  }
  return tip || x > distance ? at(vault.at(-1)!, 1) : result;
}

/** Generate a half wing without mutating the parameters or any existing design. */
export function generateGeometry(input: PreprocessorInput): Result<GeometryResult> {
  const errors = validatePreprocessor(input);
  if (errors.length) return { ok: false, errors };
  const le = edges(input, true);
  const te = edges(input, false);
  const vault = vaultSegments(input);
  const { cells, widths } = cellWidths(input, le, te);
  const ribs: GeneratedRib[] = positions(widths, input.halfSpan).map((x, i, xs) => ({
    number: i + 1,
    x,
    yLE: interpolate(le, x),
    yTE: interpolate(te, x),
    ...front(vault, x, i === xs.length - 1),
    rotationPoint: 33.33,
    washin: 0,
  }));
  const area = (key: 'x' | 'xp') => {
    let sum = ribs[0][key] * (ribs[0].yTE - ribs[0].yLE);
    for (let i = 1; i < ribs.length; i++) {
      const a = ribs[i - 1];
      const b = ribs[i];
      sum += (b[key] - a[key]) * 0.5 * (a.yTE - a.yLE + b.yTE - b.yLE);
    }
    return (2 * sum) / 10000;
  };
  const flatSpan = (input.halfSpan * 2) / 100;
  const projectedSpan = (ribs.at(-1)!.xp * 2) / 100;
  const vaultPoints = points(vault);
  const flatArea = area('x');
  const projectedArea = area('xp');
  const value: GeometryResult = {
    cells,
    ribs,
    curves: {
      leadingEdge: points(le),
      trailingEdge: points(te),
      vault: vaultPoints,
      vaultArcs:
        input.vault.mode === 2
          ? input.vault.arcs.map((_, i) =>
              vaultPoints.slice(i * ARC_SEGMENTS, (i + 1) * ARC_SEGMENTS + 1),
            )
          : [],
    },
    metrics: {
      flatSpan,
      projectedSpan,
      flatArea,
      projectedArea,
      flatAspectRatio: flatSpan ** 2 / flatArea,
      projectedAspectRatio: projectedSpan ** 2 / projectedArea,
      flattening: (flatArea - projectedArea) / flatArea,
      maxChord: ribs[0].yTE - ribs[0].yLE,
      meanChord: (flatArea / flatSpan) * 100,
      minChord: ribs.at(-1)!.yTE - ribs.at(-1)!.yLE,
    },
  };
  const valid =
    ribs.every((rib) => allFinite(Object.values(rib)) && rib.yTE > rib.yLE) &&
    allFinite(Object.values(value.metrics)) &&
    // The vault arcs are parts of the vault.
    [value.curves.leadingEdge, value.curves.trailingEdge, vaultPoints].every((curve) =>
      curve.every(allFinite),
    ) &&
    flatArea > 0 &&
    projectedArea > 0;
  if (!valid) {
    return {
      ok: false,
      errors: [
        {
          severity: 'error',
          field: 'geometry',
          message: 'Parameters produce an undefined geometry or a non-positive chord or area',
        },
      ],
    };
  }
  return { ok: true, value, warnings: [] };
}
