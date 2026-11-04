import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  miniribPatterns as referenceMiniribs,
  type MiniribPattern,
  type MiniribSections,
} from '../fortran/miniribs.ts';
import { cellHeights } from './skin.ts';
import { stations } from './stations.ts';

/**
 * The miniribs as the reference's, the transition (section 37, code 3001)
 * from the arc heights of the minirib's own cell, as the skin takes them;
 * the parabolic one drawn: from the full height at the minirib's front to
 * nothing, flat, at its length's end.
 */
export function miniribPatterns(
  design: Pick<LepDesign, MiniribSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): MiniribPattern[] {
  return referenceMiniribs(design, airfoils, {
    parabola: (t) => (1 - t) ** 2,
    stations,
    heights: (sections, ribs) => {
      const heights = cellHeights(sections, ribs);
      return (i, j) => heights[i - 1]?.[j] ?? 0;
    },
  });
}
