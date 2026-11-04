import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  unloadedRibPatterns as referenceUnloadedRibs,
  type UnloadedRibPattern,
  type UnloadedRibSections,
} from '../fortran/unloaded-ribs.ts';
import { unloadedSteps } from './panel-steps.ts';

/** The unloaded ribs on their cell's sides as sewn, with the type 11 holes only. */
export function unloadedRibPatterns(
  design: Pick<LepDesign, UnloadedRibSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): UnloadedRibPattern[] {
  return referenceUnloadedRibs(design, airfoils, unloadedSteps);
}
