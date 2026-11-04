import type { LepDesign } from '@lepara/format';
import {
  anchorDistances,
  anchorForm,
  arcNumeral,
  circleCentre,
  cornerMarks,
  edgeNumeral,
  markOffset,
  numeralForm,
  panelAnchorMarks,
  polylineLength,
  sideMarks,
  type MarkRun,
  type PieceSides,
  type TableMarks,
} from './marks.ts';
import { middle, slope, type Point } from '../shared/points.ts';
import type { CellCuts } from './skin-shaping.ts';
import type {
  Flat,
  SkinPatternSections,
  SkinPatterns,
  SkinProfileSections,
  SkinRib,
} from '../shared/skin-types.ts';

export type SkinPanelSections =
  SkinProfileSections | SkinPatternSections | 'shaping' | 'marks' | 'markTypes' | 'anchors';

/**
 * A skin panel laid flat as the engine draws it (§8.6, drwvent): an
 * extrados or intrados panel, or its piece between 3D-shaping cuts (section
 * 29), with the air inlet glued to it (section 26).
 */
export interface SkinPanel {
  /** Outer rib index from 0; 0 is the central cell, whole, if any. */
  readonly cell: number;
  readonly surface: 'extrados' | 'intrados';
  /** Closed sewing line, from the first point of its inner (left) rib. */
  readonly sewing: readonly Point[];
  /** Closed cut line, sewing allowances included. */
  readonly cut: readonly Point[];
  /** Sewing lines across the panel, where an air inlet joins it. */
  readonly joins: readonly (readonly [Point, Point])[];
  /** Closed cut lines inside the panel: elliptical air inlets. */
  readonly holes: readonly (readonly Point[])[];
  /** The panel's piece between the 3D-shaping cuts of its surface, from its first point. */
  readonly piece: number;
  /** Sewing marks along its ribs (§8.6, prinifp and xmarksi): its corners, then marks every section 7 spacing. */
  readonly marks: readonly Point[];
  /**
   * Its cell's number, from 1, in roman numerals of dots (romano): at the
   * trailing edge of the piece that holds it (romanop), else along its
   * 3D-shaping seam (romanoparc).
   */
  readonly numeral: readonly Point[];
  /** On the intrados, the anchors of both ribs on the cutting table (iam). */
  readonly anchors: TableMarks;
  /**
   * Where the unloaded rib of its cell (section 2) is sewn, along the
   * cell's midline (§9.9.10): its ends, then marks every section 7 spacing.
   */
  readonly unloadedSeam: readonly Point[];
}

/** The lines of a panel, its joins and holes optional. */
type Panel = Pick<SkinPanel, 'sewing' | 'cut'> & Partial<Pick<SkinPanel, 'joins' | 'holes'>>;

/**
 * The sewing marks of a surface's pieces, from its trailing edge (the last
 * piece of the intrados, `backwards`): each piece's corners (on `corners`,
 * the sides prinifp reads), then its marks along its sides, which start
 * where the previous piece's left off. With two cuts, the engine stops those
 * of the second and third pieces at the first piece's length and starts the
 * third's from 0.
 */
function surfaceMarks(
  pieces: readonly PieceSides[],
  corners: readonly PieceSides[],
  backwards: boolean,
  spacing: number,
  offset: number,
): Point[][] {
  const order = pieces.map((_, k) => (backwards ? pieces.length - 1 - k : k));
  const marks: Point[][] = [];
  let run: MarkRun = { left: 0, right: 0 };
  order.forEach((k, n) => {
    const quirk = pieces.length === 3 && n > 0;
    const start = quirk && n === 2 ? { left: 0, right: 0 } : run;
    const found = sideMarks(
      pieces[k],
      quirk ? { ...start, limit: pieces[order[0]] } : start,
      spacing,
      offset,
      backwards,
    );
    marks[k] = [...cornerMarks(corners[k], offset), ...found.marks];
    run = found.next;
  });
  return marks;
}

type Round = (value: number) => number;

/** Sewing and cut lines along both ribs, point by point. */
interface Strip {
  readonly sewing: Flat;
  readonly cut: Flat;
}

const mapFlat = ({ left, right }: Flat, f: (edge: Point[]) => Point[]): Flat => ({
  left: f(left),
  right: f(right),
});
const mapStrip = ({ sewing, cut }: Strip, f: (edge: Point[]) => Point[]): Strip => ({
  sewing: mapFlat(sewing, f),
  cut: mapFlat(cut, f),
});
/** `a` then `b`, sharing a point: the last of `a` (extrados), or the first of `b` (intrados). */
const join = (a: Strip, b: Strip, keepLast: boolean): Strip => {
  const edge = (x: Point[], y: Point[]) =>
    keepLast ? [...x, ...y.slice(1)] : [...x.slice(0, -1), ...y];
  const flat = (x: Flat, y: Flat): Flat => ({
    left: edge(x.left, y.left),
    right: edge(x.right, y.right),
  });
  return { sewing: flat(a.sewing, b.sewing), cut: flat(a.cut, b.cut) };
};
const reversed = (points: readonly Point[]) => [...points].reverse();

/** xrxs: the intersection of lines `r` and `s`, in the engine's implicit reals. */
export function intersection(
  [r1, r2]: readonly Point[],
  [s1, s2]: readonly Point[],
  round: Round = (value) => value,
): Point {
  const mr = round((r2[1] - r1[1]) / (r2[0] - r1[0])),
    br = round(r1[1] - mr * r1[0]);
  const ms = round((s2[1] - s1[1]) / (s2[0] - s1[0])),
    bs = round(s1[1] - ms * s1[0]);
  if (Math.abs(r2[0] - r1[0]) <= 0.0001) return [round(r1[0]), round(ms * r1[0] + bs)];
  if (Math.abs(s2[0] - s1[0]) <= 0.0001) return [round(s1[0]), round(mr * s1[0] + br)];
  const u = round((bs - br) / (mr - ms));
  return [u, round(mr * u + br)];
}

/**
 * extpoints (tangent case): end `j` moved by `allowance` (mm) along the
 * normal of its sewing line, outwards (`sign`), to the cut lines along the
 * ribs: their corners and the moved ends of the sewing lines.
 */
function stripEnd(
  { sewing, cut }: Strip,
  j: number,
  next: number,
  allowance: number,
  sign: number,
  round: Round,
): Point[] {
  const [a, b] = [sewing.left[j], sewing.right[j]];
  const angle = -slope(a, b);
  const move = ([u, v]: Point): Point => [
    u + sign * allowance * round(0.1) * Math.sin(angle),
    v + sign * allowance * round(0.1) * Math.cos(angle),
  ];
  const across = [move(a), move(b)];
  // The last segment of each cut line, in its points' order.
  const [p, q] = [Math.min(j, next), Math.max(j, next)];
  return [
    intersection(across, [cut.left[p], cut.left[q]], round),
    ...across,
    intersection(across, [cut.right[p], cut.right[q]], round),
  ];
}

/**
 * An end of a panel, from its left side to its right: the points of its
 * sewing line between the sides' last points, and its cut line between the
 * sides' cut lines.
 */
interface End {
  readonly sewing: readonly Point[];
  readonly cut: readonly Point[];
}

/**
 * dpanelcc draws an end through the moved ends of the sewing lines;
 * drwvent draws the end of an inlet (`inlet`) from corner to corner.
 */
function bracket(
  strip: Strip,
  j: number,
  next: number,
  allowance: number,
  sign: number,
  round: Round,
  inlet = false,
): End {
  const points = stripEnd(strip, j, next, allowance, sign, round);
  return { sewing: [], cut: inlet ? [points[0], points[3]] : points };
}

/** A strip closed by its `first` and `last` ends. */
function closed(strip: Strip, first: End, last: End): Pick<SkinPanel, 'sewing' | 'cut'> {
  return {
    sewing: [
      ...strip.sewing.left,
      ...last.sewing,
      ...reversed(strip.sewing.right),
      ...reversed(first.sewing),
    ],
    cut: [...strip.cut.left, ...last.cut, ...reversed(strip.cut.right), ...reversed(first.cut)],
  };
}

/**
 * arc3p: end `j` of a panel cut by a 3D-shaping seam (section 29), an arc
 * of sagitta `depth` (cm), convex (`side` 1, its last end) or concave (-1),
 * its cut line the concentric arc `allowance` (mm) further, to the cut lines
 * along the ribs (their segment from point `next`).
 */
function seam(
  { sewing, cut }: Strip,
  j: number,
  next: number,
  depth: number,
  side: number,
  allowance: number,
  round: Round,
): End {
  const sagitta = Math.abs(depth) < 0.000001 ? 0.00001 : depth;
  const sign = sagitta < 0 ? -1 : 1;
  const turn = side * sign;
  const [p1, p3] = [sewing.left[j], sewing.right[j]];
  const half = 0.5 * Math.hypot(p1[0] - p3[0], p1[1] - p3[1]);
  const omega = Math.atan((p1[1] - p3[1]) / (p3[0] - p1[0]));
  const p4 = middle(p1, p3);
  const p2: Point = [
    p4[0] + turn * sagitta * Math.sin(omega),
    p4[1] + turn * sagitta * Math.cos(omega),
  ];
  const [u0, v0] = circleCentre(p1, p2, p3);
  const radius = Math.hypot(p1[0] - u0, p1[1] - v0);
  // Drawn horizontally from point 1, then turned onto 1-3 (upstream keeps a
  // stale angle when 1-3 is vertical within 0.01 cm).
  const xi = Math.abs(p3[0] - p1[0]) >= 0.01 ? Math.atan((p1[1] - p3[1]) / (p1[0] - p3[0])) : 0;
  const g = Math.sqrt(radius * radius - half * half);
  const mu = Math.atan(half / g);
  const arcOf = (r: number) =>
    Array.from({ length: 21 }, (_, k): Point => {
      const ep = mu - ((2 * mu) / 20) * k;
      const [x, y] = [half - r * Math.sin(ep), turn * (-g + r * Math.cos(ep))];
      return [
        x * Math.cos(xi) - y * Math.sin(xi) + p1[0],
        x * Math.sin(xi) + y * Math.cos(xi) + p1[1],
      ];
    });
  const inner = arcOf(radius);
  const outer = arcOf(radius + sign * allowance * 0.1);
  return {
    sewing: inner.slice(1, -1),
    cut: [
      intersection([outer[0], outer[1]], [cut.left[j], cut.left[next]], round),
      ...outer,
      intersection([outer[20], outer[19]], [cut.right[j], cut.right[next]], round),
    ],
  };
}

/**
 * drwvent types -2 and -3: a strip whose inlet, up to point `j`, keeps one
 * side (`right` for -2) and is closed by a diagonal seam, moved by
 * `allowance` (mm) to the other side's cut line; `last` closes its other end.
 */
function diagonal(
  strip: Strip,
  j: number,
  right: boolean,
  allowance: number,
  last: End,
  round: Round,
): Pick<SkinPanel, 'sewing' | 'cut'> {
  const { sewing, cut } = strip;
  const offset = allowance * round(0.1);
  if (right) {
    const [a, b] = [sewing.left[j], sewing.right[0]];
    const angle = Math.atan((a[1] - b[1]) / (b[0] - a[0]));
    const move = ([u, v]: Point): Point => [
      u - offset * Math.sin(angle),
      v - offset * Math.cos(angle),
    ];
    const line = [move(a), move(b)];
    const corners = [
      intersection([cut.left[j], cut.left[j - 1]], line, round),
      intersection([cut.right[0], cut.right[1]], line, round),
    ];
    return {
      sewing: [...sewing.left.slice(j), ...last.sewing, ...reversed(sewing.right)],
      cut: [corners[0], ...cut.left.slice(j), ...last.cut, ...reversed(cut.right), corners[1]],
    };
  }
  const [a, b] = [sewing.left[0], sewing.right[j]];
  const angle = slope(a, b);
  const move = ([u, v]: Point): Point => [
    u + offset * Math.sin(angle),
    v - offset * Math.cos(angle),
  ];
  const line = [move(a), move(b)];
  const corners = [
    intersection([cut.left[0], cut.left[1]], line, round),
    intersection([cut.right[j], cut.right[j - 1]], line, round),
  ];
  return {
    sewing: [...sewing.left, ...last.sewing, ...reversed(sewing.right.slice(j))],
    cut: [...cut.left, ...last.cut, ...reversed(cut.right.slice(j)), corners[1], corners[0]],
  };
}

/** The engine's drawing frame, v reversed: arcs and ellipses are computed in it. */
const flip = ([u, v]: Point): Point => [u, -v];
const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** interpoly2d: the point `along` an edge, on its segment `k` at fraction `t`, the last segment matching. */
function pointAlong(edge: readonly Point[], along: number) {
  let found: { k: number; t: number; point: Point } | undefined;
  let start = 0;
  edge.slice(1).forEach((b, k) => {
    const a = edge[k];
    const end = start + distance(a, b);
    if (along >= start && along <= end) {
      const t = (along - start) / (end - start);
      found = { k, t, point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
    }
    start = end;
  });
  return found;
}

/** arcfle: the 21 points of the arc from `a` to `b` of sagitta `depth`, on side `sign`. */
function arc(a: Point, b: Point, depth: number, sign: number): Point[] {
  const [p, q] = [flip(a), flip(b)];
  const sagitta = depth <= 0.01 ? 0.01 : depth;
  const chord = distance(p, q);
  const h = ((chord * chord) / 4 - sagitta * sagitta) / (2 * sagitta);
  const radius = sagitta + h;
  const theta = Math.atan((q[1] - p[1]) / (q[0] - p[0]));
  const centre: Point = [
    0.5 * (p[0] + q[0]) - sign * h * Math.sin(theta),
    0.5 * (p[1] + q[1]) + sign * h * Math.cos(theta),
  ];
  const omega = Math.atan((0.5 * chord) / h);
  const [start, step] = [0.5 * Math.PI - (theta + omega), (2 * omega) / 20];
  const points = Array.from({ length: 21 }, (_, k) =>
    flip([
      centre[0] + sign * radius * Math.cos(start + step * k),
      centre[1] - sign * radius * Math.sin(start + step * k),
    ]),
  );
  return distance(points[0], a) <= distance(points[20], a) ? points : points.reverse();
}

/** distpr: the distance from `p` to the line through `a` and `b`. */
function lineDistance(a: Point, b: Point, p: Point) {
  if (Math.abs(b[0] - a[0]) < 0.001) return Math.abs(p[0] - a[0]);
  const slope = (b[1] - a[1]) / (b[0] - a[0]);
  const intercept = (b[0] * a[1] - a[0] * b[1]) / (b[0] - a[0]);
  return Math.abs(slope * p[0] - p[1] + intercept) / Math.sqrt(slope * slope + 1);
}

/**
 * elliquad: types ±6, an ellipse centred in the inlet `vent`, its axes
 * `widths` (%) of the distance between its sides' midpoints and of the
 * distances to its ends.
 */
function ellipse({ sewing }: Strip, [across, along]: readonly number[]): Point[] {
  const n = sewing.left.length - 1;
  const [p1, p2, p3, p4] = [sewing.left[0], sewing.right[0], sewing.right[n], sewing.left[n]].map(
    flip,
  );
  const [p5, p6] = [middle(p1, p4), middle(p2, p3)];
  const centre = middle(p5, p6);
  const theta = Math.atan((p6[1] - p5[1]) / (p6[0] - p5[0]));
  const a = (across / 200) * distance(p5, p6);
  const b = (along / 200) * (lineDistance(p1, p2, centre) + lineDistance(p4, p3, centre));
  return Array.from({ length: 50 }, (_, i) => {
    const angle = ((2 * Math.PI) / 50) * i;
    const [x, y] = [a * Math.cos(angle), b * Math.sin(angle)];
    return flip([
      centre[0] + x * Math.cos(theta) - y * Math.sin(theta),
      centre[1] + x * Math.sin(theta) + y * Math.cos(theta),
    ]);
  });
}

/**
 * drwvent types ±4 and ±5: the inlet `vent` cut across where its sides reach
 * `100 - parameters[0..1]` % of their lengths from its first point, its new
 * end moved by `allowance` (mm) away from its first point (`sign` 1) or
 * towards it (-1); type 5 arched by `parameters[2]` % of their mean length.
 * The kept segments `k` of its sides, and its new end from left to right.
 */
function trimmed(
  vent: Strip,
  parameters: readonly number[],
  arched: boolean,
  allowance: number,
  sign: number,
  round: Round,
) {
  const [lengthLeft, lengthRight] = [
    polylineLength(vent.sewing.left),
    polylineLength(vent.sewing.right),
  ];
  const left = pointAlong(vent.sewing.left, lengthLeft * (1 - (parameters[0] ?? 0) / 100));
  const right = pointAlong(vent.sewing.right, lengthRight * (1 - (parameters[1] ?? 0) / 100));
  if (!left || !right) return undefined;
  const angle = Math.abs(slope(left.point, right.point));
  const move = ([u, v]: Point): Point => [
    u + sign * allowance * round(0.1) * Math.sin(angle),
    v + sign * allowance * round(0.1) * Math.cos(angle),
  ];
  const [a, b] = [move(left.point), move(right.point)];
  const on = (edge: readonly Point[], { k, t }: { k: number; t: number }): Point => [
    edge[k][0] + (edge[k + 1][0] - edge[k][0]) * t,
    edge[k][1] + (edge[k + 1][1] - edge[k][1]) * t,
  ];
  const corner = (edge: readonly Point[], k: number) =>
    intersection([edge[k + 1], edge[k]], [a, b], round);
  const depth = ((parameters[2] ?? 0) / 100) * 0.5 * (lengthLeft + lengthRight);
  // Type 5 arches both lines, on the side drwvent gives each surface.
  const inner = (p: Point, q: Point) => (arched ? arc(p, q, depth, -sign).slice(1, -1) : []);
  return {
    left: left.k,
    right: right.k,
    sewing: [left.point, ...inner(left.point, right.point), right.point],
    cut: [
      on(vent.cut.left, left),
      corner(vent.cut.left, left.k),
      a,
      ...inner(a, b),
      b,
      corner(vent.cut.right, right.k),
      on(vent.cut.right, right),
    ],
  };
}

/**
 * A cell's panel sides as the engine's vectors 9 and 10 hold them after §8.4,
 * by its point indices: the extrados and the intrados developed; on the
 * inlet, the extrados extrapolated one point (§8.2.4), then zeros, never set;
 * the left side reflected at np2 + np3 − 2 through the point before (§8.4.4),
 * over the extrados' last point when the inlet has 2 points. §8.2.4 and §8.4.4
 * run when ndif is 1000.
 */
export function engineSides(
  design: Pick<LepDesign, 'skinTension'>,
  rib: SkinRib,
  patterns: SkinPatterns,
  cell: number,
): Flat {
  const lowest = rib.upper + rib.inlet - 1;
  const reformat = design.skinTension.panelCorrection.points === 1000;
  const extended = (points: Point[], j: number) => {
    const [a, b] = [points[j - 1], points[j - 2]];
    points[j] = [2 * a[0] - b[0], 2 * a[1] - b[1]];
  };
  const side = (key: keyof Flat) => {
    const points: Point[] = [];
    for (let j = 1; j < rib.local.length; j++)
      points[j] =
        j >= lowest
          ? patterns.lower[cell][key][j]
          : j <= rib.upper
            ? patterns.upper[cell][key][j]
            : [0, 0];
    if (reformat && rib.upper + 1 < lowest) extended(points, rib.upper + 1);
    return points;
  };
  const left = side('left');
  if (reformat && lowest > 2) {
    const [p, q] = [left[lowest - 2], left[lowest - 1]];
    left[lowest - 1] = [2 * p[0] - q[0], 2 * p[1] - q[1]];
  }
  return { left, right: side('right') };
}

/** A dot along a cell's midline, after its point `at`. */
export interface SeamDot {
  readonly at: number;
  readonly point: Point;
}

/**
 * §9.9.10: the seam of an unloaded rib along its cell's midline (u44), on
 * the extrados and the intrados from the trailing edge: their ends `offset`
 * aside (their angle unsigned), then marks every `spacing` (up to 60).
 */
export function unloadedSeam(
  sides: Flat,
  rib: SkinRib,
  spacing: number,
  offset: number,
): { extrados: SeamDot[]; intrados: SeamDot[] } {
  const midline = sides.left.map((point, j) => middle(point, sides.right[j]));
  const aside = ([u, v]: Point, angle: number, sign: number): Point => [
    u - sign * offset * Math.sin(angle),
    v + sign * offset * Math.cos(angle),
  ];
  const end = (j: number, k: number): SeamDot => ({
    at: j,
    point: aside(midline[j], Math.abs(slope(midline[j], midline[k])), 1),
  });
  /** Marks along points `run`, `side` of the midline by its v. */
  const marks = (run: readonly number[], side: (v: number) => number) => {
    const dots: SeamDot[] = [];
    for (let k = 1; k <= 60; k++) {
      const at = spacing * k;
      let sum = 0;
      for (let n = 0; n + 1 < run.length; n++) {
        const [p, q] = [midline[run[n]], midline[run[n + 1]]];
        const [before, step] = [sum, distance(p, q)];
        sum += step;
        if (at < sum && at >= before) {
          const t = (at - before) / step;
          const point: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          dots.push({
            at: Math.min(run[n], run[n + 1]),
            point: aside(point, slope(p, q), side(point[1])),
          });
        }
      }
    }
    return dots;
  };
  const last = midline.length - 1;
  const lowest = rib.upper + rib.inlet - 1;
  const range = (from: number, to: number) =>
    Array.from({ length: Math.abs(to - from) + 1 }, (_, k) => from + Math.sign(to - from) * k);
  return {
    extrados: [
      end(1, 2),
      end(rib.upper, rib.upper - 1),
      // Below the chord, the marks turn the other way.
      ...marks(range(1, rib.upper), (v) => (v < 0 ? -1 : 1)),
    ],
    intrados: [
      end(last, last - 1),
      end(lowest, lowest - 1),
      ...marks(range(last, lowest), () => 1),
    ],
  };
}

/**
 * The steps of `panelOutlines` each model takes its own way: the panel sides
 * the marks and the unloaded ribs' seams read, and those seams.
 */
export interface PanelSteps {
  readonly sides: typeof engineSides;
  readonly seam: typeof unloadedSeam;
  readonly marks: typeof surfaceMarks;
  readonly anchors: typeof panelAnchorMarks;
  /** The point an inlet glued to the extrados turns about, from the middle of its first points. */
  readonly inletOrigin: (middle: Point) => Point;
  /**
   * Where an anchor on an inlet glued to the intrados goes, from its point
   * on the inlet's side `side` as developed, `glued` placing it as drawn.
   */
  readonly inletAnchor: (side: readonly Point[], glued: (p: Point) => Point) => (p: Point) => Point;
}

/** The engine's steps. */
const engineSteps: PanelSteps = {
  sides: engineSides,
  seam: unloadedSeam,
  marks: surfaceMarks,
  anchors: panelAnchorMarks,
  // drwvent translates the inlet's u only, not its v.
  inletOrigin: ([u]) => [u, 0],
  // iam, part 4: "SOLUCIÓ PROVISIONAL", back by its side's span.
  inletAnchor:
    (side) =>
    ([u, v]) => {
      const [first, last] = [side[0], side[side.length - 1]];
      return [u - (last[0] - first[0]), v - (last[1] - first[1])];
    },
};

/**
 * The panels of developed `patterns`, the central one if it is wide enough,
 * split at the 3D-shaping cuts of section 29 (`cuts`), with the air inlets of
 * section 26 glued to their extrados (types 1, 4 to 6) or intrados (types -1
 * to -6). Open inlets (type 0, or no section 26) have no fabric.
 */
export function panelOutlines(
  design: Pick<
    LepDesign,
    | 'geometry'
    | 'airfoils'
    | 'sewingAllowances'
    | 'glueVents'
    | 'skinTension'
    | 'marks'
    | 'markTypes'
    | 'anchors'
  >,
  ribs: readonly SkinRib[],
  patterns: SkinPatterns,
  cuts: readonly CellCuts[],
  round: Round,
  steps: PanelSteps = engineSteps,
): SkinPanel[] {
  const central = design.geometry.ribs[0].x * design.geometry.wingScale >= 0.01;
  const single = design.geometry.paragliderType === 'ss';
  const { upper, lower } = design.sewingAllowances;
  const glued = design.glueVents;
  const offset = markOffset(design);
  const form = numeralForm(design);
  const anchoring = anchorForm(design);
  // Rib 0 takes rib 1's anchors.
  const distances = ribs.map((rib, r) => {
    const row = design.anchors[Math.max(r, 1) - 1];
    return row ? anchorDistances(rib.local.slice(1), rib.chord, row) : [];
  });
  return ribs.slice(0, -1).flatMap((rib, cell): SkinPanel[] => {
    if (cell === 0 && !central) return [];
    const strip = (sewing: Flat, cut: Flat, from: number, to: number): Strip =>
      mapStrip({ sewing, cut }, (edge) => edge.slice(from, to + 1));
    const top = strip(patterns.upper[cell], patterns.seams.upper[cell], 1, rib.upper);
    const inlet = strip(
      patterns.inlet[cell],
      patterns.seams.inlet[cell],
      rib.upper,
      rib.upper + rib.inlet - 1,
    );
    const lowest = rib.upper + rib.inlet - 1;
    const sides = steps.sides(design, rib, patterns, cell);
    // Rib cell + 1 unloaded: sewn in this cell.
    const sewnRib =
      !single && design.airfoils[cell]?.minirib === 100
        ? steps.seam(sides, rib, design.marks.spacing, offset)
        : undefined;
    const bottom = strip(
      patterns.lower[cell],
      patterns.seams.lower[cell],
      lowest,
      rib.points.length - 1,
    );
    // drwvent takes the integer part of the type (dint).
    const vent = glued.mode === 1 ? glued.ribs[cell] : undefined;
    const type = Math.trunc(vent?.type ?? 0);
    const given = vent?.parameters ?? [];
    // §4: the central cell's trimmed inlets take their left side's parameter on both sides.
    const parameters =
      cell === 0 && [4, 5].includes(Math.abs(type))
        ? [given[0], given[0], ...given.slice(2)]
        : given;
    const panels: SkinPanel[] = [];
    const across = ({ sewing }: Strip, j: number) => [sewing.left[j], sewing.right[j]] as const;
    const part = (whole: Strip, from: number, to?: number) =>
      mapStrip(whole, (edge) => edge.slice(from, to));
    const last = (piece: Strip) => piece.sewing.left.length - 1;

    /**
     * A surface split at `splits` (its point indices) into pieces, each
     * closed by `close` (its first and last pieces taking the surface's
     * ends) or by the cut seams of their `depths`.
     */
    const pieces = (
      surface: SkinPanel['surface'],
      whole: Strip,
      splits: readonly { at: number; depth: number }[],
      allowance: number,
      close: (piece: Strip, first: End | undefined, last: End | undefined) => Panel,
    ) => {
      const bounds = [0, ...splits.map(({ at }) => at), last(whole)];
      const split = (sides: PieceSides) =>
        bounds.slice(1).map((to, k) => ({
          left: sides.left.slice(bounds[k], to + 1),
          right: sides.right.slice(bounds[k], to + 1),
        }));
      const strips = bounds.slice(1).map((to, k) => part(whole, bounds[k], to + 1));
      const extrados = surface === 'extrados';
      // The marks take the left sides as §8.4.4 leaves them, after copying the extrados to draw it.
      const from = extrados ? 1 : lowest;
      const left = sides.left.slice(from, from + whole.sewing.left.length);
      const marks = steps.marks(
        strips.map(({ sewing }) => sewing),
        split({ left, right: whole.sewing.right }),
        !extrados,
        design.marks.spacing,
        offset,
      );
      const trailing = extrados ? 0 : strips.length - 1;
      // Each seam dot on the piece holding the segment after its point.
      const seamDots = (sewnRib?.[surface] ?? []).map(({ at, point }) => {
        let k = 0;
        while (k + 2 < bounds.length && at - from >= bounds[k + 1]) k++;
        return { k, point };
      });
      // iam measures each intrados piece's anchors from the trailing edge, past the pieces after it.
      const lengths = strips.map(({ sewing }) => ({
        left: polylineLength(sewing.left),
        right: polylineLength(sewing.right),
      }));
      strips.forEach((piece, k) => {
        const after = lengths.slice(k + 1);
        let anchors: TableMarks = extrados
          ? { dots: [], lines: [] }
          : steps.anchors(
              piece.sewing,
              {
                left: after.reduce((sum, l) => sum + l.left, 0),
                right: after.reduce((sum, l) => sum + l.right, 0),
              },
              { left: distances[cell], right: distances[cell + 1] },
              anchoring,
              offset,
              design.sewingAllowances.ribs,
            );
        // iam, part 4: the anchors past the intrados, on an inlet glued to it.
        if (!extrados && k === 0 && type <= -1 && type >= -6) {
          const total = lengths.reduce(
            (sum, l) => ({ left: sum.left + l.left, right: sum.right + l.right }),
            { left: 0, right: 0 },
          );
          const glued = gluedBelow(piece);
          for (const side of ['left', 'right'] as const) {
            const place = steps.inletAnchor(inlet.sewing[side], glued);
            const marks = steps.anchors(
              inlet.sewing,
              total,
              {
                left: side === 'left' ? distances[cell] : [],
                right: side === 'right' ? distances[cell + 1] : [],
              },
              anchoring,
              offset,
              design.sewingAllowances.ribs,
            );
            anchors = {
              dots: [...anchors.dots, ...marks.dots.map(place)],
              lines: [...anchors.lines, ...marks.lines.map((line) => line.map(place))],
            };
          }
        }
        const numeral =
          k === trailing
            ? edgeNumeral(piece.sewing, extrados, form, cell + 1)
            : arcNumeral(
                piece.sewing,
                extrados,
                splits[extrados ? k - 1 : k].depth,
                extrados ? -1 : 1,
                form,
                cell + 1,
              );
        const n = last(piece);
        const first = k ? seam(piece, 0, 1, splits[k - 1].depth, -1, allowance, round) : undefined;
        const end =
          k < splits.length
            ? seam(piece, n, n - 1, splits[k].depth, 1, allowance, round)
            : undefined;
        const panel = close(piece, first, end);
        panels.push({
          cell,
          surface,
          piece: k,
          joins: [],
          holes: [],
          marks: marks[k],
          numeral,
          anchors,
          unloadedSeam: seamDots.filter((dot) => dot.k === k).map(({ point }) => point),
          ...panel,
        });
      });
    };
    // A draft's cuts may lie off their surface or out of order: each piece needs two points.
    const splitsOf = (list: CellCuts['upper'], from: number, whole: Strip) => {
      let previous = 0;
      return list
        .map(({ cut, depth }) => ({ at: cut.end - from, depth }))
        .filter(({ at }) => {
          const inside = at > previous && at < last(whole);
          if (inside) previous = at;
          return inside;
        });
    };

    pieces(
      'extrados',
      top,
      splitsOf(cuts[cell]?.upper ?? [], 1, top),
      upper.sides,
      (piece, first, end) => {
        const n = last(piece);
        const trailing = first ?? bracket(piece, 0, 1, upper.trailingEdge, -1, round);
        return (
          (!end && extradosInlet(piece, trailing)) ||
          closed(piece, trailing, end ?? bracket(piece, n, n - 1, upper.leadingEdge, 1, round))
        );
      },
    );

    /** The leading-edge piece of the extrados with its inlet glued (types 1, 4 to 6). */
    function extradosInlet(piece: Strip, trailing: End): Panel | undefined {
      if (![1, 4, 5, 6].includes(type)) return undefined;
      // drwvent: the inlet turned onto the extrados' leading edge, about its
      // origin (`inletOrigin`), its first points replaced by the extrados' last.
      const n = last(piece);
      const [a, b] = across(piece, n);
      const to = middle(a, b);
      const from = steps.inletOrigin(middle(...across(inlet, 0)));
      const angle = slope(a, b);
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const moved = mapStrip(inlet, (edge) =>
        edge.map(([u, v]): Point => [
          (u - from[0]) * cos - (v - from[1]) * sin + to[0],
          (u - from[0]) * sin + (v - from[1]) * cos + to[1],
        ]),
      );
      const both = join(piece, moved, true);
      const joins = [across(both, n)];
      if (type === 1 || type === 6) {
        const m = last(both);
        return {
          ...closed(both, trailing, bracket(both, m, m - 1, upper.leadingEdge, 1, round, true)),
          joins,
          holes: type === 6 ? [ellipse(part(both, n), parameters)] : [],
        };
      }
      const end = trimmed(part(both, n), parameters, type === 5, upper.leadingEdge, 1, round);
      if (!end) return undefined;
      const kept = part(both, 0, n + end.left + 1);
      const keptRight = part(both, 0, n + end.right + 1);
      return {
        sewing: [
          ...kept.sewing.left,
          ...end.sewing,
          ...reversed(keptRight.sewing.right),
          ...reversed(trailing.sewing),
        ],
        cut: [
          ...kept.cut.left,
          ...end.cut,
          ...reversed(keptRight.cut.right),
          ...reversed(trailing.cut),
        ],
        joins,
      };
    }

    if (single) return panels;
    pieces(
      'intrados',
      bottom,
      splitsOf(cuts[cell]?.lower ?? [], lowest, bottom),
      lower.sides,
      (piece, first, end) => {
        const n = last(piece);
        const trailing = end ?? bracket(piece, n, n - 1, lower.trailingEdge, 1, round);
        return (
          (!first && intradosInlet(piece, trailing)) ||
          closed(piece, first ?? bracket(piece, 0, 1, lower.leadingEdge, -1, round), trailing)
        );
      },
    );

    /** drwvent: the inlet turned onto the intrados' first points, its last points onto them. */
    function gluedBelow(piece: Strip) {
      const [a, b] = across(piece, 0);
      const to = middle(a, b);
      const [c, d] = across(inlet, last(inlet));
      const from = middle(c, d);
      const angle = slope(a, b) - slope(c, d);
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return ([u, v]: Point): Point => {
        const [x, y] = [u - from[0], v - from[1]];
        return [x * cos - y * sin + to[0], x * sin + y * cos + to[1]];
      };
    }

    /** The leading-edge piece of the intrados with its inlet glued (types -1 to -6). */
    function intradosInlet(piece: Strip, trailing: End): Panel | undefined {
      if (type > -1 || type < -6) return undefined;
      // Its last points replaced by the intrados' first.
      const j = last(inlet);
      const moved = mapStrip(inlet, (edge) => edge.map(gluedBelow(piece)));
      const both = join(moved, piece, false);
      const joins = [across(both, j)];
      if (type === -1 || type === -6)
        return {
          ...closed(both, bracket(both, 0, 1, lower.leadingEdge, -1, round, true), trailing),
          joins,
          holes: type === -6 ? [ellipse(part(both, 0, j + 1), parameters)] : [],
        };
      if (type === -2 || type === -3)
        return {
          ...diagonal(both, j, type === -2, lower.leadingEdge, trailing, round),
          joins,
        };
      const end = trimmed(
        part(both, 0, j + 1),
        parameters,
        type === -5,
        lower.leadingEdge,
        -1,
        round,
      );
      if (!end) return undefined;
      const [kept, keptRight] = [part(both, end.left + 1), part(both, end.right + 1)];
      return {
        sewing: [
          ...kept.sewing.left,
          ...trailing.sewing,
          ...reversed(keptRight.sewing.right),
          ...reversed(end.sewing),
        ],
        cut: [
          ...kept.cut.left,
          ...trailing.cut,
          ...reversed(keptRight.cut.right),
          ...reversed(end.cut),
        ],
        joins,
      };
    }
    return panels;
  });
}
