// Section 12 of the engine: the suspension lines in space, from the main
// karabiners to the anchors (§12.2 to 12.8), with its quirks.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { anchorPoint, turnedAnchor } from './anchors.ts';
import { branch, lineList, placeLines, type ListedLine, type SuspensionLine } from './network.ts';
import { finite, ribChord, type Point3 } from './ribs.ts';
import { karabiner } from './trim.ts';

export type { SuspensionLine } from './network.ts';

/** The sections the lines read. */
export type LineSections =
  | 'geometry'
  | 'wingTip'
  | 'airfoils'
  | 'thickness'
  | 'anchors'
  | 'angleOfAttack'
  | 'lines'
  | 'ramifications'
  | 'elasticLines'
  | 'risers';

/**
 * The load of each anchor (§12.4++): half the flight load, shared between
 * the anchors of a rib by section 18 and between ribs by chord times
 * relative weight; none beyond its anchor count.
 */
function anchorLoads(design: Pick<LepDesign, LineSections>) {
  const { geometry, airfoils, anchors, elasticLines } = design;
  const weight = (index: number) =>
    ribChord(design, index) * (airfoils[index]?.relativeWeight ?? 0) || 0;
  const total = geometry.ribs.reduce((sum, _, index) => sum + weight(index), 0);
  return (rib: number, row: number) => {
    const count = anchors[rib - 1]?.count ?? 0;
    const share = elasticLines.distribution[count - 2]?.[row - 1] ?? 0;
    return row <= count
      ? (elasticLines.flightLoad / 2) * (share / 100) * (weight(rib - 1) / total)
      : 0;
  };
}

/**
 * The suspension lines of the right half wing at Wing scale (§12.6), as the
 * engine places them (`placeLines`): each riser from the karabiner towards
 * the action point of its line (§12.5: the anchors it holds, weighted by
 * section 9), its riser length long; every line of level 2 from the plan's
 * first riser (`x2line(plan,1,1)`). On a single skin, the lines to the
 * anchors end at their turned triangles (§12.7, 12.8).
 */
export function suspensionLines(
  design: Pick<LepDesign, LineSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): SuspensionLine[] {
  const start = karabiner(design);
  if (!start) return [];
  const { plans, weighting } = design.lines;
  const scale = design.geometry.wingScale;
  const { lines3, lines4 } = design.ramifications;
  const anchors = new Map<string, Point3 | undefined>();
  const anchor = (rib: number, row: number) => {
    const key = `${rib}/${row}`;
    if (!anchors.has(key)) anchors.set(key, anchorPoint(design, airfoils, rib, row));
    return anchors.get(key);
  };
  const load = anchorLoads(design);
  const chord = (rib: number) => ribChord(design, rib - 1);
  const relative = (rib: number) => design.airfoils[rib - 1]?.relativeWeight ?? Number.NaN;
  const paths = (plan: number) => plans[plan - 1]?.paths ?? [];
  /** The action point of `line`: the anchors of its paths, weighted (§12.5). */
  const action = (line: ListedLine): Point3 | undefined => {
    const sum = [0, 0, 0];
    let weights = 0;
    for (const path of paths(line.plan))
      for (let slot = 0; slot < 4; slot++) {
        const [level, order] = branch(path, slot);
        if (level !== line.level || order !== line.order) continue;
        const point = anchor(path.anchorRib, path.anchorRow);
        if (!point) return undefined;
        // Weightings 1 and 2 take the line's own rib, for every anchor.
        const factor =
          weighting === 3
            ? load(path.anchorRib, path.anchorRow)
            : weighting === 2
              ? chord(line.rib) * relative(line.rib)
              : weighting === 1
                ? chord(line.rib)
                : 1;
        point.forEach((value, axis) => (sum[axis] += value * factor));
        weights += factor;
      }
    // Weighting 0 divides by the count of identification (`corda(i,4)`), not of anchors.
    const divisor = weighting === 0 ? line.paths : weights;
    const point = sum.map((value) => value / divisor) as [number, number, number];
    return point.every(finite) ? point : undefined;
  };
  const riser = (plan: number) =>
    design.risers.mode === 0
      ? design.angleOfAttack.risersLength
      : design.risers.type === 1
        ? (design.risers.lengths[plan - 1] ?? Number.NaN)
        : 0;
  const placed = placeLines({
    list: lineList(plans),
    paths,
    action,
    first: (line) => [start, riser(line.plan)],
    fromFirst: true,
    anchor: (line) => anchor(line.rib, line.row),
    ramifications: [lines3.l2 * scale, lines4.l3 * scale, lines4.l2 * scale],
  });
  if (design.geometry.paragliderType !== 'ss') return placed;
  return placed.map((line) =>
    line.level === line.levels && line.level >= 3
      ? { ...line, end: turnedAnchor(design, airfoils, line) ?? line.end }
      : line,
  );
}
