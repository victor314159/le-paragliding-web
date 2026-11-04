// Section 16 of the engine: the V and VH ribs in space (§16.2, 16.3, 16.6),
// as it draws them in its 3D model.
import type { HvRib, LepAirfoil, LepDesign } from '@lepara/format';
import { markOffset } from './marks.ts';
import { finite, ribChord, ribPoint, type Point3 } from './ribs.ts';
import { ribStations, type Stations } from './skin-ribs.ts';

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
  /** Type 5: what its cut between anchors takes (§16.3.2.5). */
  readonly continuous?: Continuous;
}

/** The cutouts of a type 5 V-rib between its anchors, laid flat. */
export interface Continuous {
  /**
   * The lengths along its rib's intrados from the end of its edge there
   * (point 4) back to each anchor, as the engine measures them on the
   * airfoil (`rib(i,130+klz) − rib(i,104)`).
   */
  readonly anchors: readonly number[];
  /** Column 9: the cutouts' depth, % of the way to the other edge; over 100, ellipses. */
  readonly depth: number;
  /**
   * The length of its neighbour's extrados from the trailing edge to the
   * end of its edge there (point 11, `rib(i,105)`), where its marks start;
   * none without that point.
   */
  readonly extrados?: number;
  /** Column 10 at Wing scale: the band left about each anchor, in cm. */
  readonly margin: number;
}

/** A point of a rib in the engine's `u(i,j,3)`, `v(i,j,3)`: cm at Wing scale along the chord and up. */
export type Local = readonly [number, number];

/**
 * The airfoil of rib number `rib` in these units, points numbered from 1
 * from the trailing edge over the extrados (`np(i,2)` of them); the
 * engine's arrays hold zeros past the last.
 */
function contour(
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
  stations: Stations = ribStations,
) {
  const { points = [], upper: extrados = 0 } = stations(design, airfoils, rib - 1) ?? {};
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
export type Contour = ReturnType<typeof contour>;

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

/** A band's ends on its rib (points 2 and 4, or 9 and 11) and their profile points (`jcon`). */
interface Ends {
  readonly ends: readonly [Local, Local];
  readonly jcon: readonly [number, number];
}

/**
 * Types 2 to 4 on their anchor ribs (§16.2.1, 16.3.1.1, 16.4.1): the intrados from
 * `center − half` to `center + half` at 21 even chord positions, between
 * the profile points of the segments found. Where no segment spans a
 * position, the engine keeps the line of the last one it took.
 */
function intradosBand(
  c: Contour,
  center: number,
  half: number,
): ({ points: Local[] } & Ends) | undefined {
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
  return {
    points,
    ends: [
      [u2, p2.v],
      [u4, p4.v],
    ],
    jcon: [j2, j4],
  };
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
  const points = along(c, [u9, p9.v], [u11, p11.v], p9.j, p9.j - p11.j + 1, -1, 21);
  if (!points) return undefined;
  const ends: [Local, Local] = [
    [u9, p9.v],
    [u11, p11.v],
  ];
  return { points, ends, jcon: [p9.j, p11.j] as const };
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
  const [cos, sin] = [Math.cos((Math.PI / 180) * angle), Math.sin((Math.PI / 180) * angle)];
  // Points 6 and 8.
  const ends: [Local, Local] =
    angle === 90
      ? [
          [center - half, v6],
          [center + half, v8],
        ]
      : [
          [center - half * cos, v7 - half * sin],
          [center + half * cos, v7 + half * sin],
        ];
  return { points: straight(...ends), ends };
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
export function columns(design: Pick<LepDesign, 'geometry' | 'hvRibs'>) {
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

/** Type 5 (§16.3.2.2): the length along the extrados of `c` from its trailing edge to `hit`. */
function extradosLength(c: Contour, hit: { point: Local; j: number }) {
  let length = 0;
  for (let j = 1; j <= hit.j - 2; j++)
    length += Math.hypot(c.u(j + 1) - c.u(j), c.v(j + 1) - c.v(j));
  return length + Math.hypot(c.u(hit.j - 1) - hit.point[0], c.v(hit.j - 1) - hit.point[1]);
}

/**
 * Type 5 (§6, 16.3.2.1): the lengths along the intrados of rib `c` from
 * `end` (point 4, after its point `j`) back to its anchors, each measured
 * from the trailing edge as the engine does; anchors on no segment left out.
 */
function anchorLengths(
  design: Pick<LepDesign, 'anchors'>,
  c: Contour,
  end: { point: Local; j: number },
) {
  // From the last point down to point `j`, then to `p`.
  const fromEnd = (j: number, [u, v]: Local) => {
    let length = 0;
    for (let jj = c.count; jj >= j + 1; jj--)
      length += Math.hypot(c.u(jj) - c.u(jj - 1), c.v(jj) - c.v(jj - 1));
    return length + Math.hypot(c.u(j) - u, c.v(j) - v);
  };
  const four = fromEnd(end.j + 1, end.point);
  const { count = 0, positions = [] } = design.anchors[c.rib - 1] ?? {};
  return positions.slice(0, count).flatMap((position) => {
    const x = (c.chord * position) / 100;
    let found: number | undefined;
    for (let j = c.count; j >= 2; j--) if (c.u(j - 1) <= x && c.u(j) > x && c.u(j) >= 0) found = j;
    return found ? [fromEnd(found, [x, across(c, found - 1, x)]) - four] : [];
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
  steps: TraceSteps = engineTraces,
): VRib[] {
  return model(design, airfoils, 0, false, steps).vribs;
}

export type VRibTraceSections = VRibSections | 'marks' | 'markTypes' | 'specialParameters';

/** What the engine draws of the V-ribs on a rib (§16.2.5.3, 16.3.1.5.3, 16.3.2.5.3, 16.4.5, 16.6.5). */
export interface VRibTrace {
  /** Segments on its printed drawing: where a V-rib's edge is sewn. */
  readonly lines: Local[][];
  /** On its cutting table: segments, and dots. */
  readonly tableLines: Local[][];
  readonly dots: Local[];
}

/** The slope of airfoil `c` about its point `j` (`jcon`): from point j − 1 to j + 1. */
const airfoilSlope = (c: Contour, j: number) => {
  const [[u0, v0], [u1, v1]] = [c.point(j - 1), c.point(j + 1)];
  return Math.atan((v0 - v1) / (u0 - u1));
};

/** The steps of the V-ribs' traces each model takes its own way. */
export interface TraceSteps {
  /** How far type 2 moves the end dots on its left neighbour inwards, in mark offsets. */
  readonly leftInwards: number;
  /** The angle type 4 turns the dots of its middle rib `c` by, from its line's ends. */
  middleAngle(c: Contour, ends: readonly [Local, Local]): number;
  /** Whether type 5 turns the dots on its own rib by its left neighbour's lines. */
  readonly neighbourTurn: boolean;
  /** The airfoil stations the V-ribs lie on. */
  readonly stations: Stations;
  /**
   * Whether type 6 marks and joins the next rib only, whatever rib it goes
   * to (the engine's, with what it kept for the next rib), or its own.
   */
  readonly nextRibOnly: boolean;
}

/**
 * The engine's: type 2's left dots 2·`xdes` in; type 4's turned by points 6
 * and 8's `jcon`, never set: 0; type 5's by its left neighbour's lines.
 */
export const engineTraces: TraceSteps = {
  leftInwards: 2,
  middleAngle: (c) => airfoilSlope(c, 0),
  neighbourTurn: true,
  nextRibOnly: true,
  stations: ribStations,
};

/**
 * The traces of the V and VH ribs of section 12 on each rib (by number,
 * from 1), in the rib's `u(i,j,3)`, `v(i,j,3)` (cm along the chord and up):
 * the segment between a V-rib's ends, and dots `xdes` off it: 3 across the
 * airfoil at a band's ends, or along the segment. Quirks kept: type 2
 * moves its left dots 2·`xdes` inwards along the segment; type 4 turns the
 * dots of its middle ribs by a `jcon` never set (0, the trailing edge's
 * slope from the origin); type 5 turns the dots on its rib by its left
 * neighbour's lines. Not ported: a type 6 to another rib than the next,
 * which the engine marks on the next rib with whatever it kept there.
 */
export function vRibTraces(
  design: Pick<LepDesign, VRibTraceSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  steps: TraceSteps = engineTraces,
): ReadonlyMap<number, VRibTrace> {
  const { specialParameters: special } = design;
  // Section 37, code 2006: the type 6 segments also on the cutting table.
  const code2006 =
    special.mode === 1 && special.entries.some((p) => p.code === 2006 && p.value === 1);
  return model(design, airfoils, markOffset(design), code2006, steps).traces;
}

function model(
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  xdes: number,
  code2006: boolean,
  steps: TraceSteps,
) {
  const count = design.geometry.ribs.length;
  const contours = new Map<number, Contour | undefined>();
  const rib = (number: number) => {
    if (!Number.isInteger(number) || number < 1 || number > count) return undefined;
    if (!contours.has(number))
      contours.set(number, contour(design, airfoils, number, steps.stations));
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
  const traces = new Map<number, VRibTrace>();
  /** Rib `number`'s traces: `line` on its drawing, on the table too if `table`, and table dots. */
  const trace = (
    number: number,
    line: [Local, Local] | undefined,
    table: boolean,
    dots: Local[],
  ) => {
    if (number < 1 || number > count) return;
    if (!traces.has(number)) traces.set(number, { lines: [], tableLines: [], dots: [] });
    const t = traces.get(number)!;
    if (line) t.lines.push(line);
    if (line && table) t.tableLines.push(line);
    // A V-rib of no width has no direction: the engine's dots are NaN.
    t.dots.push(...dots.filter((p) => p.every(Number.isFinite)));
  };
  /**
   * `n` dots across the airfoil at a band's end `p`, the
   * first `xdes` inside: `side` 1 on the intrados, −1 on the extrados.
   */
  const acrossAt = (p: Local, alpha: number, side: number, n = 3) =>
    Array.from({ length: n }, (_, k): Local => [
      p[0] + side * (xdes - k) * Math.sin(alpha),
      p[1] - side * (xdes - k) * Math.cos(alpha),
    ]);
  /** Dots at a segment's ends and middle, `xdes` above it; `inwards` moves the ends 2·`xdes` in. */
  const alongSegment = ([p6, p8]: readonly [Local, Local], inwards: number): Local[] => {
    const alpha = Math.atan((p8[1] - p6[1]) / (p8[0] - p6[0]));
    const [sin, cos] = [Math.sin(alpha), Math.cos(alpha)];
    const off = (p: Local, sign: number): Local => [
      p[0] - xdes * sin + sign * inwards * xdes * cos,
      p[1] + xdes * cos + sign * inwards * xdes * sin,
    ];
    const [a, b] = [off(p6, 1), off(p8, -1)];
    return [a, [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])], b];
  };
  // Type 5: points 2 (row 1) and 4 (by row) of the neighbours, `ucnt(i±1,ii,2|4)`.
  const twos = new Map<string, Local>();
  const fours = new Map<string, Local>();
  // The type 5 rows of each rib, from its first anchor row.
  const group = new Map<number, number[]>();
  const draw = (
    rows: readonly number[],
    h: number[],
    color: number,
    ribs: [number, number],
    a?: Point3[],
    b?: Point3[],
    continuous?: Continuous,
  ) => {
    if (a && b) result.push({ rows, type: h[2], ribs, color, edges: [a, b], continuous });
  };
  columns(design).forEach((h, k, rows) => {
    const [type, r, row] = [h[2], Math.trunc(h[3]), Math.trunc(h[4])];
    if (type === 2 || type === 3) {
      const [here, left, right] = [rib(r), rib(r - 1), rib(r + 1)];
      if (!here) return;
      const band = intradosBand(here, anchor(here, row), h[7]);
      keep(2, r, row, place(here, band?.points));
      trace(r, band?.ends && [...band.ends], false, []);
      // On the left (`side` −1) or right neighbour, when that side is drawn.
      const neighbour = (c: Contour | undefined, increment: number, side: number) => {
        if (!c) return undefined;
        const center = anchor(c, row);
        const half = h[8] + increment;
        const drawn = h[side < 0 ? 5 : 6] === 1;
        if (type === 2) {
          const line = heightLine(c, center, half, h[9], h[10]);
          if (line && drawn)
            trace(
              c.rib,
              [...line.ends],
              true,
              alongSegment(line.ends, side < 0 ? steps.leftInwards : 0),
            );
          return line?.points;
        }
        const band = extradosBand(c, center - half, center + half);
        if (band && drawn) {
          const [p9, p11] = band.ends;
          trace(c.rib, [p9, p11], true, [
            ...acrossAt(p9, airfoilSlope(c, band.jcon[0]), -1),
            ...acrossAt(p11, airfoilSlope(c, band.jcon[1]), -1),
            ...[0, 2].map((k) => alongSegment(band.ends, side < 0 ? steps.leftInwards : 0)[k]),
          ]);
        }
        return band?.points;
      };
      if (left) keep(1, r, row, place(left, neighbour(left, h[15], -1)));
      if (right) keep(3, r, row, place(right, neighbour(right, type === 2 ? h[17] : h[16], 1)));
      const [colors, line] = [type === 2 ? [5, 1] : [4, 3], kept(2, r, row)];
      if (h[5] === 1) draw([k + 1], h, colors[0], [r, r - 1], line, kept(1, r, row));
      if (h[6] === 1) draw([k + 1], h, colors[1], [r, r + 1], line, kept(3, r, row));
    }
    if (type === 4) {
      const [a, b, c, d] = [r - 1, r, r + 1, r + 2].map(rib);
      const band = (e: Contour | undefined, increment: number, drawn: boolean) => {
        const b = e && intradosBand(e, anchor(e, row), h[7] + increment);
        if (e && b && drawn)
          trace(e.rib, [...b.ends], true, [
            ...acrossAt(b.ends[0], airfoilSlope(e, b.jcon[0]), 1),
            ...acrossAt(b.ends[1], airfoilSlope(e, b.jcon[1]), 1),
          ]);
        return e && place(e, b?.points);
      };
      const middle = (e: Contour | undefined, drawn: boolean) => {
        const line = e && heightLine(e, anchor(e, row), h[8], h[9], h[10]);
        if (e && line && drawn)
          trace(
            e.rib,
            [...line.ends],
            true,
            line.ends.flatMap((p) => acrossAt(p, steps.middleAngle(e, line.ends), -1, 1)),
          );
        return e && place(e, line?.points);
      };
      const edges = [
        band(a, h[15], h[5] === 1),
        middle(b, true),
        middle(c, h[6] === 1),
        band(d, h[16], h[6] === 1),
      ];
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
        if (q2) twos.set(`${c.rib}/${row}`, [middle - h[10], q2.v]);
        if (q4) fours.set(`${c.rib}/${row}`, [middle + h[10], q4.v]);
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
      if (row === anchorCount(r)) {
        // From a neighbour's point 9 to its point 2 of row 1, and from 11 to its 4 of this row.
        const lines = (n: number) => {
          const [p9, p2, p11, p4] = [
            nine.get(n)?.point,
            twos.get(`${n}/1`),
            eleven.get(n)?.point,
            fours.get(`${n}/${row}`),
          ];
          return p9 && p2 && p11 && p4 ? { p9, p2, p11, p4 } : undefined;
        };
        const klz = [1, 2, 3].map((k) => 1 - k + xdes);
        const turn = ({ p9, p2, p11, p4 }: NonNullable<ReturnType<typeof lines>>) => [
          -Math.atan((p9[1] - p2[1]) / (p9[0] - p2[0])),
          Math.atan((p11[1] - p4[1]) / (p11[0] - p4[0])),
        ];
        const own = lines(r - 1);
        if (!steps.neighbourTurn && a && b)
          trace(r, undefined, false, [
            ...acrossAt(a.point, airfoilSlope(here, a.j), 1),
            ...acrossAt(b.point, airfoilSlope(here, b.j), 1),
          ]);
        else if (own && a && b) {
          const [alpha, beta] = turn(own);
          const [[x2, y2], [x4, y4]] = [a.point, b.point];
          trace(r, undefined, false, [
            ...klz.flatMap((d): Local[] => [
              [x2 + d * Math.cos(alpha), y2 - d * Math.sin(alpha)],
              [x4 - d * Math.cos(beta), y4 - d * Math.sin(beta)],
            ]),
          ]);
        }
        for (const [n, drawn] of [
          [r - 1, h[5] === 1],
          [r + 1, h[6] === 1],
        ] as const) {
          const side = lines(n);
          if (!side || !drawn) continue;
          const [alpha, beta] = turn(side);
          trace(n, [side.p9, side.p2], false, []);
          trace(n, [side.p11, side.p4], false, [
            ...klz.flatMap((d): Local[] => [
              [side.p9[0] - d * Math.cos(alpha), side.p9[1] + d * Math.sin(alpha)],
              [side.p11[0] + d * Math.cos(beta), side.p11[1] + d * Math.sin(beta)],
            ]),
          ]);
        }
      }
      const drawn = [r - 1, r, r + 1].every((number) => row === anchorCount(number));
      const continuous = (n: Contour | undefined) => {
        const hit = n && eleven.get(n.rib);
        return drawn && b
          ? {
              anchors: anchorLengths(design, here, b),
              depth: h[9],
              margin: h[10],
              extrados: hit && extradosLength(n, hit),
            }
          : undefined;
      };
      if (drawn && h[5] === 1)
        draw(group.get(r)!, h, 5, [r, r - 1], kept(2, r, row), kept(1, r, row), continuous(left));
      if (drawn && h[6] === 1)
        draw(group.get(r)!, h, 1, [r, r + 1], kept(2, r, row), kept(3, r, row), continuous(right));
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
        const [p2, p4, p9, p11] = [lower(c, u2), lower(c, u4), upper(c, u2), upper(c, u4)];
        // §16.6.5 marks the next rib only, with what it kept for it.
        const marked = steps.nextRibOnly ? c.rib === r + 1 : c.rib === end;
        if (p2 && p4 && p9 && p11 && (c.rib === r || marked)) {
          const at = (p: { v: number }, u: number): Local => [u, p.v];
          if (height === 0)
            trace(c.rib, [at(p2, u2), at(p4, u4)], code2006, [
              ...acrossAt(at(p2, u2), airfoilSlope(c, p2.j), 1),
              ...acrossAt(at(p4, u4), airfoilSlope(c, p4.j), 1),
            ]);
          if (height > 0 && height < 100) {
            const ends: [Local, Local] = [
              [u2, (p9.v - p2.v) * (height / 100) + p2.v],
              [u4, (p11.v - p4.v) * (height / 100) + p4.v],
            ];
            trace(c.rib, ends, code2006, alongSegment(ends, 0));
          }
          if (height === 100)
            trace(c.rib, [at(p9, u2), at(p11, u4)], code2006, [
              ...acrossAt(at(p9, u2), airfoilSlope(c, p9.j), -1),
              ...acrossAt(at(p11, u4), airfoilSlope(c, p11.j), -1),
            ]);
        }
        if (height === 100) return extradosBand(c, u2, u4)?.points;
        if (!p2 || !p4 || !p9 || !p11) return undefined;
        return straight(
          [u2, (p9.v - p2.v) * (height / 100) + p2.v],
          [u4, (p11.v - p4.v) * (height / 100) + p4.v],
        );
      };
      const [start, other] = [rib(r), rib(end)];
      if (start) keep(2, r, virtual, place(start, band(start, h[4], h[5], h[6], h[7])));
      const far = other && place(other, band(other, h[9], h[10], h[11], h[12]));
      if (other) keep(3, end - 1, virtual, far);
      draw(
        [k + 1],
        h,
        r % 2 === 1 ? 4 : 30,
        [r, end],
        kept(2, r, virtual),
        steps.nextRibOnly ? kept(3, r, virtual) : far,
      );
    }
  });
  return { vribs: result, traces };
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
  steps: Pick<TraceSteps, 'stations'> = engineTraces,
): HStrap[] {
  const count = design.geometry.ribs.length;
  const edge = (number: number, row: number, half: number) => {
    const rib = Math.trunc(number);
    if (rib < 0 || rib > count) return undefined;
    const c = contour(design, airfoils, Math.max(rib, 1), steps.stations);
    const position = design.anchors[c.rib - 1]?.positions[Math.trunc(row) - 1];
    const band = finite(position) && intradosBand(c, (c.chord * position) / 100, half)?.points;
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
