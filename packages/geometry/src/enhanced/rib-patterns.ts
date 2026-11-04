import type { LepAirfoil, LepDesign } from '@lepara/format';
import type { Point } from '../shared/points.ts';
import { double } from './double.ts';
import {
  cutLine as referenceCutLine,
  ribPatterns as referenceRibPatterns,
  type RibPattern,
  type RibPatternSections,
} from '../fortran/rib-patterns.ts';
import { ribMylar } from '../fortran/rods.ts';
import { ribRods } from './rods.ts';
import { stations } from './stations.ts';
import { intersection } from '../fortran/skin-panels.ts';
import { skinRibs } from '../fortran/skin-ribs.ts';
import { traceSteps } from './vribs.ts';

/**
 * A "pc" rib's cut line, its inlet between points `upper` and `lower` (from
 * 1) closed by a straight line: the cut line `allowance` mm off it, meeting
 * the extrados' and the intrados' at their corners, the cut line's own
 * points kept; without thickness, open at the nose.
 */
function closedNose(
  contour: readonly Point[],
  cut: readonly Point[],
  upper: number,
  lower: number,
  allowance: number,
): Point[][] {
  const [j, k] = [upper - 1, lower - 1];
  const [extrados, intrados] = [cut.slice(0, j + 1), cut.slice(k)];
  if (contour.every(([, v]) => v === 0)) return [extrados, intrados];
  const [a, b] = [contour[j], contour[k]];
  const dv = a[1] - b[1];
  const alpha = dv === 0 ? 0 : Math.atan(dv / (b[0] - a[0]));
  const m = allowance / 10;
  const off = ([u, v]: Point): Point => [u - m * Math.sin(alpha), v - m * Math.cos(alpha)];
  const nose = [off(a), off(b)];
  return [
    [
      ...extrados,
      intersection([cut[j], cut[j - 1]], nose, double),
      intersection([cut[k], cut[k + 1]], nose, double),
      ...intrados,
    ],
  ];
}

/**
 * §6.11's cut line, its ends moved by the allowance alone: the engine moves
 * them by the last point's sawtooth factor too.
 */
function cutLine(
  contour: readonly Point[],
  upper: number,
  lower: number,
  single: boolean,
  allowance: number,
) {
  const cut = referenceCutLine(contour, upper, lower, single, allowance, double);
  const n = contour.length - 1;
  const m = allowance / 10;
  const end = (j: number, k: number, below: boolean): Point => {
    const [u, v] = contour[j];
    const alpha = Math.atan((contour[k][1] - v) / (contour[k][0] - u));
    return below
      ? [u + m * Math.sin(alpha), v - m * Math.cos(alpha)]
      : [u - m * Math.sin(alpha), v + m * Math.cos(alpha)];
  };
  cut[0] = end(0, 1, contour[0][1] < 0);
  cut[n] = end(n, n - 1, contour[n][1] <= 0);
  return cut;
}

/**
 * The engine's rib patterns in double arithmetic, with the corrected rods,
 * their cut lines' ends moved by the allowance alone and joined across the
 * trailing edge; "pc" ribs cut with the corners of their closed nose, and
 * their mylars along it.
 */
export function ribPatterns(
  design: Pick<LepDesign, RibPatternSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): RibPattern[] {
  const patterns = referenceRibPatterns(design, airfoils, double, {
    rods: ribRods,
    stations,
    traces: traceSteps,
  });
  const type = design.geometry.paragliderType;
  const ribs = skinRibs(design, airfoils, double, stations).slice(1);
  const allowance = design.sewingAllowances.ribs;
  return patterns.map((pattern, index) => {
    const rib = ribs[index];
    const contour = rib.local.slice(1).map(([u, v]): Point => [u, -v]);
    const lower = rib.upper + rib.inlet - 1;
    const cut = cutLine(contour, rib.upper, lower, type === 'ss', allowance);
    // A whole line closes across the trailing edge, which the engine leaves uncut.
    const across = (lines: Point[][]) =>
      lines.length === 1 ? [[...lines[0], lines[0][0]]] : lines;
    return type === 'pc'
      ? {
          ...pattern,
          cut: across(closedNose(contour, cut, rib.upper, lower, allowance)),
          mylar: ribMylar(design, index, pattern.sewing, rib.upper, rib.chord),
        }
      : { ...pattern, cut: across([cut]) };
  });
}
