import type { LepAirfoil, LepDesign } from '@lepara/format';
import type {
  BalloonedPanel,
  SkinPatternSections,
  SkinRib,
  SkinSections,
} from '../shared/skin-types.ts';
import { buildSkin, skinHeights, type SkinModel } from '../shared/skin-mesh.ts';
import { shapingCuts } from '../fortran/skin-shaping.ts';
import { cross, sub } from '../shared/vectors.ts';
import { skinPatterns } from '../fortran/skin-patterns.ts';
import { double } from './double.ts';
import { panelSteps, patternSteps } from './panel-steps.ts';
import { stations } from './stations.ts';
import { skinRibs } from '../fortran/skin-ribs.ts';
import { panelOutlines, type SkinPanel, type SkinPanelSections } from '../fortran/skin-panels.ts';
import { arcHeight, arcPoint } from './circular-arc.ts';

/** Unit normals of the local span and the median-profile tangent. */
const normals: SkinModel['normals'] = (median, inner, outer) =>
  median.map((_, j) => {
    if (j === 0) return [0, 0, 0];
    const tangent = sub(median[Math.min(j + 1, median.length - 1)], median[Math.max(j - 1, 1)]);
    const normal = cross(sub(outer[j], inner[j]), tangent);
    const length = Math.hypot(...normal);
    return length > 0 ? [normal[0] / length, normal[1] / length, normal[2] / length] : [0, 0, 0];
  });

/** The arc height of each station, by cell, on the corrected patterns. */
export const cellHeights = (
  design: Pick<LepDesign, SkinPatternSections>,
  ribs: readonly SkinRib[],
) => skinHeights(ribs, skinPatterns(design, ribs, double, patternSteps), arcHeight);

/**
 * Enhanced v1 retains the engine's developed panels and sewing conventions,
 * using double arithmetic, a convergent circular-arc solver, geometric surface
 * normals and each cell's own fabric lengths (including the central cell).
 */
export function balloonedSkin(
  design: Pick<LepDesign, SkinSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): BalloonedPanel[] {
  const ribs = skinRibs(design, airfoils, double, stations);
  if (!ribs.length) return [];
  const miniribs = design.airfoils.map(({ minirib }) =>
    design.geometry.paragliderType !== 'ss' && minirib > 1 && minirib < 100 ? minirib : 0,
  );
  return buildSkin(design, ribs, {
    heights: cellHeights(design, ribs),
    // Keep the sewn middle in the mesh, even with an odd requested count.
    subdivisions: (cell, count) => (miniribs[cell] ? Math.max(4, 2 * Math.ceil(count / 2)) : count),
    arc(chord, height, k, count, station) {
      const t = k / count;
      if (
        station.surface === 'inlet' ||
        !miniribs[station.cell] ||
        station.chord > miniribs[station.cell]
      )
        return arcPoint(chord, height, t);
      // Two congruent half-arcs meet on the uninflated median profile.
      // Scaling both chord and sagitta halves the analytic fabric length.
      const half = t < 0.5 ? 0 : 1;
      const p = arcPoint(chord / 2, height / 2, 2 * t - half);
      return { span: (half + p.span) / 2, lift: p.lift };
    },
    normals,
  });
}

/**
 * The engine's developed panels, sewing conventions and 3D-shaping seams, in
 * double arithmetic; their marks and unloaded ribs' seams on their sides as sewn.
 */
export function skinPanels(
  design: Pick<LepDesign, SkinPanelSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): SkinPanel[] {
  const ribs = skinRibs(design, airfoils, double, stations);
  if (!ribs.length) return [];
  const patterns = skinPatterns(design, ribs, double, patternSteps);
  const heights = skinHeights(ribs, patterns, arcHeight);
  const cuts = shapingCuts(design, ribs, heights, normals, double, {
    // The first cut's zone of influence from its start, as the second's.
    firstStart: (cut) => cut.start,
    // The chord from the airfoil's nose, its least u.
    nose: (rib) => rib.local.reduce((nose, [x], j) => (j && x < rib.local[nose][0] ? j : nose), 1),
  });
  return panelOutlines(design, ribs, patterns, cuts, double, panelSteps);
}
