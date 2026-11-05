import { SEAM_CONVENTIONS, type EndSeam, type RibSeamLayer } from '@lepara/design';
import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  balloonedSkin,
  hStraps,
  miniribPatterns,
  miniribSeams,
  ribChord,
  ribPatterns,
  ribPoint,
  skinPanels,
  vRibPatterns,
  vRibs,
  type BalloonedPanel,
  type MiniribPattern,
  type MiniribSeam,
  type MiniribSections,
  type Point3,
  type RibPattern,
  type RibPatternSections,
  type SkinPanel,
  type SkinPanelSections,
  type SkinSections,
  type VRib,
  type VRibPattern,
  type VRibPatternSections,
} from '@lepara/geometry/enhanced-v1';
import type { Point } from './geometry.ts';
import type { Opening, PreviewModel } from './model.ts';
import { gridLength } from './scene.ts';

export type AssemblySections =
  SkinSections | SkinPanelSections | RibPatternSections | MiniribSections | VRibPatternSections;

type Kind = 'extrados' | 'intrados' | 'rib' | 'minirib' | 'vrib';

/** What a model of the assembly can draw, with its label: each piece with its allowances. */
export const ASSEMBLY_LAYERS = [
  ['extrados', 'Extrados'],
  ['intrados', 'Intrados'],
  ['rib', 'Ribs'],
  ['minirib', 'Miniribs'],
  ['vrib', 'V-ribs'],
  ['lines', 'Lines'],
  ['marks', 'Marks'],
] as const;
export type AssemblyLayer = (typeof ASSEMBLY_LAYERS)[number][0];

const COLORS: Record<Kind, string | undefined> = {
  extrados: undefined,
  intrados: '#6f9fd8',
  rib: '#d9a441',
  minirib: '#6fb58a',
  vrib: '#b58ad9',
};
/** A seam whose edges or marks differ. */
const FAULT = '#e5484d';
/** Where a minirib is sewn on a panel: darker than the minirib, to show on the skins. */
const MINIRIB_SEAM = '#1f7a4d';
/** The gap between pieces on the table, and over it as they move, of the cell's chord. */
const GAP = 0.02;
const CLEARANCE = 0.08;
/** The rows across a panel, at least, between its seam lines. */
const ACROSS = 12;
/**
 * The steps of a piece's opening: the piece slid over its place on the table,
 * folded as sewn, its allowances swung open about their seams, the piece
 * flattened on the spot, then laid rigidly on the table.
 */
const SWINGS = 6;
const MOVED = 0.2;
const SWUNG = 0.5;
const FLATTENED = 0.65;
const MOVES = 8;
const OPENING_AT = [
  ...Array.from({ length: SWINGS + 1 }, (_, k) => MOVED + ((SWUNG - MOVED) * k) / SWINGS),
  ...Array.from({ length: MOVES }, (_, k) => FLATTENED + ((1 - FLATTENED) * k) / MOVES),
  1,
];
/** How far over the pieces laid flat the grid lies (cm), to show on them. */
const GRID_LIFT = 0.1;
/** About how many grid squares the table spans, its longest way. */
const GRID_SQUARES = 30;
/** The marks of a panel's corners, before those along its sides. */
const CORNERS = 4;
/** Spans of a V-rib between its points inside, and how far those keep from its outline, in cm. */
const INNER_SPANS = 24;
const INNER_MARGIN = 0.5;
/** How far a V-rib's mark lies from an edge to be one of its seam, in cm: type 5 has more inside. */
const MARK_REACH = 0.6;
/** How far from a rib two V-ribs count as crossing, in cm: on it, they share its seam. */
const CLEAR_OF_RIB = 1.5;

/** A surface of a cell: how much longer its ballooning asks its middle to be than it is cut. */
export interface PanelStretch {
  readonly surface: 'extrados' | 'intrados';
  readonly stretch: number;
}

/** Two edges sewn together: how much their lengths differ, and their marks at most (cm). */
export interface SeamCheck {
  readonly cell: number;
  readonly seam: string;
  readonly difference: number;
  readonly marks: number;
}

/**
 * A point of a piece: sewn, and on its pattern. On a flap's cut line, it opens
 * out of its fold to `open`, swinging about `hinge`, on its seam, by the side
 * of `via` if turned right back.
 */
interface Vertex {
  readonly point: Point3;
  readonly flat: Point;
  readonly open?: Point3;
  readonly hinge?: Point3;
  readonly via?: Point3;
}

/** An allowance: its sewing line, then its cut line, point for point. */
type Flap = readonly [readonly Vertex[], readonly Vertex[]];

/** A mark of a piece, sewn and on its pattern. */
type Mark = Vertex;

/**
 * A piece of the cell: `vertices` a grid on a panel, elsewhere its outline and its holes,
 * a hole of one point being a point inside it to shape it.
 */
interface Piece {
  readonly kind: Kind;
  /** Its side of the cell, for a rib. */
  readonly side: number;
  readonly vertices: readonly (readonly Vertex[])[];
  /** Pairs of points that orient it, along its chord, then across it. */
  readonly axes: readonly [Vertex, Vertex, Vertex, Vertex];
  readonly flaps: readonly Flap[];
  readonly marks: readonly Mark[];
  /** Whether its sides are off, on a panel: left, right. */
  readonly faults: readonly boolean[];
  /** The lengths of a panel's sewing line across its ends, first and last. */
  readonly ends?: readonly [number, number];
  /** A V-rib along the whole chord, in its own column on the table. */
  readonly long?: boolean;
  /** Where a minirib is sewn on a panel. */
  readonly seam?: readonly Vertex[];
  /** A panel's middle along the chord, cut then sewn. */
  readonly middle?: readonly [number, number];
  /** A V-rib as it hangs between its edges, and where its fabric is on its pattern. */
  readonly strip?: {
    readonly row: number;
    readonly left: readonly Vertex[];
    readonly right: readonly Vertex[];
    readonly inFabric: (flat: Point) => boolean;
  };
}

/** A rib or minirib of the cell in 3D: its unit normal towards its side of the wing's tip, and its index. */
interface CellRib {
  readonly index: number;
  readonly mirrored: boolean;
  readonly chord: number;
  readonly tipward: Point3;
  readonly pattern: Pick<RibPattern, 'sewing' | 'holes' | 'marks'> &
    Partial<Pick<RibPattern, 'vRibs' | 'anchors'>>;
  /** Its allowances: each point of a cut line, with the point of the sewing line it folds on. */
  readonly edges: readonly (readonly (readonly [number, Point])[])[];
  /** A point of its pattern in 3D. */
  readonly place: (point: Point) => Point3 | undefined;
  /** How far `direction`, a unit vector in its plane, runs from a point of it to its contour. */
  readonly room: (from: Point3, direction: Point3) => number;
}

const mean = (values: readonly number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const centreOf = (points: readonly Point3[]): Point3 => [
  mean(points.map((p) => p[0])),
  mean(points.map((p) => p[1])),
  mean(points.map((p) => p[2])),
];
const minus = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (a: Point3, d: Point3, t: number): Point3 => [
  a[0] + d[0] * t,
  a[1] + d[1] * t,
  a[2] + d[2] * t,
];
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Point3): Point3 => along([0, 0, 0], v, 1 / (Math.hypot(...v) || 1));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lengthOf = (points: readonly Point[]) =>
  points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
const lengthIn3D = (points: readonly Point3[]) =>
  points.slice(1).reduce((sum, p, i) => sum + Math.hypot(...minus(p, points[i])), 0);
const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** A polyline of a pattern, its points at fractions `at`. */
interface Line {
  readonly points: readonly Point[];
  readonly at: readonly number[];
}
const byPoint = (points: readonly Point[]): Line => ({
  points,
  at: points.map((_, i) => i / (points.length - 1)),
});
function byLength(points: readonly Point[]): Line {
  const total = lengthOf(points) || 1;
  let run = 0;
  return {
    points,
    at: points.map((p, i) => (run += i ? distance(points[i - 1], p) : 0) / total),
  };
}
/** The segment of `at` holding fraction `f`, and how far along it. */
function segment(at: readonly number[], f: number): [number, number] {
  let i = 0;
  while (i < at.length - 2 && at[i + 1] < f) i++;
  return [i, (f - at[i]) / (at[i + 1] - at[i] || 1)];
}
function sample({ points, at }: Line, f: number): Point {
  const [i, t] = segment(at, f);
  return lerp(points[i], points[i + 1], t);
}
/** The fractions of all `lines`, sorted, each once. */
function fractions(...lines: readonly Pick<Line, 'at'>[]): number[] {
  const sorted = lines.flatMap((line) => line.at).sort((a, b) => a - b);
  return sorted.filter((f, i) => !i || f - sorted[i - 1] > 1e-9);
}

/** How many layers a rib's seam puts `layer` tipwards of the rib itself. */
const ribLayer = (layer: RibSeamLayer) =>
  SEAM_CONVENTIONS.rib.indexOf(layer) - SEAM_CONVENTIONS.rib.indexOf('rib');

/** Its stations across the cell for each airfoil point, on both sides of the axis for the central cell. */
function cellGrid(skin: readonly BalloonedPanel[], cell: number) {
  const columns = new Map<number, Point3[]>();
  for (const { from, rows } of skin.filter((panel) => panel.cell === cell))
    rows[0].forEach((_, n) => {
      const halves = cell
        ? []
        : rows
            .slice(1)
            .reverse()
            .map((row): Point3 => {
              const [x, y, z] = row[n].point;
              return [-x, y, z];
            });
      columns.set(from + n, [...halves, ...rows.map((row) => row[n].point)]);
    });
  return columns;
}

/** The airfoil points the skin leaves out, as open inlets, straight between their ribs. */
function filledGrid(
  columns: Map<number, Point3[]>,
  inner: CellRib | undefined,
  outer: CellRib | undefined,
) {
  const [{ length: rows } = { length: 0 }] = columns.values();
  if (!inner || !outer || !rows) return columns;
  const [a, b] = [inner.pattern.sewing, outer.pattern.sewing];
  if (a.length !== b.length) return columns;
  a.forEach((point, n) => {
    const [p, q] = [inner.place(point), outer.place(b[n])];
    if (columns.has(n + 1) || !p || !q) return;
    columns.set(
      n + 1,
      Array.from({ length: rows }, (_, k) => along(p, minus(q, p), k / (rows - 1))),
    );
  });
  return columns;
}

/** The ribbon of a grid's column `j`, at fraction `t` across, by arc: equal rows, equal fabric. */
function acrossColumn(column: readonly Point3[], t: number): Point3 {
  const r = Math.min(t, 1) * (column.length - 1);
  const k = Math.min(Math.floor(r), column.length - 2);
  return along(column[k], minus(column[k + 1], column[k]), r - k);
}

/** A sewn line's length from airfoil point to point, and the place at a length along it. */
function ribLine(grid: ReadonlyMap<number, readonly Point3[]>, row: number) {
  const keys = [...grid.keys()].sort((a, b) => a - b);
  const line = keys.map((key) => grid.get(key)![row < 0 ? grid.get(key)!.length - 1 : row]);
  const lengths = [0];
  line.slice(1).forEach((p, i) => lengths.push(lengths[i] + Math.hypot(...minus(p, line[i]))));
  const at = (point: number) => lengths[Math.max(0, Math.min(keys.length - 1, point - keys[0]))];
  return {
    first: keys[0],
    last: keys[keys.length - 1],
    at,
    /** The airfoil point, a fraction of one, at `length` along the line; off its ends, in line. */
    point: (length: number) => {
      const [i, t] = segment(lengths, length);
      return keys[0] + i + t;
    },
  };
}

/** The sides of a panel's closed line: along its ribs, then its ends, left to right. */
function sidesOf(polygon: readonly Point[], left: readonly Point[], right: readonly Point[]) {
  const key = ([u, v]: Point) => `${u},${v}`;
  const [lefts, rights] = [new Set(left.map(key)), new Set(right.map(key))];
  const isLeft = (i: number) => lefts.has(key(polygon[i % polygon.length]));
  const start = polygon.findIndex((_, i) => isLeft(i) && !isLeft(i + polygon.length - 1));
  if (start < 0) return undefined;
  // A trim at a point of its side repeats that point.
  const ring = polygon
    .map((_, i) => polygon[(start + i) % polygon.length])
    .filter((p, i, all) => key(p) !== key(all[(i + all.length - 1) % all.length]));
  const ends = ring.findIndex((p) => !lefts.has(key(p)));
  const rightStart = ring.findIndex((p) => rights.has(key(p)));
  if (ends < 2 || rightStart < 0) return undefined;
  let rightEnd = rightStart;
  while (rightEnd < ring.length && rights.has(key(ring[rightEnd]))) rightEnd++;
  if (rightEnd - rightStart < 2) return undefined;
  const [leftLine, rightLine] = [ring.slice(0, ends), ring.slice(rightStart, rightEnd).reverse()];
  const [leftEnd, rightLast] = [leftLine[leftLine.length - 1], rightLine[rightLine.length - 1]];
  return {
    left: leftLine,
    right: rightLine,
    /** Its ends from left to right: after the sides' last points, before their first. */
    last: [leftEnd, ...ring.slice(ends, rightStart), rightLast],
    first: [rightLine[0], ...ring.slice(rightEnd), ring[0]].reverse(),
    leftFrom: left.findIndex((p) => key(p) === key(leftLine[0])),
    rightFrom: right.findIndex((p) => key(p) === key(rightLine[0])),
  };
}

/**
 * The surface a pattern's four sides enclose, flat: each exact on its side.
 * `s` along the ribs, `t` across, from the left side and the first end.
 */
function pattern(left: Line, right: Line, first: Line, last: Line) {
  const [a, b, c, d] = [
    left.points[0],
    right.points[0],
    left.points[left.points.length - 1],
    right.points[right.points.length - 1],
  ];
  const corner = (i: 0 | 1, s: number, t: number) =>
    (1 - s) * (1 - t) * a[i] + (1 - s) * t * b[i] + s * (1 - t) * c[i] + s * t * d[i];
  return (s: number, t: number): Point => {
    const [l, r, f, e] = [sample(left, s), sample(right, s), sample(first, t), sample(last, t)];
    const blend = (i: 0 | 1) =>
      (1 - t) * l[i] + t * r[i] + (1 - s) * f[i] + s * e[i] - corner(i, s, t);
    return [blend(0), blend(1)];
  };
}

/** How far the ray from `from` along `direction` runs to the closed line `ring`; 0 out of it, as off a sharp end. */
function rayToRing(ring: readonly Point[], from: Point, direction: Point): number {
  let nearest = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const [ax, ay] = [a[0] - from[0], a[1] - from[1]];
    const determinant = direction[0] * ey - direction[1] * ex;
    if (!determinant) return;
    const t = (ax * ey - ay * ex) / determinant;
    const s = (ax * direction[1] - ay * direction[0]) / determinant;
    if (t > 1e-6 && s >= 0 && s <= 1) nearest = Math.min(nearest, t);
  });
  return Number.isFinite(nearest) ? nearest : 0;
}

/**
 * The allowance of a panel's side on rib `rib`: folded in along the rib, to
 * its place in the rib's seam, up to the rib's middle where the wing is
 * thinner than the allowance, as near the trailing edge.
 */
function sideFlap(
  edge: readonly Vertex[],
  next: readonly Vertex[],
  cut: readonly Point[],
  rib: CellRib,
  layer: number,
  centre: Point3,
): Flap {
  const points = edge.map((v) => v.point);
  const inwards = points.map((point, i) =>
    cross(
      rib.tipward,
      unit(minus(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)])),
    ),
  );
  const facing = points.reduce((sum, p, i) => sum + dot(inwards[i], minus(centre, p)), 0);
  const outer = edge.map(({ point, flat }, i): Vertex => {
    const width = distance(cut[i], flat);
    const inward = along([0, 0, 0], unit(inwards[i]), facing < 0 ? -1 : 1);
    return {
      point: along(
        along(point, inward, Math.min(width, rib.room(point, inward) / 2)),
        rib.tipward,
        layer * SEAM_CONVENTIONS.layerThickness,
      ),
      open: along(point, unit(minus(point, next[i].point)), width),
      hinge: point,
      flat: cut[i],
    };
  });
  return [edge, outer];
}

/** The allowance across a panel's end, lying as its seam does. */
function endFlap(
  edge: readonly Vertex[],
  next: readonly Vertex[],
  cut: readonly Point[],
  lay: 1 | -1,
  layer: number,
  centre: Point3,
): Flap {
  const directions = edge.map((v, k) => unit(minus(v.point, next[k].point)));
  // Along the seam as a whole: at its ends, it can bend along the piece's sides.
  const [start, finish] = [edge[0], edge[edge.length - 1]];
  const tangent = unit(minus(finish.point, start.point));
  const across = directions.map((direction) => cross(tangent, direction));
  const facing = edge.reduce((sum, v, k) => sum + dot(across[k], minus(centre, v.point)), 0);
  const outer = edge.map((v, k): Vertex => {
    const length = Math.hypot(v.flat[0] - next[k].flat[0], v.flat[1] - next[k].flat[1]) || 1;
    const [du, dv] = [
      (v.flat[0] - next[k].flat[0]) / length,
      (v.flat[1] - next[k].flat[1]) / length,
    ];
    const off = [cut[k][0] - v.flat[0], cut[k][1] - v.flat[1]];
    const width = Math.abs(off[0] * du + off[1] * dv);
    // A corner of the cut line lies off its seam's end, along the seam too.
    const [eu, ev] = [finish.flat[0] - start.flat[0], finish.flat[1] - start.flat[1]];
    const sign = dv * eu - du * ev < 0 ? -1 : 1;
    const sideways = sign * (off[1] * du - off[0] * dv);
    const inside = along([0, 0, 0], unit(across[k]), facing < 0 ? -1 : 1);
    return {
      point: along(
        along(v.point, directions[k], lay * width),
        inside,
        layer * SEAM_CONVENTIONS.layerThickness,
      ),
      open: along(
        along(v.point, directions[k], width),
        unit(along(tangent, directions[k], -dot(tangent, directions[k]))),
        sideways,
      ),
      hinge: v.point,
      via: inside,
      flat: cut[k],
    };
  });
  return [edge, outer];
}

/** How the allowance across a panel's end lies, its direction kept (1) or turned back (-1). */
const endLay = (seam: EndSeam, towardTail: boolean): 1 | -1 =>
  seam === 'towardTrailingEdge' && towardTail ? 1 : -1;

/** The nearest point of `line`, as a fraction, and how far. */
function nearestOn({ points, at }: Line, p: Point) {
  let best = { f: 0, gap: Infinity };
  points.slice(1).forEach((b, i) => {
    const a = points[i];
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1)),
    );
    const gap = distance(lerp(a, b, t), p);
    if (gap < best.gap) best = { f: at[i] + (at[i + 1] - at[i]) * t, gap };
  });
  return best;
}

/** A panel from its pattern: its lines laid flat, then each point put on the wing by its fabric. */
function panelPiece(
  design: Pick<LepDesign, 'sewingAllowances'>,
  panel: SkinPanel,
  grid: ReadonlyMap<number, readonly Point3[]>,
  pieces: number,
  [inner, outer]: readonly [CellRib, CellRib],
  centre: Point3,
  check: (seam: string, difference: number, marks: number) => boolean,
  minirib?: MiniribSeam,
): Piece | undefined {
  const { from, left, right, cut } = panel.ribEdges;
  const sewn = sidesOf(panel.sewing, left, right);
  const edge = sidesOf(panel.cut, cut.left, cut.right);
  if (!sewn || !edge || !grid.size) return undefined;
  const extrados = panel.surface === 'extrados';

  // Each side laid along its rib by its own length, from the trailing edge:
  // what it has more or less than its rib shows at its other end.
  const along3D = (points: readonly Point[], first: number, row: number) => {
    const line = ribLine(grid, row);
    const start = extrados ? first : first + points.length - 1;
    let length = 0;
    const lengths = points.map((p, i) => (length += i ? distance(points[i - 1], p) : 0));
    const total = lengths[lengths.length - 1];
    const fromLine = lengths.map((l) => line.at(start) + (extrados ? l : l - total));
    const end = extrados ? start + points.length - 1 : first;
    return {
      fromLine,
      point: line.point,
      difference: total - Math.abs(line.at(end) - line.at(start)),
    };
  };
  const leftSide = along3D(sewn.left, from + sewn.leftFrom, 0);
  const rightSide = along3D(sewn.right, from + sewn.rightFrom, -1);
  const [lines, ends] = [
    [byPoint(sewn.left), byPoint(sewn.right)],
    [byLength(sewn.first), byLength(sewn.last)],
  ];
  const flat = pattern(lines[0], lines[1], ends[0], ends[1]);
  // By length, as fabric: a side's segment can span a point of its rib.
  const station = (s: number, { fromLine, point }: typeof leftSide, line: Line) => {
    const [i, t] = segment(line.at, s);
    return point(fromLine[i] + (fromLine[i + 1] - fromLine[i]) * t);
  };
  const keys = [...grid.keys()].sort((a, b) => a - b);
  const wing = (s: number, t: number): Point3 => {
    const a = station(s, leftSide, lines[0]) * (1 - t) + station(s, rightSide, lines[1]) * t;
    const k = Math.max(keys[0], Math.min(keys[keys.length - 2], Math.floor(a)));
    const [p, q] = [grid.get(k), grid.get(k + 1)];
    if (!p || !q) return acrossColumn(grid.get(keys[0])!, t);
    const [m, n] = [acrossColumn(p, t), acrossColumn(q, t)];
    return along(m, minus(n, m), a - k);
  };
  const vertex = (s: number, t: number): Vertex => ({ point: wing(s, t), flat: flat(s, t) });

  const stations = fractions(...lines);
  const across = fractions(...ends, byPoint(Array.from({ length: ACROSS + 1 }, (_, k) => [k, 0])));
  const rows = across.map((t) => stations.map((s) => vertex(s, t)));

  // Each allowance between a side of the sewing line and of the cut line.
  const ds = 1 / (stations.length - 1 || 1);
  const dt = 1 / (across.length - 1 || 1);
  const side = (line: Line, cutLine: Line, t: number, rib: CellRib, layer: number) => {
    // On the stations of the panel too: a point of it alone would crack the fold.
    const at = fractions(line, cutLine, { at: stations });
    return sideFlap(
      at.map((s) => vertex(s, t)),
      at.map((s) => vertex(s, t ? t - dt : dt)),
      at.map((s) => sample(cutLine, s)),
      rib,
      layer,
      centre,
    );
  };
  const end = (start: boolean, line: Line, cutLine: Line, corners: readonly [Vertex, Vertex]) => {
    const shaping = start ? panel.piece > 0 : panel.piece < pieces - 1;
    const tail = start === extrados;
    const seam = shaping
      ? SEAM_CONVENTIONS.shaping
      : tail
        ? SEAM_CONVENTIONS.trailingEdge
        : SEAM_CONVENTIONS.leadingEdge;
    const s = start ? 0 : 1;
    // Each point of the cut line faces its place on the seam, those past its ends the end
    // itself; the cut line ends where the seam does.
    const facing = {
      ...cutLine,
      at: cutLine.points.map((p, k, { length }) =>
        k && k < length - 1 ? nearestOn(line, p).f : Math.min(k, 1),
      ),
    };
    const opposite = [
      ...cutLine.points.map((cut, k) => ({ t: facing.at[k], cut })),
      ...across
        .slice(1, -1)
        .filter((t) => !facing.at.some((f) => Math.abs(f - t) < 1e-9))
        .map((t) => ({ t, cut: sample(facing, t) })),
    ].sort((a, b) => a.t - b.t);
    const [sewing, folded] = endFlap(
      opposite.map(({ t }) => vertex(s, t)),
      opposite.map(({ t }) => vertex(start ? ds : 1 - ds, t)),
      opposite.map(({ cut }) => cut),
      endLay(seam, tail),
      shaping && tail ? 2 : 1,
      centre,
    );
    // The cut line ends on the sides': the same fabric, tucked in with them.
    const tucked = (v: Vertex) => corners.find((c) => distance(c.flat, v.flat) < 1e-9) ?? v;
    return [sewing, folded.map(tucked)] as const;
  };

  // The panel's marks on their sides, where the fabric puts them.
  const marks = panel.marks.flatMap((flatMark): Mark[] => {
    const [l, r] = [nearestOn(lines[0], flatMark), nearestOn(lines[1], flatMark)];
    const [s, t] = l.gap <= r.gap ? [l.f, 0] : [r.f, 1];
    return [{ point: wing(s, t), flat: flatMark }];
  });
  // Marks are drawn off their seams: compared where each comes on its seam.
  const ribMarks = (rib: CellRib) => {
    const seamLine = byPoint(rib.pattern.sewing);
    return rib.pattern.marks.flatMap((mark) => {
      const point = rib.place(sample(seamLine, nearestOn(seamLine, mark).f));
      return point ? [point] : [];
    });
  };
  const apartMarks = (seamMarks: Mark[], rib: CellRib) => {
    const others = ribMarks(rib);
    if (!others.length) return 0;
    return seamMarks.reduce(
      (worst, { point }) =>
        Math.max(worst, Math.min(...others.map((p) => Math.hypot(...minus(p, point))))),
      0,
    );
  };
  const name = `${panel.surface} ${panel.piece + 1}`;
  // Its corners, first, lie on no rib mark: the marks after them run on from the trailing edge.
  const onSide = (t: number) =>
    marks.slice(CORNERS).filter((_, i) => {
      const mark = panel.marks[CORNERS + i];
      return nearestOn(lines[0], mark).gap <= nearestOn(lines[1], mark).gap === (t === 0);
    });
  const faults = [
    check(
      `${name} left side on rib ${inner.index + 1}`,
      leftSide.difference,
      apartMarks(onSide(0), inner),
    ),
    check(
      `${name} right side on rib ${outer.index + 1}`,
      rightSide.difference,
      apartMarks(onSide(1), outer),
    ),
  ];
  // Its minirib's seam, on the cell's middle where the fabric puts it: how far off it runs.
  const middle: Line = { points: stations.map((s) => flat(s, 0.5)), at: stations };
  const onMiddle = (p: Point): Vertex => ({ point: wing(nearestOn(middle, p).f, 0.5), flat: p });
  if (minirib) check(`${name} on minirib`, 0, nearestOn(middle, minirib.line[1]).gap);
  const cuts = [byPoint(edge.left), byPoint(edge.right), byLength(edge.first), byLength(edge.last)];
  const sides = [
    side(lines[0], cuts[0], 0, inner, ribLayer(inner.mirrored ? 'innerPanel' : 'outerPanel')),
    side(lines[1], cuts[1], 1, outer, ribLayer('innerPanel')),
  ];
  const cornersAt = (k: number) => [sides[0][1].at(k)!, sides[1][1].at(k)!] as const;
  const middleRow = rows[rows.length >> 1];
  return {
    kind: panel.surface,
    side: 0,
    vertices: rows,
    axes: [
      rows[rows.length >> 1][0],
      rows[rows.length >> 1][stations.length - 1],
      rows[0][stations.length >> 1],
      rows[rows.length - 1][stations.length >> 1],
    ],
    flaps: [
      ...sides,
      end(true, ends[0], cuts[2], cornersAt(0)),
      end(false, ends[1], cuts[3], cornersAt(-1)),
    ],
    marks,
    faults,
    ends: [lengthOf(sewn.first), lengthOf(sewn.last)],
    middle: [lengthOf(middleRow.map((v) => v.flat)), lengthIn3D(middleRow.map((v) => v.point))],
    // In steps, to stay on the skin.
    seam:
      minirib &&
      Array.from({ length: ACROSS + 1 }, (_, k) => onMiddle(lerp(...minirib.line, k / ACROSS))),
  };
}

/** A flat piece of the cell in 3D, from its place. */
function inPlane(
  index: number,
  mirrored: boolean,
  chord: number,
  pattern: CellRib['pattern'],
  edges: CellRib['edges'],
  place: CellRib['place'],
): CellRib | undefined {
  const [o, a, b] = [place([0, 0]), place([chord, 0]), place([0, chord / 10])];
  if (!o || !a || !b) return undefined;
  const [ex, ey] = [unit(minus(a, o)), unit(minus(b, o))];
  const normal = unit(cross(ex, ey));
  const onRib = (v: Point3): Point => [dot(v, ex), dot(v, ey)];
  return {
    index,
    mirrored,
    chord,
    pattern,
    edges,
    tipward: normal[0] < 0 !== mirrored ? along([0, 0, 0], normal, -1) : normal,
    place,
    room: (from, direction) => rayToRing(pattern.sewing, onRib(minus(from, o)), onRib(direction)),
  };
}

/** A rib of the cell in 3D, from its pattern, on the mirror side for the central cell's inner rib. */
function cellRib(
  design: Pick<LepDesign, AssemblySections>,
  pattern: RibPattern | undefined,
  mirrored: boolean,
): CellRib | undefined {
  if (!pattern) return undefined;
  const index = pattern.rib;
  const chord = ribChord(design, index);
  // A closed "pc" nose has no line of its own.
  const line = pattern.cut[0].slice(0, pattern.sewing.length);
  const edges = [line.map((flat, i) => [i, flat] as const)];
  return inPlane(
    index,
    mirrored,
    chord,
    pattern,
    pattern.cut.length === 1 && line.length === pattern.sewing.length ? edges : [],
    ([u, v]) => {
      const placed = ribPoint(design, index, [u / chord, -v / chord]);
      if (!placed) return undefined;
      const [x, y, z] = placed;
      return [mirrored ? -x : x, y, z];
    },
  );
}

/**
 * A minirib in 3D, midway between its ribs, in its inner rib's frame. Its sewing
 * line runs along the extrados to its front, then back along the intrados;
 * each cut line starts and ends on it.
 */
function cellMinirib(pattern: MiniribPattern, inner: CellRib, outer: CellRib) {
  const scale = outer.chord / inner.chord;
  const extrados = pattern.cut[0].length - 2;
  const last = pattern.sewing.length - 1;
  const onSide = [(k: number) => k, (k: number) => last - k];
  const size = [extrados, pattern.sewing.length - extrados];
  const edges = pattern.cut.map((line, c) =>
    line.map((flat, i) => [onSide[c](Math.max(0, Math.min(i - 1, size[c] - 1))), flat] as const),
  );
  return inPlane(
    pattern.rib - 1,
    false,
    inner.chord,
    { ...pattern, marks: [] },
    edges,
    ([u, v]) => {
      const [a, b] = [inner.place([u, v]), outer.place([u * scale, v * scale])];
      return a && b ? along(a, minus(b, a), 0.5) : undefined;
    },
  );
}

/** A rib or minirib from its pattern. */
function ribPiece(rib: CellRib, side: number, kind: Kind = 'rib'): Piece | undefined {
  const { pattern, place, tipward, edges } = rib;
  const { sewing, holes } = pattern;
  const ring = (points: readonly Point[]) =>
    points.flatMap((flat): Vertex[] => {
      const point = place(flat);
      return point ? [{ point, flat: [...flat] }] : [];
    });
  const vertices = [sewing, ...holes].map(ring);
  if (vertices[0].length < 3) return undefined;
  // A rib's edge turned back onto it, tipwards, up to its middle where it is
  // thinner than that; a minirib's laid on the skin, inside it.
  const layer = ribLayer('ribFlap') * SEAM_CONVENTIONS.layerThickness;
  type Entry = CellRib['edges'][number][number];
  const folding = ([i, flat]: Entry) => {
    const edge = sewing[i];
    const { point } = vertices[0][i];
    const turned = place([2 * edge[0] - flat[0], 2 * edge[1] - flat[1]]) ?? point;
    const inward = unit(minus(turned, point));
    // Not past the other skin, where the wing is thinner than the layers.
    const inset = along(point, inward, Math.min(layer, rib.room(point, inward) / 2));
    return { point, inward, inset, width: distance(flat, edge), hinged: { hinge: point, flat } };
  };
  // A layer off the skin all its width, not only at its edge, to show as a layer.
  const lying = (entry: Entry): Vertex => {
    const { inset, width, hinged } = folding(entry);
    return {
      ...hinged,
      point: along(inset, tipward, SEAM_CONVENTIONS.minirib * width),
      hinge: inset,
      open: place(entry[1]) ?? inset,
    };
  };
  const turnedBack = (entry: Entry): Vertex => {
    const { point, inward, width, hinged } = folding(entry);
    return {
      ...hinged,
      point: along(
        along(point, inward, Math.min(width, rib.room(point, inward) / 2)),
        tipward,
        layer,
      ),
      open: place(entry[1]) ?? point,
      via: tipward,
    };
  };
  const flaps =
    vertices[0].length === sewing.length
      ? edges.map((line): Flap =>
          kind === 'minirib'
            ? [
                line.map((entry): Vertex => ({
                  point: folding(entry).inset,
                  flat: vertices[0][entry[0]].flat,
                })),
                line.map(lying),
              ]
            : [line.map(([i]) => vertices[0][i]), line.map(turnedBack)],
        )
      : [];
  const by = (value: (v: Vertex) => number) =>
    vertices[0].reduce((best, v) => (value(v) < value(best) ? v : best));
  return {
    kind,
    side,
    vertices,
    axes: [
      by((v) => v.flat[0]),
      by((v) => -v.flat[0]),
      by((v) => v.flat[1]),
      by((v) => -v.flat[1]),
    ],
    flaps,
    marks: pattern.marks.flatMap((flat): Mark[] => {
      const point = place(flat);
      return point ? [{ point, flat }] : [];
    }),
    faults: [],
  };
}

/** How far a line of points runs from a closed line, at most. */
function offRing(points: readonly Point3[], ring: readonly Point3[]) {
  const toSegment = (p: Point3, a: Point3, b: Point3) => {
    const d = minus(b, a);
    const t = Math.max(0, Math.min(1, dot(minus(p, a), d) / (dot(d, d) || 1)));
    return Math.hypot(...minus(p, along(a, d, t)));
  };
  return Math.max(
    ...points.map((p) =>
      Math.min(...ring.map((a, i) => toSegment(p, a, ring[(i + 1) % ring.length]))),
    ),
  );
}

/** A rib's sewing line in 3D. */
const contourOf = ({ pattern, place }: CellRib) =>
  pattern.sewing.flatMap((point) => {
    const placed = place(point);
    return placed ? [placed] : [];
  });

/**
 * How far an edge lies from where its rib says it is sewn: on the line the
 * engine draws on it, end for end, or along its contour, in the rib's seam
 * with the panels, where it draws none.
 */
function offRib(rib: CellRib, points: readonly Point3[]) {
  const { pattern, place } = rib;
  const [a, b] = [points[0], points[points.length - 1]];
  const span = (p: Point3, q: Point3) => Math.hypot(...minus(p, q));
  const lines = (pattern.vRibs?.lines ?? []).flatMap((line) => {
    const [p, q] = [place(line[0]), place(line[line.length - 1])];
    return p && q
      ? [Math.min(Math.max(span(a, p), span(b, q)), Math.max(span(a, q), span(b, p)))]
      : [];
  });
  return Math.min(...lines, offRing(points, contourOf(rib)));
}

/** The 3D edges of a strap or V-rib in the order of `left` and `right`, as far as its corners tell. */
function matched(
  left: readonly Point[],
  right: readonly Point[],
  [first, second]: readonly [readonly Point3[], readonly Point3[]],
) {
  const span = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(...a.map((v, axis) => v - b[axis]));
  const flat = [span(left[0], right[0]), span(left.at(-1)!, right.at(-1)!)];
  const lengths = [lengthOf(left), lengthOf(right)];
  const length3D = (line: readonly Point3[]) =>
    line.slice(1).reduce((sum, p, i) => sum + Math.hypot(...minus(p, line[i])), 0);
  const options = [
    [first, second],
    [second, first],
  ].flatMap(([a, b]) => [
    [a, b],
    [[...a].reverse(), [...b].reverse()],
  ]);
  const miss = ([a, b]: (typeof options)[number]) =>
    Math.abs(span(a[0], b[0]) - flat[0]) +
    Math.abs(span(a.at(-1)!, b.at(-1)!) - flat[1]) +
    Math.abs(length3D(a) - lengths[0]) +
    Math.abs(length3D(b) - lengths[1]);
  return options.reduce((best, option) => (miss(option) < miss(best) ? option : best));
}

/** A point of a strip's pattern in 3D, by the triangle of its two edges that holds it. */
function onStrip(left: readonly Vertex[], right: readonly Vertex[]) {
  const triangles = left.slice(1).flatMap((_, k) => [
    [left[k], left[k + 1], right[k]],
    [left[k + 1], right[k + 1], right[k]],
  ]);
  return ([u, v]: Point): Point3 => {
    const weights = (corners: readonly Vertex[]) => {
      const [[x0, y0], [x1, y1], [x2, y2]] = corners.map((corner) => corner.flat);
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) || 1;
      const b = ((u - x0) * (y2 - y0) - (x2 - x0) * (v - y0)) / area;
      const c = ((x1 - x0) * (v - y0) - (u - x0) * (y1 - y0)) / area;
      return [1 - b - c, b, c];
    };
    const inside = (corners: readonly Vertex[]) => Math.min(...weights(corners));
    const best = triangles.reduce((a, b) => (inside(b) > inside(a) ? b : a));
    // Past its edges, as an allowance of its teeth is: on them.
    const kept = weights(best).map((weight) => Math.max(weight, 0));
    const total = kept[0] + kept[1] + kept[2];
    const [a, b, c] = kept.map((weight) => weight / total);
    const at = (axis: 0 | 1 | 2) =>
      a * best[0].point[axis] + b * best[1].point[axis] + c * best[2].point[axis];
    return [at(0), at(1), at(2)];
  };
}

/**
 * A strap or V-rib from its pattern, its two edges sewn on the cell's ribs:
 * each allowance goes on the way the piece comes, flat on the rib's face, a
 * layer off it.
 */
/**
 * How far along a V-rib's `edge`, sewn on `rib`, its `marks` next to its points `first` to `last`
 * lie from the rib's marks at most: across it, a mark is only drawn in from its seam.
 */
function offMarks(
  rib: CellRib,
  edge: readonly Vertex[],
  marks: readonly Point[],
  first = 0,
  last = edge.length - 1,
) {
  const { anchors, vRibs, marks: own } = rib.pattern;
  const onRib = [
    ...own,
    ...(anchors?.dots ?? []),
    ...(anchors?.lines ?? []).map(([anchor]) => anchor),
    ...(vRibs?.table.dots ?? []),
    ...(vRibs?.lines ?? []).flatMap((line) => [line[0], line[line.length - 1]]),
  ]
    .map(rib.place)
    .filter((p) => !!p);
  if (!onRib.length) return 0;
  const flatEdge = edge.map((v) => v.flat);
  return marks.reduce((worst, flat) => {
    const gaps = flatEdge.map((p) => distance(p, flat));
    const k = gaps.indexOf(Math.min(...gaps));
    if (k < first || k > last || nearestOn(byPoint(flatEdge), flat).gap > MARK_REACH) return worst;
    const [before, after] = [Math.max(k - 1, 0), Math.min(k + 1, edge.length - 1)];
    const way = unit(minus(edge[after].point, edge[before].point));
    const flatWay = minus([...flatEdge[after], 0], [...flatEdge[before], 0]);
    const slid = dot(minus([...flat, 0], [...flatEdge[k], 0]), unit(flatWay));
    // Drawn in from an end of the edge, it stands for that end.
    const end = [edge[0], edge[edge.length - 1]].find((v) => distance(v.flat, flat) < MARK_REACH);
    const point = end?.point ?? along(edge[k].point, way, slid);
    const nearest = onRib.reduce((best, p) =>
      Math.hypot(...minus(p, point)) < Math.hypot(...minus(best, point)) ? p : best,
    );
    return Math.max(worst, Math.abs(dot(minus(nearest, point), way)));
  }, 0);
}

/**
 * The stretches of a cut `line` past `edge`, away from the piece's `other` edge, as a tooth's
 * tip is: each point with its index and its edge's nearest point.
 */
function outsideEdge(line: readonly Point[], edge: readonly Point[], other: readonly Point[]) {
  const placed = line.map((flat, at) => {
    const k = edge.reduce(
      (best, p, i) => (distance(p, flat) < distance(edge[best], flat) ? i : best),
      0,
    );
    const [x, y] = [flat[0] - edge[k][0], flat[1] - edge[k][1]];
    const past = x * (edge[k][0] - other[k][0]) + y * (edge[k][1] - other[k][1]);
    return { flat, at, k, past: past > 0 && Math.hypot(x, y) > SEAM_CONVENTIONS.seamTolerance };
  });
  return placed.reduce<(typeof placed)[]>((stretches, point, i) => {
    if (!point.past) return stretches;
    if (placed[i - 1]?.past) stretches.at(-1)!.push(point);
    else stretches.push([point]);
    return stretches;
  }, []);
}

/** Whether a ray from `p` crosses a closed `ring` an odd number of times. */
function crossesOddly(ring: readonly Point[], [x, y]: Point) {
  return ring.reduce((odd, [x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % ring.length];
    const crosses = y0 > y !== y1 > y && x < x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
    return crosses ? !odd : odd;
  }, false);
}

function vRibPiece(
  pattern: VRibPattern,
  edges: readonly [readonly Point3[], readonly Point3[]],
  ribs: readonly [CellRib, CellRib],
  check: (seam: string, difference: number, marks: number) => boolean,
): Piece | undefined {
  const { sewing, cut } = pattern;
  const count = sewing.length >> 1;
  const [flatLeft, flatRight] = [sewing.slice(0, count), sewing.slice(count).reverse()];
  const [left3D, right3D] = matched(flatLeft, flatRight, edges);
  if (left3D.length !== count || right3D.length !== count) return undefined;
  const vertex = (flat: Point, point: Point3): Vertex => ({ point, flat: [...flat] });
  const left = flatLeft.map((flat, k) => vertex(flat, left3D[k]));
  const right = flatRight.map((flat, k) => vertex(flat, right3D[k]));
  const middle = count >> 1;
  const cuts = cut.slice(2);
  // Type 5 is cut in teeth along one edge, sewn at their tips: its outline, not that edge.
  const teeth = cuts.find(({ length }) => length !== count + 2);
  const sides = [left, right].map((edge, side) => {
    const other = side ? left : right;
    // Its edge's rib, by which of the cell's ribs it runs nearest.
    const off = (rib: CellRib) => {
      const origin = rib.place([0, 0]);
      return origin ? Math.abs(dot(minus(edge[middle].point, origin), rib.tipward)) : Infinity;
    };
    const rib = off(ribs[0]) < off(ribs[1]) ? ribs[0] : ribs[1];
    const into = dot(minus(other[middle].point, edge[middle].point), rib.tipward) < 0 ? -1 : 1;
    const flatEdge = edge.map((v) => v.flat);
    const line = cuts.find(
      (points) => points.length === count + 2 && distance(points[0], flatEdge[0]) < 1e-6,
    );
    const toothed = !line && !!teeth && distance(teeth[0], flatEdge[0]) < 1e-6;
    const stretches = line
      ? [line.map((flat, at) => ({ flat, at, k: Math.max(0, Math.min(at - 1, count - 1)) }))]
      : toothed
        ? outsideEdge(
            teeth,
            flatEdge,
            other.map((v) => v.flat),
          )
        : [];
    /** Its points `first` to `last`, flat against sewn, and how far `marks` of them are off. */
    const seamCheck = (name: string, first: number, last: number, marks: number) => {
      const part = edge.slice(first, last + 1);
      check(
        `V-rib ${pattern.rows[0]} ${name}on rib ${rib.index + 1}`,
        lengthOf(part.map((v) => v.flat)) - lengthIn3D(part.map((v) => v.point)),
        marks,
      );
    };
    if (toothed) {
      // Only its feet are sewn: each by its marks, on an anchor of the rib.
      stretches.forEach((stretch, n) => {
        const ks = stretch.map(({ k }) => k);
        const [first, last] = [Math.min(...ks), Math.max(...ks)];
        seamCheck(`foot ${n + 1} `, first, last, offMarks(rib, edge, pattern.marks, first, last));
      });
    } else
      seamCheck(
        '',
        0,
        count - 1,
        Math.max(
          offRib(
            rib,
            edge.map((v) => v.point),
          ),
          offMarks(rib, edge, pattern.marks),
        ),
      );
    if (!stretches.length) return { edge, flaps: [] as Flap[], tips: [] };
    // In a rib's seam, nested in the panel's corner: under it, it would go through its allowance.
    const inSeam =
      offRing(
        edge.map((v) => v.point),
        contourOf(rib),
      ) <= SEAM_CONVENTIONS.seamTolerance;
    const panel = rib === ribs[0] && !rib.mirrored ? 'outerPanel' : 'innerPanel';
    const layers = inSeam ? ribLayer(panel) + into : into;
    const inset = (k: number) =>
      along(edge[k].point, rib.tipward, layers * SEAM_CONVENTIONS.layerThickness);
    const sewnAt = (k: number): Vertex => ({ point: inset(k), flat: edge[k].flat });
    /** Square to its edge at point `k`, in the rib's plane. */
    const square = (k: number) =>
      unit(
        cross(
          rib.tipward,
          minus(edge[Math.min(k + 1, count - 1)].point, edge[Math.max(k - 1, 0)].point),
        ),
      );
    const onwardAt = (k: number) => unit(minus(edge[k].point, other[k].point));
    const rows = stretches.map((stretch) => {
      const { k: mid } = stretch[stretch.length >> 1];
      // On the way the piece comes, unless that leaves the rib, as off a strap along the skin.
      const way = dot(square(mid), onwardAt(mid)) < 0 ? -1 : 1;
      const widest = Math.max(...stretch.map(({ flat, k }) => distance(flat, flatEdge[k])));
      const fits = rib.room(edge[mid].point, along([0, 0, 0], square(mid), way)) >= widest;
      return stretch.map(({ flat, k }) => {
        const width = distance(flat, flatEdge[k]);
        return {
          seam: sewnAt(k),
          cut: {
            point: along(inset(k), square(k), (fits ? way : -way) * width),
            open: along(inset(k), onwardAt(k), width),
            hinge: inset(k),
            flat: [...flat] as Point,
          },
        };
      });
    });
    // Its edge on the layer of its allowance: apart, the two would cross.
    return {
      edge: edge.map((_, k) => sewnAt(k)),
      flaps: rows.map((row) => [row.map(({ seam }) => seam), row.map(({ cut }) => cut)] as Flap),
      tips: toothed
        ? stretches.flatMap((stretch, r) =>
            stretch.map(({ at }, j) => [at, rows[r][j].seam] as const),
          )
        : [],
    };
  });
  const [sewnLeft, sewnRight] = sides.map(({ edge }) => edge);
  const flaps = sides.flatMap((side) => side.flaps);
  const place = onStrip(sewnLeft, sewnRight);
  const mark = (flat: Point): Vertex => vertex(flat, place(flat));
  const startsLeft = teeth && distance(teeth[0], left[0].flat) < 1e-6;
  const tips = new Map(sides.flatMap((side) => side.tips));
  const outline = teeth
    ? [
        ...teeth.map((flat, i) => tips.get(i) ?? mark(flat)),
        ...[...(startsLeft ? sewnRight : sewnLeft)].reverse(),
      ]
    : [...sewnLeft, ...[...sewnRight].reverse()];
  // Twisted: on its outline alone, triangles would cut across it.
  const rings = [outline.map((v) => v.flat), ...pattern.holes];
  const inFabric = (p: Point) =>
    rings.every((ring) => nearestOn(byPoint(ring), p).gap > INNER_MARGIN) &&
    rings.reduce((odd, ring) => odd !== crossesOddly(ring, p), false);
  const inner = Array.from({ length: INNER_SPANS - 1 }, (_, i) => {
    const k = Math.round(((i + 1) * (count - 1)) / INNER_SPANS);
    return Array.from({ length: ACROSS - 1 }, (_, j) =>
      lerp(left[k].flat, right[k].flat, (j + 1) / ACROSS),
    );
  })
    .flat()
    .filter(inFabric);
  return {
    kind: 'vrib',
    side: 0,
    long: !!teeth,
    vertices: [
      outline,
      ...pattern.holes.map((hole) => hole.map(mark)),
      ...inner.map((p) => [mark(p)]),
    ],
    axes: [sewnLeft[0], sewnLeft[count - 1], sewnLeft[middle], sewnRight[middle]],
    flaps,
    marks: pattern.marks.map(mark),
    faults: [],
    strip: { row: pattern.rows[0], left: sewnLeft, right: sewnRight, inFabric },
  };
}

/**
 * How long a stretch of V-rib `a` goes through V-rib `b`, in cm: where its rungs cross
 * the other's triangles, both in fabric and clear of the `ribs` they are both sewn on.
 */
function crossing(a: NonNullable<Piece['strip']>, b: NonNullable<Piece['strip']>, ribs: CellRib[]) {
  const clear = (point: Point3) =>
    ribs.every((rib) => {
      const origin = rib.place([0, 0]);
      return !origin || Math.abs(dot(minus(point, origin), rib.tipward)) > CLEAR_OF_RIB;
    });
  const triangles = b.left.slice(1).flatMap((_, k) => [
    [b.left[k], b.left[k + 1], b.right[k]],
    [b.left[k + 1], b.right[k + 1], b.right[k]],
  ]);
  const hits = a.left.flatMap((start, k): Point3[] => {
    const [p, q] = [start.point, a.right[k].point];
    const way = minus(q, p);
    return triangles.flatMap(([v0, v1, v2]): Point3[] => {
      const [e1, e2] = [minus(v1.point, v0.point), minus(v2.point, v0.point)];
      const h = cross(way, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-9) return [];
      const s = minus(p, v0.point);
      const u = dot(s, h) / det;
      const r = cross(s, e1);
      const v = dot(way, r) / det;
      const t = dot(e2, r) / det;
      if (u < 0 || v < 0 || u + v > 1 || t < 0 || t > 1) return [];
      const point = along(p, way, t);
      const onB: Point = [
        v0.flat[0] + u * (v1.flat[0] - v0.flat[0]) + v * (v2.flat[0] - v0.flat[0]),
        v0.flat[1] + u * (v1.flat[1] - v0.flat[1]) + v * (v2.flat[1] - v0.flat[1]),
      ];
      const onA = lerp(start.flat, a.right[k].flat, t);
      return clear(point) && a.inFabric(onA) && b.inFabric(onB) ? [point] : [];
    });
  });
  return hits.reduce(
    (most, p) => Math.max(most, ...hits.map((q) => Math.hypot(...minus(p, q)))),
    0,
  );
}

/**
 * A design taken apart from its patterns: `cells` holds the cells whose
 * pieces can be assembled (outer rib indices from 0, 0 the central cell);
 * `model` gives a cell's pieces, each opening to its pattern laid flat, the
 * `visible` layers of them, and `checks` how each of its seams sews together:
 * the panels' sides on their ribs, their pieces between 3D-shaping cuts, the
 * trailing edge, the miniribs' seams on the cell's middle, and the edges of
 * straps and V-ribs on their ribs.
 * `panels` and `strips`, those to assemble, by default the design's.
 */
export function assembly(
  design: Pick<LepDesign, AssemblySections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  panels: readonly SkinPanel[] = skinPanels(design, airfoils),
  strips: readonly Pick<VRib, 'rows' | 'ribs' | 'edges'>[] = [
    ...hStraps(design, airfoils),
    ...vRibs(design, airfoils),
  ],
) {
  const skin = balloonedSkin(design, airfoils);
  const patterns = ribPatterns(design, airfoils);
  const miniribs = miniribPatterns(design, airfoils);
  const seams = miniribSeams(design, airfoils);
  const flatRibs = vRibPatterns(design, airfoils);

  const piecesOf = (cell: number) => {
    const checks: SeamCheck[] = [];
    const check = (seam: string, difference: number, marks: number) => {
      checks.push({ cell, seam, difference, marks });
      return (
        Math.abs(difference) > SEAM_CONVENTIONS.seamTolerance ||
        marks > SEAM_CONVENTIONS.seamTolerance
      );
    };
    const inner = cellRib(design, patterns[Math.max(cell - 1, 0)], cell === 0);
    const outer = cellRib(design, patterns[cell], false);
    const own = panels.filter((panel) => panel.cell === cell);
    const grid = filledGrid(cellGrid(skin, cell), inner, outer);
    const count = (surface: SkinPanel['surface']) =>
      own.filter((panel) => panel.surface === surface).length;
    const middle = centreOf([...grid.values()].flat());
    const sewn = own.map((panel) =>
      inner && outer
        ? panelPiece(
            design,
            panel,
            grid,
            count(panel.surface),
            [inner, outer],
            middle,
            check,
            seams.find(
              ({ cell: at, surface, piece }) =>
                at === cell && surface === panel.surface && piece === panel.piece,
            ),
          )
        : undefined,
    );
    // Each 3D-shaping seam: the end of a piece on the start of the next.
    own.forEach((panel, i) => {
      const [piece, next] = [sewn[i], sewn[i + 1]];
      if (!piece?.ends || !next?.ends || own[i + 1].surface !== panel.surface) return;
      check(
        `${panel.surface} ${panel.piece + 1} on ${panel.piece + 2}`,
        piece.ends[1] - next.ends[0],
        0,
      );
    });
    // The trailing edge: the extrados' first piece on the intrados' last.
    const piece = (surface: SkinPanel['surface'], index: number) =>
      sewn[own.findIndex((panel) => panel.surface === surface && panel.piece === index)];
    const [top, bottom] = [piece('extrados', 0), piece('intrados', count('intrados') - 1)];
    if (top?.ends && bottom?.ends) check('trailing edge', top.ends[0] - bottom.ends[1], 0);
    const minirib = miniribs.find(({ rib }) => rib - 1 === cell);
    const placed = minirib && inner && outer && cellMinirib(minirib, inner, outer);
    const laid = flatRibs.flatMap((pattern) => {
      // Laid flat, its ribs can come the other way round.
      const key = ({ rows, ribs }: Pick<VRibPattern, 'rows' | 'ribs'>) =>
        `${rows.join()}:${Math.min(...ribs)}:${Math.max(...ribs)}`;
      const built = strips.find((rib) => key(rib) === key(pattern));
      return inner && outer && built && Math.min(...pattern.ribs) === cell
        ? [vRibPiece(pattern, built.edges, [inner, outer], check)]
        : [];
    });
    // V-ribs are checked on their ribs: this is what catches two going through each other.
    const hanging = laid.flatMap((piece) => (piece?.strip ? [piece.strip] : []));
    hanging.forEach((a, i) =>
      hanging.slice(i + 1).forEach((b) => {
        const length = inner && outer ? crossing(a, b, [inner, outer]) : 0;
        if (length) check(`V-rib ${a.row} through V-rib ${b.row}`, length, 0);
      }),
    );
    const pieces = [
      inner && ribPiece(inner, -1),
      ...sewn,
      placed && ribPiece(placed, 0, 'minirib'),
      ...laid,
      outer && ribPiece(outer, 1),
    ].filter((piece) => !!piece);
    // By surface: a 3D-shaping seam moves fabric from one panel to the next.
    const stretches = (['extrados', 'intrados'] as const).flatMap((surface): PanelStretch[] => {
      const middles = sewn.flatMap((piece) => (piece?.kind === surface ? [piece.middle!] : []));
      const [cut, sewed] = [0, 1].map((i) => middles.reduce((sum, m) => sum + m[i], 0));
      return cut ? [{ surface, stretch: sewed / cut - 1 }] : [];
    });
    return { pieces, checks, stretches };
  };

  return {
    cells: [...new Set(panels.map((panel) => panel.cell))],
    checks: (cell: number) => piecesOf(cell).checks,
    stretches: (cell: number) => piecesOf(cell).stretches,
    /** The section whose overwidth balloons the cells, and so stretches the panels. */
    overwidthSection: design.skinTensionGroups.mode === 0 ? 5 : 31,
    model(
      cell: number,
      visible: ReadonlySet<AssemblyLayer> = new Set(ASSEMBLY_LAYERS.map(([key]) => key)),
    ): PreviewModel {
      const { pieces } = piecesOf(cell);
      const model: PreviewModel = {
        title: `Cell ${cell + 1} assembly`,
        note: pieces.length
          ? 'Each piece is its pattern: laid flat lengthwise, turned as little as it can be from the wing, placed on the wing by the length of its fabric. Allowances folded by the seam conventions, thicker than fabric.'
          : 'The pieces need valid ribs and airfoils with matching points.',
        surfaces: [],
        fills: [],
        dots: [],
        lines: [],
        legend: [
          { text: 'Extrados' },
          { text: 'Intrados', color: COLORS.intrados },
          { text: 'Ribs', color: COLORS.rib },
          { text: 'Miniribs', color: COLORS.minirib },
          { text: 'V-ribs', color: COLORS.vrib },
          { text: 'Seam off', color: FAULT },
        ],
        openingAt: OPENING_AT,
      };
      if (!pieces.length) return model;
      layOut(pieces, model, visible);
      return visible.has('lines') ? model : { ...model, lines: [] };
    },
  };
}

/** A flap's point `f` of its way out of its fold, on an arc about its seam: it never flattens. */
function swing({ point, open, hinge, via }: Vertex, f: number): Point3 {
  if (!open || !hinge) return point;
  if (f >= 1) return open;
  const [from, to] = [minus(point, hinge), minus(open, hinge)];
  const start = unit(from);
  const toward = via ?? to;
  const square = along(toward, start, -dot(toward, start));
  const [a, b] = [Math.hypot(...from), Math.hypot(...to)];
  if (!a || Math.hypot(...square) < 1e-9) return along(point, minus(open, point), f);
  const side = unit(square);
  const turn = Math.atan2(dot(to, side), dot(to, start));
  const angle = f * (turn < 0 ? turn + 2 * Math.PI : turn);
  const direction = along(along([0, 0, 0], start, Math.cos(angle)), side, Math.sin(angle));
  return along(hinge, direction, a + (b - a) * f);
}

/** The rotation taking one right-handed basis onto another, as a unit quaternion, w last. */
function rotationBetween(from: readonly Point3[], to: readonly Point3[]) {
  const m = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => to[0][i] * from[0][j] + to[1][i] * from[1][j] + to[2][i] * from[2][j]),
  );
  const trace = m[0][0] + m[1][1] + m[2][2];
  // On the largest component: the others divide by it.
  const q =
    trace > 0
      ? [m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1], 1 + trace]
      : m[0][0] >= m[1][1] && m[0][0] >= m[2][2]
        ? [1 + m[0][0] - m[1][1] - m[2][2], m[0][1] + m[1][0], m[0][2] + m[2][0], m[2][1] - m[1][2]]
        : m[1][1] >= m[2][2]
          ? [
              m[0][1] + m[1][0],
              1 + m[1][1] - m[0][0] - m[2][2],
              m[1][2] + m[2][1],
              m[0][2] - m[2][0],
            ]
          : [
              m[0][2] + m[2][0],
              m[1][2] + m[2][1],
              1 + m[2][2] - m[0][0] - m[1][1],
              m[1][0] - m[0][1],
            ];
  const length = Math.hypot(...q);
  return q.map((v) => (q[3] < 0 ? -v : v) / length);
}

/** The basis of a chord and a direction across it, the second made square to the first. */
function basis(chord: Point3, across: Point3): Point3[] {
  const e1 = unit(chord);
  const e2 = unit(along(across, e1, -dot(across, e1)));
  return [e1, e2, cross(e1, e2)];
}

/**
 * Where a piece's pattern lies at `f` of its way, rigid, from over its place
 * (`f` 0: at `centre`, in the plane of its `axes`) to the table: one
 * rotation and one straight move, lifted as far as it would go through the
 * table, at height `table`. `laid` puts a pattern's point on it.
 */
function rigidMove(
  { axes, vertices, flaps }: Piece,
  moved: (point: Point3) => Point3,
  laid: (point: Point) => Point3,
  table: number,
) {
  const [a, b, c, d] = axes.map((v) => moved(v.point));
  const [fa, fb, fc, fd] = axes.map(({ flat: [u, v] }): Point3 => [u, v, 0]);
  const q = rotationBetween(basis(minus(fb, fa), minus(fd, fc)), basis(minus(b, a), minus(d, c)));
  const angle = Math.acos(Math.min(1, q[3]));
  const body = vertices.flat();
  const fabric = [...body, ...flaps.flat(2)];
  const origin: Point = [mean(body.map((v) => v.flat[0])), mean(body.map((v) => v.flat[1]))];
  const [start, end] = [centreOf(body.map((v) => moved(v.point))), laid(origin)];
  return (f: number) => {
    const left = angle * (1 - f);
    const s = angle > 1e-9 ? Math.sin(left) / Math.sin(angle) : 1 - f;
    const axis: Point3 = [q[0] * s, q[1] * s, q[2] * s];
    const w = Math.cos(left);
    const centre = along(start, minus(end, start), f);
    const place = ([u, v]: Point): Point3 => {
      const p: Point3 = [u - origin[0], v - origin[1], 0];
      const t = cross(axis, p);
      const turned = along(along(p, t, 2 * w), cross(axis, t), 2);
      return [turned[0] + centre[0], turned[1] + centre[1], turned[2] + centre[2]];
    };
    const lowest = Math.max(...fabric.map((v) => place(v.flat)[2]));
    const lift = Math.max(0, lowest - table);
    return (point: Point) => along(place(point), [0, 0, 1], -lift);
  };
}

/** A piece's flat bounds, allowances included. */
function bounds({ vertices, flaps }: Piece) {
  const points = [...vertices.flat(), ...flaps.flat(2)].map((v) => v.flat);
  const us = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  return {
    left: Math.min(...us),
    right: Math.max(...us),
    bottom: Math.min(...vs),
    top: Math.max(...vs),
  };
}

/**
 * A piece turned on the table, or over, for the least turn from the wing: its
 * chord along Y and across it along X, each its way on the wing; the edges of
 * a rib or minirib by the skin they are sewn to, in the columns of `layOut`.
 */
function turned(piece: Piece): Piece {
  const [a, b, c, d] = piece.axes;
  const [chordU, chordV] = [b.flat[0] - a.flat[0], b.flat[1] - a.flat[1]];
  const length = Math.hypot(chordU, chordV) || 1;
  const [eu, ev] = [chordU / length, chordV / length];
  const y = Math.sign(b.point[1] - a.point[1]) || 1;
  const across = (d.flat[0] - c.flat[0]) * -ev + (d.flat[1] - c.flat[1]) * eu;
  const flat = piece.kind === 'rib' || piece.kind === 'minirib';
  const wanted = !flat ? d.point[0] - c.point[0] : piece.kind === 'minirib' ? -1 : 1;
  const x = Math.sign(across * wanted) || 1;
  const turn = (v: Vertex): Vertex => ({
    ...v,
    flat: [x * (v.flat[1] * eu - v.flat[0] * ev), y * (v.flat[0] * eu + v.flat[1] * ev)],
  });
  return {
    ...piece,
    vertices: piece.vertices.map((ring) => ring.map(turn)),
    axes: [turn(a), turn(b), turn(c), turn(d)],
    flaps: piece.flaps.map(([sewing, cut]): Flap => [sewing.map(turn), cut.map(turn)]),
    marks: piece.marks.map(turn),
    seam: piece.seam?.map(turn),
  };
}

/** The pieces into `model`: each moved apart, then flat on the table, in columns. */
function layOut(sewn: readonly Piece[], model: PreviewModel, visible: ReadonlySet<AssemblyLayer>) {
  const pieces = sewn.map(turned);
  const points = pieces.flatMap((piece) => piece.vertices.flat().map((v) => v.point));
  const centre = centreOf(points);
  const folded = pieces.flatMap((piece) => piece.flaps.flat(2).map((v) => v.point));
  const ys = points.map((p) => p[1]);
  const chord = Math.max(...ys) - Math.min(...ys);
  // The table, under the cell's lowest point (Z down).
  const table = Math.max(...[...points, ...folded].map((p) => p[2]));
  const gap = GAP * chord;

  // Columns on the table, as on the wing from inner to outer rib, chords along Y.
  const boxes = pieces.map(bounds);
  const middleY = (piece: Piece) => centreOf(piece.vertices.flat().map((v) => v.point))[1];
  const columns = [
    pieces.filter(({ side }) => side < 0),
    ...[
      (piece: Piece) => piece.kind === 'extrados',
      (piece: Piece) => piece.kind === 'minirib' || (piece.kind === 'vrib' && !piece.long),
      (piece: Piece) => !!piece.long,
      (piece: Piece) => piece.kind === 'intrados',
    ].map((own) => pieces.filter(own).sort((a, b) => middleY(b) - middleY(a))),
    pieces.filter(({ side }) => side > 0),
  ].filter((column) => column.length);
  const breadth = (piece: Piece) => {
    const box = boxes[pieces.indexOf(piece)];
    return box.right - box.left;
  };
  const widths = columns.map((column) => Math.max(...column.map(breadth)));
  let x = centre[0] - (widths.reduce((a, b) => a + b, 0) + (columns.length - 1) * gap) / 2;
  const origins: Point[] = pieces.map(() => [0, 0]);
  columns.forEach((column, c) => {
    // Their trailing edges level, under the wing's, each piece ahead of the one behind.
    let y = Math.max(...ys);
    for (const piece of column) {
      const i = pieces.indexOf(piece);
      origins[i] = [x + (widths[c] - breadth(piece)) / 2 - boxes[i].left, y - boxes[i].top];
      y -= boxes[i].top - boxes[i].bottom + gap;
    }
    x += widths[c] + gap;
  });
  const xs = points.map((p) => p[0]);
  model.grid = tableGrid(
    [
      ...boxes.map((box, i) => ({
        left: box.left + origins[i][0],
        right: box.right + origins[i][0],
        bottom: box.bottom + origins[i][1],
        top: box.top + origins[i][1],
      })),
      {
        left: Math.min(...xs),
        right: Math.max(...xs),
        bottom: Math.min(...ys),
        top: Math.max(...ys),
      },
    ],
    table - GRID_LIFT,
  );

  pieces.forEach((piece, i) => {
    const laid = ([u, v]: Point): Point3 => [u + origins[i][0], v + origins[i][1], table];
    // Slid over its place on the table, clear of it for the allowances opening.
    const body = piece.vertices.flat();
    const [from, to] = [
      centreOf(body.map((v) => v.point)),
      laid([mean(body.map((v) => v.flat[0])), mean(body.map((v) => v.flat[1]))]),
    ];
    const moved = ([px, py, pz]: Point3): Point3 => [
      px + to[0] - from[0],
      py + to[1] - from[1],
      pz - CLEARANCE * chord,
    ];
    const move = rigidMove(piece, moved, laid, table);
    const poses = Array.from({ length: MOVES }, (_, k) => move(k / MOVES));
    const through = (v: Vertex): Opening<Point3> => ({
      before: Array.from({ length: SWINGS }, (_, k) => moved(swing(v, k / SWINGS))),
      apart: moved(v.open ?? v.point),
      between: poses.map((pose) => pose(v.flat)),
      flat: laid(v.flat),
    });
    const opened = (rings: readonly (readonly Vertex[])[]): Opening<Point3[][]> => {
      const steps = rings.map((ring) => ring.map(through));
      return {
        before: Array.from({ length: SWINGS }, (_, k) =>
          steps.map((ring) => ring.map((p) => p.before[k])),
        ),
        apart: steps.map((ring) => ring.map((p) => p.apart)),
        between: poses.map((_, k) => steps.map((ring) => ring.map((p) => p.between[k]))),
        flat: steps.map((ring) => ring.map((p) => p.flat)),
      };
    };
    const line = (
      points: Point3[],
      opening: Opening<Point3[][]>,
      pick: (rows: Point3[][]) => Point3[],
      fault?: boolean,
    ) =>
      seam(
        points,
        {
          before: opening.before.map(pick),
          apart: pick(opening.apart),
          between: opening.between.map(pick),
          flat: pick(opening.flat),
        },
        fault,
      );
    const sewnOf = (rings: readonly (readonly Vertex[])[]) =>
      rings.map((ring) => ring.map((v) => v.point));
    const color = COLORS[piece.kind];
    const sewn = sewnOf(piece.vertices);
    const opening = opened(piece.vertices);
    if (piece.kind !== 'extrados' && piece.kind !== 'intrados') {
      if (visible.has(piece.kind)) {
        model.fills.push({
          points: sewn[0],
          holes: sewn.slice(1),
          kind: 'skin',
          color,
          opening,
        });
        // Its holes are cut, not folded.
        sewn.slice(1).forEach((ring, r) => {
          if (ring.length > 1)
            model.lines.push(line(closed(ring), opening, (rows) => closed(rows[r + 1])));
        });
      }
      model.lines.push(line(closed(sewn[0]), opening, (rows) => closed(rows[0])));
    } else {
      if (visible.has(piece.kind))
        model.surfaces.push({ rows: sewn, kind: 'skin', color, opening });
      const firstColumn = (rows: Point3[][]) => rows.map((row) => row[0]);
      const lastColumn = (rows: Point3[][]) => rows.map((row) => row[row.length - 1]);
      model.lines.push(
        line(sewn[0], opening, (rows) => rows[0], piece.faults[0]),
        line(sewn.at(-1)!, opening, (rows) => rows.at(-1)!, piece.faults[1]),
        line(firstColumn(sewn), opening, firstColumn),
        line(lastColumn(sewn), opening, lastColumn),
      );
    }
    if (piece.seam && visible.has('minirib')) {
      const seamOpening = opened([piece.seam]);
      model.lines.push({
        ...line(sewnOf([piece.seam])[0], seamOpening, (rows) => rows[0]),
        color: MINIRIB_SEAM,
      });
    }
    for (const flap of visible.has(piece.kind) ? piece.flaps : []) {
      const rows = sewnOf(flap);
      const flapOpening = opened(flap);
      model.surfaces.push({ rows, kind: 'flap', color, opening: flapOpening });
      // A rib's cut line closes across its trailing edge.
      const edge = (steps: Point3[][]) => (piece.kind === 'rib' ? closed(steps[1]) : steps[1]);
      model.lines.push(line(edge(rows), flapOpening, edge));
    }
    for (const mark of visible.has('marks') ? piece.marks : [])
      model.dots.push({
        point: mark.point,
        kind: 'mark',
        selected: false,
        color: piece.kind === 'rib' ? COLORS.rib : undefined,
        opening: through(mark),
      });
  });
}

/** A grid in cm around `boxes`, at height `z`. */
function tableGrid(boxes: readonly ReturnType<typeof bounds>[], z: number) {
  const [left, right] = [
    Math.min(...boxes.map((box) => box.left)),
    Math.max(...boxes.map((box) => box.right)),
  ];
  const [bottom, top] = [
    Math.min(...boxes.map((box) => box.bottom)),
    Math.max(...boxes.map((box) => box.top)),
  ];
  const length = gridLength(Math.max(right - left, top - bottom) / GRID_SQUARES);
  const [columns, rows] = [
    [left, right],
    [bottom, top],
  ].map(([from, to]) => {
    const [first, last] = [Math.floor(from / length), Math.ceil(to / length)];
    return Array.from({ length: last - first + 1 }, (_, k) => (first + k) * length);
  });
  const lines = [
    ...columns.flatMap((x): Point3[] => [
      [x, rows[0], z],
      [x, rows.at(-1)!, z],
    ]),
    ...rows.flatMap((y): Point3[] => [
      [columns[0], y, z],
      [columns.at(-1)!, y, z],
    ]),
  ];
  return { length, lines };
}

const closed = (ring: Point3[]) => [...ring, ring[0]];

/** A line through a piece's steps, marked when its seam is off. */
function seam(
  points: Point3[],
  opening: Opening<Point3[]>,
  fault = false,
): PreviewModel['lines'][number] {
  return {
    points,
    kind: 'seam',
    selected: false,
    color: fault ? FAULT : undefined,
    opening,
  };
}
