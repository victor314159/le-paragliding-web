// The holes of section 38 in the V-ribs of types 5 and 6, as the engine
// cuts them on the V-ribs laid flat (§16.3.2.5, 16.6.4).
import type { HvrHoleRow, LepAirfoil, LepDesign } from '@lepara/format';
import type { Point, Point3 } from './ribs.ts';
import { intradosAnchors, vRibs, type VRib, type VRibSections } from './vribs.ts';

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
 */
export function flatten(left: readonly Point3[], right: readonly Point3[]): FlatVRib {
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
    [x0, y0] = next;
    theta = Math.atan((nextRight[1] - next[1]) / (nextRight[0] - next[0]));
  }
  return flat;
}

/** `flat` turned so that its right edge runs from its first point to its last along y, as type 5 is drawn. */
function upright(flat: FlatVRib): FlatVRib {
  const [first, last] = [flat.right[0], flat.right[flat.right.length - 1]];
  const angle = Math.atan((last[0] - first[0]) / (last[1] - first[1]));
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const turn = ([x, y]: Point): Point => [c * x - s * y, s * x + c * y];
  return { left: flat.left.map(turn), right: flat.right.map(turn) };
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

/** A V-rib with holes: laid flat, its edges in 3D in the same order, and its holes. */
export interface HoledVRib {
  readonly rib: VRib;
  readonly flat: FlatVRib;
  readonly edges: readonly [readonly Point3[], readonly Point3[]];
  readonly holes: readonly FlatHole[];
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

/** The fractional index of the point of `points` nearest `p`. */
function nearest(points: readonly Point3[], p: Point3): number {
  let best = { s: 0, distance: Infinity };
  for (let i = 0; i + 1 < points.length; i++) {
    const d = [0, 1, 2].map((k) => points[i + 1][k] - points[i][k]);
    const w = [0, 1, 2].map((k) => p[k] - points[i][k]);
    const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const t = Math.min(Math.max((w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / (dd || 1), 0), 1);
    const distance = length3(at(points, i + t), p);
    if (distance < best.distance) best = { s: i + t, distance };
  }
  return best.s;
}

/**
 * The holes of section 38 in the V-ribs of types 5 and 6 (right half
 * wing), as the engine cuts them, from the last row with holes of types
 * 5/15 and 6/16:
 * - type 5, laid flat and turned along its edge on the anchor rib: at
 *   each anchor, `h` the distance across in x to the other edge's point
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
): HoledVRib[] {
  const rows = design.hvrHoles.mode === 0 ? [] : design.hvrHoles.rows;
  const [five, six] = [keptRow(rows, [5, 15]), keptRow(rows, [6, 16])];
  return vRibs(design, airfoils).flatMap((rib): HoledVRib[] => {
    const [a, b] = rib.edges;
    if (rib.type === 5 && rows[five]) {
      const { height, width, center } = rows[five];
      // The left V-rib lays the anchor rib on the right, the right one on the left.
      const left = rib.ribs[1] < rib.ribs[0];
      const edges = left ? ([b, a] as const) : ([a, b] as const);
      const flat = upright(flatten(...edges));
      const [anchored, other] = left ? [flat.right, flat.left] : [flat.left, flat.right];
      const holes = intradosAnchors(design, airfoils, rib.ribs[0]).map((anchor): FlatHole => {
        const s = nearest(a, anchor);
        const point = at(anchored, s);
        const past = other[Math.min(Math.floor(s) + 1, other.length - 1)];
        const h = left ? point[0] - past[0] : past[0] - point[0];
        return {
          center: [point[0] + (left ? -h : h) * center, point[1]],
          a: Math.abs(height * h * 0.005),
          b: Math.abs(width * h * 0.005),
          angle: 0,
          row: five,
        };
      });
      return [{ rib, flat, edges, holes }];
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
      return [{ rib, flat, edges: [a, b], holes }];
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
