// Nylon rods and nose mylars on the ribs, engine §6.12.6 and §6.12.7
// (joncs, joncs2, joncst3s, joncst3i, joncs4, joncs5, pjoncs_b12,
// pjoncs_b17, pjoncs2, loffset2, mylars): in the rib's frame, cm, v up.
// The engine builds each rod in one array per rib, `xjonc`, indexed as
// the airfoil's points (from 1): the ports keep its indices, overwrites
// included.
import type {
  ArcRodGroup,
  LepDesign,
  LongRodGroup,
  NoseMylarGroup,
  NoseRodGroup,
  RodCurve,
  RodPocket,
  SharkNoseGroup,
} from '@lepara/format';
import type { Point } from '../shared/points.ts';
import { romanDots } from './marks.ts';

export type RodSections = 'joncs' | 'noseMylars' | 'airfoils' | 'markTypes';

/** A nylon rod of a rib (section 21), as §6.12.6 draws it. */
export interface RibRod {
  /** Its type of section 21; the shark nose (3) has an upper and a lower rod. */
  readonly type: number;
  /** Its centre line, `xjonc`. */
  readonly line: readonly Point[];
  /** Its two edges on the rib; the engine marks their ends on the cutting table. */
  readonly edges: readonly [readonly Point[], readonly Point[]];
  /** Its pocket's outline, closed: drawn on the rib and as its own piece. */
  readonly pocket: readonly Point[];
  /** The rib's number on the pocket, in roman numerals of dots spaced by section 20, row 9. */
  readonly numeral: readonly Point[];
}

/** A rib's nose mylar (section 22), as §6.12.7 draws it. */
export interface RibMylar {
  /** Its edge inside the rib, drawn on it: points 1, 2, 4, 5, 7 and 8. */
  readonly edge: readonly Point[];
  /**
   * The mylar as its own piece: along the airfoil from point 1 to 8, then
   * its edge back, closed; open, in two lines, where it ends inside a "pc" inlet.
   */
  readonly outline: readonly (readonly Point[])[];
  /** The rib's number on it, in roman numerals of dots 3 cm apart. */
  readonly numeral: readonly Point[];
  /** Its ends on the cutting table, 0.7 cm segments in thirds, their middle left out. */
  readonly ends: readonly (readonly Point[])[];
}

/** The rib's airfoil as the engine's arrays, from 1, 0 past its points. */
export interface Airfoil {
  readonly u: number[];
  readonly v: number[];
  /** Its points: `np(i,1)`. */
  readonly n: number;
  /** The first point of its inlet, `np(i,2)`, and the points of the inlet, `np(i,3)`. */
  readonly upper: number;
  readonly inlet: number;
  readonly chord: number;
  readonly single: boolean;
  /** Its inlet's end (% of chord), `rib(i,12)`. */
  readonly intakeEnd: number;
}

/** `xjonc(i,j,1..2)`: a rib's rod array, kept from one rod to the next. */
export interface RodArray {
  readonly x: number[];
  readonly y: number[];
}

export const at = (values: readonly number[], j: number) => values[j] ?? 0;

/** interpola: v at u = x3 on the line through (x1, y1) and (x2, y2). */
function interpola(x1: number, y1: number, x2: number, y2: number, x3: number) {
  const xm = (y2 - y1) / (x2 - x1);
  return xm * x3 + (y2 - xm * x2);
}

/** interpd: the point `xd` from (x1, y1) towards (x2, y2). */
function interpd([x1, y1]: Point, [x2, y2]: Point, xd: number): Point {
  const xdi = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  return xdi !== 0 ? [x1 + ((x2 - x1) * xd) / xdi, y1 + ((y2 - y1) * xd) / xdi] : [x1, y1];
}

/** "ss": the point after the inlet moved onto its last segment's line at the rod's intrados end. */
export function withVirtualPoint(foil: Airfoil, to: number): Airfoil {
  if (!foil.single || !(to > foil.intakeEnd)) return foil;
  const j = foil.upper + foil.inlet - 1;
  const [u, v] = [[...foil.u], [...foil.v]];
  const x3 = (to * foil.chord) / 100;
  u[j + 1] = x3;
  v[j + 1] = interpola(at(u, j - 1), at(v, j - 1), at(u, j), at(v, j), x3);
  return { ...foil, u, v };
}

/** The points the rod passes on the airfoil, the last match of each, with its point. */
export interface Found {
  j?: number;
  point?: Point;
}

/**
 * What the engine's rod subroutines keep from one call to the next, their
 * locals being static, zero at first: the points each last found, and
 * joncs2's `xsign3`; with §6.12.5's `x21`, and the point joncs4 leaves at
 * (0, 0) on the rib (from 1). One for the ribs of a run, in order.
 */
export interface RodState {
  x21?: number;
  xsign3: number;
  readonly found: Map<string, readonly Found[]>;
  cleared?: number;
}

export const rodState = (): RodState => ({ xsign3: 0, found: new Map() });

/** The points subroutine `name` found: those it did not, as its last call left them. */
function kept(state: RodState, name: string, found: readonly Found[]): Found[] {
  const last = state.found.get(name) ?? [];
  const result = found.map((f, k) =>
    f.j === undefined ? (last[k] ?? { j: 0, point: [0, 0] }) : f,
  );
  state.found.set(name, result);
  return result;
}

/**
 * Where a rod leaves the airfoil, as the engine's loops find it: the last
 * segment j (from `first` to `last`) matching `test`, interpolated from
 * point j+1 (`forward` false) or from point j.
 */
export function find(
  foil: Airfoil,
  first: number,
  last: number,
  x: number,
  test: (j: number) => boolean,
  forward: boolean,
): Found {
  const { u, v } = foil;
  const found: Found = {};
  for (let j = first; j <= last; j++) {
    if (!test(j)) continue;
    const [a, b] = forward ? [j, j + 1] : [j + 1, j];
    found.j = j;
    found.point = [x, interpola(at(u, a), at(v, a), at(u, b), at(v, b), x)];
  }
  return found;
}

/** The points the engine explores: extrados and inlet single skin, else the whole airfoil. */
export const explored = (foil: Airfoil) => (foil.single ? foil.upper + foil.inlet - 1 : foil.n - 1);

/**
 * joncs, joncs4, joncs5: the airfoil from `f1` to `f2` through the points
 * between, its ends on the rod's four points, deflected by `deflect1` from
 * the second point back to the first and by `deflect2` from the third to
 * the fourth; renumbered from 1.
 */
function alongAirfoil(
  foil: Airfoil,
  { x, y }: RodArray,
  [f1, i1, i2, f2]: readonly Found[],
  deflect1: (x: number) => number,
  deflect2: (x: number) => number,
): number | undefined {
  const [j1f, j1i, j2i, j2f] = [f1.j, i1.j, i2.j, f2.j];
  if (j1f === undefined || j1i === undefined || j2i === undefined || j2f === undefined) return;
  const set = (j: number, [u, v]: Point) => ((x[j] = u), (y[j] = v));
  const point = (j: number): Point => [at(foil.u, j), at(foil.v, j)];
  set(j1f, f1.point!);
  for (let j = j1f + 1; j <= j1i; j++) set(j, point(j));
  set(j1i + 1, i1.point!);
  for (let j = j1i + 1; j <= j2i; j++) set(j + 1, point(j));
  set(j2i + 2, i2.point!);
  for (let j = j2i + 1; j <= j2f; j++) set(j + 2, point(j));
  set(j2f + 3, f2.point!);
  const npo = j2f - j1f + 4;
  for (let j = j1i + 1; j >= j1f; j--) y[j] += deflect1(x[j]);
  for (let j = j2i + 2; j <= j2f + 3; j++) y[j] += deflect2(x[j]);
  renumber({ x, y }, 1, npo, j1f - 1);
  return npo;
}

/** The reformat loops: points `from` to `to` take those `shift` further, read first. */
function renumber({ x, y }: RodArray, from: number, to: number, shift: number) {
  const read = Array.from({ length: to - from + 1 }, (_, k): Point => [
    at(x, from + k + shift),
    at(y, from + k + shift),
  ]);
  read.forEach(([u, v], k) => ((x[from + k] = u), (y[from + k] = v)));
}

/** A power deflection, `deflection` % of chord at `to` from nothing at `from`, the engine's `k`. */
export function power(
  chord: number,
  deflection: number,
  exponent: number,
  from: number,
  to: number,
) {
  const k = (deflection * chord) / 100 / Math.pow(to - from, exponent);
  return (sign: number) => (x: number) => sign * k * Math.pow(x - from, exponent);
}

export const pct = (foil: Airfoil, p: number) => (p * foil.chord) / 100;

/** joncs: type 1, from the extrados round the nose to the intrados. */
function noseRod(
  base: Airfoil,
  rod: RodArray,
  extrados: RodCurve,
  intrados: RodCurve,
  state: RodState,
) {
  const foil = withVirtualPoint(base, intrados.to);
  const { u, v } = foil;
  const [x1f, x1i, x2f, x2i] = [extrados.to, extrados.from, intrados.to, intrados.from].map((p) =>
    pct(foil, p),
  );
  const last = explored(foil);
  const above = (x: number) => (j: number) => u[j] >= x && at(u, j + 1) < x && v[j] >= 0;
  return alongAirfoil(
    foil,
    rod,
    kept(state, 'joncs', [
      find(foil, 1, last, x1f, above(x1f), false),
      find(foil, 1, last, x1i, above(x1i), false),
      find(foil, 1, last, x2i, (j) => u[j] <= x2i && at(u, j + 1) > x2i && v[j] < 0, true),
      find(foil, 1, last, x2f, (j) => u[j] <= x2f && at(u, j + 1) >= x2f && v[j] < 0, true),
    ]),
    power(foil.chord, extrados.deflection, extrados.exponent, x1i, x1f)(-1),
    power(foil.chord, intrados.deflection, intrados.exponent, x2i, x2f)(1),
  );
}

/**
 * joncs4: type 4, along the extrados from the final part's end to the
 * initial part's start; each part deflected by the other's deflection and
 * exponent. Single skin, it then restores the point after the inlet from
 * its `x4` and `y4`, never set: (0, 0), for the rest of the rib.
 */
function extradosRod(
  foil: Airfoil,
  rod: RodArray,
  initial: RodCurve,
  final: RodCurve,
  state: RodState,
) {
  const { u, v } = foil;
  const [x2i, x2f, x1f, x1i] = [initial.to, initial.from, final.to, final.from].map((p) =>
    pct(foil, p),
  );
  const last = explored(foil);
  const above = (x: number) => (j: number) => u[j] >= x && at(u, j + 1) < x && v[j] >= 0;
  const npo = alongAirfoil(
    foil,
    rod,
    kept(state, 'joncs4', [
      find(foil, 1, last, x1f, above(x1f), false),
      find(foil, 1, last, x1i, above(x1i), false),
      find(foil, 1, last, x2i, above(x2i), true),
      find(foil, 1, last, x2f, above(x2f), true),
    ]),
    power(foil.chord, initial.deflection, initial.exponent, x1i, x1f)(-1),
    power(foil.chord, final.deflection, final.exponent, x2i, x2f)(-1),
  );
  if (foil.single && final.to > foil.intakeEnd) {
    const j = foil.upper + foil.inlet;
    [u[j], v[j], state.cleared] = [0, 0, j];
  }
  return npo;
}

/** joncs5: type 5, along the intrados from the initial part's start to the final part's end. */
function intradosRod(
  foil: Airfoil,
  rod: RodArray,
  initial: RodCurve,
  final: RodCurve,
  state: RodState,
) {
  const { u, v } = foil;
  const [x1i, x1f, x2f, x2i] = [initial.to, initial.from, final.to, final.from].map((p) =>
    pct(foil, p),
  );
  const below = (x: number) => (j: number) => u[j] <= x && at(u, j + 1) > x && v[j] < 0;
  const [first, last] = [foil.upper, foil.n];
  return alongAirfoil(
    foil,
    rod,
    kept(state, 'joncs5', [
      find(foil, first, last, x1f, below(x1f), false),
      find(foil, first, last, x1i, below(x1i), false),
      find(foil, first, last, x2i, below(x2i), true),
      find(foil, first, last, x2f, below(x2f), true),
    ]),
    power(foil.chord, initial.deflection, initial.exponent, x1i, x1f)(1),
    power(foil.chord, final.deflection, final.exponent, x2i, x2f)(1),
  );
}

/**
 * The shark nose's transition, 11 points: v = b (u / a)^n from its start,
 * turned by `angle` (degrees, loc2glo2D); a, b and n in % of chord.
 */
function parabola(foil: Airfoil, curve: RodCurve, sign: number, start: Point, angle: number) {
  const [a, b, n] = [curve.to, sign * curve.deflection, curve.exponent].map((p) => pct(foil, p));
  const [s, c] = [Math.sin((angle * Math.PI) / 180), Math.cos((angle * Math.PI) / 180)];
  return Array.from({ length: 11 }, (_, k): Point => {
    const xl = (a * k) / 10;
    const yl = (b / Math.pow(a, n)) * Math.pow(xl, n);
    return [c * xl - s * yl + start[0], s * xl + c * yl + start[1]];
  });
}

/** joncst3s: the shark nose's upper rod, from the extrados round the nose into its transition. */
function sharkUpperRod(base: Airfoil, { x, y }: RodArray, group: SharkNoseGroup, state: RodState) {
  const foil = withVirtualPoint(base, group.intrados.to);
  const { u, v } = foil;
  const { extrados, upperRod } = group;
  const [x1f, x1i, x3i] = [extrados.to, extrados.from, upperRod.from].map((p) => pct(foil, p));
  const last = explored(foil);
  const above = (p: number) => (j: number) => u[j] >= p && at(u, j + 1) < p && v[j] >= 0;
  const [f1, i1, p3] = kept(state, 'joncst3s', [
    find(foil, 1, last, x1f, above(x1f), false),
    find(foil, 1, last, x1i, above(x1i), false),
    find(foil, 1, last, x3i, (j) => u[j] <= x3i && at(u, j + 1) > x3i && v[j] < 0, true),
  ]);
  const [j1f, j1i, j3i] = [f1.j!, i1.j!, p3.j!];
  const set = (j: number, [a, b]: Point) => ((x[j] = a), (y[j] = b));
  set(j1f, f1.point!);
  for (let j = j1f + 1; j <= j1i; j++) set(j, [u[j], v[j]]);
  set(j1i + 1, i1.point!);
  for (let j = j1i + 1; j <= j3i; j++) set(j, [u[j], v[j]]);
  const [x3, y3] = p3.point!;
  const angle = (180 / Math.PI) * Math.atan((at(v, j3i - 2) - y3) / (at(u, j3i - 2) - x3));
  parabola(foil, upperRod, 1, [x3, y3], angle).forEach((p, k) => set(j3i + k, p));
  const deflect = power(foil.chord, extrados.deflection, extrados.exponent, x1i, x1f)(-1);
  for (let j = j1i + 1; j >= j1f; j--) y[j] += deflect(x[j]);
  const npo = j3i - j1f + 11;
  renumber({ x, y }, 1, npo, j1f - 1);
  return npo;
}

/** joncst3i: the shark nose's lower rod, from its transition along the intrados, its points from 0. */
function sharkLowerRod(base: Airfoil, { x, y }: RodArray, group: SharkNoseGroup, state: RodState) {
  const foil = withVirtualPoint(base, group.intrados.to);
  const { u, v } = foil;
  const { intrados, lowerRod } = group;
  const [x2f, x2i, x4i] = [intrados.to, intrados.from, lowerRod.from].map((p) => pct(foil, p));
  const last = explored(foil);
  const below = (p: number, end: (a: number, b: number) => boolean) => (j: number) =>
    u[j] <= p && end(at(u, j + 1), p) && v[j] < 0;
  const [p4, i2, f2] = kept(state, 'joncst3i', [
    find(
      foil,
      1,
      last,
      x4i,
      below(x4i, (a, b) => a > b),
      true,
    ),
    find(
      foil,
      1,
      last,
      x2i,
      below(x2i, (a, b) => a > b),
      true,
    ),
    find(
      foil,
      1,
      last,
      x2f,
      below(x2f, (a, b) => a >= b),
      true,
    ),
  ]);
  const [j4i, j2i, j2f] = [p4.j!, i2.j!, f2.j!];
  const set = (j: number, [a, b]: Point) => ((x[j] = a), (y[j] = b));
  set(j4i, p4.point!);
  for (let j = j4i; j <= j2i; j++) set(j, [u[j], v[j]]);
  const [x4, y4] = p4.point!;
  const angle = -180 + (180 / Math.PI) * Math.atan((at(v, j4i + 2) - y4) / (at(u, j4i + 2) - x4));
  const transition = parabola(foil, lowerRod, -1, [x4, y4], angle).reverse();
  const [last1, last2, first] = [transition[10], transition[9], transition[0]];
  transition.unshift([first[0] + (last1[0] - last2[0]), first[1] + (last1[1] - last2[1])]);
  set(j2i, i2.point!);
  for (let j = j2i + 1; j <= j2f; j++) set(j, [u[j], v[j]]);
  set(j2f, f2.point!);
  const deflect = power(foil.chord, intrados.deflection, intrados.exponent, x2i, x2f)(1);
  for (let j = j2i + 2; j <= j2f + 3; j++) y[j] = at(y, j) + deflect(at(x, j));
  const npo = j2f - j4i + 11;
  transition.forEach((p, j) => set(j, p));
  renumber({ x, y }, 12, npo, j4i - 11);
  return npo;
}

/** joncs2: type 2, 41 points from (x1, y1) to (x2, y2), straight or on an arc of that deflection. */
function arcRod(foil: Airfoil, { x, y }: RodArray, group: ArcRodGroup, state: RodState) {
  const nparc = 41;
  const { x1, y1, x2, y2, deflection } = group;
  const [dx, dy] = [(x2 - x1) / (nparc - 1), (y2 - y1) / (nparc - 1)];
  const scale = foil.chord / 100;
  const limit = Math.fround(0.01);
  if (Math.abs(deflection) < limit) {
    for (let j = 1; j <= nparc; j++)
      [x[j], y[j]] = [(x1 + dx * (j - 1)) * scale, (y1 + dy * (j - 1)) * scale];
    return nparc;
  }
  const xsign = deflection > limit ? 1 : -1;
  // xsign3 is only set falling, else kept from the last arc that set it.
  if (y1 > y2 && x2 > x1) state.xsign3 = -1;
  if (y1 > y2 && x2 < x1) state.xsign3 = 1;
  const [x4, y4] = [(x1 + x2) * 0.5, (y1 + y2) * 0.5];
  const d = 0.5 * Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
  const f = Math.abs(deflection);
  const radi = (f * f + d * d) / (2 * f);
  const g = radi - f;
  let alpha = Math.atan((y2 - y1) / (x2 - x1));
  if (Math.abs(y2 - y1) > Math.abs(x2 - x1)) {
    if (x1 === x2) alpha = y2 > y1 ? -Math.PI / 2 : Math.PI / 2;
    const xsign2 = y1 > y2 ? 1 : -1;
    const [x0, y0] = [x4 + xsign * g * Math.sin(alpha), y4 - xsign * g * Math.cos(alpha)];
    for (let j = 1; j <= nparc; j++) {
      y[j] = y1 + dy * (j - 1);
      const b = -2 * x0;
      const c = x0 * x0 + y[j] * y[j] - 2 * y[j] * y0 + y0 * y0 - radi * radi;
      x[j] = (-b - xsign * xsign2 * state.xsign3 * Math.sqrt(b * b - 4 * c)) / 2;
    }
  } else {
    const [x0, y0] = [x4 + xsign * g * Math.sin(alpha), y4 - xsign * g * Math.cos(alpha)];
    for (let j = 1; j <= nparc; j++) {
      x[j] = x1 + dx * (j - 1);
      const b = -2 * y0;
      const c = x0 * x0 + x[j] * x[j] - 2 * x[j] * x0 + y0 * y0 - radi * radi;
      y[j] = (-b + xsign * Math.sqrt(b * b - 4 * c)) / 2;
    }
  }
  for (let j = 1; j <= nparc; j++) [x[j], y[j]] = [x[j] * scale, y[j] * scale];
  return nparc;
}

/** loffset2: points 1 to `npo` moved `xo` mm across their following segment (the last, its previous). */
function offsetLine({ x, y }: RodArray, npo: number, xo: number): Point[] {
  // The engine's pi is single precision here.
  const pi = Math.fround(Math.PI);
  return Array.from({ length: npo }, (_, k): Point => {
    const j = k + 1;
    const [a, b] = j < npo ? [j, j + 1] : [j - 1, j];
    let alpha = Math.atan((at(y, b) - at(y, a)) / (at(x, b) - at(x, a)));
    if (at(x, b) >= at(x, a)) alpha -= pi;
    return [x[j] - xo * 0.1 * Math.sin(alpha), y[j] + xo * 0.1 * Math.cos(alpha)];
  });
}

/**
 * pjoncs_b12, pjoncs_b17 and pjoncs2: a rod's edges and pocket, `edges`
 * and `sides` its offsets (mm), and the rib's number on its pocket at a
 * quarter of its points.
 */
export function drawRod(
  rod: RodArray,
  npo: number,
  type: number,
  edges: readonly [number, number],
  [outer, inner]: readonly [number, number],
  n: number,
  spacing: number,
): RibRod {
  const [line3, line4] = [offsetLine(rod, npo, outer), offsetLine(rod, npo, inner)];
  const ijo = Math.trunc(npo * 0.25);
  const { x, y } = rod;
  const alpha = Math.atan((at(y, ijo) - at(y, ijo - 1)) / (at(x, ijo) - at(x, ijo - 1)));
  return {
    type,
    line: Array.from({ length: npo }, (_, k): Point => [x[k + 1], y[k + 1]]),
    edges: [offsetLine(rod, npo, edges[0]), offsetLine(rod, npo, edges[1])],
    pocket: [...line3, ...line4.reverse(), line3[0]],
    numeral:
      spacing > 0.01
        ? romanDots(n, [at(x, ijo), at(y, ijo)], alpha, spacing * Math.fround(0.1))
        : [],
  };
}

/** The pocket offsets of pjoncs_b12 (types 1, 3 to 5): its edges, its outer and inner sides. */
export function pocketOffsets({ offset, outerWidth, rodWidth, innerWidth }: RodPocket) {
  return {
    edges: [-offset, -(offset + rodWidth)] as const,
    sides: [outerWidth - offset, -(offset + rodWidth + innerWidth)] as const,
  };
}

/** The pocket offsets of pjoncs2 (type 2): its edges, its outer and inner sides. */
export function arcOffsets({ outerWidth, rodWidth, innerWidth }: RodPocket) {
  return {
    edges: [-rodWidth / 2, rodWidth / 2] as const,
    sides: [-rodWidth / 2 - outerWidth, rodWidth / 2 + innerWidth] as const,
  };
}

/** The rod groups naming rib `rib` (from 1), types 1 first, then the others, by bloc. */
export function rodGroups({ joncs }: Pick<LepDesign, 'joncs'>, rib: number) {
  type Entry =
    | { type: 1; group: NoseRodGroup }
    | { type: 2; group: ArcRodGroup }
    | { type: 3; group: SharkNoseGroup }
    | { type: 4 | 5; group: LongRodGroup };
  const blocs =
    joncs.mode === 0
      ? []
      : joncs.mode === 1
        ? [{ type: 1 as const, groups: joncs.groups }]
        : joncs.blocs;
  const entries = blocs.flatMap((bloc) =>
    bloc.groups
      .filter((g) => g.firstRib <= rib && rib <= g.lastRib)
      .map((group) => ({ type: bloc.type, group }) as Entry),
  );
  return [...entries.filter((e) => e.type === 1), ...entries.filter((e) => e.type !== 1)];
}

/**
 * §6.12.6: the rods of rib `index` (from 0) on its airfoil, in the engine's
 * order, with what the engine kept from the ribs before (`state`): its arcs
 * (type 2) all `x21` once a rectangle hole has set it (§6.12.5), NaN.
 */
export function ribRods(
  design: Pick<LepDesign, RodSections>,
  index: number,
  contour: readonly Point[],
  upper: number,
  inlet: number,
  chord: number,
  single: boolean,
  state: RodState = rodState(),
): RibRod[] {
  const foil: Airfoil = {
    u: [0, ...contour.map(([u]) => u)],
    v: [0, ...contour.map(([, v]) => v)],
    n: contour.length,
    upper,
    inlet,
    chord,
    single,
    intakeEnd: design.airfoils[index]?.intakeEnd ?? 0,
  };
  // Section 20, row 9, its laser size (the ribs' numerals take its offset).
  const spacing = design.markTypes[8]?.laser.size ?? 0;
  const rod: RodArray = { x: [], y: [] };
  const rods: RibRod[] = [];
  const draw = (npo: number | undefined, type: number, pocket: RodPocket, arc = false) => {
    if (npo === undefined) return;
    const { edges, sides } = arc ? arcOffsets(pocket) : pocketOffsets(pocket);
    rods.push(drawRod(rod, npo, type, edges, sides, index + 1, spacing));
  };
  for (const { type, group } of rodGroups(design, index + 1)) {
    if (type === 1)
      draw(noseRod(foil, rod, group.extrados, group.intrados, state), 1, group.pocket);
    if (type === 2) {
      const v = state.x21;
      const arc = v === undefined ? group : { ...group, x1: v, y1: v, x2: v, y2: v, deflection: v };
      draw(arcRod(foil, rod, arc, state), 2, group.pocket, true);
    }
    if (type === 3) {
      draw(sharkUpperRod(foil, rod, group, state), 3, group.pocket);
      draw(sharkLowerRod(foil, rod, group, state), 3, group.pocket);
    }
    if (type === 4)
      draw(extradosRod(foil, rod, group.initial, group.final, state), 4, group.pocket);
    if (type === 5)
      draw(intradosRod(foil, rod, group.initial, group.final, state), 5, group.pocket);
  }
  return rods;
}

/** The last mylar group naming rib `rib` (from 1). */
function mylarGroup({ noseMylars }: Pick<LepDesign, 'noseMylars'>, rib: number) {
  if (noseMylars.mode !== 1) return undefined;
  return [...noseMylars.groups]
    .reverse()
    .find((g: NoseMylarGroup) => g.firstRib <= rib && rib <= g.lastRib);
}

/** §6.12.7: rib `index`'s nose mylar, across a "pc" inlet closed from point `upper` to `closed` (from 1). */
export function ribMylar(
  design: Pick<LepDesign, RodSections>,
  index: number,
  contour: readonly Point[],
  upper: number,
  chord: number,
  closed?: number,
): RibMylar | undefined {
  const group = mylarGroup(design, index + 1);
  if (!group) return undefined;
  const [from, across, , to, height] = group.values.map((p) => (p * chord) / 100);
  const [first, second] = [group.values[2], group.values[5]];
  const u = [0, ...contour.map(([x]) => x)];
  const v = [0, ...contour.map(([, y]) => y)];
  let start: { j: number; v: number } | undefined;
  let end: { j: number; v: number } | undefined;
  for (let j = 1; j <= contour.length - 1; j++) {
    const line = (x: number) => interpola(at(u, j + 1), at(v, j + 1), u[j], v[j], x);
    if (u[j] >= from && at(u, j + 1) < from && v[j] >= 0) start = { j, v: line(from) };
    if (u[j] <= to && at(u, j + 1) > to && j >= upper) end = { j, v: line(to) };
  }
  if (!start || !end) return undefined;
  const m: Point[] = [];
  m[1] = [from, start.v];
  m[8] = [to, end.v];
  m[3] = [from + across, start.v];
  m[6] = [to, end.v + height];
  // A corner cut `size` % of chord across: its points 1 cm along both
  // sides, then scaled, their distance in single precision.
  const corner = (c: Point, a: Point, b: Point, size: number): [Point, Point] => {
    const [p, q] = [interpd(c, a, 1), interpd(c, b, 1)];
    const xdi = Math.fround(Math.hypot(p[0] - q[0], p[1] - q[1]));
    if (xdi === 0) return [p, q];
    const xd = (size * chord) / Math.fround(100 * xdi);
    return [interpd(c, a, xd), interpd(c, b, xd)];
  };
  [m[2], m[4]] = corner(m[3], m[1], m[6], first);
  [m[5], m[7]] = corner(m[6], m[3], m[8], second);
  const edge = [1, 2, 4, 5, 7, 8].map((k) => m[k]);
  const centre: Point = [0.5 * (m[3][0] + m[6][0]), 0.5 * (m[3][1] + m[6][1])];
  const alpha = Math.atan((m[6][1] - m[3][1]) / (m[6][0] - m[3][0]));
  // Along the airfoil, from point start.j + 1 to end.j (from 1); a "pc"
  // inlet closed at point `closed` by a straight line drawn whole: ending
  // inside it, the mylar is left open there.
  const points = (from: number, to: number) => contour.slice(from - 1, to);
  const along =
    closed === undefined
      ? [[m[1], ...points(start.j + 1, end.j), m[8]]]
      : end.j >= closed
        ? [[m[1], ...points(start.j + 1, upper), ...points(closed, end.j), m[8]]]
        : [
            [m[1], ...points(start.j + 1, upper), contour[closed - 1]],
            [contour[end.j - 1], m[8]],
          ];
  const third = (a: Point, b: Point): Point[][] => {
    const t = (k: number): Point => [
      a[0] + ((b[0] - a[0]) * k) / 3,
      a[1] + ((b[1] - a[1]) * k) / 3,
    ];
    return [
      [a, t(1)],
      [t(2), b],
    ];
  };
  const tick = Math.fround(0.7);
  return {
    edge,
    outline: [...along.slice(0, -1), [...along.at(-1)!, ...edge.slice(0, -1).reverse()]],
    numeral: romanDots(
      index + 1,
      [centre[0] + Math.sin(alpha), centre[1] - Math.cos(alpha)],
      alpha,
      3,
    ),
    ends: [...third(m[1], [m[1][0] + tick, m[1][1]]), ...third(m[8], [m[8][0], m[8][1] + tick])],
  };
}
