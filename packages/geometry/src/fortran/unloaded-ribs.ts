// The unloaded ribs laid flat, engine §9.9: for a rib whose `rib(i,56)` is
// 100, a rib in the middle of the cell before it, the airfoil of the rib
// before at the cell's mean chord and thickness, its extrados and intrados
// stretched to the lengths of the panel's midline; its cut line, marks,
// inlet ends, number and holes. In its frame, cm, v up.
import type { Hole, LepAirfoil, LepDesign } from '@lepara/format';
import { markOffset, romanDots } from './marks.ts';
import type { Point } from '../shared/points.ts';
import { engineSides } from './skin-panels.ts';
import { ellipsePolyline, ellipseSegments, ribMarks } from './rib-patterns.ts';
import type { MiniribSections } from './miniribs.ts';
import { skinPatterns } from './skin-patterns.ts';
import { ribStations, skinRibs, type SkinRib, type Stations } from './skin-ribs.ts';
import type { SkinPatterns } from '../shared/skin-types.ts';

export type UnloadedRibSections = MiniribSections | 'holes';

/** An unloaded rib laid flat, in its frame (cm, v up). */
export interface UnloadedRibPattern {
  /** The rib of section 2 that sets it, from 1: it lies in the cell between it and the rib before. */
  readonly rib: number;
  /** Its sewing line, which the engine does not draw: its airfoil from the trailing edge round. */
  readonly sewing: readonly Point[];
  /** Its cut line, closed onto the sewing line at the trailing edge. */
  readonly cut: readonly Point[];
  /** Sewing marks every section 7 spacing along the extrados and the intrados. */
  readonly marks: readonly Point[];
  /** Its inlet's ends: two dots across each. */
  readonly inlets: readonly Point[];
  readonly holes: readonly (readonly Point[])[];
  readonly numeral: readonly Point[];
}

/** The length of a polyline from its point `from` to `to`. */
const length = (points: readonly Point[], from: number, to: number) => {
  let sum = 0;
  for (let j = from; j < to; j++)
    sum += Math.hypot(points[j][0] - points[j + 1][0], points[j][1] - points[j + 1][1]);
  return sum;
};

/** The engine's quadrant signs of a step: the last case matching wins. */
function signs(du: number, dv: number): Point {
  let s: Point = [0, 0];
  if (du >= 0 && dv >= 0) s = [1, 1];
  if (du <= 0 && dv >= 0) s = [-1, 1];
  if (du >= 0 && dv <= 0) s = [1, -1];
  if (du <= 0 && dv <= 0) s = [-1, -1];
  return s;
}

/** A step `from` → `to` of the airfoil, as the engine rescales it: its signs, length and angle. */
function step(from: Point, to: Point) {
  const [du, dv] = [to[0] - from[0], to[1] - from[1]];
  return {
    signs: signs(du, dv),
    distance: Math.hypot(du, dv),
    angle: du !== 0 ? Math.abs(Math.atan(dv / du)) : 2 * Math.atan(1),
  };
}

/** §6.11+: the engine's thickness of an airfoil (% of chord), the last rise and fall it finds. */
function thickness(points: readonly Point[], chord: number) {
  let [top, bottom] = [0, 0];
  for (let j = 1; j + 1 < points.length; j++) {
    const [[u0, v0], [u1, v1]] = [points[j], points[j + 1]];
    if (v1 >= v0 && u1 < u0) top = v1;
    if (v1 <= v0 && u1 > u0) bottom = v1;
  }
  return (100 * (top - bottom)) / chord;
}

/**
 * §9.9.9: the holes of the unloaded ribs, read as section 4's "parameters
 * for unloaded": those of the last rib of the last row holding a type 11,
 * whatever their types, as that rib's last row left them.
 */
function unloadedHoles({ holes }: Pick<LepDesign, 'holes'>): readonly Hole[] {
  const elevens = holes.flatMap((group) =>
    group.holes.some((hole) => hole.type === 11)
      ? Array.from({ length: group.lastRib - group.firstRib + 1 }, (_, k) => ({
          rib: group.firstRib + k,
          group,
        }))
      : [],
  );
  const eleven = elevens.at(-1);
  return eleven &&
    [...holes].reverse().find((g) => g.firstRib <= eleven.rib && eleven.rib <= g.lastRib) ===
      eleven.group
    ? eleven.group.holes
    : [];
}

/** The steps of `unloadedRibPatterns` each model takes its own way. */
export interface UnloadedSteps {
  readonly sides: typeof engineSides;
  readonly holes: typeof unloadedHoles;
  /** The airfoil stations they read. */
  readonly stations: Stations;
  /** The developed panels their midline runs on. */
  readonly patterns: (
    design: Pick<LepDesign, UnloadedRibSections>,
    ribs: readonly SkinRib[],
  ) => SkinPatterns;
}

/**
 * The unloaded ribs of a double-skin or "pc" wing, their holes drawn as
 * ellipses.
 */
export function unloadedRibPatterns(
  design: Pick<LepDesign, UnloadedRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  steps: UnloadedSteps = {
    sides: engineSides,
    holes: unloadedHoles,
    stations: ribStations,
    patterns: skinPatterns,
  },
): UnloadedRibPattern[] {
  if (design.geometry.paragliderType === 'ss') return [];
  const closed = design.geometry.paragliderType === 'pc';
  const unloaded = design.airfoils.flatMap(({ minirib }, index) =>
    minirib === 100 ? [index + 1] : [],
  );
  if (!unloaded.length) return [];
  const ribs = skinRibs(design, airfoils, Math.fround, steps.stations);
  if (!ribs.length) return [];
  const patterns = steps.patterns(design, ribs);
  const xdes = markOffset(design);
  const xcos = design.sewingAllowances.ribs / 10;
  const spacing = (design.markTypes[8]?.laser.offset ?? 0) * 0.1;
  const segments = ellipseSegments(design);
  const holeRows = steps.holes(design);
  return unloaded.flatMap((i): UnloadedRibPattern[] => {
    const [before, here] = [ribs[i - 1], ribs[i]];
    const stations = steps.stations(design, airfoils, Math.max(i - 2, 0));
    if (!before || !here || !stations) return [];
    const { upper: np2, inlet: np3 } = before;
    const np1 = before.local.length - 1;
    // u(i-1,j,3), v(i-1,j,3) and u(i,j,3), from 1.
    const contour = (rib: typeof before): Point[] => rib.local.map(([u, v]): Point => [u, -v]);
    const [c0, c1] = [contour(before), contour(here)];
    const [t0, t1] = [thickness(c0, before.chord), thickness(c1, here.chord)];
    const mean = 0.5 * (here.chord + before.chord);
    // u43: the airfoil of rib i − 1 at the mean chord and thickness.
    const p43: Point[] = [
      [0, 0],
      ...stations.points.map(([x, y]): Point => [
        (100 * x * mean) / 100,
        (((100 * -y * (0.5 * (t1 + t0))) / t0) * mean) / 100,
      ]),
    ];
    // u44: the midline of the cell's panels, vectors 9 and 10 as §8.4 leaves them.
    const lower = np2 + np3 - 1;
    const sides = steps.sides(design, before, patterns, i - 1);
    const p44 = sides.left.map(([u, v], j): Point => [
      (u + sides.right[j][0]) / 2,
      (v + sides.right[j][1]) / 2,
    ]);
    // The extrados from the trailing edge, then the intrados from it, rescaled in chains.
    const extradosScale = length(p44, 1, np2) / length(p43, 1, np2);
    const extrados = Array.from({ length: np2 - 1 }, (_, k) => step(p43[k + 1], p43[k + 2]));
    extrados.forEach(({ signs: [su, sv], distance, angle }, k) => {
      const j = k + 1;
      p43[j + 1] = [
        p43[j][0] + su * extradosScale * distance * Math.cos(angle),
        p43[j][1] + sv * extradosScale * distance * Math.sin(angle),
      ];
    });
    let intradosLength = 0;
    let midline = 0;
    for (let j = lower; j <= np1 - 1; j++) {
      intradosLength += Math.hypot(p43[j][0] - p43[j + 1][0], p43[j][1] - p43[j + 1][1]);
      midline += Math.hypot(p44[j][0] - p44[j + 1][0], p44[j][1] - p44[j + 1][1]);
    }
    const intradosScale = midline / intradosLength;
    const intrados = new Map<number, ReturnType<typeof step>>();
    for (let j = np1; j >= lower + 1; j--) intrados.set(j, step(p43[j - 1], p43[j]));
    for (let j = np1; j >= lower + 1; j--) {
      const {
        signs: [su, sv],
        distance,
        angle,
      } = intrados.get(j)!;
      p43[j - 1] = [
        p43[j][0] - su * intradosScale * distance * Math.cos(angle),
        p43[j][1] - sv * intradosScale * distance * Math.sin(angle),
      ];
    }
    // The inlet, its inner points between its ends: evenly on "pc" wings.
    if (closed) {
      const [du, dv] = [0, 1].map((c) => (p43[lower][c] - p43[np2][c]) / (np3 - 1));
      for (let j = np2; j <= lower - 1; j++) p43[j + 1] = [p43[j][0] + du, p43[j][1] + dv];
    } else if (np3 === 3) {
      const j = np2 + 1;
      p43[j] = [(p43[j - 1][0] + p43[j + 1][0]) * 0.5, (p43[j - 1][1] + p43[j + 1][1]) * 0.5];
    } else if (np3 >= 4) {
      let j = np2 + 1;
      p43[j] = [(2 * p43[j - 1][0] + p43[j + 2][0]) / 3, (2 * p43[j - 1][1] + p43[j + 2][1]) / 3];
      j = np2 + 2;
      p43[j] = [(p43[j - 2][0] + 2 * p43[j + 1][0]) / 3, (p43[j - 2][1] + 2 * p43[j + 1][1]) / 3];
    }
    // §9.9.2: the cut line on mean segment angles, turned over on a sawtooth intrados.
    const p46: Point[] = [];
    const off = (j: number, alpha: number, below: boolean): Point => {
      const [u, v] = p43[j];
      return below
        ? [u + xcos * Math.sin(alpha), v - xcos * Math.cos(alpha)]
        : [u - xcos * Math.sin(alpha), v + xcos * Math.cos(alpha)];
    };
    const slope = (a: number, b: number) =>
      Math.atan((p43[b][1] - p43[a][1]) / (p43[b][0] - p43[a][0]));
    for (let j = 2; j <= np1 - 1; j++) {
      const [a1, a2] = [slope(j, j + 1), slope(j - 1, j)];
      let alpha = 0.5 * (a1 + a2);
      if (a1 < 0 && a2 > 0 && j >= np2) alpha += Math.PI;
      p46[j] = off(j, alpha, p43[j][1] < 0);
      if (c1[j]?.[0] === 0) p46[j] = [p43[j][0] - xcos, p43[j][1]];
    }
    p46[1] = off(1, slope(1, 2), p43[1][1] < 0);
    p46[np1] = off(np1, slope(np1 - 1, np1), p43[np1][1] <= 0);
    const sewing = p43.slice(1);
    // §9.9.6: two dots across each end of the inlet, `xdes` inside and 1.8 or 2 cm out.
    const across = (j: number, alpha: number, out: number): Point[] => [
      [p43[j][0] + xdes * Math.sin(alpha), p43[j][1] - xdes * Math.cos(alpha)],
      [p43[j][0] - out * Math.sin(alpha), p43[j][1] + out * Math.cos(alpha)],
    ];
    const holes = holeRows.map(({ parameters: [x, y, a, b, rotation] }) =>
      ellipsePolyline(
        [(x * mean) / 100, (-y * mean) / 100],
        (a * mean) / 100,
        (b * mean) / 100,
        rotation,
        segments,
        Math.fround,
      ).map(([u, v]): Point => [u, -v]),
    );
    return [
      {
        rib: i,
        sewing,
        cut: [p43[1], ...p46.slice(1), p43[np1]],
        marks: ribMarks(sewing, np2, np2 + np3, true, design.marks.spacing, xdes).slice(1),
        inlets: [
          ...across(np2, slope(np2 - 1, np2), 1.8),
          ...across(lower, slope(lower - 1, lower + 1), 2),
        ],
        holes,
        numeral: romanDots(i, [p43[1][0] - 20, p43[1][1]], 0, spacing),
      },
    ];
  });
}
