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
import { miniribFront, transition, transitionShape } from '../fortran/miniribs.ts';
import { skinRibs } from '../fortran/skin-ribs.ts';
import { panelOutlines, type SkinPanel, type SkinPanelSections } from '../fortran/skin-panels.ts';
import { arcHeight, arcLength, arcPoint } from './circular-arc.ts';

/** The parabolic transition of a minirib, from its full height at its front to nothing. */
export const miniribParabola = (t: number) => (1 - t) ** 2;

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
  const heights = cellHeights(design, ribs);
  const miniribs = design.airfoils.map(({ minirib }) =>
    design.geometry.paragliderType !== 'ss' && minirib > 1 && minirib < 100 ? minirib : 0,
  );
  const fronts = miniribs.map((minirib, cell) =>
    ribs[cell] ? miniribFront(ribs[cell], (ribs[cell].chord * minirib) / 100) : undefined,
  );
  const ease = transition(design);
  const shape = transitionShape(ease.kind, miniribParabola);
  /** How far the sewn middle of a station stands off its median, up to its height. */
  const sewn = (
    height: number,
    width: number,
    { cell, surface, chord, length }: Parameters<SkinModel['arc']>[4],
  ) => {
    const minirib = miniribs[cell];
    if (surface === 'inlet' || !minirib) return height;
    const { je = 0, ji = 0 } = fronts[cell] ?? {};
    const front = ease.height * (heights[cell][surface === 'extrados' ? je : ji] ?? 0);
    const eased = (t: number) => (ease.kind && ease.length ? front * shape(t) : 0);
    if (chord <= minirib) {
      const t = (minirib - chord) / ease.length;
      return t < 1 ? eased(t) : 0;
    }
    // Ahead of its front, the skin frees itself over half the cell's width.
    const free = (((chord - minirib) / 100) * length) / (width / 2);
    if (free >= 1) return height;
    const start = eased(0);
    return start + (height - start) * free * free * (3 - 2 * free);
  };
  return buildSkin(design, ribs, {
    heights,
    // Keep the sewn middle in the mesh, even with an odd requested count.
    subdivisions: (cell, count) => (miniribs[cell] ? Math.max(4, 2 * Math.ceil(count / 2)) : count),
    arc(chord, height, k, count, station) {
      const t = k / count;
      const middle = sewn(height, chord, station);
      if (middle >= height) return arcPoint(chord, height, t);
      // Two congruent arcs meet on the sewn middle, the fabric's length conserved.
      const half = Math.hypot(chord / 2, middle);
      const arc = arcPoint(
        half,
        arcHeight(half, arcLength(chord, height) / 2),
        t < 0.5 ? 2 * t : 2 - 2 * t,
      );
      const [along, off] = [arc.span * half, arc.lift];
      const span = (along * (chord / 2) - off * middle) / half / chord;
      const lift = (along * middle + off * (chord / 2)) / half;
      return { span: t < 0.5 ? span : 1 - span, lift };
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
