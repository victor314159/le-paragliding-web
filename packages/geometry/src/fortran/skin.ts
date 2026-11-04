import type { LepAirfoil, LepDesign } from '@lepara/format';
import type { BalloonedPanel, SkinSections } from '../shared/skin-types.ts';
import { buildSkin, skinHeights, type SkinModel } from '../shared/skin-mesh.ts';
import { shapingCuts } from './skin-shaping.ts';
import { add, sub, cross, unit } from '../shared/vectors.ts';
import type { Point3 } from '../shared/points.ts';
import { panelOutlines, type SkinPanel, type SkinPanelSections } from './skin-panels.ts';
import { skinPatterns } from './skin-patterns.ts';
import { skinRibs } from './skin-ribs.ts';
export type { BalloonedPanel, SkinSections } from '../shared/skin-types.ts';
export { skinSubdivisions } from '../shared/skin-mesh.ts';
export type { SkinPanel, SkinPanelSections } from './skin-panels.ts';

/** panels3d: retain the original 301-step search and its 0.01 cm flat threshold. */
export function arcHeight(s: number, sm: number): number {
  const max = 0.5 * Math.sqrt(Math.abs(sm * sm - s * s));
  const q = (sm * s) / (8 * max + 0.00001);
  const range = q - max;
  for (let l = 0; l <= 300; l++) {
    const h = ((l + 0.00001) / 300) * range * 4;
    const theta = Math.atan((0.5 * s) / h);
    const radius = sm / (2 * theta);
    if (2 * radius * Math.sin(theta) >= s) return Math.abs(sm - s) <= 0.01 ? 0 : radius - h;
  }
  return 0;
}

/** panels3d: in-plane normals, by a point 10 cm off the median extrados plane. */
const normals: SkinModel['normals'] = (median, _inner, _outer, upper) => {
  const first = median[1],
    mid = median[Math.trunc((1 + upper) / 2)],
    last = median[upper];
  const plane = unit(cross(sub(mid, first), sub(last, first)));
  return median.map((p, j) => {
    if (j === 0) return [0, 0, 0] as Point3;
    const prev = median[Math.max(1, j - 1)],
      next = median[Math.min(j + 1, median.length - 1)];
    const origin = j === median.length - 1 ? prev : p;
    return unit(cross(sub(next, prev), sub(add(origin, plane, 10), prev)));
  });
};

/** The verified Fortran 3.29 surface model, including its thresholds and central-cell copy. */
export function balloonedSkin(
  design: Pick<LepDesign, SkinSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): BalloonedPanel[] {
  const ribs = skinRibs(design, airfoils);
  if (!ribs.length) return [];
  const heights = skinHeights(ribs, skinPatterns(design, ribs), arcHeight);
  // §8.5.0.1: upstream replaces hautok(0,:) and hautok(1,:) with hautok(2,:).
  if (heights[1]) heights[0] = heights[1];
  return buildSkin(design, ribs, {
    heights,
    arc(d, h, k, count) {
      let span = k / count,
        lift = 0;
      if (h >= 0.01) {
        const q = (d * d) / (8 * h) - 0.5 * h,
          R = q + h;
        const theta = Math.atan(q / (0.5 * d));
        const alpha = theta + ((Math.PI - 2 * theta) * (count - k)) / count;
        const x = 0.5 * d - R * Math.cos(alpha);
        span = 1 - x / d;
        lift = R * Math.sin(alpha) - q;
      }
      return { span, lift };
    },
    normals,
  });
}

/**
 * The panels laid flat (§8.2 to §8.4) as the engine draws them (§8.6), split
 * at the 3D-shaping cuts, whose seams take each cell's own heights (czinf).
 */
export function skinPanels(
  design: Pick<LepDesign, SkinPanelSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): SkinPanel[] {
  const ribs = skinRibs(design, airfoils);
  if (!ribs.length) return [];
  const patterns = skinPatterns(design, ribs);
  const heights = skinHeights(ribs, patterns, arcHeight);
  const cuts = shapingCuts(design, ribs, heights, normals, Math.fround);
  return panelOutlines(design, ribs, patterns, cuts, Math.fround);
}
