// The anchors of the lines and brakes in space (§9.1, 12.3, 12.4, 12.7).
import type { BrakePath, LepAirfoil, LepDesign } from '@lepara/format';
import type { SuspensionLine } from './network.ts';
import { finite, ribAirfoil, ribChord, ribPoint, type Point, type Point3 } from './ribs.ts';

export type AnchorDesign = Pick<
  LepDesign,
  'geometry' | 'wingTip' | 'airfoils' | 'thickness' | 'anchors'
>;

/**
 * Anchor `row` of rib number `rib` on its airfoil, at Wing scale: from the
 * inlet, on the last segment that spans its position, else at the leading
 * edge (§9.1), placed as its rib (§12.3); `above`, the extrados point after
 * its position (`anccont`, from the trailing edge), and the airfoil.
 */
function anchorOnRib(
  design: AnchorDesign,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
  row: number,
) {
  const index = rib - 1;
  const position = design.anchors[index]?.positions[row - 1];
  if (!finite(position)) return undefined;
  const { points, extrados } = ribAirfoil(design, airfoils, index);
  const x = position / 100;
  // The engine compares in single precision, at Wing scale.
  const chord = ribChord(design, index);
  const single = (value: number) => Math.fround(value * chord);
  // Without such a segment, the engine keeps the initial zeros: the leading edge.
  let local: Point = [0, 0];
  for (let j = Math.max(extrados - 1, 0); j < points.length - 1; j++) {
    const [p, q] = [points[j], points[j + 1]];
    if (single(p[0]) <= single(x) && single(q[0]) >= single(x))
      local = [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])];
  }
  let above: number | undefined;
  for (let j = extrados - 1; j >= 1; j--) if (points[j][0] <= x && points[j - 1][0] >= x) above = j;
  return { point: ribPoint(design, index, local, true), above, points };
}

/** Whether the single-skin anchor `row` of rib number `rib` is virtual (§12.4+). */
const virtualAnchor = ({ geometry, airfoils }: AnchorDesign, rib: number, row: number) =>
  geometry.paragliderType === 'ss' &&
  !(row === 1 && geometry.paragliderParameter === 1) &&
  airfoils[rib - 1]?.minirib !== 0;

/**
 * Anchor `row` (1 to 6, F the brake) of rib number `rib` at Wing scale, as
 * the lines reach it: on its airfoil (`anchorOnRib`); on a single skin,
 * the middle of the extrados segment above it, but for the A row with
 * `paragliderParameter` 1 and on ribs whose minirib column is 0 (§12.4+).
 */
export function anchorPoint(
  design: AnchorDesign,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  rib: number,
  row: number,
): Point3 | undefined {
  const anchor = anchorOnRib(design, airfoils, rib, row);
  if (!anchor || !virtualAnchor(design, rib, row)) return anchor?.point;
  const { above, points } = anchor;
  const ends = above === undefined ? [] : [points[above], points[above - 1]];
  const [p, q] = ends.map((point) => ribPoint(design, rib - 1, point));
  return p && q ? [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2] : undefined;
}

const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: Point3): Point3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

/**
 * §12.7: on a single skin, the anchor of `line`, at the last level (3 or
 * 4) of its path, its triangle turned towards the line: the triangle of
 * the extrados points three before and after the anchor and the anchor on
 * its airfoil, about its base, by the angle between the line and the rib
 * (beta). The engine's formulas, signs included, differ between levels.
 * The anchor stays on ribs whose minirib column is 0 and on a flat last
 * rib, and is the anchor on its airfoil on the A row with
 * `paragliderParameter` 1.
 */
export function turnedAnchor(
  design: AnchorDesign,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  line: Pick<SuspensionLine, 'level' | 'rib' | 'row' | 'start' | 'end'>,
): Point3 | undefined {
  const { geometry, airfoils: rows } = design;
  if (line.row === 1 && geometry.paragliderParameter === 1)
    return anchorOnRib(design, airfoils, line.rib, line.row)?.point;
  // A last rib of zero thickness, a stabilo, keeps its anchors too.
  const flat = (rib: number) =>
    rib === geometry.ribs.length &&
    ribAirfoil(design, airfoils, rib - 1).points.every(([, y]) => y === 0);
  if (rows[line.rib - 1]?.minirib === 0 || flat(line.rib)) return line.end;
  const anchor = anchorOnRib(design, airfoils, line.rib, line.row);
  if (!anchor?.point || anchor.above === undefined) return undefined;
  const { above, points, point: p3 } = anchor;
  const [p1, p2] = [points[above - 3], points[above + 3]].map(
    (point) => point && ribPoint(design, line.rib - 1, point),
  );
  if (!p1 || !p2) return undefined;
  const d21 = unit(sub(p1, p2));
  const d31 = sub(p1, p3);
  const xt = d21[0] * d31[0] + d21[1] * d31[1] + d21[2] * d31[2];
  const p4: Point3 = [p1[0] - d21[0] * xt, p1[1] - d21[1] * xt, p1[2] - d21[2] * xt];
  const d41 = unit(sub(p1, p4));
  const d43 = unit(sub(p3, p4));
  const length = Math.hypot(...sub(p3, p4));
  const [a, b] = [sub(p2, p1), sub(p3, p1)];
  const d45 = unit([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]);
  // phi0: the line's angle to the vertical, in the span plane, less the rib's beta.
  const phi1 = Math.atan((line.end[0] - line.start[0]) / (line.start[2] - line.end[2]));
  const phi = phi1 - (geometry.ribs[line.rib - 1].beta * Math.PI) / 180;
  const across = length * Math.sin(phi);
  const down = length * Math.cos(phi);
  const turned: Point3 =
    line.level === 4
      ? [
          d45[0] * across + d45[2] * down + p4[0],
          d41[0] * across - d41[2] * down + p4[1],
          d43[0] * across + d43[2] * down + p4[2],
        ]
      : [
          d45[0] * across + d45[2] * down + p4[0],
          d21[0] * across - d21[2] * down + p4[1],
          d43[0] * across + d43[2] * down + p4[2],
        ];
  return turned.every(finite) ? turned : undefined;
}

/**
 * The brake anchors (F, row 6) of the ribs (§12.4, 14.4), by rib number:
 * each lengthened along its rib's axis (beta) by the brake distribution of
 * section 10, interpolated at its span (its X over the last rib's); a rib
 * beyond the spans keeps the previous rib's lengthening, as the engine
 * does. Then, path by path, an anchor rib of fractional part f takes
 * (1 - f) of its anchor and f of the next rib's: in place, as the engine
 * does, so that later paths on these ribs take the moved anchors.
 */
export function brakeAnchors(
  design: AnchorDesign & Pick<LepDesign, 'brakes'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  paths: readonly BrakePath[],
) {
  const { ribs, wingScale: scale } = design.geometry;
  const { distributionSpans: spans, distributionIncrements: increments } = design.brakes;
  const anchors = new Map<number, Point3 | undefined>();
  let [across, down] = [0, 0];
  ribs.forEach((rib, index) => {
    const span = (rib.x / ribs[ribs.length - 1].x) * 100;
    for (let k = 0; k < 4; k++)
      if (span >= spans[k] && (k === 3 ? span <= spans[k + 1] : span < spans[k + 1])) {
        const slope = (increments[k + 1] - increments[k]) / (spans[k + 1] - spans[k]);
        const length = (increments[k] + slope * (span - spans[k])) * scale;
        const beta = (rib.beta * Math.PI) / 180;
        [across, down] = [length * Math.sin(beta), length * Math.cos(beta)];
      }
    const point = anchorOnRib(design, airfoils, index + 1, 6)?.point;
    anchors.set(index + 1, point && [point[0] + across, point[1], point[2] - down]);
  });
  for (const { anchorRib } of paths) {
    const rib = Math.trunc(anchorRib);
    const fraction = anchorRib - rib;
    const [here, next] = [anchors.get(rib), anchors.get(rib + 1)];
    if (rib < ribs.length && here && next)
      anchors.set(
        rib,
        [0, 1, 2].map((axis) => (1 - fraction) * here[axis] + fraction * next[axis]) as [
          number,
          number,
          number,
        ],
      );
  }
  return anchors;
}
