// Rib patterns, engine §6.11 to §6.13, §9 and §11.3: each rib's airfoil laid
// flat in cm, v up, its cut line, its holes (section 4) and its marks.
import type { AnchorRow, GlueVent, LepAirfoil, LepDesign } from '@lepara/format';
import type { Point } from '../shared/points.ts';
import { intersection } from './skin-panels.ts';
import type { SkinProfileSections } from '../shared/skin-types.ts';
import {
  anchorForm,
  inletForm,
  markOffset,
  pointsAlong,
  romanDots,
  triangle,
  type LaserForm,
  type TableMarks,
} from './marks.ts';
import {
  ribMylar,
  ribRods,
  rodState,
  type RibMylar,
  type RibRod,
  type RodSections,
} from './rods.ts';
import { ribStations, skinRibs, type Stations } from './skin-ribs.ts';
import { engineTraces, vRibTraces, type TraceSteps, type VRibTraceSections } from './vribs.ts';

export type RibPatternSections =
  | SkinProfileSections
  | 'sewingAllowances'
  | 'holes'
  | 'specialParameters'
  | 'marks'
  | 'markTypes'
  | 'anchors'
  | 'ribPoints'
  | 'glueVents'
  | RodSections
  | VRibTraceSections;

/** A rib laid flat, in cm, its trailing edge at its chord, v up. */
export interface RibPattern {
  /** Rib index from 0. */
  readonly rib: number;
  /** The airfoil contour, its sewing line, from the trailing edge round. */
  readonly sewing: readonly Point[];
  /**
   * The cut line, sewing allowance included, as cut on the table: open at
   * the trailing edge; on a "pc" rib without thickness, two, the engine
   * leaving its nose open.
   */
  readonly cut: readonly (readonly Point[])[];
  /** Closed cut lines of its holes (types 1, 3 and 4). */
  readonly holes: readonly (readonly Point[])[];
  /** Sewing marks (§11.3): its trailing edge, then marks along the extrados and the intrados. */
  readonly marks: readonly Point[];
  /** Its anchors A to E (section 3), and the brake F if set, on the cutting table (§9.3.2). */
  readonly anchors: TableMarks;
  /** The ends of its air inlet on the cutting table (§9.4), by its type of section 26. */
  readonly inlets: TableMarks;
  /** The points of section 17 (§9.5). */
  readonly points: readonly Point[];
  /** Its number, from 1, in roman numerals of dots near its trailing edge (§6.13). */
  readonly numeral: readonly Point[];
  /** Its nylon rods (section 21, §6.12.6), in the engine's order. */
  readonly rods: readonly RibRod[];
  /** Its nose mylar (section 22, §6.12.7). */
  readonly mylar?: RibMylar;
  /** Where the V and VH ribs of section 12 are sewn to it (§16), and their marks on the cutting table. */
  readonly vRibs: { readonly lines: readonly (readonly Point[])[]; readonly table: TableMarks };
}

type Round = (value: number) => number;

/**
 * A DO loop on a single-precision variable: its trip count computed in
 * single precision, the variable incremented by `step` each time.
 */
function realLoop(start: number, stop: number, step: number, round: Round): number[] {
  const count = Math.max(Math.trunc(round(round(round(stop - start) + step) / step)), 0);
  const values: number[] = [];
  for (let k = 0, t = start; k < count; k++, t = round(t + step)) values.push(t);
  return values;
}

/** §6.11: the cut line, the contour moved by the rib allowance on mean segment normals. */
export function cutLine(
  contour: readonly Point[],
  upper: number,
  lower: number,
  single: boolean,
  allowance: number,
  round: Round,
): Point[] {
  const n = contour.length - 1;
  const xcos = round(allowance / round(10));
  const slope = (a: Point, b: Point) => round(Math.atan((b[1] - a[1]) / (b[0] - a[0])));
  const cut: Point[] = [];
  // Upstream keeps the last factor of the loop for both ends.
  let xcosk = 1;
  for (let j = 1; j < n; j++) {
    const [u, v] = contour[j];
    const a1 = slope(contour[j], contour[j + 1]),
      a2 = slope(contour[j - 1], contour[j]);
    const alpha = round(round(0.5) * round(a1 + a2));
    xcosk = 1;
    // Sawtooth correction on single-skin intrados.
    if (single && j + 1 >= lower) xcosk = round(1 / Math.sin(0.5 * (Math.PI + a1 - a2)));
    const m = round(xcos * xcosk);
    let point: Point = [u - m * Math.sin(alpha), v];
    if (v >= 0) point = [point[0], v + m * Math.cos(alpha)];
    if ((v >= 0 && j + 1 >= upper) || v < 0)
      point = [u + m * Math.sin(alpha), v - m * Math.cos(alpha)];
    if (u === 0) point = [u - m, v];
    cut[j] = point;
  }
  const m = round(xcos * xcosk);
  const end = (j: number, alpha: number, below: boolean): Point => {
    const [u, v] = contour[j];
    return below
      ? [u + m * Math.sin(alpha), v - m * Math.cos(alpha)]
      : [u - m * Math.sin(alpha), v + m * Math.cos(alpha)];
  };
  cut[0] = end(0, slope(contour[0], contour[1]), contour[0][1] < 0);
  cut[n] = end(n, slope(contour[n - 1], contour[n]), contour[n][1] <= 0);
  return cut;
}

/**
 * §6.12.2 and §6.13, "pc": the inlet between points `upper` and `lower`
 * (from 1) closed by a straight line. §6.12.2 draws the cut line
 * `allowance` mm off it, meeting the extrados' and the intrados' at xrxs
 * corners, which it writes over the cut line's points upper + 1, upper + 2,
 * lower − 2 and lower − 1, in that order; §6.13 then cuts the extrados and
 * the intrados on these points (with fewer than 4 inlet points, some
 * overwritten), and the nose straight between their ends, only with a
 * thickness.
 */
function closedInlet(
  contour: readonly Point[],
  cut: readonly Point[],
  upper: number,
  lower: number,
  allowance: number,
  round: Round,
) {
  const [j, k] = [upper - 1, lower - 1];
  const [a, b] = [contour[j], contour[k]];
  const dv = a[1] - b[1];
  const alpha = dv === 0 ? 0 : Math.atan(dv / (b[0] - a[0]));
  const m = allowance * round(0.1);
  const off = ([u, v]: Point): Point => [u - m * Math.sin(alpha), v - m * Math.cos(alpha)];
  const w = [...cut];
  w[j + 2] = off(a);
  w[k - 2] = off(b);
  w[j + 1] = intersection([w[j], w[j - 1]], [w[j + 2], w[k - 2]], round);
  w[k - 1] = intersection([w[k], w[k + 1]], [w[j + 2], w[k - 2]], round);
  const [extrados, intrados] = [w.slice(0, j + 1), w.slice(k)];
  return {
    sewing: [...contour.slice(0, j + 1), ...contour.slice(k)],
    cut: contour.every(([, v]) => v === 0) ? [extrados, intrados] : [[...extrados, ...intrados]],
  };
}

/**
 * §11.3: a rib's trailing edge, then a mark every `spacing` from it along
 * its extrados and, double skin, its intrados, moved `offset` across its
 * segment: inwards on the intrados, on the extrados by the sign of v.
 */
export function ribMarks(
  contour: readonly Point[],
  upper: number,
  lower: number,
  double: boolean,
  spacing: number,
  offset: number,
): Point[] {
  const positions = Array.from({ length: 60 }, (_, k) => spacing * (k + 1));
  const along = (line: readonly Point[]) =>
    pointsAlong(line, positions, (at, before, after) => at < after && at >= before);
  const extrados = along(contour.slice(0, upper)).map(({ point: [u, v], angle }): Point =>
    v < 0
      ? [u + offset * Math.sin(angle), v - offset * Math.cos(angle)]
      : [u - offset * Math.sin(angle), v + offset * Math.cos(angle)],
  );
  const intrados = double
    ? along(contour.slice(lower - 2).reverse()).map(({ point: [u, v], angle }): Point => [
        u + offset * Math.sin(angle),
        v - offset * Math.cos(angle),
      ])
    : [];
  return [contour[0], ...extrados, ...intrados];
}

/**
 * §9.1 and §9.3.2: the anchors of a rib (and its brake F if strictly
 * between 0 and 100 %) on the last intrados segment holding them, compared
 * in single precision, marked by section 20's row 5 across the intrados
 * slope about them: three dots `size` apart from `offset` below (type 1
 * upright, type 2 turned) or a triangle (type 3).
 */
function anchorMarks(
  contour: readonly Point[],
  upper: number,
  chord: number,
  { count, positions }: AnchorRow,
  form: LaserForm,
  round: Round,
): TableMarks {
  const dots: Point[] = [];
  const lines: Point[][] = [];
  positions.forEach((position, k) => {
    if (!(k < count || (k === 5 && position < 100 && position > 0))) return;
    const a = (chord * position) / 100;
    let anchor: Point | undefined;
    let around: number | undefined;
    for (let j = 0; j + 1 < contour.length; j++) {
      const [[u0, v0], [u1, v1]] = [contour[j], contour[j + 1]];
      if (j + 1 >= upper && round(u0) <= round(a) && round(u1) >= round(a)) {
        const m = (v1 - v0) / (u1 - u0);
        anchor = [a, m * a + v0 - m * u0];
      }
      if (u0 <= a && u1 >= a && u0 <= u1) around = j;
    }
    if (!anchor) return;
    const [u, v] = anchor;
    if (form.type === 1)
      dots.push(...[0, 1, 2].map((n): Point => [u, v - form.offset + n * form.size]));
    if (around === undefined || around < 1) return;
    const [p, q] = [contour[around - 1], contour[around + 1]];
    const alpha = Math.atan((p[1] - q[1]) / (p[0] - q[0]));
    const [sin, cos] = [Math.sin(alpha), Math.cos(alpha)];
    if (form.type === 2)
      dots.push(
        ...[0, 1, 2].map((n): Point => {
          const d = form.offset - n * form.size;
          return [u + d * sin, v - d * cos];
        }),
      );
    if (form.type === 3)
      lines.push(triangle([u + form.offset * sin, v - form.offset * cos], form.size, alpha));
  });
  return { dots, lines };
}

/**
 * interpseg: the point `fraction` of the way along a polyline, on the last
 * segment holding it, and that segment's end.
 */
function along(line: readonly Point[], fraction: number) {
  const lengths = line.slice(1).map((p, j) => Math.hypot(p[0] - line[j][0], p[1] - line[j][1]));
  const at = lengths.reduce((sum, d) => sum + d, 0) * fraction;
  let found = { j: 0, rest: 0 };
  let sum = 0;
  lengths.forEach((d, j) => {
    if (at >= sum && at <= sum + d) found = { j, rest: at - sum };
    sum += d;
  });
  const { j, rest } = found;
  const [[u0, v0], [u1, v1]] = [line[j], line[j + 1]];
  const m = (v1 - v0) / (u1 - u0);
  const u = u0 + (rest / lengths[j]) * (u1 - u0);
  return { point: [u, m * u + v0 - m * u0] as Point, end: j + 1 };
}

/**
 * §9.4: the ends of a rib's air inlet on the cutting table, by its type
 * (`rib(i,165)`): its first point (types 0, -1 to -4, -6), its last (0, 1,
 * -3, 4, 6), or the point `csi(i,20)` % from its end (±4, ±5), each marked
 * by section 20's row 4 across the contour from `offset` outside: two dots
 * (type 1), a segment (2), or a segment in thirds, its middle left out (3).
 */
function inletMarks(
  contour: readonly Point[],
  upper: number,
  inlet: number,
  vent: GlueVent | undefined,
  central: boolean,
  form: LaserForm,
): TableMarks {
  const type = vent?.type ?? 0;
  // §4: the central rib's trimmed inlets take its left parameter on both sides.
  const fraction = vent?.parameters[central && [4, 5].includes(Math.abs(type)) ? 0 : 1] ?? 0;
  const first = upper - 1,
    last = upper + inlet - 2;
  const angle = (a: Point, b: Point) => Math.PI + Math.atan((b[1] - a[1]) / (b[0] - a[0]));
  const ends: [Point, number][] = [];
  if ([0, -1, -2, -3, -4, -6].includes(type))
    ends.push([contour[first], angle(contour[first - 1], contour[first])]);
  if (Math.abs(type) === 4 || Math.abs(type) === 5) {
    const { point, end } = along(contour.slice(first, last + 1), 1 - fraction * 0.01);
    ends.push([point, angle(contour[first + end - 1], contour[first + end])]);
  }
  if ([0, 1, -3, 4, 6].includes(type))
    ends.push([contour[last], angle(contour[last - 1], contour[last + 1])]);
  const dots: Point[] = [];
  const lines: Point[][] = [];
  for (const [[u, v], alpha] of ends) {
    const [sin, cos] = [Math.sin(alpha), Math.cos(alpha)];
    const a: Point = [u + form.offset * sin, v - form.offset * cos];
    const rest = form.size - form.offset;
    const b: Point = [u - rest * sin, v + rest * cos];
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (form.type === 1) dots.push(a, b);
    if (form.type === 2) lines.push([a, b]);
    if (form.type === 3) lines.push([a, at(1 / 3)], [at(2 / 3), b]);
  }
  return { dots, lines };
}

/**
 * `ellipse`: `count` segments about (u0, v0) in the engine's frame, axis `a`
 * at `rotation` (rad), the parameter a single-precision fraction of the turn.
 */
export function ellipsePolyline(
  [u0, v0]: Point,
  a: number,
  b: number,
  rotation: number,
  count: number,
  round: Round,
): Point[] {
  const n = count + 1;
  return Array.from({ length: n }, (_, l): Point => {
    const t = 2 * Math.PI * round(round(l) / round(n - 1));
    return [
      u0 + a * Math.cos(t) * Math.cos(rotation) - b * Math.sin(t) * Math.sin(rotation),
      v0 + a * Math.cos(t) * Math.sin(rotation) + b * Math.sin(t) * Math.cos(rotation),
    ];
  });
}

/** Section 37, code 3002: the segments of the engine's ellipses, 60 by default. */
export function ellipseSegments({
  specialParameters: special,
}: Pick<LepDesign, 'specialParameters'>) {
  return special.mode === 1
    ? special.entries.reduce((n, p) => (p.code === 3002 ? p.value : n), 60)
    : 60;
}

/** ellipse: type 1, its centre not displaced, its rotation read as radians, drawn v reversed. */
function ellipseHole(
  [x, y, a, b, rotation]: readonly number[],
  chord: number,
  count: number,
  round: Round,
) {
  const [u0, v0, ha, hb] = [x, y, a, b].map((p) => (p * chord) / 100);
  return ellipsePolyline([u0, -v0], ha, hb, rotation, count, round).map(([u, v]): Point => [u, -v]);
}

/** Type 3: a right-angled triangle with rounded corners, in the engine's single precision. */
function triangleHole(
  [x, y, a, b, rotation, radius]: readonly number[],
  chord: number,
  round: Round,
) {
  const pi = Math.PI;
  const r = (value: number) => round(value);
  const alpha = r((rotation * pi) / 180);
  let atri = r((a * chord) / 100);
  const btri = r((b * chord) / 100),
    rtri = r((radius * chord) / 100);
  const s = r(atri / Math.sqrt(atri * atri));
  if (!Number.isFinite(s)) return undefined;
  atri = Math.abs(atri);
  const cgor = r(0.5 * pi - alpha);
  const ctri = r(Math.sqrt(atri * atri + btri * btri - 2 * atri * btri * Math.cos(cgor)));
  const agor = r(Math.acos((ctri * ctri + btri * btri - atri * atri) / (2 * btri * ctri)));
  const bgor = r(Math.acos((ctri * ctri + atri * atri - btri * btri) / (2 * atri * ctri)));
  const [aggor, bggor, cggor] = [r(pi - agor), r(pi - bgor), r(pi - cgor)];
  const h1 = r(rtri / Math.sin(0.5 * cgor)),
    h2 = r(rtri / Math.sin(0.5 * bgor)),
    h3 = r(rtri / Math.sin(0.5 * agor));
  const x1 = r((x * chord) / 100),
    y1 = r((y * chord) / 100);
  const x2 = r(x1 + s * atri * Math.cos(alpha)),
    y2 = r(y1 + atri * Math.sin(alpha));
  const [x3, y3] = [x1, r(y1 + btri)];
  const o1: Point = [
    r(x1 + s * h1 * Math.cos(alpha + 0.5 * cgor)),
    r(y1 + h1 * Math.sin(alpha + 0.5 * cgor)),
  ];
  const o2: Point = [
    r(x2 - s * h2 * Math.cos(-alpha + 0.5 * bgor)),
    r(y2 + h2 * Math.sin(-alpha + 0.5 * bgor)),
  ];
  const o3: Point = [r(x3 + s * h3 * Math.sin(0.5 * agor)), r(y3 - h3 * Math.cos(0.5 * agor))];
  const points: Point[] = [
    ...realLoop(0, r(cggor + r(0.01)), r(cggor / 6), round).map((t): Point => [
      r(o1[0] - s * rtri * Math.cos(t)),
      r(o1[1] - rtri * Math.sin(t)),
    ]),
    ...realLoop(alpha, r(r(alpha + bggor) + r(0.01)), r(bggor / 6), round).map((t): Point => [
      r(o2[0] + s * rtri * Math.sin(t)),
      r(o2[1] - rtri * Math.cos(t)),
    ]),
    ...realLoop(agor, r(pi + r(0.01)), r(aggor / 6), round).map((t): Point => [
      r(o3[0] + s * rtri * Math.cos(t)),
      r(o3[1] + rtri * Math.sin(t)),
    ]),
  ];
  // Upstream draws 21 segments of the closed list.
  return [...points, points[0]].slice(0, 22);
}

/**
 * §6.12.5: what a rectangle assigns to the whole array of section 21's arcs,
 * `x21`: its second corner's u, less its corner radius along its side.
 */
function rectangleX21(
  [x, , a, , rotation, radius]: readonly number[],
  chord: number,
  round: Round,
) {
  const alpha = round((rotation * Math.PI) / 180);
  const atri = round((a * chord) / 100);
  const s = round(atri / Math.sqrt(atri * atri));
  const x2 = round(round((x * chord) / 100) + s * Math.abs(atri) * Math.cos(alpha));
  return x2 - s * round((radius * chord) / 100) * Math.cos(alpha);
}

/** Type 4: a rectangle with rounded corners (2023), in the engine's single precision. */
function rectangleHole(
  [x, y, a, b, rotation, radius]: readonly number[],
  chord: number,
  round: Round,
) {
  const pi = Math.PI;
  const r = (value: number) => round(value);
  const alpha = r((rotation * pi) / 180);
  let atri = r((a * chord) / 100);
  const btri = r((b * chord) / 100),
    rtri = r((radius * chord) / 100);
  const s = r(atri / Math.sqrt(atri * atri));
  if (s !== 1 && s !== -1) return undefined;
  atri = Math.abs(atri);
  const [cos, sin] = [Math.cos(alpha), Math.sin(alpha)];
  const x1 = r((x * chord) / 100),
    y1 = r((y * chord) / 100);
  const x2 = r(x1 + s * atri * cos),
    y2 = r(y1 + atri * sin);
  const x3 = r(x2 - s * btri * sin),
    y3 = r(y2 + btri * cos);
  const x4 = r(x1 - s * btri * sin),
    y4 = r(y1 + btri * cos);
  const centres: Point[] = [
    [r(x1 + s * rtri * cos - s * rtri * sin), r(y1 + rtri * sin + rtri * cos)],
    [r(x2 - s * rtri * cos - s * rtri * sin), r(y2 - rtri * sin + rtri * cos)],
    [r(x3 - s * rtri * cos + s * rtri * sin), r(y3 - rtri * sin - rtri * cos)],
    [r(x4 + s * rtri * cos + s * rtri * sin), r(y4 + rtri * sin - rtri * cos)],
  ];
  const angles = realLoop(0, r(pi / 2), r(pi / 12), round);
  // Each corner's arc, from its start angle, the other way for a negative width.
  const starts = s === 1 ? [pi, 1.5 * pi, 0, 0.5 * pi] : [0, -0.5 * pi, pi, 0.5 * pi];
  const points = centres.flatMap(([cx, cy], k) =>
    angles.map((t): Point => {
      const angle = s === 1 ? t + starts[k] + alpha : -t + starts[k] - alpha;
      return [r(cx + rtri * Math.cos(angle)), r(cy + rtri * Math.sin(angle))];
    }),
  );
  // Upstream draws 28 segments of the closed list.
  return [...points, points[0]].slice(0, 29);
}

/** The steps of `ribPatterns` each model takes its own way. */
export interface RibSteps {
  readonly rods: typeof ribRods;
  readonly stations: Stations;
  readonly traces: TraceSteps;
}

/**
 * The ribs laid flat as §6.12 draws them, in cm (single skin and double
 * skin, and "pc" wings with their inlets closed). `round`
 * reproduces the engine's implicit single precision.
 */
export function ribPatterns(
  design: Pick<LepDesign, RibPatternSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  round: Round = Math.fround,
  steps: RibSteps = { rods: ribRods, stations: ribStations, traces: engineTraces },
): RibPattern[] {
  const closed = design.geometry.paragliderType === 'pc';
  const ribs = skinRibs(design, airfoils, round, steps.stations).slice(1);
  const single = design.geometry.paragliderType === 'ss';
  const segments = ellipseSegments(design);
  const offset = markOffset(design);
  const [anchoring, venting] = [anchorForm(design), inletForm(design)];
  const spacing = (design.markTypes[8]?.laser.offset ?? 0) * 0.1;
  const vents = design.glueVents.mode === 1 ? design.glueVents.ribs : [];
  // The last group naming a rib (from 1) gives its holes.
  const holeGroups = ribs.map((_, index) =>
    [...design.holes].reverse().find((g) => g.firstRib <= index + 1 && index + 1 <= g.lastRib),
  );
  const traces = vRibTraces(design, airfoils, steps.traces);
  const state = rodState();
  return ribs.map((rib, index): RibPattern => {
    // Point 0 of the engine's arrays is unused. §6.8 puts the rib back in
    // place: drawn without its displacement, like its holes.
    const contour = rib.local.slice(1).map(([u, v]): Point => [u, -v]);
    const lower = rib.upper + rib.inlet - 1;
    const cutAll = cutLine(contour, rib.upper, lower, single, design.sewingAllowances.ribs, round);
    const { sewing, cut } = closed
      ? closedInlet(contour, cutAll, rib.upper, lower, design.sewingAllowances.ribs, round)
      : { sewing: contour, cut: [cutAll] };
    const holes = (holeGroups[index]?.holes ?? []).flatMap(({ type, parameters }) => {
      const hole =
        type === 1
          ? ellipseHole(parameters, rib.chord, segments, round)
          : type === 3
            ? triangleHole(parameters, rib.chord, round)
            : type === 4
              ? rectangleHole(parameters, rib.chord, round)
              : undefined;
      // §6.12.5 assigns a rectangle's x21 to the whole array of section 21's
      // arcs: from the first rib with one, the engine's arc rods are NaN.
      if (type === 4) state.x21 = rectangleX21(parameters, rib.chord, round);
      return hole ? [hole] : [];
    });
    state.cleared = undefined;
    const rods = steps.rods(design, index, contour, rib.upper, rib.inlet, rib.chord, single, state);
    // The mylar (§6.12.7), the marks (§11.3), anchors (§9.3) and inlets (§9.4) after them, on the airfoil they leave.
    const after = contour.map((p, j): Point => (j + 1 === state.cleared ? [0, 0] : p));
    // §11.3 marks the last rib only if it has a thickness.
    const flat = index === ribs.length - 1 && contour.every(([, v]) => v === 0);
    const marks = flat
      ? []
      : ribMarks(after, rib.upper, rib.upper + rib.inlet, !single, design.marks.spacing, offset);
    const row = design.anchors[index];
    const trace = traces.get(index + 1);
    return {
      rib: index,
      sewing,
      cut,
      holes,
      marks,
      anchors: row
        ? anchorMarks(after, rib.upper, rib.chord, row, anchoring, round)
        : { dots: [], lines: [] },
      inlets: inletMarks(after, rib.upper, rib.inlet, vents[index], index === 0, venting),
      points: design.ribPoints.map(([x, y]): Point => [
        (x * rib.chord) / 100,
        (y * rib.chord) / 100,
      ]),
      numeral: romanDots(index + 1, [0.89 * rib.chord, 1], 0, spacing),
      rods,
      mylar: ribMylar(design, index, after, rib.upper, rib.chord, closed ? lower : undefined),
      vRibs: {
        lines: trace?.lines ?? [],
        table: { dots: trace?.dots ?? [], lines: trace?.tableLines ?? [] },
      },
    };
  });
}
