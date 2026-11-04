import type { LepDesign, ShapingCut } from '@lepara/format';
import type { Point3 } from '../shared/points.ts';
import type { SkinModel } from '../shared/skin-mesh.ts';
import type { SkinRib } from '../shared/skin-types.ts';
import { add, cross, dot, sub, unit } from '../shared/vectors.ts';

/** The 3D-shaping cuts of a cell, by surface, with the sagitta of their seams (cm, `zinf(i,6,·)`). */
export interface CellCuts {
  readonly upper: readonly { readonly cut: ShapingCut; readonly depth: number }[];
  readonly lower: readonly { readonly cut: ShapingCut; readonly depth: number }[];
}

/**
 * The steps of `shapingCuts` each model takes its own way: where the first
 * extrados cut's zone of influence starts (`n` the airfoil's last point),
 * and the nose the chord runs from (its point, or none).
 */
export interface ShapingSteps {
  firstStart(cut: ShapingCut, n: number): number;
  nose(rib: SkinRib): number | undefined;
}

/**
 * The engine's: a cut point detection loop, its tests commented out, leaves
 * the start of the first extrados cut at the airfoil's last point but one,
 * its zone of influence empty (l. 4138); the nose, the point at (0, 0),
 * else (.dat airfoils) the unset point 0, the origin.
 */
const engineShaping: ShapingSteps = {
  firstStart: (_, n) => n - 1,
  nose(rib) {
    let nose: number | undefined;
    rib.local.forEach(([x, y], j) => {
      if (j && Math.abs(x / rib.chord) < 0.0001 && Math.abs(y / rib.chord) < 0.0001) nose = j;
    });
    return nose;
  },
};

/**
 * The group of section 29 of the cell outside rib `rib` (from 1): the group
 * number its range gives the rib, then used as the index of the groups as
 * read (`rib(i,169)`, then `uppcuts(ng)`).
 */
function cellGroup(design: Pick<LepDesign, 'shaping'>, rib: number) {
  const { shaping } = design;
  if (shaping.mode !== 1) return undefined;
  let number = 0;
  for (const group of shaping.groups)
    if (group.firstRib <= rib && rib <= group.lastRib) number = group.group;
  return shaping.groups[number - 1];
}

/**
 * panels3d and czinf: the sagitta of each cut seam, half the extra length the
 * ovalized median airfoil (its points moved by `heights` along `normals`)
 * gains over the median on the zones each side of the cut, in the median's
 * plane, times the cut's depth coefficient.
 */
export function shapingCuts(
  design: Pick<LepDesign, 'shaping'>,
  ribs: readonly SkinRib[],
  heights: SkinModel['heights'],
  normals: SkinModel['normals'],
  round: (value: number) => number,
  steps: ShapingSteps = engineShaping,
): CellCuts[] {
  return ribs.slice(1).map((outer, cell): CellCuts => {
    const group = cellGroup(design, cell + 1);
    if (!group || (!group.upper.cuts.length && !group.lower.cuts.length))
      return { upper: [], lower: [] };
    const inner = ribs[cell];
    const median = outer.points.map((p, j) => add(p, sub(inner.points[j], p), 0.5));
    const n = median.length - 1;
    const directions = normals(median, inner.points, outer.points, outer.upper);
    const ovalized = median.map((p, j) => add(p, directions[j], heights[cell][j] ?? 0));
    // Local axes: the plane of the extrados, and the chord from the nose (0, 0).
    const plane = unit(
      cross(
        sub(median[Math.trunc((1 + outer.upper) / 2)], median[1]),
        sub(median[outer.upper], median[1]),
      ),
    );
    const nose = steps.nose(outer);
    const chord = sub(median[n], nose === undefined ? [0, 0, 0] : median[nose]);
    const along = unit(chord),
      across = unit(cross(plane, chord));
    const planar = (points: readonly Point3[], from: number, to: number) => {
      let length = 0;
      for (let j = from; j < to; j++) {
        const d = sub(points[j], points[j + 1]);
        length = round(length + Math.sqrt(dot(d, along) ** 2 + dot(d, across) ** 2));
      }
      return length;
    };
    const gain = (from: number, to: number) =>
      round(planar(ovalized, from, to) - planar(median, from, to));
    const [first, second] = group.upper.cuts;
    const firstStart = first ? steps.firstStart(first, n) : 0;
    const upper = !first
      ? []
      : !second
        ? [
            {
              cut: first,
              depth:
                0.5 * (gain(first.end, outer.upper) + gain(firstStart, first.end)) * first.depth,
            },
          ]
        : [
            {
              cut: first,
              depth:
                0.5 *
                (gain(second.start, second.end) * 0.5 + gain(firstStart, first.end)) *
                first.depth,
            },
            {
              cut: second,
              depth:
                0.5 *
                (gain(second.end, outer.upper) + gain(second.start, second.end) * 0.5) *
                second.depth,
            },
          ];
    const [low] = group.lower.cuts;
    const start = outer.upper + outer.inlet - 1;
    const lower = low
      ? [{ cut: low, depth: 0.5 * (gain(low.start, low.end) + gain(start, low.start)) * low.depth }]
      : [];
    return { upper, lower };
  });
}
