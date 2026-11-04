// The miniribs laid flat, engine §6.12.0: the nose of the airfoil of the rib
// before, as far as section 2's `rib(i,56)` % of its chord, its back eased
// by section 37's code 3001, its cut line, its number and its holes of
// section 38 (type 9); in the rib's frame, cm, v up.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import type { Point } from '../shared/points.ts';
import { romanDots } from './marks.ts';
import type { SkinPanelSections } from './skin-panels.ts';
import { skinHeights } from '../shared/skin-mesh.ts';
import { ellipsePolyline, ellipseSegments } from './rib-patterns.ts';
import { arcHeight } from './skin.ts';
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
}

/**
 * Section 37, code 3001: the transition easing the minirib's back, `i3001(2)`
 * (0 none, 1 linear, 3 cosine; 2 is read and not drawn), its length (% of
 * chord) and height (fraction of the panel's arc height).
 */
function transition({ specialParameters: special }: Pick<LepDesign, 'specialParameters'>) {
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
    const [np1, np2] = [before.local.length - 1, before.upper];
    const xminirib = (before.chord * minirib) / 100;
    let [je, ji] = [0, 0];
    for (let j = 1; j <= np2 - 1; j++)
      if (u(1) - u(j) < xminirib && u(1) - u(j + 1) >= xminirib) je = j;
    for (let j = np1; j >= np2; j--)
      if (u(1) - u(j) < xminirib && u(1) - u(j - 1) >= xminirib) ji = j;
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
      return ease.kind === 1
        ? size * (1 - local / xminimod)
        : ease.kind === 2 && parabola
          ? size * parabola(local / xminimod)
          : (size / 2) * (1 + Math.cos((Math.PI * local) / xminimod));
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
      },
    ];
  });
}
