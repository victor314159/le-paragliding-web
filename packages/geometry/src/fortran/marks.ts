// The engine's sewing marks (§11.3, §11.4, xmarksi, prinifp): points along
// the sewing lines, moved inside the piece.
import type { AnchorRow, LepDesign } from '@lepara/format';
import { slope, type Point } from '../shared/points.ts';

/**
 * Sections 7 and 20: how far the engine moves the sewing marks inside the
 * sewing line (cm), `xdes`, the first laser form of section 20 overriding
 * section 7.
 */
export function markOffset({ marks, markTypes }: Pick<LepDesign, 'marks' | 'markTypes'>) {
  const laser = markTypes[0]?.laser;
  return laser && (laser.type === 1 || laser.type === 2) ? laser.offset / 10 : marks.pointOffset;
}

/** A point found along a polyline: its position (index in `positions`), its slope (`datan`). */
export interface Along {
  readonly index: number;
  readonly at: number;
  readonly point: Point;
  readonly angle: number;
}

/**
 * The points at `positions` along a polyline from its first point, as the
 * engine's mark loops find them: on every segment whose interval of lengths
 * `includes` the position, so that one at a vertex may be found twice.
 */
export function pointsAlong(
  line: readonly Point[],
  positions: readonly number[],
  includes: (at: number, before: number, after: number) => boolean,
): Along[] {
  return positions.flatMap((at, index) => {
    const found: Along[] = [];
    let length = 0;
    for (let j = 0; j + 1 < line.length; j++) {
      const [a, b] = [line[j], line[j + 1]];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const before = length;
      length += d;
      if (!includes(at, before, length)) continue;
      const t = (at - before) / d;
      found.push({
        index,
        at,
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        angle: Math.atan((b[1] - a[1]) / (b[0] - a[0])),
      });
    }
    return found;
  });
}

export const polylineLength = (line: readonly Point[]) =>
  line.slice(1).reduce((sum, p, j) => sum + Math.hypot(p[0] - line[j][0], p[1] - line[j][1]), 0);

/** A panel's mark moved `offset` inside: off its left side (`sign` -1) or right side (1). */
const inside = ([u, v]: Point, slope: number, offset: number, sign: number): Point => {
  const angle = Math.abs(slope);
  return [u + sign * offset * Math.sin(angle), v - sign * offset * Math.cos(angle)];
};

/** The sides of a panel piece, from its first point. */
export interface PieceSides {
  readonly left: readonly Point[];
  readonly right: readonly Point[];
}

/**
 * prinifp: the four corners of a panel piece, moved inside across their
 * sides' end segments.
 */
export function cornerMarks({ left, right }: PieceSides, offset: number): Point[] {
  return (
    [
      [left, -1],
      [right, 1],
    ] as const
  ).flatMap(([side, sign]) => {
    const n = side.length - 1;
    return [
      inside(side[0], slope(side[0], side[1]), offset, sign),
      inside(side[n], slope(side[n - 1], side[n]), offset, sign),
    ];
  });
}

/** Where the marks of each side of a piece start, and the length they stop at. */
export interface MarkRun {
  readonly left: number;
  readonly right: number;
  readonly limit?: PieceSides;
  /** A piece too short for a mark passes the run on; the engine's next piece starts over. */
  readonly through?: boolean;
}

/**
 * xmarksi: a mark every `spacing` along each side of a piece from its
 * `start` (from its first point, or its last for the intrados, `backwards`),
 * the mark at the start drawn only from 0.01, up to the length of the side
 * of `run.limit` (the piece's own by default). Returns its marks and where
 * the next piece's start: the spacing less what is left after the last.
 */
export function sideMarks(
  piece: PieceSides,
  run: MarkRun,
  spacing: number,
  offset: number,
  backwards: boolean,
) {
  const marks: Point[] = [];
  const next = (['left', 'right'] as const).map((side) => {
    const edge = backwards ? [...piece[side]].reverse() : piece[side];
    const start = run[side];
    const limit = polylineLength((run.limit ?? piece)[side]);
    const found = pointsAlong(
      edge,
      Array.from({ length: 60 }, (_, k) => spacing * k + start),
      (at, before, after) => at <= after && at >= before && at <= limit,
    );
    for (const { index, point, angle } of found)
      if (start >= 0.01 || index > 0)
        marks.push(inside(point, angle, offset, side === 'left' ? -1 : 1));
    return spacing - (limit - (found.at(-1)?.at ?? (run.through ? start - spacing : 0)));
  });
  return { marks, next: { left: next[0], right: next[1] } };
}

/** Section 20, row 8: how the engine draws the panels' roman numerals (cm). */
export function numeralForm({ markTypes }: Pick<LepDesign, 'markTypes'>) {
  const row = markTypes[7];
  return {
    /** romanop: the numeral's distance along the panel's end, as a fraction of its width; romanoparc: of the arc. */
    along: row?.print.size ?? 0,
    /** Its distance inside the panel. */
    inside: (row?.print.offset ?? 0) * 0.1,
    /** The spacing of its dots. */
    spacing: (row?.laser.offset ?? 0) * 0.1,
  };
}

export type NumeralForm = ReturnType<typeof numeralForm>;

/**
 * romano: number `n` in dots `spacing` apart from `start`, along `angle`:
 * an X as two pairs of dots across, a V as a dot, one across half a step on,
 * and a dot, an I as a dot.
 */
export function romanDots(n: number, start: Point, angle: number, spacing: number): Point[] {
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const along = (d: number): Point => [start[0] + d * cos, start[1] + d * sin];
  const across = (d: number): Point => {
    const [u, v] = along(d);
    return [u + spacing * sin, v - spacing * cos];
  };
  const dots: Point[] = [];
  let d = 0;
  for (let k = 0; k < Math.trunc(n / 10); k++)
    for (let twice = 0; twice < 2; twice++, d += spacing) dots.push(along(d), across(d));
  for (let k = 0; k < Math.trunc((n % 10) / 5); k++) {
    dots.push(along(d), across(d + 0.5 * spacing));
    d += spacing;
    dots.push(along(d));
    d += spacing;
  }
  for (let k = 0; k < n % 5; k++, d += spacing) dots.push(along(d));
  return dots;
}

/**
 * romanop: number `n` at a panel piece's trailing edge, from its left side
 * on the extrados, its right side on the intrados, along the edge by a
 * fraction of its width and inside it. The engine passes the extrados' v
 * unreversed, its numeral mirrored about v = 0.
 */
export function edgeNumeral(
  { left, right }: PieceSides,
  extrados: boolean,
  form: NumeralForm,
  n: number,
): Point[] {
  const last = left.length - 1;
  const [[x1, y1], [x2, y2]] = extrados
    ? [left[0], right[0]]
    : [
        [right[last][0], -right[last][1]],
        [left[last][0], -left[last][1]],
      ];
  const alpha1 = -Math.atan((y2 - y1) / (x2 - x1)) + (extrados ? 0 : Math.PI);
  const horizontal = form.along * Math.hypot(x2 - x1, y2 - y1);
  const hypotenuse = Math.hypot(horizontal, form.inside);
  const alpha2 = Math.PI / 2 + alpha1;
  const u2 = hypotenuse * Math.cos(alpha1) - form.inside * Math.cos(alpha2);
  const v2 = -hypotenuse * Math.sin(alpha1) + form.inside * Math.sin(alpha2);
  return romanDots(n, [x1 + u2, -(y1 + v2)], alpha1, form.spacing);
}

/** The centre of the circle through three points, as arc3p and romanoparc solve it. */
export function circleCentre([u1, v1]: Point, [u2, v2]: Point, [u3, v3]: Point): Point {
  const [a, b] = [2 * (u2 - u1), 2 * (v2 - v1)];
  const c = u1 * u1 - u2 * u2 + v1 * v1 - v2 * v2;
  const [d, e] = [2 * (u3 - u2), 2 * (v3 - v2)];
  const f = u2 * u2 - u3 * u3 + v2 * v2 - v3 * v3;
  const v0 = ((c * d) / a - f) / (e - (b * d) / a);
  return [-(v0 * b + c) / a, v0];
}

/**
 * romanoparc: number `n` along the 3D-shaping seam of a panel piece, of
 * sagitta `depth`, at its first end on the extrados, its last on the
 * intrados: on the arc through both sides' points (21 points, its bulge
 * `sign` towards the piece, reversed by a negative depth), at a fraction of
 * its length, inside the piece.
 */
export function arcNumeral(
  { left, right }: PieceSides,
  extrados: boolean,
  depth: number,
  sign: number,
  form: NumeralForm,
  n: number,
): Point[] {
  const j = extrados ? 0 : left.length - 1;
  const [[u1, v1], [u3, v3]] = [left[j], right[j]];
  const distance = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const isn = depth < 0 ? -sign : sign;
  const fle = Math.abs(depth) < 1e-6 ? 1e-5 : depth;
  const half = 0.5 * distance([u1, v1], [u3, v3]);
  const omega = Math.atan((v1 - v3) / (u3 - u1));
  const [u4, v4] = [0.5 * (u1 + u3), 0.5 * (v1 + v3)];
  const [u2, v2]: Point =
    isn === 1
      ? [u4 + fle * Math.sin(omega), v4 + fle * Math.cos(omega)]
      : [u4 - fle * Math.sin(omega), v4 - fle * Math.cos(omega)];
  const [u0, v0] = circleCentre([u1, v1], [u2, v2], [u3, v3]);
  const radius = distance([u1, v1], [u0, v0]);
  // The engine keeps its previous angle below 0.01 cm across; panels are wider.
  const xi = Math.atan((v1 - v3) / (u1 - u3));
  const g = Math.sqrt(radius * radius - half * half);
  const mu = Math.atan(half / g);
  // The arc laid level from point 1, its centre below, turned back by xi.
  const [cu, cv] = [u1 + half, v1 - g];
  const arc = Array.from({ length: 21 }, (_, k): Point => {
    const ep = mu - ((2 * mu) / 20) * (extrados ? k : 20 - k);
    const [lu, lv] = [cu - radius * Math.sin(ep) - u1, isn * (cv + radius * Math.cos(ep) - v1)];
    return [lu * Math.cos(xi) - lv * Math.sin(xi) + u1, lu * Math.sin(xi) + lv * Math.cos(xi) + v1];
  });
  // The last of the arc's 20 equal segments whose sum is within `along` of
  // it. The engine sums them: 0.2, 4 segments, is an equality, which summing
  // in floating point may miss; the engine's drawings take it.
  const counted = Math.floor(20 * form.along + 1e-9);
  if (counted < 1) return [];
  let first = Math.min(counted, 20) - 1;
  let end = first + 2;
  if (first >= 19) end = 20;
  if (end === 20) first = 18;
  const [[uu1, vv1], [uu2, vv2]] = [arc[first], arc[end]];
  const alpha1 = Math.atan((vv2 - vv1) / (uu2 - uu1));
  const alpha2 = Math.PI / 2 + alpha1;
  const out = extrados ? -1 : 1;
  return romanDots(
    n,
    [uu1 + out * form.inside * Math.cos(alpha2), vv1 + out * form.inside * Math.sin(alpha2)],
    alpha1 + (extrados ? 0 : Math.PI),
    form.spacing,
  );
}

/** Marks the engine draws on its cutting table: dots, and lines (open or closed polylines). */
export interface TableMarks {
  readonly dots: readonly Point[];
  readonly lines: readonly (readonly Point[])[];
}

/** A mark form of section 20's laser column, its size and offset in cm. */
export interface LaserForm {
  readonly type: number;
  readonly size: number;
  readonly offset: number;
}

/** Section 20, row 4 (`typevent`): how the engine marks the ends of the ribs' air inlets. */
export function inletForm({ markTypes }: Pick<LepDesign, 'markTypes'>): LaserForm {
  const { type = 0, size = 0, offset = 0 } = markTypes[3]?.laser ?? {};
  return { type, size: 0.1 * size, offset: 0.1 * offset };
}

/** Section 20, row 5 (`typetab`): how the engine marks the anchors, in mm up to type 3. */
export function anchorForm({ markTypes }: Pick<LepDesign, 'markTypes'>): LaserForm {
  const { type = 0, size = 0, offset = 0 } = markTypes[4]?.laser ?? {};
  const scale = type <= 3 ? 0.1 : 1;
  return { type, size: scale * size, offset: scale * offset };
}

/**
 * mtriangle: a triangle of height `height` from its apex, its base below it
 * turned by `rotation`, closed.
 */
export function triangle([u, v]: Point, height: number, rotation: number): Point[] {
  const half = height * Math.tan(Math.PI / 6);
  const [cos, sin] = [Math.cos(rotation), Math.sin(rotation)];
  const corner = (x: number): Point => [u + x * cos + height * sin, v + x * sin - height * cos];
  return [[u, v], corner(half), corner(-half), [u, v]];
}

/**
 * §6.10+: the distances of a rib's anchors A to E (`positions`, % of
 * `chord`, the first `count`) from its trailing edge along its intrados,
 * on the segment nearest the leading edge where the contour passes them
 * forwards; those it does not pass left out.
 */
export function anchorDistances(
  contour: readonly Point[],
  chord: number,
  { count, positions }: Pick<AnchorRow, 'count' | 'positions'>,
): number[] {
  const n = contour.length - 1;
  return positions.slice(0, Math.min(Math.trunc(count), 5)).flatMap((position) => {
    const a = (position * chord) / 100;
    let found: number | undefined;
    for (let j = n; j >= 1; j--) {
      const [[u0, v0], [u1, v1]] = [contour[j - 1], contour[j]];
      if (!(u0 <= a && u1 > a && u1 >= 0)) continue;
      const m = (v1 - v0) / (u1 - u0);
      let length = Math.hypot(u1 - a, v1 - (m * a + v0 - m * u0));
      for (let k = n; k > j; k--)
        length += Math.hypot(contour[k][0] - contour[k - 1][0], contour[k][1] - contour[k - 1][1]);
      found = length;
    }
    return found === undefined ? [] : [found];
  });
}

/**
 * iam: the anchors of a piece of intrados panel, at their `distances` from
 * the trailing edge along each side (from the last point, the piece's
 * starting at `start`): each on its side, its segment's angle in [0, π).
 */
export function panelAnchors(
  piece: PieceSides,
  start: { readonly left: number; readonly right: number },
  distances: { readonly left: readonly number[]; readonly right: readonly number[] },
) {
  const anchors: { side: 'left' | 'right'; point: Point; alpha: number }[] = [];
  for (const side of ['left', 'right'] as const) {
    const edge = piece[side];
    for (const distance of distances[side]) {
      let length = start[side];
      for (let j = edge.length - 1; j >= 1; j--) {
        const [p, q] = [edge[j], edge[j - 1]];
        const segment = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (distance >= length && distance <= length + segment) {
          const t = (distance - length) / segment;
          const [du, dv] = [p[0] - q[0], p[1] - q[1]];
          let alpha = side === 'left' && du === 0 ? Math.PI / 2 : -Math.atan(dv / du);
          if (alpha < 0) alpha += Math.PI;
          anchors.push({ side, point: [p[0] - t * du, p[1] - t * dv], alpha });
        }
        length += segment;
      }
    }
  }
  return anchors;
}

/** A panel's anchors: on the cutting table, and each one's line into the panel on its plan. */
export interface PanelAnchorMarks extends TableMarks {
  readonly plan: readonly (readonly Point[])[];
}

/**
 * iam: the anchors of a piece of intrados panel (`panelAnchors`), marked on
 * the cutting table by section 20's row 5, outwards: three dots (types 1
 * and 2; type 1 spaced to fill the rib allowance, `allowance` in mm, from a
 * mark offset to the other) or a triangle (type 3). Type 2 moves both
 * sides' dots the same way, inwards on the right; the left triangle moves
 * along its side's v the right one's way. On the plan, a line of 0.4 `allowance`
 * into the panel.
 */
export function panelAnchorMarks(
  piece: PieceSides,
  start: { readonly left: number; readonly right: number },
  distances: { readonly left: readonly number[]; readonly right: readonly number[] },
  form: LaserForm,
  offset: number,
  allowance: number,
): PanelAnchorMarks {
  const dots: Point[] = [];
  const lines: Point[][] = [];
  const plan: Point[][] = [];
  const spacing = (0.5 * (allowance - 20 * offset)) / 10;
  for (const {
    side,
    point: [x, y],
    alpha,
  } of panelAnchors(piece, start, distances)) {
    const [sin, cos] = [Math.sin(alpha), Math.cos(alpha)];
    // Left, the marks go along (-sin, -cos); right, along (sin, cos).
    const s = side === 'left' ? -1 : 1;
    const reach = 0.4 * allowance;
    plan.push([
      [x, y],
      [x - s * reach * sin, y - s * reach * cos],
    ]);
    const three = (from: Point, step: number) =>
      [0, 1, 2].map((k): Point => [from[0] + s * k * step * sin, from[1] + s * k * step * cos]);
    if (form.type === 1) dots.push(...three([x + s * offset * sin, y + s * offset * cos], spacing));
    if (form.type === 2)
      dots.push(...three([x - form.offset * sin, y - form.offset * cos], form.size));
    if (form.type === 3)
      lines.push(
        triangle(
          [x + s * form.offset * sin, y + form.offset * cos],
          form.size,
          side === 'left' ? -alpha : Math.PI - alpha,
        ),
      );
  }
  return { dots, lines, plan };
}
