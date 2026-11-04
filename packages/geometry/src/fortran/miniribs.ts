// The miniribs laid flat, engine §6.12.0: the nose of the airfoil of the rib
// before, as far as section 2's `rib(i,56)` % of its chord, its back eased
// by section 37's code 3001, its cut line, its number and its holes of
// section 38 (type 9); in the rib's frame, cm, v up.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import type { Point } from '../shared/points.ts';
import { markOffset, polylineLength, romanDots } from './marks.ts';
import type { SkinPanel, SkinPanelSections } from './skin-panels.ts';
import { skinHeights } from '../shared/skin-mesh.ts';
import { ellipsePolyline, ellipseSegments } from './rib-patterns.ts';
import { arcHeight, skinPanels } from './skin.ts';
import { skinPatterns } from './skin-patterns.ts';
import { ribStations, skinRibs, type Stations } from './skin-ribs.ts';
import type { SkinPatternSections, SkinRib } from '../shared/skin-types.ts';

export type MiniribSections = SkinPanelSections | 'hvrHoles' | 'specialParameters';

/** A minirib laid flat, in its rib's frame (cm, v up). */
export interface MiniribPattern {
  /** The rib of section 2 that sets it, from 1: it is cut on the airfoil of the rib before. */
  readonly rib: number;
  /** Its sewing line: the extrados from the trailing edge to its front, then the intrados back. */
  readonly sewing: readonly Point[];
  /** Its cut lines along the extrados and the intrados, closed onto the sewing line at their ends. */
  readonly cut: readonly (readonly Point[])[];
  /** Section 38, type 9: ellipses along it. */
  readonly holes: readonly (readonly Point[])[];
  /** Its number in roman numerals of dots, on the cutting table. */
  readonly numeral: readonly Point[];
  /** The airfoil points its panels' seams aim at, on the extrados and the intrados. */
  readonly aim: { readonly extrados: number; readonly intrados: number };
}

/** Where a minirib is sewn on a panel of its cell, from the trailing edge. */
export interface MiniribSeam {
  readonly cell: number;
  readonly surface: SkinPanel['surface'];
  /** The piece of its panel at the trailing edge, that holds it. */
  readonly piece: number;
  /** The reference line (§8.2.6): from the midline's end, as long as the minirib's side. */
  readonly line: readonly [Point, Point];
  /** The sewing marks at its ends, section 7's displacement aside. */
  readonly dots: readonly [Point, Point];
}

/** The steps of `miniribSeams` each model takes its own way. */
export interface MiniribSeamSteps {
  readonly miniribs: readonly MiniribPattern[];
  readonly panels: readonly SkinPanel[];
  /** The way of a seam from `from` towards `to`, a unit vector, `sign` -1 on the intrados. */
  readonly direction: (from: Point, to: Point, sign: number) => Point;
}

/** §8.2.6: an angle of `atan`, with no quadrant: past a right angle, the seam runs off its panel. */
const engineDirection: MiniribSeamSteps['direction'] = ([x1, y1], [x2, y2], sign) => {
  const alpha = Math.abs(x2 - x1) < 0.00001 ? Math.PI / 2 : Math.atan((y2 - y1) / (x2 - x1));
  return [sign * Math.cos(alpha), sign * Math.sin(alpha)];
};

/**
 * The miniribs' seams on the panels of their cells (§8.2.6): straight from
 * the middle of the trailing edge towards the midline at the airfoil point
 * the minirib's front reaches, as long as its side.
 */
export function miniribSeams(
  design: Pick<LepDesign, MiniribSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  { miniribs, panels, direction }: MiniribSeamSteps = {
    miniribs: miniribPatterns(design, airfoils),
    panels: skinPanels(design, airfoils),
    direction: engineDirection,
  },
): MiniribSeam[] {
  const offset = markOffset(design);
  return miniribs.flatMap(({ rib, sewing, cut, aim }): MiniribSeam[] => {
    const cell = rib - 1;
    const front = cut[0].length - 2;
    const sides = [sewing.slice(0, front), sewing.slice(front)];
    return (['extrados', 'intrados'] as const).flatMap((surface, s): MiniribSeam[] => {
      const own = panels.filter((panel) => panel.cell === cell && panel.surface === surface);
      const holding = (point: number) =>
        own.find(({ ribEdges: { from, left } }) => point >= from && point < from + left.length);
      const middleAt = (point: number, { ribEdges: { from, left, right } }: SkinPanel) => {
        const [p, q] = [left[point - from], right[point - from]];
        return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as Point;
      };
      const ends = own.map(({ ribEdges: { from, left } }) => from + left.length - 1);
      const [first, target] = [s ? Math.max(...ends) : 1, s ? aim.intrados : aim.extrados];
      const [tail, ahead] = [holding(first), holding(target)];
      if (!tail || !ahead) return [];
      const [start, towards] = [middleAt(first, tail), middleAt(target, ahead)];
      const [dx, dy] = direction(start, towards, s ? -1 : 1);
      const length = polylineLength(sides[s]);
      const end: Point = [start[0] + dx * length, start[1] + dy * length];
      const alpha = Math.atan(dy / dx);
      const aside = ([u, v]: Point): Point => [
        u - offset * Math.sin(alpha),
        v + offset * Math.cos(alpha),
      ];
      const { piece } = tail;
      return [{ cell, surface, piece, line: [start, end], dots: [aside(start), aside(end)] }];
    });
  });
}

/**
 * Section 37, code 3001: the transition easing the minirib's back, `i3001(2)`
 * (0 none, 1 linear, 3 cosine; 2 is read and not drawn), its length (% of
 * chord) and height (fraction of the panel's arc height).
 */
export function transition({ specialParameters: special }: Pick<LepDesign, 'specialParameters'>) {
  const entry =
    special.mode === 1
      ? special.entries.reduce<{ transition: number; values: readonly number[] } | undefined>(
          (found, p) => (p.code === 3001 ? p : found),
          undefined,
        )
      : undefined;
  return {
    kind: entry?.transition ?? 0,
    length: entry?.values[0] ?? 0,
    height: entry?.values[1] ?? 0,
  };
}

/** The share of its height left of a transition of `kind` at fraction `t` of its length, from its front. */
export const transitionShape =
  (kind: number, parabola?: (fraction: number) => number) => (t: number) =>
    kind === 1 ? 1 - t : kind === 2 && parabola ? parabola(t) : (1 + Math.cos(Math.PI * t)) / 2;

/** The last airfoil points of `before` a minirib of `length` (cm) covers, 0 if none. */
export function miniribFront(before: SkinRib, length: number) {
  const u = (j: number) => before.local[j]?.[0] ?? 0;
  const np1 = before.local.length - 1;
  let [je, ji] = [0, 0];
  for (let j = 1; j <= before.upper - 1; j++)
    if (u(1) - u(j) < length && u(1) - u(j + 1) >= length) je = j;
  for (let j = np1; j >= before.upper; j--)
    if (u(1) - u(j) < length && u(1) - u(j - 1) >= length) ji = j;
  return { je, ji };
}

/** The steps of `miniribPatterns` each model takes its own way. */
export interface MiniribSteps {
  /** The parabolic transition, of the fraction of its length, from 1 at the minirib's front. */
  readonly parabola?: (fraction: number) => number;
  readonly stations: Stations;
  /** The arc height the transition of the minirib of rib `i` starts from, at point `j`. */
  readonly heights: (
    design: Pick<LepDesign, SkinPatternSections>,
    ribs: readonly SkinRib[],
  ) => (i: number, j: number) => number;
}

/**
 * `hautok(i - 1, j)`: `hautok(k)` is the cell of rib k, so the cell before
 * the minirib's; the engine copies rib 2's into ribs 0 and 1.
 */
const engineMiniribs: MiniribSteps = {
  stations: ribStations,
  heights: (design, ribs) => {
    const heights = skinHeights(ribs, skinPatterns(design, ribs), arcHeight);
    return (i, j) => heights[Math.max(i - 1, 2) - 1]?.[j] ?? 0;
  },
};

/**
 * The miniribs of a double-skin wing, by rib `i` whose `rib(i,56)` is over
 * 1 and not 100 (an unloaded rib), on the airfoil of rib i − 1 (rib 0 the
 * central rib's copy). The parabolic transition (2), `steps.parabola`; the
 * engine's sets none of its points: they stay at the origin, its lines of
 * no length.
 */
export function miniribPatterns(
  design: Pick<LepDesign, MiniribSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  steps: MiniribSteps = engineMiniribs,
): MiniribPattern[] {
  if (design.geometry.paragliderType === 'ss') return [];
  const ribs = skinRibs(design, airfoils, Math.fround, steps.stations);
  if (!ribs.length) return [];
  const ease = transition(design);
  const { parabola } = steps;
  const unset = ease.kind === 2 && !parabola;
  const shape = transitionShape(ease.kind, parabola);
  const hautok = ease.kind === 0 ? () => 0 : steps.heights(design, ribs);
  const xrib = design.sewingAllowances.ribs * 0.1;
  const spacing = (design.markTypes[8]?.laser.offset ?? 0) * 0.1;
  const holes = design.hvrHoles.mode === 1 ? design.hvrHoles.rows : [];
  const nine = holes.reduce<(typeof holes)[number] | undefined>(
    (found, row) => (row.type === 9 && row.drawn > 0 ? row : found),
    undefined,
  );
  const segments = ellipseSegments(design);
  return design.airfoils.flatMap(({ minirib }, index): MiniribPattern[] => {
    const i = index + 1;
    if (!(minirib > 1) || minirib === 100) return [];
    const before = ribs[i - 1];
    if (!before) return [];
    // The engine's u(i-1,j,3), v(i-1,j,3), from 1.
    const u = (j: number) => before.local[j]?.[0] ?? 0;
    const v = (j: number) => -(before.local[j]?.[1] ?? 0);
    const np1 = before.local.length - 1;
    const xminirib = (before.chord * minirib) / 100;
    const { je, ji } = miniribFront(before, xminirib);
    if (!je || !ji) return [];
    const d107e = xminirib - (u(1) - u(je));
    const front: Point = [
      u(je) - d107e,
      v(je) - (d107e * (v(je) - v(je + 1))) / (u(je) - u(je + 1)),
    ];
    const d107i = xminirib - (u(1) - u(ji));
    const back: Point = [
      u(ji) - d107i,
      v(ji) - (d107i * (v(ji) - v(ji - 1))) / (u(ji) - u(ji - 1)),
    ];
    const xminimod = (before.chord * ease.length) / 100;
    const sup = ease.height * hautok(i, je);
    const inf = ease.height * hautok(i, ji);
    /** The easing at airfoil point j, `size` at the minirib's front. */
    const eased = (j: number, x: number, size: number) => {
      if (ease.kind === 0) return 0;
      if (u(j) < u(1) - xminirib || u(j) > u(1) - xminirib + xminimod) return 0;
      const local = u(j) - x;
      return size * shape(local / xminimod);
    };
    const end = ease.kind === 0 ? [0, 0] : [sup, inf];
    // Extrados, points 1 to je + 1: each point's next takes its easing first.
    const e71: Point[] = [];
    const e72: Point[] = [];
    let alpha = 0;
    for (let j = 1; j <= je; j++) {
      const y = eased(j, front[0], sup);
      e71[j] = [u(j), v(j) + y];
      e71[j + 1] = [u(j + 1), v(j + 1) + y];
      alpha = Math.atan(-(e71[j][1] - e71[j + 1][1]) / (e71[j][0] - e71[j + 1][0]));
      e72[j] = [e71[j][0] + xrib * Math.sin(alpha), e71[j][1] + xrib * Math.cos(alpha)];
    }
    e71[je + 1] = [front[0], front[1] + end[0]];
    e72[je + 1] = [
      e71[je + 1][0] + xrib * Math.sin(alpha),
      e71[je + 1][1] + xrib * Math.cos(alpha),
    ];
    // Intrados, points np1 down to ji − 1.
    const i71: Point[] = [];
    const i72: Point[] = [];
    for (let j = np1; j >= ji; j--) {
      const y = eased(j, back[0], inf);
      i71[j] = [u(j), v(j) - y];
      i71[j - 1] = [u(j - 1), v(j - 1) - y];
      alpha = Math.atan((i71[j][1] - i71[j - 1][1]) / (i71[j][0] - i71[j - 1][0]));
      i72[j] = [i71[j][0] + xrib * Math.sin(alpha), i71[j][1] - xrib * Math.cos(alpha)];
    }
    i71[ji - 1] = [back[0], back[1] - end[1]];
    i72[ji - 1] = [
      i71[ji - 1][0] + xrib * Math.sin(alpha),
      i71[ji - 1][1] - xrib * Math.cos(alpha),
    ];
    const extrados = e71.slice(1);
    const intrados = i71.slice(ji - 1);
    const cut = [
      [e71[1], ...e72.slice(1), e71[je + 1]],
      [i71[np1], ...i72.slice(ji - 1).reverse(), i71[ji - 1]],
    ];
    // Type 9 holes: from the trailing edge, the engine's centre v mirrored.
    const height = front[1] - back[1];
    const ellipses = nine
      ? Array.from({ length: Math.trunc(nine.holes) }, (_, k) => {
          const factor = (nine.holes + 2 - (k + 1)) / (nine.holes + 2);
          const x = factor * xminirib + 0.05 * xminirib;
          const y = factor * height * nine.center;
          const b = (factor * height * nine.height) / 100 / 2;
          return ellipsePolyline(
            [u(1) - x, v(1) - y],
            nine.width * b,
            b,
            (nine.offset * Math.PI) / 180,
            segments,
            Math.fround,
          ).map(([p, q]): Point => [p, -q]);
        })
      : [];
    const origin = (points: readonly Point[]) => points.map((): Point => [0, 0]);
    return [
      {
        rib: i,
        sewing: unset ? origin([...extrados, ...intrados]) : [...extrados, ...intrados],
        cut: unset ? cut.map(origin) : cut,
        holes: ellipses,
        numeral: romanDots(
          i,
          [0.5 * (back[0] + front[0]) + 1, 0.5 * (back[1] + front[1]) - 2],
          0,
          spacing,
        ),
        aim: { extrados: je, intrados: ji },
      },
    ];
  });
}
