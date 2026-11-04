// The V-ribs as the reference builds them, corrected: see "V-rib traces"
// in MODELS.md.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { vRibHoles as referenceHoles, type VRibHoleSections } from '../fortran/vrib-holes.ts';
import {
  hStraps as referenceHStraps,
  vRibs as referenceVRibs,
  type TraceSteps,
  type VRibSections,
} from '../fortran/vribs.ts';
import { stations } from './stations.ts';

/**
 * Type 2's dots alike on both neighbours, type 4's across its middle ribs'
 * lines, type 5's across its own rib's intrados; type 6 to its own end rib.
 */
export const traceSteps: TraceSteps = {
  leftInwards: 0,
  middleAngle: (_, [p6, p8]) => Math.atan((p8[1] - p6[1]) / (p8[0] - p6[0])),
  neighbourTurn: false,
  nextRibOnly: false,
  stations,
};

/** The V and VH ribs as the reference's, a type 6 joined to its own end rib. */
export const vRibs = (
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
) => referenceVRibs(design, airfoils, traceSteps);

/** Their holes, on these V-ribs. */
export const vRibHoles = (
  design: Pick<LepDesign, VRibHoleSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
) => referenceHoles(design, airfoils, traceSteps);

/** The H straps on these airfoil stations. */
export const hStraps = (
  design: Pick<LepDesign, VRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
) => referenceHStraps(design, airfoils, traceSteps);
