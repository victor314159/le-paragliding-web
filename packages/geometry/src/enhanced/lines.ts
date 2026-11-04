// The anchors, suspension and brake lines as the reference places them,
// corrected: see "Lines" in MODELS.md.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  anchorPoint as referenceAnchorPoint,
  suspensionTriangles as referenceTriangles,
  type AnchorDesign,
  type LineSteps,
  type TriangleTurn,
} from '../fortran/anchors.ts';
import { brakeLines as referenceBrakeLines } from '../fortran/brakes.ts';
import { suspensionLines as referenceLines, type LineSections } from '../fortran/lines.ts';
import type { SuspensionLine } from '../fortran/network.ts';
import type { Point3 } from '../shared/points.ts';
import { add, dot, sub, unit } from '../shared/vectors.ts';

/** The point `distance` from `from` towards `to`, exactly. */
const toward = (from: Point3, to: Point3, distance: number): Point3 =>
  add(from, unit(sub(to, from)), distance);

/**
 * §12.7: the anchor turned about its base on the extrados until its tip
 * points to the line's start.
 */
const turn: TriangleTurn = (_, [p1, p2, p3], line) => {
  const axis = unit(sub(p2, p1));
  // The foot of a point on the base's line.
  const foot = (p: Point3) => add(p1, axis, dot(sub(p, p1), axis));
  const p4 = foot(p3);
  // The line's direction, across the base.
  return toward(p4, add(p4, sub(line.start, foot(line.start))), Math.hypot(...sub(p3, p4)));
};

/**
 * Anchors found in double, else at the intrados' nearer end; each line of
 * level 2 from its own riser; lengths exact; each anchor weighted by its
 * own rib, the mean over the anchors summed; single-skin triangles turned
 * to their lines; the brake distribution's ends beyond its spans, a
 * fractional anchor rib taken for its path alone.
 */
export const lineSteps: LineSteps = {
  exactAnchors: true,
  turn,
  ownWeights: true,
  ownRisers: true,
  ownBrakes: true,
  toward,
};

export const anchorPoint = (
  design: AnchorDesign,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
  row: number,
) => referenceAnchorPoint(design, airfoils, rib, row, lineSteps);

export const suspensionTriangles = (
  design: AnchorDesign,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  lines: readonly SuspensionLine[],
) => referenceTriangles(design, airfoils, lines, lineSteps);

export const suspensionLines = (
  design: Pick<LepDesign, LineSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
) => referenceLines(design, airfoils, lineSteps);

export const brakeLines = (
  design: Pick<LepDesign, LineSections | 'brakes'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  lines?: readonly SuspensionLine[],
) => referenceBrakeLines(design, airfoils, lines, lineSteps);
