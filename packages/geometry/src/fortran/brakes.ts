// Section 14 of the engine: the brake lines in space (§14.2 to 14.5).
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { anchorPoint, brakeAnchors, engineLines, type LineSteps } from './anchors.ts';
import { suspensionLines, type LineSections } from './lines.ts';
import { branch, lineList, placeLines, type ListedLine, type SuspensionLine } from './network.ts';
import { finite, type Point3 } from './ribs.ts';
import { add, sub } from '../shared/vectors.ts';

/**
 * The brake lines of the right half wing at Wing scale, as the engine
 * places them (§14.5), in the plan after the lines': each main brake line
 * from the end of the first riser of the last line plan (`x2line(slp,1,1)`)
 * towards its action point, the main brake length long (section 10, at
 * Wing scale); each other from its parent, as the lines are. Action points
 * are the plain mean of the anchors (§14.4), the brake anchors lengthened by
 * the brake distribution and taken between ribs for fractional anchor ribs
 * (`brakeAnchors`). `lines` are the suspension lines, if already placed.
 * With `steps.ownBrakes`, an anchor rib of fractional part f takes (1 − f)
 * of its anchor and f of the next rib's for that path alone.
 */
export function brakeLines(
  design: Pick<LepDesign, LineSections | 'brakes'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  lines?: readonly SuspensionLine[],
  steps: LineSteps = engineLines,
): SuspensionLine[] {
  const { paths } = design.brakes;
  const last = design.lines.plans.length;
  const scale = design.geometry.wingScale;
  const start = (lines ?? suspensionLines(design, airfoils, steps)).find(
    (line) => line.plan === last && line.level === 1 && line.order === 1,
  );
  const brakes = brakeAnchors(design, airfoils, paths, steps);
  const anchor = (anchorRib: number, row: number) => {
    const rib = Math.trunc(anchorRib);
    if (row !== 6) return anchorPoint(design, airfoils, rib, row, steps);
    const [here, next] = [brakes.get(rib), brakes.get(rib + 1)];
    const fraction = anchorRib - rib;
    return steps.ownBrakes && here && fraction && next
      ? add(here, sub(next, here), fraction)
      : here;
  };
  const action = (line: ListedLine): Point3 | undefined => {
    const sum = [0, 0, 0];
    let count = 0;
    for (const path of paths)
      for (let slot = 0; slot < 4; slot++) {
        const [level, order] = branch(path, slot);
        if (level !== line.level || order !== line.order) continue;
        const point = anchor(path.anchorRib, path.anchorRow);
        if (!point) return undefined;
        point.forEach((value, axis) => (sum[axis] += value));
        count++;
      }
    // The engine divides by the count of identification, not of anchors.
    const divisor = steps.ownWeights ? count : line.paths;
    const point = sum.map((value) => value / divisor) as [number, number, number];
    return point.every(finite) ? point : undefined;
  };
  const { brakes3, brakes4 } = design.ramifications;
  return placeLines({
    list: lineList([{ paths }], last + 1),
    paths: () => paths,
    action,
    first: () => [start?.end, design.brakes.length * scale],
    fromFirst: false,
    // The engine's anchor rib of the line, truncated.
    anchor: (line) => anchor(steps.ownBrakes ? line.anchorRib : line.rib, line.row),
    ramifications: [brakes3.l2 * scale, brakes4.l3 * scale, brakes4.l2 * scale],
    toward: steps.toward,
  });
}
