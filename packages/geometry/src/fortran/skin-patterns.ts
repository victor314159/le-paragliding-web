// Panel development and skin tension, engine §7–8. Arrays retain the engine's
// rib/point numbering here: panel i lies between ribs i and i+1.
import type { LepDesign, SkinTensionPoint } from '@lepara/format';
import { flatten } from './vrib-holes.ts';
import type { Point } from './ribs.ts';
import type { SkinRib } from './skin-ribs.ts';

import type { Flat, SkinPatternSections, SkinPatterns } from '../shared/skin-types.ts';
export type { SkinPatternSections } from '../shared/skin-types.ts';

const zero: Point = [0, 0];
/** Point `j` of `p`, or the origin where the engine's array holds no value. */
const at = (p: readonly Point[], j: number): Point => p[j] ?? zero;
const distance = (a: Point, b: Point) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
const length = (p: readonly Point[], first: number, last: number) => {
  let sum = 0;
  for (let j = first; j < last; j++) sum += distance(at(p, j), at(p, j + 1));
  return sum;
};
const move = (p: Point, d: Point, k: number): Point => [p[0] + k * d[0], p[1] + k * d[1]];
const delta = (a: Point, b: Point): Point => [b[0] - a[0], b[1] - a[1]];

/** A flat panel with the endpoints of each of its quadrilaterals, nonplanar ones apart. */
interface Developed extends Flat {
  leftEnds: Point[];
  rightEnds: Point[];
}

/** The panel between ribs `a` and `b`, points `from` to `to`, laid flat (`flatt`). */
function develop(a: SkinRib, b: SkinRib, from: number, to: number): Developed {
  const ends = { left: [] as Point[], right: [] as Point[] };
  const flat = flatten(a.points.slice(from, to + 1), b.points.slice(from, to + 1), ends);
  const pad = (points: readonly Point[], n: number): Point[] => [
    ...Array.from({ length: n }, () => zero),
    ...points,
  ];
  return {
    left: pad(flat.left, from),
    right: pad(flat.right, from),
    leftEnds: pad(ends.left, from + 1),
    rightEnds: pad(ends.right, from + 1),
  };
}

/** The length of edge `side` from point `from` to `to`, along its quadrilaterals. */
function developedLength(panel: Developed, side: 'left' | 'right', from: number, to: number) {
  let sum = 0;
  for (let j = from; j < to; j++)
    sum += distance(at(panel[side], j), at(panel[`${side}Ends`], j + 1));
  return sum;
}

/** puntslat: offsets use the preceding segment, including the initial-point special case. */
function offset(
  edge: readonly Point[],
  widths: readonly number[],
  from: number,
  to: number,
  side: number,
  fixedSigns = false,
  ends = edge,
  firstAngle?: number,
): Point[] {
  const result: Point[] = [];
  for (let j = from; j <= to; j++) {
    const k = j === from ? from : j - 1;
    const d = delta(at(edge, k), at(ends, k + 1));
    const angle =
      j === from
        ? (firstAngle ?? Math.abs(Math.atan(d[1] / d[0])))
        : d[1] !== 0
          ? Math.abs(Math.atan(d[1] / d[0]))
          : Math.PI / 2;
    const sx = fixedSigns ? 1 : d[1] <= 0 ? -1 : 1;
    const sy = fixedSigns ? -1 : d[0] <= 0 ? 1 : -1;
    result[j] = move(
      at(j === from ? edge : ends, j),
      [side * sx * Math.sin(angle), side * sy * Math.cos(angle)],
      widths[j] ?? 0,
    );
  }
  return result;
}

/**
 * Tension `points` on the extrados (`upper`) or intrados, as (distance along
 * an edge `total` long from its first point, overwidth of a cell `width`
 * wide), by increasing distance.
 */
function curve(
  points: readonly SkinTensionPoint[],
  upper: boolean,
  total: number,
  width: number,
): Point[] {
  return [...points]
    .reverse()
    .map((p) => [
      ((100 - (upper ? p.extradosPosition : p.intradosPosition)) / 100) * total,
      (width * (upper ? p.extradosOverwidth : p.intradosOverwidth)) / 100,
    ]);
}

/**
 * The overwidth at each point of `edge` from `from` to `to`, interpolated on
 * `curve` with the interval tests of section 5 or, `grouped`, section 31.
 */
function widths(
  edge: readonly Point[],
  from: number,
  to: number,
  curve: readonly Point[],
  grouped: boolean,
  ends = edge,
  round: (value: number) => number = Math.fround,
): number[] {
  const values: number[] = [];
  let u = 0;
  for (let j = from; j <= to; j++) {
    let value = grouped ? 0 : (curve[0]?.[1] ?? 0);
    if (j !== from || grouped) {
      for (let k = 0; k < curve.length - 1; k++) {
        const [a, b] = [curve[k], curve[k + 1]];
        if (
          grouped
            ? u >= a[0] && u <= b[0] * round(1.001)
            : (k === 0 || u > a[0]) && (k === curve.length - 2 || u <= b[0])
        ) {
          const slope = (b[1] - a[1]) / (b[0] - a[0]);
          value = slope * u + (b[1] - slope * b[0]);
        }
      }
    }
    values[j] = value;
    u += distance(at(edge, j), at(ends, j + 1));
  }
  return values;
}

/**
 * The steps of `skinPatterns` each model takes its own way, the engine's
 * when false: each panel edge from its own rib's tension curve, cell width
 * and start indices (`symmetric`); the classic intrados from its own first
 * segment (`ownAngle`); the cut lines off the corrected sewing lines
 * (`correctedCuts`).
 */
export interface PatternSteps {
  readonly symmetric: boolean;
  readonly ownAngle: boolean;
  readonly correctedCuts: boolean;
}

const enginePatterns: PatternSteps = {
  symmetric: false,
  ownAngle: false,
  correctedCuts: false,
};

/** The sewing-length correction of a rib's two seams (§8.2.4). */
interface Correction {
  leftLength: number;
  rightLength: number;
  localLength: number;
  leftStart: number;
  rightStart: number;
  leftDelta: number;
  rightDelta: number;
}

/** §8.2.4 and §8.4.4. Preserve the different left/right start indices used upstream. */
function reformat(
  design: Pick<LepDesign, SkinPatternSections>,
  ribs: readonly SkinRib[],
  panels: Flat[],
  upper: boolean,
  unformatted: readonly number[],
  round: (value: number) => number,
  symmetric: boolean,
) {
  const n = ribs.length - 1;
  const factor = design.skinTension.panelCorrection.factor;
  const point = design.skinTension.points[2];
  // A draft may hold fewer points.
  if (!point) return;
  const fraction = (upper ? point.extradosPosition : point.intradosPosition) / 100;
  const bounds = (i: number): [number, number] =>
    upper ? [1, ribs[i].upper] : [ribs[i].upper + ribs[i].inlet - 1, ribs[i].local.length - 1];
  const corrections: Correction[] = ribs.map((rib, i) => {
    const [from, to] = bounds(i);
    const leftLength = length(panels[i - 1]?.right ?? [], from, to);
    const rightLength = length(panels[i].left, from, to);
    const localLength = length(rib.local, from, to);
    return {
      leftLength,
      rightLength,
      localLength,
      leftStart: 0,
      rightStart: 0,
      leftDelta: factor * (localLength - leftLength),
      rightDelta: factor * (localLength - rightLength),
    };
  });
  Object.assign(corrections[0], {
    leftLength: corrections[1].rightLength,
    rightLength: corrections[1].leftLength,
    localLength: corrections[1].localLength,
    leftDelta: factor * (corrections[1].localLength - corrections[1].rightLength),
    rightDelta: factor * (corrections[1].localLength - corrections[1].leftLength),
  });
  for (let i = 0; i <= n; i++) {
    const c = corrections[i],
      [from, to] = bounds(i);
    for (const side of ['left', 'right'] as const) {
      const edge = side === 'left' ? (panels[i - 1]?.right ?? []) : panels[i].left;
      const total = side === 'left' ? c.leftLength : c.rightLength;
      let sum = 0;
      for (let j = from; j < to; j++) {
        sum += distance(at(edge, j), at(edge, j + 1));
        if (sum < total * (upper ? 1 - fraction : fraction)) c[`${side}Start`] = j;
      }
    }
  }
  corrections[0].leftStart = corrections[1].leftStart;
  corrections[0].rightStart = corrections[1].rightStart;
  for (const side of ['left', 'right'] as const) {
    for (let i = side === 'left' ? 1 : 0; i <= n; i++) {
      const c = corrections[i],
        [from, to] = bounds(i);
      const edge = side === 'left' ? panels[i - 1].right : panels[i].left;
      const start = c[`${side}Start`];
      let sectionLength = 0;
      for (let j = upper ? start : from; j < (upper ? to : start); j++)
        sectionLength = round(sectionLength + distance(at(edge, j), at(edge, j + 1)));
      const scale = round(round(sectionLength + c[`${side}Delta`]) / sectionLength);
      // Intrados right side intentionally uses jirl for the rewritten points (§8.4.4).
      const first = !symmetric && !upper && side === 'right' ? c.leftStart : start;
      extend(edge, first, upper ? to : from, scale, 0, first, upper ? 1 : -1);
    }
  }
  for (let iteration = 0; iteration < 5; iteration++) {
    for (let i = upper ? 1 : 2; i < n; i++) {
      const c = corrections[i],
        [from, to] = bounds(i);
      const edge = panels[i].left;
      const end = upper ? to : from;
      const error = round(
        distance(at(panels[i].left, end), at(panels[i].right, end)) - unformatted[i],
      );
      const dist = distance(at(edge, c.leftStart), at(edge, end));
      const omega =
        Math.abs(error) < round(0.01)
          ? 0
          : round((Math.asin(error / dist) * error) / Math.abs(error));
      // Angles are prepared from jirl, then extrados writes from jirr.
      extend(
        edge,
        upper && !symmetric ? c.rightStart : c.leftStart,
        end,
        1,
        upper ? omega : -omega,
        c.leftStart,
        upper ? 1 : -1,
      );
    }
  }
}

/** §8.2.3: the older seam-length correction changes only the right edge near the nose. */
function legacyCorrection(
  design: Pick<LepDesign, SkinPatternSections>,
  ribs: readonly SkinRib[],
  panels: Flat[],
  seams: Flat[],
  round: (value: number) => number,
) {
  const count = design.skinTension.panelCorrection.points;
  const factor = design.skinTension.panelCorrection.factor || round(0.01);
  const differences = ribs.map((rib, i) =>
    i > 0 && i < ribs.length - 1
      ? (length(seams[i].left, rib.upper - count, rib.upper) -
          length(seams[i - 1].right, rib.upper - count, rib.upper)) *
        factor
      : 0,
  );
  for (let i = 1; i < ribs.length - 1; i++) {
    const panel = panels[i - 1],
      rib = ribs[i - 1],
      end = rib.upper;
    const a = at(panel.left, end),
      b = at(panel.right, end),
      change = differences[i];
    const theta3 = Math.acos(change / (2 * distance(a, b)));
    const theta1 = Math.atan((a[1] - b[1]) / (b[0] - a[0]));
    const theta2 = Math.PI - theta3 - theta1;
    const shifted = move(b, [Math.cos(theta2), Math.sin(theta2)], change);
    const theta4 = Math.atan((shifted[1] - b[1]) / (shifted[0] - b[0]));
    const start = at(panel.right, end - count),
      total = distance(start, b);
    for (let j = end - count; j <= end; j++) {
      const fraction = distance(at(panel.right, j), start) ** 3 / total ** 3;
      panel.right[j] = move(
        at(panel.right, j),
        [Math.cos(theta4), Math.sin(theta4)],
        fraction * change,
      );
    }
  }
  // The right seam follows the moved points, on unsigned normals (xcos).
  const allowance = round(design.sewingAllowances.upper.sides / 10);
  for (let i = 0; i < ribs.length - 2; i++) {
    const right = panels[i].right,
      end = ribs[i].upper;
    for (let j = end - count; j <= end; j++) {
      const d = delta(at(right, j - 1), at(right, j));
      const angle = Math.abs(Math.atan(d[1] / d[0]));
      seams[i].right[j] = move(at(right, j), [Math.sin(angle), -Math.cos(angle)], allowance);
    }
  }
}

/** Change segment lengths, then reconstruct in order, as the engine's reformat loops do. */
function extend(
  edge: Point[],
  first: number,
  end: number,
  scale: number,
  omega = 0,
  angleStart = first,
  step = 1,
) {
  const vectors = new Map<number, Point>();
  for (let j = angleStart; step * (end - j) > 0; j += step) {
    const d = delta(at(edge, j), at(edge, j + step));
    const angle = (d[0] !== 0 ? Math.abs(Math.atan(d[1] / d[0])) : Math.PI / 2) + omega;
    const dist = Math.sqrt(d[0] ** 2 + d[1] ** 2);
    vectors.set(j, [
      (d[0] <= 0 ? -1 : 1) * dist * Math.cos(angle),
      (d[1] <= 0 ? -1 : 1) * dist * Math.sin(angle),
    ]);
  }
  for (let j = first; step * (end - j) > 0; j += step)
    edge[j + step] = move(at(edge, j), vectors.get(j) ?? zero, scale);
}

/** The left normal of segment `d` in §8.3.1: signs by quadrant, the last matching case winning. */
function leftQuadrant([du, dv]: Point, angle: number): Point {
  let signs: Point = [0, 0];
  if (du >= 0 && dv >= 0) signs = [-1, 1];
  if (du <= 0 && dv >= 0) signs = [-1, -1];
  if (du >= 0 && dv <= 0) signs = [1, 1];
  if (du <= 0 && dv <= 0) signs = [1, -1];
  return [signs[0] * Math.sin(angle), signs[1] * Math.cos(angle)];
}

/**
 * Developed panels after skin tension and sewing-length corrections, before
 * shaping cuts. `round` reproduces implicit reals in the reference; supplying
 * identity changes precision while retaining these panel conventions.
 */
export function skinPatterns(
  design: Pick<LepDesign, SkinPatternSections>,
  ribs: readonly SkinRib[],
  round: (value: number) => number = Math.fround,
  steps: PatternSteps = enginePatterns,
): SkinPatterns {
  const n = ribs.length - 1;
  const grouped = design.skinTensionGroups.mode === 1;
  // Section 31: the last group naming rib i, rib 0 taking those of rib 1.
  const points = (i: number) =>
    design.skinTensionGroups.mode === 0
      ? design.skinTension.points
      : ([...design.skinTensionGroups.groups]
          .reverse()
          .find((g) => g.firstRib <= Math.max(i, 1) && g.lastRib >= Math.max(i, 1))?.points ?? []);
  const flats = ribs.map((rib, i) =>
    i < n
      ? develop(rib, ribs[i + 1], rib.upper, rib.upper + rib.inlet)
      : { left: [], right: [], leftEnds: [], rightEnds: [] },
  );
  const make = (upper: boolean) => {
    const flat: Developed[] = ribs.map((rib, i) => {
      if (i === n) return { left: [], right: [], leftEnds: [], rightEnds: [] };
      const from = upper ? 1 : rib.upper + rib.inlet - 1;
      const to = upper ? rib.upper : rib.points.length - 1;
      return develop(rib, ribs[i + 1], from, to);
    });
    const totals = ribs.map((rib, i) => {
      const from = upper ? 1 : rib.upper + rib.inlet - 1,
        to = upper ? rib.upper : rib.points.length - 1;
      return developedLength(i === n ? flat[i - 1] : flat[i], i === n ? 'right' : 'left', from, to);
    });
    const cellWidths = flat.map((panel, i) => {
      const rib = ribs[i],
        to = rib.points.length - 1;
      const middle = upper
        ? Math.trunc(rib.upper / 2)
        : Math.trunc((rib.upper + rib.inlet - 1 + to) / 2);
      const source = i === n ? flat[i - 1] : panel;
      return distance(at(source.left, middle), at(source.right, middle));
    });
    const seams: Flat[] = [];
    const output = flat.map((panel, i): Flat => {
      const rib = ribs[i];
      const from = upper ? 1 : rib.upper + rib.inlet - 1,
        to = upper ? rib.upper : rib.points.length - 1;
      const width = cellWidths[i];
      const left = widths(
        panel.left,
        from,
        to,
        curve(points(i), upper, totals[i], width),
        grouped,
        panel.leftEnds,
        round,
      );
      const rightCurve = curve(
        points(i + 1),
        upper,
        totals[i + 1] ?? 0,
        !upper && grouped && !steps.symmetric ? (cellWidths[i + 1] ?? 0) : width,
      );
      // Extrados initializes only skinpoints(i) values for the next rib.
      // Intrados initializes all of that rib's values, but still interpolates
      // only skinpoints(i) intervals (§8.2 / §8.4, section 31).
      const right = widths(
        panel.right,
        from,
        to,
        grouped && !steps.symmetric
          ? rightCurve.slice(0, points(i).length + (upper ? 0 : 1))
          : rightCurve,
        grouped,
        panel.rightEnds,
        round,
      );
      // Sewing allowance (mm) beyond the overwidth, on the same normals:
      // computed before the corrections, which leave it in place.
      const margin = design.sewingAllowances[upper ? 'upper' : 'lower'].sides * round(0.1);
      // The classic intrados writer uses fixed offset signs rather than puntslat,
      // and starts its left edge on the angle of the last vent segment, in the
      // vent's own development (§8.4.1).
      const fixed = !upper && !grouped;
      const vent = flats[i];
      const ventSegment = delta(at(vent.left, from - 1), at(vent.leftEnds, from));
      const firstAngle =
        fixed && !steps.ownAngle ? Math.abs(Math.atan(ventSegment[1] / ventSegment[0])) : undefined;
      const edges = (extra: number): Flat => ({
        left: offset(
          panel.left,
          left.map((v) => v + extra),
          from,
          to,
          -1,
          fixed,
          panel.leftEnds,
          firstAngle,
        ),
        right: offset(
          panel.right,
          right.map((v) => v + extra),
          from,
          to,
          1,
          fixed,
          panel.rightEnds,
        ),
      });
      seams.push(edges(margin));
      return edges(0);
    });
    const unformatted = output.map((p, i) =>
      distance(
        at(p.left, upper ? ribs[i].upper : ribs[i].upper + ribs[i].inlet - 1),
        at(p.right, upper ? ribs[i].upper : ribs[i].upper + ribs[i].inlet - 1),
      ),
    );
    if (design.skinTension.panelCorrection.points === 1000)
      reformat(design, ribs, output, upper, unformatted, round, steps.symmetric);
    else if (upper) legacyCorrection(design, ribs, output, seams, round);
    // The cut lines the allowance off the sewing lines as corrected.
    if (steps.correctedCuts)
      output.forEach((edge, i) => {
        if (i === n) return;
        const rib = ribs[i];
        const from = upper ? 1 : rib.upper + rib.inlet - 1;
        const to = upper ? rib.upper : rib.points.length - 1;
        const allowance = design.sewingAllowances[upper ? 'upper' : 'lower'].sides * round(0.1);
        const margin = Array<number>(to + 1).fill(allowance);
        const fixed = !upper && !grouped;
        seams[i] = {
          left: offset(edge.left, margin, from, to, -1, fixed),
          right: offset(edge.right, margin, from, to, 1, fixed),
        };
      });
    return { output, seams };
  };
  const { output: upper, seams: upperSeams } = make(true),
    { output: lower, seams: lowerSeams } = make(false);
  const totals = flats.map((flat, i) =>
    developedLength(
      i === n ? flats[i - 1] : flat,
      i === n ? 'right' : 'left',
      ribs[i].upper,
      ribs[i].upper + ribs[i].inlet - 1,
    ),
  );
  const inletSeams: Flat[] = [];
  const inlet = flats.map((flat, i): Flat => {
    if (i === n || (i === 0 && design.geometry.ribs[0].x < 0.01)) {
      inletSeams.push({ left: [], right: [] });
      return { left: [], right: [] };
    }
    const rib = ribs[i],
      first = rib.upper,
      last = first + rib.inlet - 1;
    const upperFlat = develop(rib, ribs[i + 1], 1, first);
    const lowerFlat = develop(rib, ribs[i + 1], last, rib.points.length - 1);
    const widthUpper = distance(
      at(upperFlat.left, Math.trunc(first / 2)),
      at(upperFlat.right, Math.trunc(first / 2)),
    );
    const middle = Math.trunc((last + rib.points.length - 1) / 2);
    const widthLower = distance(at(lowerFlat.left, middle), at(lowerFlat.right, middle));
    const result: Flat = { left: [], right: [] },
      seam: Flat = { left: [], right: [] };
    // §8.3: the intrados allowance, the extrados one for vents glued to it (section 31 only).
    const vent = design.glueVents.mode === 1 ? design.glueVents.ribs[i]?.type : undefined;
    const allowances = design.sewingAllowances[grouped && (vent ?? 0) >= 1 ? 'upper' : 'lower'];
    const margin = allowances.sides * round(0.1);
    for (const side of ['left', 'right'] as const) {
      const pts = points(side === 'left' ? i : i + 1);
      const a = (widthUpper * (pts[0]?.extradosOverwidth ?? 0)) / 100;
      const b = (widthLower * (pts.at(-1)?.intradosOverwidth ?? 0)) / 100;
      const total = grouped && side === 'right' ? totals[i + 1] : totals[i];
      const slope = (b - a) / total,
        intercept = b - slope * total;
      let u = 0;
      for (let j = first; j <= last; j++) {
        const edge = flat[side],
          ends = flat[`${side}Ends`];
        const k = side === 'left' || j === first ? j : j - 1;
        const d = delta(at(edge, k), at(ends, k + 1));
        // §8.3.1: the left side takes the signs of its segment's quadrant, but at its first point.
        const quadrant = side === 'left' && j !== first;
        const angle = quadrant && d[1] === 0 ? Math.PI / 2 : Math.abs(Math.atan(d[1] / d[0]));
        let value = j === first ? a : slope * u + intercept;
        if (side === 'left' && j !== first && value <= round(0.001)) value = 0;
        const sign = side === 'left' ? -1 : 1;
        const base = side === 'left' || j === first ? at(edge, j) : at(ends, j);
        const normal: Point = quadrant
          ? leftQuadrant(d, angle)
          : [sign * Math.sin(angle), -sign * Math.cos(angle)];
        result[side][j] = move(base, normal, value);
        seam[side][j] = move(base, normal, value + margin);
        u += distance(at(edge, j), at(ends, j + 1));
      }
    }
    inletSeams.push(seam);
    return result;
  });
  return {
    upper,
    lower,
    inlet,
    seams: { upper: upperSeams, lower: lowerSeams, inlet: inletSeams },
  };
}
