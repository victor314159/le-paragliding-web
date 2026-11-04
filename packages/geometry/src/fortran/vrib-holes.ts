// The holes of section 38 in the V-ribs of types 5 and 6, as the engine
// cuts them on the V-ribs laid flat (§16.3.2.5, 16.6.4).
import type { HvrHoleRow, LepAirfoil, LepDesign } from '@lepara/format';
import type { Point, Point3 } from './ribs.ts';
import { intersection } from './skin-panels.ts';
import {
  engineTraces,
  vRibs,
  type Continuous,
  type TraceSteps,
  type VRib,
  type VRibSections,
} from './vribs.ts';

export type VRibHoleSections = VRibSections | 'hvrHoles';

/** A V-rib laid flat: the points of its left and right edges, row by row. */
export interface FlatVRib {
  readonly left: readonly Point[];
  readonly right: readonly Point[];
}

const length3 = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * `flatt`: the V-rib between edges `left` and `right` laid flat, each row
 * and the next as a quadrilateral of the same sides and diagonals, from the
 * first row along the x axis; the engine's angle between rows by `atan`.
 * `segmentEnds` also collects the individual quadrilateral endpoints, which
 * differ from the next row's right start for nonplanar panels (§7).
 */
export function flatten(
  left: readonly Point3[],
  right: readonly Point3[],
  segmentEnds?: { left: Point[]; right: Point[] },
): FlatVRib {
  const flat = { left: [] as Point[], right: [] as Point[] };
  let [x0, y0, theta] = [0, 0, 0];
  for (let j = 0; j < left.length; j++) {
    const [l, r] = [left[j], right[j]];
    const pa = length3(r, l);
    flat.left.push([x0, y0]);
    flat.right.push([x0 + pa * Math.cos(theta), y0 + pa * Math.sin(theta)]);
    const [l2, r2] = [left[j + 1], right[j + 1]];
    if (!l2 || !r2) break;
    const [pb, pc, pd, pe] = [length3(r2, l), length3(r2, r), length3(r, l2), length3(l2, l)];
    const a2r = (pa * pa - pb * pb + pc * pc) / (2 * pa);
    const [a1r, hr] = [pa - a2r, Math.sqrt(pc * pc - a2r * a2r)];
    const a2l = (pa * pa - pe * pe + pd * pd) / (2 * pa);
    const [a1l, hl] = [pa - a2l, Math.sqrt(pd * pd - a2l * a2l)];
    const [c, s] = [Math.cos(theta), Math.sin(theta)];
    const next: Point = [a1l * c - hl * s + x0, a1l * s + hl * c + y0];
    const nextRight: Point = [a1r * c - hr * s + x0, a1r * s + hr * c + y0];
    segmentEnds?.left.push(next);
    segmentEnds?.right.push(nextRight);
    [x0, y0] = next;
    theta = Math.atan((nextRight[1] - next[1]) / (nextRight[0] - next[0]));
  }
  return flat;
}

/** `flatt` with its quadrilaterals' ends: `l1`, `r1` the edges' rows, `l2`, `r2` the ends of their segments. */
export interface Flatt {
  readonly l1: readonly Point[];
  readonly l2: readonly Point[];
  readonly r1: readonly Point[];
  readonly r2: readonly Point[];
}

export function flatt(left: readonly Point3[], right: readonly Point3[]): Flatt {
  const ends = { left: [] as Point[], right: [] as Point[] };
  const { left: l1, right: r1 } = flatten(left, right, ends);
  return { l1, l2: ends.left, r1, r2: ends.right };
}

/**
 * A type 5 V-rib laid flat as the engine draws it (§16.3.2.5), turned so
 * that its right edge runs from its first point to its last along y: the
 * left V-rib (`left`) lays its anchor rib on the right, the right one on
 * the left.
 */
export function laidContinuous({ ribs, edges: [a, b] }: VRib): Flatt & { left: boolean } {
  const left = ribs[1] < ribs[0];
  const laid = left ? flatt(b, a) : flatt(a, b);
  const [first, last] = [laid.r1[0], laid.r1[laid.r1.length - 1]];
  const angle = Math.atan((last[0] - first[0]) / (last[1] - first[1]));
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const turn = (points: readonly Point[]) =>
    points.map(([x, y]): Point => [c * x - s * y, s * x + c * y]);
  return { left, l1: turn(laid.l1), l2: turn(laid.l2), r1: turn(laid.r1), r2: turn(laid.r2) };
}

/**
 * The anchors of a type 5 V-rib on its flat edge `anchored`, each its
 * length (`Continuous.anchors`) back from the last point, as the engine
 * walks it, from the last segment to the second; `j` the index of the
 * point past it.
 */
export function flatAnchors(anchored: readonly Point[], lengths: readonly number[]) {
  const step = (j: number) =>
    Math.hypot(anchored[j][0] - anchored[j - 1][0], anchored[j][1] - anchored[j - 1][1]);
  return lengths.flatMap((length) => {
    let [walked, next] = [0, step(anchored.length - 1)];
    for (let j = anchored.length - 1; j >= 2; j--) {
      if (length >= walked && length < next) {
        const [p, q, t] = [anchored[j], anchored[j - 1], length - walked];
        const point: Point = [
          p[0] - (t * (p[0] - q[0])) / step(j),
          p[1] - (t * (p[1] - q[1])) / step(j),
        ];
        return [{ point, j }];
      }
      walked += step(j);
      next = walked + step(j - 1);
    }
    return [];
  });
}

/** A hole in a flat V-rib: an ellipse, its semi-axes `a` and `b`, `a` at `angle` (rad). */
export interface FlatHole {
  readonly center: Point;
  readonly a: number;
  readonly b: number;
  readonly angle: number;
  /** The row of section 38 it comes from, from 0. */
  readonly row: number;
}

/**
 * A cutout of a type 5 V-rib between two anchors, laid flat (§16.3.2.5):
 * from `p1` to `p2` on its anchor rib's edge, a parabola, or an ellipse
 * deeper than 100 %.
 */
export interface FlatCutout {
  readonly p1: Point;
  readonly p2: Point;
  /** Its parabola: `x = k (y − vertex[1])² + vertex[0]`. */
  readonly vertex: Point;
  readonly k: number;
  /** Deeper than 100 %: the ellipse cut out instead, its semi-axes `a` along x and `b` along y. */
  readonly ellipse?: { readonly center: Point; readonly a: number; readonly b: number };
  /** The engine's indices (from 1) of the edge's first point past `p1` and last before `p2`. */
  readonly jconi: number;
  readonly jconf: number;
}

/** The point of `cutout`'s parabola at `y`. */
export const cutoutPoint = ({ vertex, k }: Pick<FlatCutout, 'vertex' | 'k'>, y: number): Point => [
  k * (y - vertex[1]) ** 2 + vertex[0],
  y,
];

/** A V-rib with holes: laid flat, its edges in 3D in the same order, its holes and cutouts. */
export interface HoledVRib {
  readonly rib: VRib;
  readonly flat: FlatVRib;
  readonly edges: readonly [readonly Point3[], readonly Point3[]];
  readonly holes: readonly FlatHole[];
  readonly cutouts: readonly FlatCutout[];
}

/** The last segment of `points` rising across `y`: its first index and its point there. */
function crossing(points: readonly Point[], y: number) {
  let found: { i: number; point: Point } | undefined;
  for (let i = 0; i + 1 < points.length; i++) {
    const [p, q] = [points[i], points[i + 1]];
    if (p[1] <= y && q[1] > y) {
      const xm = (q[1] - p[1]) / (q[0] - p[0]);
      const xb = p[1] - xm * p[0];
      found = { i, point: [(y - xb) / xm, y] };
    }
  }
  return found;
}

/**
 * The cutouts of a type 5 V-rib between its anchors, on its anchor rib's
 * edge `anchored`, towards `other` (`sign` −1 towards −x, the left
 * V-rib's, else 1): between anchors k and k + 1, from P1 (`margin` past anchor k on
 * the edge) to P2 (where it meets the edge again), a parabola about the y
 * of their middle, its vertex `depth` % of the way across to `other`; over
 * 100 %, an ellipse instead, its axes the rest of the way and the distance
 * between the margins. None where the engine cannot find one's points.
 */
function cutouts(
  anchored: readonly Point[],
  other: readonly Point[],
  anchors: readonly Point[],
  { depth, margin }: Continuous,
  sign: number,
): FlatCutout[] {
  const found = anchors.slice(1).map((next, k): FlatCutout | undefined => {
    const [x0, y0] = [0, 1].map((c) => (anchors[k][c] + next[c]) / 2);
    const five = crossing(other, y0);
    const one = crossing(anchored, anchors[k][1] + margin);
    if (!five || !one) return undefined;
    const x5 = five.point[0];
    const p1 = one.point;
    const vertex: Point = [x0 + ((x5 - x0) * depth) / 100, y0];
    const cutout = { p1, vertex, k: (p1[0] - vertex[0]) / (p1[1] - y0) ** 2 };
    let p2: Point | undefined;
    for (let i = 0; i + 1 < anchored.length; i++) {
      const [p, q] = [anchored[i], anchored[i + 1]];
      if (p[1] < y0 || p[1] >= next[1]) continue;
      const t = intersection([cutoutPoint(cutout, p[1]), cutoutPoint(cutout, q[1])], [p, q]);
      if (p[1] <= t[1] && q[1] > t[1]) p2 = t;
    }
    const two = p2 && crossing(anchored, p2[1]);
    if (!p2 || !two) return undefined;
    const ellipse =
      depth > 100
        ? {
            center: [(x0 + x5) / 2, y0] as Point,
            a: 0.5 * (sign * (x5 - x0) * (1 - (2 * (depth - 100)) / 100)),
            b: 0.5 * (p2[1] - p1[1] - 2 * margin),
          }
        : undefined;
    return { ...cutout, p2, ellipse, jconi: one.i + 2, jconf: two.i + 1 };
  });
  return found.every((cutout) => cutout) ? (found as FlatCutout[]) : [];
}

/** The row of section 38 the engine keeps for `types`: the last with holes drawn. */
function keptRow(rows: readonly HvrHoleRow[], types: readonly number[]) {
  let index = -1;
  rows.forEach((row, i) => {
    if (types.includes(row.type) && row.drawn > 0) index = i;
  });
  return index;
}

/** The point of `points` at fractional index `s`, along their segments. */
function at<P extends readonly number[]>(points: readonly P[], s: number): P {
  const i = Math.min(Math.max(Math.floor(s), 0), points.length - 2);
  const t = s - i;
  return points[i].map((value, k) => value + (points[i + 1][k] - value) * t) as unknown as P;
}

/**
 * The holes of section 38 in the V-ribs of types 5 and 6 (right half
 * wing), as the engine cuts them, from the last row with holes of types
 * 5/15 and 6/16, and the cutouts of every type 5 between its anchors
 * (`cutouts`; the engine's "parabolic holes"):
 * - type 5, laid as `laidContinuous`: at each anchor on the anchor rib's
 *   edge (`flatAnchors`), `h` the distance across in x to the other edge's point
 *   past it, the hole `center · h` from the anchor, its semi-axes
 *   `height · h / 200` across and `width · h / 200` along;
 * - type 6, laid flat: `holes` of them, the k-th `k / (holes + 1)` of the
 *   way along the straight lines between its end rows, `center` of the way
 *   across, its semi-axes half the height across times `height` % and half
 *   its length times `center / holes` (`vhholes`).
 */
export function vRibHoles(
  design: Pick<LepDesign, VRibHoleSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  steps: TraceSteps = engineTraces,
): HoledVRib[] {
  const rows = design.hvrHoles.mode === 0 ? [] : design.hvrHoles.rows;
  const [five, six] = [keptRow(rows, [5, 15]), keptRow(rows, [6, 16])];
  return vRibs(design, airfoils, steps).flatMap((rib): HoledVRib[] => {
    const [a, b] = rib.edges;
    if (rib.type === 5 && rib.continuous) {
      const laid = laidContinuous(rib);
      const [anchored, other] = laid.left ? [laid.r1, laid.l1] : [laid.l1, laid.r1];
      const anchors = flatAnchors(anchored, rib.continuous.anchors);
      const row = rows[five];
      const holes = (row ? anchors : []).map(({ point, j }): FlatHole => {
        const { height, width, center } = row;
        const h = laid.left ? point[0] - other[j][0] : other[j][0] - point[0];
        return {
          center: [point[0] + (laid.left ? -h : h) * center, point[1]],
          a: Math.abs(height * h * 0.005),
          b: Math.abs(width * h * 0.005),
          angle: 0,
          row: five,
        };
      });
      const sign = laid.left ? -1 : 1;
      const points = anchors.map(({ point }) => point);
      const edges = laid.left ? ([b, a] as const) : ([a, b] as const);
      const flat = { left: laid.l1, right: laid.r1 };
      return [
        {
          rib,
          flat,
          edges,
          holes,
          cutouts: cutouts(anchored, other, points, rib.continuous, sign),
        },
      ];
    }
    if (rib.type === 6 && rows[six]) {
      const { holes: count, height, center } = rows[six];
      const n = Math.max(Math.trunc(count), 0);
      const flat = flatten(a, b);
      const last = flat.left.length - 1;
      const [l0, r0, l1, r1] = [flat.left[0], flat.right[0], flat.left[last], flat.right[last]];
      const lerp = (p: Point, q: Point, t: number): Point => [
        p[0] + (q[0] - p[0]) * t,
        p[1] + (q[1] - p[1]) * t,
      ];
      const w = Math.hypot(...[0, 1].map((k) => (l1[k] + r1[k] - l0[k] - r0[k]) / 2));
      const holes = Array.from({ length: n }, (_, k): FlatHole => {
        const [xl, xr] = [lerp(l0, l1, (k + 1) / (n + 1)), lerp(r0, r1, (k + 1) / (n + 1))];
        const h = Math.hypot(xr[0] - xl[0], xr[1] - xl[1]);
        return {
          center: lerp(xl, xr, center),
          a: 0.5 * h * height * 0.01,
          b: 0.5 * w * (center / n),
          angle: Math.atan2(xr[1] - xl[1], xr[0] - xl[0]),
          row: six,
        };
      });
      return [{ rib, flat, edges: [a, b], holes, cutouts: [] }];
    }
    return [];
  });
}

/** `count` points around `hole`, from its `a` axis. */
export function holeOutline(hole: FlatHole, count = 40): Point[] {
  const [c, s] = [Math.cos(hole.angle), Math.sin(hole.angle)];
  return Array.from({ length: count }, (_, k): Point => {
    const theta = (2 * Math.PI * k) / count;
    const [x, y] = [hole.a * Math.cos(theta), hole.b * Math.sin(theta)];
    return [hole.center[0] + x * c - y * s, hole.center[1] + x * s + y * c];
  });
}

/**
 * The coordinates on `vrib` of the flat point `p`: `s` the fractional row
 * between the rows about it, `t` the fraction from its left edge to its
 * right one; beyond the end rows, extended from the last quadrilateral.
 */
export function flatToRib({ flat }: HoledVRib, p: Point): Point {
  const { left, right } = flat;
  // The signed distance of p from row j, towards the next rows.
  const side = (j: number) => {
    const [l, r] = [left[j], right[j]];
    const [dx, dy] = [r[0] - l[0], r[1] - l[1]];
    const next = left[Math.min(j + 1, left.length - 1)];
    const towards = (next[0] - l[0]) * -dy + (next[1] - l[1]) * dx >= 0 ? 1 : -1;
    return (towards * ((p[0] - l[0]) * -dy + (p[1] - l[1]) * dx)) / (Math.hypot(dx, dy) || 1);
  };
  let j = 0;
  while (j + 2 < left.length && side(j + 1) > 0) j++;
  const [d0, d1] = [side(j), side(j + 1)];
  const s = j + d0 / (d0 - d1 || 1);
  const [l, r] = [at(left, s), at(right, s)];
  const [dx, dy] = [r[0] - l[0], r[1] - l[1]];
  return [s, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / (dx * dx + dy * dy || 1)];
}

/** The point of `vrib` laid flat at `s` along its rows and `t` across. */
export function flatAt({ flat: { left, right } }: HoledVRib, [s, t]: Point): Point {
  const [l, r] = [at(left, s), at(right, s)];
  return [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t];
}

/** The point in 3D of `vrib` at `s` along its rows and `t` across. */
export function ribAt({ edges: [left, right] }: HoledVRib, [s, t]: Point): Point3 {
  const [l, r] = [at(left, s), at(right, s)];
  return [l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t, l[2] + (r[2] - l[2]) * t];
}
