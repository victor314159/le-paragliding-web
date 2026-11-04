import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  miniribPatterns as referenceMiniribs,
  miniribSeams as referenceSeams,
  type MiniribPattern,
  type MiniribSeam,
  type MiniribSections,
} from '../fortran/miniribs.ts';
import { cellHeights, miniribParabola, skinPanels } from './skin.ts';
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
    parabola: miniribParabola,
    stations,
    heights: (sections, ribs) => {
      const heights = cellHeights(sections, ribs);
      return (i, j) => heights[i - 1]?.[j] ?? 0;
    },
  });
}

/** The miniribs' seams as the reference's, each along its midline, whatever its way. */
export function miniribSeams(
  design: Pick<LepDesign, MiniribSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): MiniribSeam[] {
  return referenceSeams(design, airfoils, {
    miniribs: miniribPatterns(design, airfoils),
    panels: skinPanels(design, airfoils),
    direction: ([x1, y1], [x2, y2]) => {
      const length = Math.hypot(x2 - x1, y2 - y1) || 1;
      return [(x2 - x1) / length, (y2 - y1) / length];
    },
  });
}
