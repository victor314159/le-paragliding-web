// The rods of a rib as the reference builds them, corrected: see "Rods" in
// MODELS.md. Each rod is a list of points, not the engine's shared array.
import type { ArcRodGroup, LepDesign, RodCurve, RodPocket, SharkNoseGroup } from '@lepara/format';
import type { Point } from '../shared/points.ts';
import {
  arcOffsets,
  at,
  drawRod,
  explored,
  find,
  pct,
  pocketOffsets,
  power,
  rodGroups,
  withVirtualPoint,
  type Airfoil,
  type Found,
  type RibRod,
  type RodSections,
} from '../fortran/rods.ts';

type Reached = Required<Found>;

const point = (foil: Airfoil, j: number): Point => [at(foil.u, j), at(foil.v, j)];
const points = (foil: Airfoil, from: number, to: number) =>
  Array.from({ length: Math.max(to - from + 1, 0) }, (_, k) => point(foil, from + k));
/** Every point found, or none: a rod finding no segment is not drawn. */
const reached = (found: readonly Found[]) =>
  found.every((f) => f.j !== undefined) ? (found as Reached[]) : undefined;
const deflected = (line: readonly Point[], deflect: (x: number) => number) =>
  line.map(([x, y]): Point => [x, y + deflect(x)]);

/** The airfoil through the rod's four points, its ends deflected. */
function along(
  foil: Airfoil,
  [f1, i1, i2, f2]: readonly Reached[],
  deflect1: (x: number) => number,
  deflect2: (x: number) => number,
): Point[] {
  return [
    ...deflected([f1.point, ...points(foil, f1.j + 1, i1.j), i1.point], deflect1),
    ...points(foil, i1.j + 1, i2.j),
    ...deflected([i2.point, ...points(foil, i2.j + 1, f2.j), f2.point], deflect2),
  ];
}

/** Type 1, from the extrados round the nose to the intrados. */
function noseRod(base: Airfoil, extrados: RodCurve, intrados: RodCurve) {
  const foil = withVirtualPoint(base, intrados.to);
  const { u, v } = foil;
  const [x1f, x1i, x2f, x2i] = [extrados.to, extrados.from, intrados.to, intrados.from].map((p) =>
    pct(foil, p),
  );
  const last = explored(foil);
  const above = (x: number) => (j: number) => u[j] >= x && at(u, j + 1) < x && v[j] >= 0;
  const found = reached([
    find(foil, 1, last, x1f, above(x1f), false),
    find(foil, 1, last, x1i, above(x1i), false),
    find(foil, 1, last, x2i, (j) => u[j] <= x2i && at(u, j + 1) > x2i && v[j] < 0, true),
    find(foil, 1, last, x2f, (j) => u[j] <= x2f && at(u, j + 1) >= x2f && v[j] < 0, true),
  ]);
  return (
    found &&
    along(
      foil,
      found,
      power(foil.chord, extrados.deflection, extrados.exponent, x1i, x1f)(-1),
      power(foil.chord, intrados.deflection, intrados.exponent, x2i, x2f)(1),
    )
  );
}

/** Type 4, along the extrados, each part deflected by its own deflection and exponent. */
function extradosRod(foil: Airfoil, initial: RodCurve, final: RodCurve) {
  const { u, v } = foil;
  const [x2i, x2f, x1f, x1i] = [initial.to, initial.from, final.to, final.from].map((p) =>
    pct(foil, p),
  );
  const last = explored(foil);
  const above = (x: number) => (j: number) => u[j] >= x && at(u, j + 1) < x && v[j] >= 0;
  const found = reached([
    find(foil, 1, last, x1f, above(x1f), false),
    find(foil, 1, last, x1i, above(x1i), false),
    find(foil, 1, last, x2i, above(x2i), true),
    find(foil, 1, last, x2f, above(x2f), true),
  ]);
  return (
    found &&
    along(
      foil,
      found,
      power(foil.chord, final.deflection, final.exponent, x1i, x1f)(-1),
      power(foil.chord, initial.deflection, initial.exponent, x2i, x2f)(-1),
    )
  );
}

/** Type 5, along the intrados. */
function intradosRod(foil: Airfoil, initial: RodCurve, final: RodCurve) {
  const { u, v } = foil;
  const [x1i, x1f, x2f, x2i] = [initial.to, initial.from, final.to, final.from].map((p) =>
    pct(foil, p),
  );
  const below = (x: number) => (j: number) => u[j] <= x && at(u, j + 1) > x && v[j] < 0;
  const [first, last] = [foil.upper, foil.n];
  const found = reached([
    find(foil, first, last, x1f, below(x1f), false),
    find(foil, first, last, x1i, below(x1i), false),
    find(foil, first, last, x2i, below(x2i), true),
    find(foil, first, last, x2f, below(x2f), true),
  ]);
  return (
    found &&
    along(
      foil,
      found,
      power(foil.chord, initial.deflection, initial.exponent, x1i, x1f)(1),
      power(foil.chord, final.deflection, final.exponent, x2i, x2f)(1),
    )
  );
}

/**
 * The shark nose's transition, 11 points from `start`: v = b (u / a)^n,
 * turned by `angle` (degrees); a and b in % of chord, n an exponent.
 */
function parabola(foil: Airfoil, curve: RodCurve, sign: number, start: Point, angle: number) {
  const [a, b, n] = [pct(foil, curve.to), sign * pct(foil, curve.deflection), curve.exponent];
  const [s, c] = [Math.sin((angle * Math.PI) / 180), Math.cos((angle * Math.PI) / 180)];
  return Array.from({ length: 11 }, (_, k): Point => {
    const xl = (a * k) / 10;
    const yl = (b / Math.pow(a, n)) * Math.pow(xl, n);
    return [c * xl - s * yl + start[0], s * xl + c * yl + start[1]];
  });
}

/** The shark nose's upper rod: from the extrados round the nose into its transition. */
function sharkUpperRod(base: Airfoil, { extrados, upperRod, intrados }: SharkNoseGroup) {
  const foil = withVirtualPoint(base, intrados.to);
  const { u, v } = foil;
  const [x1f, x1i, x3i] = [extrados.to, extrados.from, upperRod.from].map((p) => pct(foil, p));
  const last = explored(foil);
  const above = (p: number) => (j: number) => u[j] >= p && at(u, j + 1) < p && v[j] >= 0;
  const found = reached([
    find(foil, 1, last, x1f, above(x1f), false),
    find(foil, 1, last, x1i, above(x1i), false),
    find(foil, 1, last, x3i, (j) => u[j] <= x3i && at(u, j + 1) > x3i && v[j] < 0, true),
  ]);
  if (!found) return;
  const [f1, i1, p3] = found;
  const [x3, y3] = p3.point;
  const angle = (180 / Math.PI) * Math.atan((at(v, p3.j - 2) - y3) / (at(u, p3.j - 2) - x3));
  return [
    ...deflected(
      [f1.point, ...points(foil, f1.j + 1, i1.j), i1.point],
      power(foil.chord, extrados.deflection, extrados.exponent, x1i, x1f)(-1),
    ),
    ...points(foil, i1.j + 1, p3.j),
    ...parabola(foil, upperRod, 1, p3.point, angle),
  ];
}

/** The shark nose's lower rod: from its transition along the intrados. */
function sharkLowerRod(base: Airfoil, { intrados, lowerRod }: SharkNoseGroup) {
  const foil = withVirtualPoint(base, intrados.to);
  const { u, v } = foil;
  const [x2f, x2i, x4i] = [intrados.to, intrados.from, lowerRod.from].map((p) => pct(foil, p));
  const last = explored(foil);
  const below = (p: number, end: (a: number, b: number) => boolean) => (j: number) =>
    u[j] <= p && end(at(u, j + 1), p) && v[j] < 0;
  const found = reached([
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
  if (!found) return;
  const [p4, i2, f2] = found;
  const [x4, y4] = p4.point;
  const angle = -180 + (180 / Math.PI) * Math.atan((at(v, p4.j + 2) - y4) / (at(u, p4.j + 2) - x4));
  return [
    ...parabola(foil, lowerRod, -1, p4.point, angle).reverse(),
    ...points(foil, p4.j + 1, i2.j),
    ...deflected(
      [i2.point, ...points(foil, i2.j + 1, f2.j), f2.point],
      power(foil.chord, intrados.deflection, intrados.exponent, x2i, x2f)(1),
    ),
  ];
}

/** Type 2, 41 points from (x1, y1) to (x2, y2), straight or on an arc bulging by its deflection's sign. */
function arcRod(chord: number, { x1, y1, x2, y2, deflection }: ArcRodGroup) {
  const nparc = 41;
  const [dx, dy] = [(x2 - x1) / (nparc - 1), (y2 - y1) / (nparc - 1)];
  const scale = chord / 100;
  const steps = Array.from({ length: nparc }, (_, k) => k);
  if (Math.abs(deflection) < 0.01)
    return steps.map((k): Point => [(x1 + dx * k) * scale, (y1 + dy * k) * scale]);
  const xsign = Math.sign(deflection);
  const [x4, y4] = [(x1 + x2) * 0.5, (y1 + y2) * 0.5];
  const d = 0.5 * Math.hypot(x2 - x1, y2 - y1);
  const f = Math.abs(deflection);
  const radi = (f * f + d * d) / (2 * f);
  const g = radi - f;
  const alpha =
    x1 === x2 ? (y2 > y1 ? -Math.PI / 2 : Math.PI / 2) : Math.atan((y2 - y1) / (x2 - x1));
  const [x0, y0] = [x4 + xsign * g * Math.sin(alpha), y4 - xsign * g * Math.cos(alpha)];
  // The arc's side of its circle: away from the centre, across the chord.
  const line = steps.map((k): Point => {
    if (Math.abs(y2 - y1) > Math.abs(x2 - x1)) {
      const y = y1 + dy * k;
      const root = Math.sqrt(radi * radi - (y - y0) * (y - y0));
      return [x0 - xsign * Math.sign(Math.sin(alpha)) * root, y];
    }
    const x = x1 + dx * k;
    return [x, y0 + xsign * Math.sqrt(radi * radi - (x - x0) * (x - x0))];
  });
  return line.map(([x, y]): Point => [x * scale, y * scale]);
}

/** A rod's points but those a rounding after the previous one, whose offset has no direction. */
const distinct = (line: readonly Point[]) =>
  line.filter((p, k) => k === 0 || Math.hypot(p[0] - line[k - 1][0], p[1] - line[k - 1][1]) > 1e-9);

/**
 * §6.12.6: the rods of rib `index` (from 0) as the reference's, corrected:
 * each from its own points, none taken from another rod or rib.
 */
export function ribRods(
  design: Pick<LepDesign, RodSections>,
  index: number,
  contour: readonly Point[],
  upper: number,
  inlet: number,
  chord: number,
  single: boolean,
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
  const spacing = design.markTypes[8]?.laser.size ?? 0;
  const rods: RibRod[] = [];
  const draw = (line: Point[] | undefined, type: number, pocket: RodPocket, arc = false) => {
    if (!line) return;
    const kept = distinct(line);
    const { edges, sides } = arc ? arcOffsets(pocket) : pocketOffsets(pocket);
    const rod = { x: [0, ...kept.map(([x]) => x)], y: [0, ...kept.map(([, y]) => y)] };
    const drawn = drawRod(rod, kept.length, type, edges, sides, index + 1, spacing);
    if ([...drawn.edges.flat(), ...drawn.pocket].every((p) => p.every(Number.isFinite)))
      rods.push(drawn);
  };
  for (const { type, group } of rodGroups(design, index + 1)) {
    if (type === 1) draw(noseRod(foil, group.extrados, group.intrados), 1, group.pocket);
    if (type === 2) draw(arcRod(chord, group), 2, group.pocket, true);
    if (type === 3) {
      draw(sharkUpperRod(foil, group), 3, group.pocket);
      draw(sharkLowerRod(foil, group), 3, group.pocket);
    }
    if (type === 4) draw(extradosRod(foil, group.initial, group.final), 4, group.pocket);
    if (type === 5) draw(intradosRod(foil, group.initial, group.final), 5, group.pocket);
  }
  return rods;
}
