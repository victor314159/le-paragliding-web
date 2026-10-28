// Section 16 of the engine: the V and VH ribs in space (§16.2, 16.3, 16.6),
// as it draws them in its 3D model.
import type { HvRib, LepAirfoil, LepDesign } from '@lepara/format';
import { finite, ribAirfoil, ribChord, ribPoint, type Point3 } from './ribs.ts';

export type VRibSections = 'geometry' | 'wingTip' | 'airfoils' | 'thickness' | 'anchors' | 'hvRibs';

/**
 * A V or VH rib of section 12 between two ribs, as the engine draws it in
 * its 3D model: segments from each point of its edge on rib `ribs[0]` to
 * the matching point of its edge on rib `ribs[1]`, on the right half wing.
 */
export interface VRib {
  /**
   * The rows of section 12 that build it, from 1: its own, and for type 5
   * those of its rib from its first anchor row.
   */
  readonly rows: readonly number[];
  /** Its type, those in % of chord as the engine converts them: 2 to 6. */
  readonly type: number;
  /** The rib numbers of its edges. */
  readonly ribs: readonly [number, number];
  /** The engine's DXF color: the side for types 2 to 5, the rib's parity for type 6. */
  readonly color: number;
  /** Its edges at Wing scale, as many points each: 21, or 121 for type 5. */
  readonly edges: readonly [readonly Point3[], readonly Point3[]];
}

/** A point of a rib in the engine's `u(i,j,3)`, `v(i,j,3)`: cm at Wing scale along the chord and up. */
type Local = readonly [number, number];

/**
 * The airfoil of rib number `rib` in these units, points numbered from 1
 * from the trailing edge over the extrados (`np(i,2)` of them); the
 * engine's arrays hold zeros past the last.
 */
function contour(
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
) {
  const { points, extrados } = ribAirfoil(design, airfoils, rib - 1);
  const chord = ribChord(design, rib - 1);
  const point = (j: number): Local => {
    const p = points[j - 1];
    return p ? [p[0] * chord, -p[1] * chord] : [0, 0];
  };
  return {
    rib,
    chord,
    count: points.length,
    extrados,
    point,
    u: (j: number) => point(j)[0],
    v: (j: number) => point(j)[1],
  };
}
type Contour = ReturnType<typeof contour>;

/** The height at `x` of the line through points `j` and `j + 1`, as the engine computes it. */
function across(c: Contour, j: number, x: number) {
  const [[u1, v1], [u2, v2]] = [c.point(j), c.point(j + 1)];
  const xm = (v2 - v1) / (u2 - u1);
  return xm * x + (v1 - xm * u1);
}

/** The intrados at `x`, on the last segment from the nose that spans it (`j` its first point). */
function lower(c: Contour, x: number) {
  let found: { v: number; j: number } | undefined;
  for (let j = c.extrados; j <= c.count; j++)
    if (c.u(j) <= x && c.u(j + 1) >= x) found = { v: across(c, j, x), j };
  return found;
}

/**
 * The extrados at `x`, on the last segment from the trailing edge that
 * spans it (`j` its point towards the nose, `jcon`); `inclusive` for type
 * 2, which also takes a segment starting at `x`.
 */
function upper(c: Contour, x: number, inclusive = false) {
  let found: { v: number; j: number } | undefined;
  for (let j = 1; j <= c.extrados; j++)
    if ((inclusive ? c.u(j) >= x : c.u(j) > x) && c.u(j + 1) <= x)
      found = { v: across(c, j, x), j: j + 1 };
  return found;
}

/**
 * `vredis`: `n` points along a polyline, taken from it cut into tenths of
 * its segments, every `(10·n1 − 1) / (n − 1)` tenths in integers, one more
 * for the first ones; the last point its end. Undefined where the engine
 * would read past its tenths.
 */
export function redistribute(points: readonly Local[], n: number): Local[] | undefined {
  const n1 = points.length;
  if (n1 === 2) {
    const [[x1, y1], [x2, y2]] = points;
    const [dx, dy] = [(x2 - x1) / (n - 1), (y2 - y1) / (n - 1)];
    return Array.from({ length: n }, (_, j) => [x1 + dx * j, y1 + dy * j]);
  }
  if (n1 < 2) return undefined;
  const tenths: Local[] = [];
  for (let s = 0; s < n1 - 1; s++) {
    const [[x, y], [x2, y2]] = [points[s], points[s + 1]];
    for (let k = 0; k <= (s === n1 - 2 ? 10 : 9); k++)
      tenths.push([x + (k / 10) * (x2 - x), y + (k / 10) * (y2 - y)]);
  }
  const step = Math.trunc((10 * n1 - 1) / (n - 1));
  const extra = 10 * (n1 - 1) - step * (n - 1);
  const result: Local[] = [];
  for (let j = 1, t = 0; j <= n; j++) {
    const point = j === n ? points[n1 - 1] : tenths[t];
    if (!point || j > tenths.length) return undefined;
    result.push(point);
    t += step + (j <= extra ? 1 : 0);
  }
  return result;
}

/** 21 points from `a` to `b`, the engine adding the step each time. */
function straight([u1, v1]: Local, [u2, v2]: Local): Local[] {
  const points: Local[] = [];
  for (let j = 0, du = 0, dv = 0; j < 21; j++) {
    points.push([u1 + du, v1 + dv]);
    du += (u2 - u1) / 20;
    dv += (v2 - v1) / 20;
  }
  return points;
}

/**
 * Types 2 to 4 on their anchor ribs (§16.2.1, 16.3.1.1, 16.4.1): the intrados from
 * `center − half` to `center + half` at 21 even chord positions, between
 * the profile points of the segments found. Where no segment spans a
 * position, the engine keeps the line of the last one it took.
 */
function intradosBand(c: Contour, center: number, half: number): Local[] | undefined {
  const [u2, u4] = [center - half, center + half];
  let xm = Number.NaN;
  let xb = Number.NaN;
  let p2: { v: number; j: number } | undefined;
  let p4: { v: number; j: number } | undefined;
  for (let j = c.extrados; j <= c.count; j++)
    for (const [x, point] of [
      [u2, 2],
      [center, 3],
      [u4, 4],
    ] as const)
      if (c.u(j) <= x && c.u(j + 1) >= x) {
        xm = (c.v(j + 1) - c.v(j)) / (c.u(j + 1) - c.u(j));
        xb = c.v(j) - xm * c.u(j);
        if (point === 2) p2 = { v: xm * x + xb, j };
        if (point === 4) p4 = { v: xm * x + xb, j };
      }
  if (!p2 || !p4) return undefined;
  const [j2, j4] = [p2.j, p4.j];
  const points: Local[] = [];
  for (let j = 0, du = 0; j < 21; j++) {
    const x = u2 + du;
    du += (u4 - u2) / 20;
    let v = Number.NaN;
    if (x <= c.u(j2 + 1)) {
      xm = (c.v(j2 + 1) - p2.v) / (c.u(j2 + 1) - u2);
      xb = p2.v - xm * u2;
      v = xm * x + xb;
    }
    if (x >= c.u(j2 + 1) && x <= c.u(j4)) {
      for (let l = j2 + 1; l <= j4 - 1; l++)
        if (x >= c.u(l) && x <= c.u(l + 1)) {
          xm = (c.v(l + 1) - c.v(l)) / (c.u(l + 1) - c.u(l));
          xb = c.v(l) - xm * c.u(l);
        }
      v = xm * x + xb;
    }
    if (x > c.u(j4)) {
      xm = (p4.v - c.v(j4)) / (u4 - c.u(j4));
      xb = p4.v - xm * u4;
      v = xm * x + xb;
    }
    points.push([x, v]);
  }
  return points;
}

/**
 * `n` points (`vredis`) along the polyline of `count` points from `start`
 * to `end` through the profile points `from + step`, `from + 2·step`, …:
 * as the engine counts them from its `jcon`, the profile point nearest
 * `end` is left out.
 */
function along(
  c: Contour,
  start: Local,
  end: Local,
  from: number,
  count: number,
  step: number,
  n: number,
) {
  if (count < 2) return undefined;
  const points: Local[] = [start];
  for (let j = 2; j <= count - 1; j++) points.push(c.point(from + step * (j - 1)));
  points.push(end);
  return redistribute(points, n);
}

/**
 * The extrados from `u9` to `u11` (`u9 < u11`), in 21 points: from the
 * point 9, the profile points towards the trailing edge but the last
 * before 11 (`jcon(9) − 1` down to `jcon(11) + 1`), and 11.
 */
function extradosBand(c: Contour, u9: number, u11: number) {
  const [p9, p11] = [upper(c, u9), upper(c, u11)];
  if (!p9 || !p11) return undefined;
  return along(c, [u9, p9.v], [u11, p11.v], p9.j, p9.j - p11.j + 1, -1, 21);
}

/**
 * Types 2 and 4 off their anchor rib (§16.2.2, 16.4.2): 21 points on a
 * straight line `2·half` long about the point at `center`, `height` % of
 * the way from the intrados to the extrados, at `angle` (deg) to the
 * chord; at 90°, from the points at that height `half` before and after.
 */
function heightLine(c: Contour, center: number, half: number, height: number, angle: number) {
  const at = (x: number) => {
    const [a, b] = [lower(c, x)?.v, upper(c, x, true)?.v];
    return a === undefined || b === undefined ? Number.NaN : (b - a) * (height / 100) + a;
  };
  const [v6, v7, v8] = [at(center - half), at(center), at(center + half)];
  if (![v6, v7, v8].every(finite)) return undefined;
  if (angle === 90) return straight([center - half, v6], [center + half, v8]);
  const [cos, sin] = [Math.cos((Math.PI / 180) * angle), Math.sin((Math.PI / 180) * angle)];
  return straight([center - half * cos, v7 - half * sin], [center + half * cos, v7 + half * sin]);
}

/** The intersection of the lines through `r` and `s` (`xrxs`), by their slopes. */
function intersection(r: readonly [Local, Local], s: readonly [Local, Local]): Local {
  const mr = (r[1][1] - r[0][1]) / (r[1][0] - r[0][0]);
  const br = r[0][1] - mr * r[0][0];
  const ms = (s[1][1] - s[0][1]) / (s[1][0] - s[0][0]);
  const bs = s[0][1] - ms * s[0][0];
  const u = (bs - br) / (mr - ms);
  return [u, mr * u + br];
}

/**
 * Type 5, where a line from `from` at `angle` (deg) towards the leading
 * edge (`direction` −1) or the trailing edge (1) crosses the extrados:
 * the last segment from `first` that it crosses above the chord, and its
 * point towards the nose (`jcon`).
 */
function extradosHit(c: Contour, from: Local, direction: number, angle: number, first: number) {
  const r = [from, [from[0] + direction, from[1] + Math.tan((angle * Math.PI) / 180)]] as const;
  let found: { point: Local; j: number } | undefined;
  for (let k = first; k <= c.extrados; k++) {
    const s = [c.point(k), c.point(k + 1)] as const;
    const point = intersection(r, s);
    if (s[0][0] >= point[0] && s[1][0] < point[0] && s[1][1] >= 0) found = { point, j: k + 1 };
  }
  return found;
}

/**
 * The columns of the rows of section 12 as the engine uses them, `hvr(k,
 * 1..20)` from 1: absolute widths at Wing scale, types 11 to 16 converted
 * into 1 to 6 by the chords it has read (Wing scale, before the wing tip;
 * 0 outside the wing, that of the central rib for rib 0). A type 3 in % of chord (column 9 at 1) is
 * converted, then read again, as the engine reads the section twice: its
 * widths stay the numbers given, in cm, and unscaled.
 */
function columns(design: Pick<LepDesign, 'geometry' | 'hvRibs'>) {
  const { ribs, wingScale: scale } = design.geometry;
  // Rib 0 is the engine's copy of the central rib.
  const chord = (rib: number) => {
    const r = ribs[Math.max(Math.trunc(rib), 1) - 1];
    return r ? (r.yTE - r.yLE) * scale : 0;
  };
  return design.hvRibs.ribs.map((row: HvRib) => {
    const h = Array<number>(21).fill(0);
    h[1] = row.number;
    h[2] = row.type;
    row.parameters.forEach((value, i) => (h[i + 3] = value));
    const scaled = (...cols: number[]) => cols.forEach((col) => (h[col] *= scale));
    if (h[2] === 2 || h[2] === 4 || (h[2] === 3 && h[9] !== 1)) scaled(7, 8);
    if (h[2] === 5) scaled(10);
    if (h[2] === 6) scaled(6, 7, 11, 12);
    const [here, left, right] = [chord(h[3]), chord(h[3] - 1), chord(h[3] + 1)];
    if (h[2] === 12 || h[2] === 13) {
      [h[17], h[18]] = [h[7], h[8]];
      h[7] = (h[17] / 100) * here;
      h[8] = (h[18] / 100) * here;
      h[15] = (h[18] / 100) * left - h[8];
      // Type 2 takes its right increment from column 17, type 3 from 16.
      h[h[2] === 12 ? 17 : 16] = (h[18] / 100) * right - h[8];
      h[2] -= 10;
    }
    if (h[2] === 14) {
      [h[17], h[18]] = [h[7], h[8]];
      h[7] = (h[7] / 100) * here;
      h[8] = (h[8] / 100) * here;
      h[15] = (h[17] / 100) * left - h[7];
      h[16] = (h[17] / 100) * chord(h[3] + 2) - h[7];
      h[2] = 4;
    }
    if (h[2] === 15) {
      h[10] = (h[10] / 100) * here;
      h[2] = 5;
    }
    if (h[2] === 16) {
      h[6] = (h[6] / 100) * here;
      h[7] = (h[7] / 100) * here;
      h[11] = (h[11] / 100) * chord(h[8]);
      h[12] = (h[12] / 100) * chord(h[8]);
      h[2] = 6;
    }
    if (h[2] === 11) {
      h[17] = h[7];
      h[7] = (h[17] / 100) * here;
      h[20] = (h[17] / 100) * chord(h[5]) - h[7];
      h[2] = 1;
    }
    return h;
  });
}

/**
 * The suspension anchors of rib number `rib` on its intrados, at Wing
 * scale, where type 5 takes them (§16.3.2.5): the anchor rows of section
 * 3, without the brake.
 */
export function intradosAnchors(
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
): Point3[] {
  const c = contour(design, airfoils, rib);
  const count = design.anchors[rib - 1]?.count ?? 0;
  return (design.anchors[rib - 1]?.positions ?? []).slice(0, Math.min(count, 5)).flatMap((x) => {
    const point = lower(c, (c.chord * x) / 100);
    const placed = point && ribPoint(design, rib - 1, [x / 100, -point.v / c.chord]);
    return placed ? [placed] : [];
  });
}

/**
 * The V and VH ribs of section 12 at Wing scale, right half wing, as the
 * engine draws them in its 3D model (§16): types 2 to 5 about the rib of
 * the row, on the sides its columns 5 and 6 choose, type 6 from a rib to
 * another; not H straps (type 1), which the engine leaves out of the 3D
 * model. The engine keeps its edges in arrays by rib and anchor row (a
 * virtual row for type 6), from row to row:
 * - type 2 joins a band of intrados about the anchor to a straight line
 *   on each neighbour, at a height (% of thickness, column 9) and an
 *   angle (column 10) about the neighbour's anchor;
 * - type 3 joins it to a band of the neighbour's extrados, as wide as
 *   column 8;
 * - type 4 spans three cells: bands of intrados on the ribs before and
 *   after two ribs with the straight lines of type 2, joined in turn;
 * - type 5 joins the intrados of the rib from its first anchor to its
 *   last, to the extrados of each neighbour where lines from these
 *   anchors, at the angles of columns 7 and 8, cross it. The engine
 *   builds it row by row and draws it on the last anchor row, when the
 *   neighbours have as many rows;
 * - type 6 joins two bands at chord positions and heights of their own:
 *   along the extrados at 100 % of thickness, else straight. The engine
 *   draws the line it last kept for the next rib of the row's rib: a type
 *   6 that does not go to the next rib is left out.
 */
export function vRibs(
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): VRib[] {
  const count = design.geometry.ribs.length;
  const contours = new Map<number, Contour | undefined>();
  const rib = (number: number) => {
    if (!Number.isInteger(number) || number < 1 || number > count) return undefined;
    if (!contours.has(number)) contours.set(number, contour(design, airfoils, number));
    return contours.get(number);
  };
  const anchorCount = (number: number) => design.anchors[number - 1]?.count;
  const anchor = (c: Contour, row: number) =>
    (c.chord * (design.anchors[c.rib - 1]?.positions[row - 1] ?? Number.NaN)) / 100;
  const place = (c: Contour, points: readonly Local[] | undefined) => {
    const placed = points?.map(([u, v]) =>
      ribPoint(design, c.rib - 1, [u / c.chord, -v / c.chord]),
    );
    return placed?.every((p): p is Point3 => !!p) ? placed : undefined;
  };
  // The engine's 3D edges by rib and row: rx1 (left neighbour, kept at the
  // row's rib), rx2 (the row's rib), rx3 (right neighbour, kept at the rib before it).
  const edges = [1, 2, 3].map(() => new Map<string, Point3[]>());
  const keep = (edge: number, at: number, row: number, points: Point3[] | undefined) => {
    if (points) edges[edge - 1].set(`${at}/${row}`, points);
    else edges[edge - 1].delete(`${at}/${row}`);
  };
  const kept = (edge: number, at: number, row: number) => edges[edge - 1].get(`${at}/${row}`);
  // Type 5 keeps its points by rib across rows: 2 and 4 on the row's rib, 9 and 11 on a neighbour.
  const first = new Map<number, { point: Local; j: number }>();
  const last = new Map<number, { point: Local; j: number }>();
  const nine = new Map<number, { point: Local; j: number }>();
  const eleven = new Map<number, { point: Local; j: number }>();
  const result: VRib[] = [];
  // The type 5 rows of each rib, from its first anchor row.
  const group = new Map<number, number[]>();
  const draw = (
    rows: readonly number[],
    h: number[],
    color: number,
    ribs: [number, number],
    a?: Point3[],
    b?: Point3[],
  ) => {
    if (a && b) result.push({ rows, type: h[2], ribs, color, edges: [a, b] });
  };
  columns(design).forEach((h, k, rows) => {
    const [type, r, row] = [h[2], Math.trunc(h[3]), Math.trunc(h[4])];
    if (type === 2 || type === 3) {
      const [here, left, right] = [rib(r), rib(r - 1), rib(r + 1)];
      if (!here) return;
      keep(2, r, row, place(here, intradosBand(here, anchor(here, row), h[7])));
      const neighbour = (c: Contour | undefined, increment: number) => {
        if (!c) return undefined;
        const center = anchor(c, row);
        const half = h[8] + increment;
        return type === 3
          ? extradosBand(c, center - half, center + half)
          : heightLine(c, center, half, h[9], h[10]);
      };
      if (left) keep(1, r, row, place(left, neighbour(left, h[15])));
      if (right) keep(3, r, row, place(right, neighbour(right, type === 2 ? h[17] : h[16])));
      const [colors, line] = [type === 2 ? [5, 1] : [4, 3], kept(2, r, row)];
      if (h[5] === 1) draw([k + 1], h, colors[0], [r, r - 1], line, kept(1, r, row));
      if (h[6] === 1) draw([k + 1], h, colors[1], [r, r + 1], line, kept(3, r, row));
    }
    if (type === 4) {
      const [a, b, c, d] = [r - 1, r, r + 1, r + 2].map(rib);
      const band = (e: Contour | undefined, increment: number) =>
        e && place(e, intradosBand(e, anchor(e, row), h[7] + increment));
      const middle = (e: Contour | undefined) =>
        e && place(e, heightLine(e, anchor(e, row), h[8], h[9], h[10]));
      const edges = [band(a, h[15]), middle(b), middle(c), band(d, h[16])];
      if (h[5] === 1) draw([k + 1], h, 3, [r - 1, r], edges[0], edges[1]);
      draw([k + 1], h, 2, [r, r + 1], edges[1], edges[2]);
      if (h[6] === 1) draw([k + 1], h, 1, [r + 1, r + 2], edges[2], edges[3]);
    }
    if (type === 5) {
      const [here, left, right] = [rib(r), rib(r - 1), rib(r + 1)];
      if (!here) return;
      group.set(r, [...(row === 1 ? [] : (group.get(r) ?? [])), k + 1]);
      const center = anchor(here, row);
      const [p2, p4] = [lower(here, center - h[10]), lower(here, center + h[10])];
      if (row === 1 && p2) first.set(r, { point: [center - h[10], p2.v], j: p2.j });
      if (row === anchorCount(r) && p4) last.set(r, { point: [center + h[10], p4.v], j: p4.j });
      const [a, b] = [first.get(r), last.get(r)];
      if (row === anchorCount(r))
        keep(
          2,
          r,
          row,
          a && b
            ? place(here, along(here, a.point, b.point, a.j, b.j - a.j + 1, 1, 121))
            : undefined,
        );
      const neighbour = (c: Contour | undefined, edge: number) => {
        if (!c) return;
        const middle = anchor(c, row);
        const [q2, q4, q10] = [
          lower(c, middle - h[10]),
          lower(c, middle + h[10]),
          upper(c, middle),
        ];
        if (row === 1 && q2 && q10) {
          const hit = extradosHit(c, [middle - h[10], q2.v], -1, h[7], q10.j);
          if (hit) nine.set(c.rib, hit);
        }
        if (row !== anchorCount(c.rib)) return;
        if (q4) {
          const hit = extradosHit(c, [middle + h[10], q4.v], 1, h[8], 1);
          if (hit) eleven.set(c.rib, hit);
        }
        const [p9, p11] = [nine.get(c.rib), eleven.get(c.rib)];
        const line = p9 && p11 && along(c, p9.point, p11.point, p9.j, p9.j - p11.j + 1, -1, 121);
        keep(edge, r, row, place(c, line));
      };
      neighbour(left, 1);
      neighbour(right, 3);
      const drawn = [r - 1, r, r + 1].every((number) => row === anchorCount(number));
      if (drawn && h[5] === 1)
        draw(group.get(r)!, h, 5, [r, r - 1], kept(2, r, row), kept(1, r, row));
      if (drawn && h[6] === 1)
        draw(group.get(r)!, h, 1, [r, r + 1], kept(2, r, row), kept(3, r, row));
    }
    if (type === 6) {
      // The virtual row: 2 after a type 6 on the same rib, else 1.
      const previous = rows[k - 1];
      const virtual = previous && previous[2] === 6 && previous[3] === h[3] ? 2 : 1;
      const end = Math.trunc(h[8]);
      const band = (
        c: Contour | undefined,
        position: number,
        height: number,
        minus: number,
        plus: number,
      ) => {
        if (!c) return undefined;
        const center = (c.chord * position) / 100;
        const [u2, u4] = [center - minus, center + plus];
        if (height === 100) return extradosBand(c, u2, u4);
        const [p2, p4, p9, p11] = [lower(c, u2), lower(c, u4), upper(c, u2), upper(c, u4)];
        if (!p2 || !p4 || !p9 || !p11) return undefined;
        return straight(
          [u2, (p9.v - p2.v) * (height / 100) + p2.v],
          [u4, (p11.v - p4.v) * (height / 100) + p4.v],
        );
      };
      const [start, other] = [rib(r), rib(end)];
      if (start) keep(2, r, virtual, place(start, band(start, h[4], h[5], h[6], h[7])));
      if (other) keep(3, end - 1, virtual, place(other, band(other, h[9], h[10], h[11], h[12])));
      draw([k + 1], h, r % 2 === 1 ? 4 : 30, [r, end], kept(2, r, virtual), kept(3, r, virtual));
    }
  });
  return result;
}

/** An H strap of section 12 (type 1) between two ribs: as a `VRib`, without color. */
export type HStrap = Omit<VRib, 'type' | 'color'>;

/**
 * The H straps of section 12 at Wing scale, right half wing, as the engine
 * computes them before laying them flat in its 2D drawing (§16.1), which
 * it leaves out of its 3D model: on each of its two ribs, the band of
 * intrados about its anchor, as types 2 to 4 take it, as wide as column 7
 * (in cm, which the engine does not scale) or, for type 11, of each rib's
 * chord. Rib 0 is the engine's copy of the central rib, on the left half
 * wing.
 */
export function hStraps(
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): HStrap[] {
  const count = design.geometry.ribs.length;
  const edge = (number: number, row: number, half: number) => {
    const rib = Math.trunc(number);
    if (rib < 0 || rib > count) return undefined;
    const c = contour(design, airfoils, Math.max(rib, 1));
    const position = design.anchors[c.rib - 1]?.positions[Math.trunc(row) - 1];
    const band = finite(position) && intradosBand(c, (c.chord * position) / 100, half);
    const placed = band
      ? band.map(([u, v]) => ribPoint(design, c.rib - 1, [u / c.chord, -v / c.chord]))
      : [];
    if (!band || !placed.every((p): p is Point3 => !!p)) return undefined;
    return rib === 0 ? placed.map(([x, y, z]): Point3 => [-x, y, z]) : placed;
  };
  // The engine leaves out a strap from rib 0 without a central cell.
  const central = (design.geometry.ribs[0]?.x ?? 0) > 0.01;
  return columns(design).flatMap((h, k) => {
    if (h[2] !== 1 || (h[3] <= 0 && !central)) return [];
    const a = edge(h[3], h[4], h[7]);
    const b = edge(h[5], h[6], h[7] + h[20]);
    return a && b
      ? [{ rows: [k + 1], ribs: [Math.trunc(h[3]), Math.trunc(h[5])], edges: [a, b] }]
      : [];
  });
}
