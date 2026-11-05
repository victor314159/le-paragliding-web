// The H straps and V-ribs laid flat as the reference draws them, corrected:
// see "V-ribs" in MODELS.md.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { middle, type Point } from '../shared/points.ts';
import { double } from './double.ts';
import { romanDots } from '../fortran/marks.ts';
import { flatAnchors, type Flatt, type laidContinuous } from '../fortran/vrib-holes.ts';
import {
  continuousMarks,
  edgeAngle,
  moved,
  stripMarks,
  vRibPatterns as referenceVRibPatterns,
  type MarkForm,
  type VRibPattern,
  type VRibPatternSections,
} from '../fortran/vrib-patterns.ts';
import type { Continuous } from '../fortran/vribs.ts';
import { traceSteps } from './vribs.ts';

/**
 * The marks of an H strap or a V-rib of types 2, 3, 4 and 6, as the
 * reference's; an edge on an anchor is marked at it, the row halfway across
 * the chord, not halfway along the fabric; type 6 numbers its right edge after its own rib, both
 * edges' numbers the same way in, and no anchor row, which it has not.
 */
function strapMarks(laid: Flatt, type: number, ribs: readonly [number, number], form: MarkForm) {
  const { marks, numeral } = stripMarks(laid, type, ribs, form);
  const { l1, l2, r1, r2 } = laid;
  const { h, offset: inside, allowance, spacing } = form;
  const [left, right] = [edgeAngle(l1[0], l2[19]), edgeAngle(r1[0], r2[19])];
  const [onLeft, onRight] = [moved(l1[10], left, -inside), moved(r1[10], right, inside)];
  if (type === 1) return { marks: [onLeft, onRight], numeral };
  if (type === 2 || type === 3)
    return {
      marks:
        ribs[1] === Math.trunc(h[3])
          ? [...marks.slice(0, -1), onRight]
          : [onLeft, ...marks.slice(1)],
      numeral,
    };
  if (type !== 6) return { marks, numeral };
  const number = (n: number, [x, y]: Point, alpha: number) => romanDots(n, [x, -y], alpha, spacing);
  return {
    marks,
    numeral: [
      ...number(
        ribs[0],
        moved(moved(middle(l1[0], l2[19]), left, -inside), left, -0.3 * allowance, 0.3 * h[7]),
        left,
      ),
      ...number(
        ribs[1],
        moved(moved(middle(r1[0], r2[19]), right, inside), right, 0.3 * allowance, 0.3 * h[7]),
        right,
      ),
    ],
  };
}

/**
 * The marks of a type 5 V-rib as the reference's, each anchor's three dots
 * 1 cm apart across its edge's segment, inwards.
 */
function anchorMarks(
  laid: ReturnType<typeof laidContinuous>,
  continuous: Continuous,
  ribs: readonly [number, number],
  form: MarkForm,
  ribAllowance: number,
  spacing: number,
) {
  const { marks, numeral } = continuousMarks(
    laid,
    { ...continuous, anchors: [] },
    ribs,
    form,
    ribAllowance,
    spacing,
  );
  const { left, l1, r1 } = laid;
  const anchored = left ? r1 : l1;
  const inwards = left ? -1 : 1;
  const dots = flatAnchors(anchored, continuous.anchors).flatMap(({ point, j }) => {
    const [p, q] = [anchored[j - 1], anchored[j]];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    // The edge's normal, turned inwards: the edge runs along y.
    const normal: Point = [(q[1] - p[1]) / length, -(q[0] - p[0]) / length];
    const s = Math.sign(normal[0]) === inwards ? 1 : -1;
    const start: Point = [
      point[0] + s * form.offset * normal[0],
      point[1] + s * form.offset * normal[1],
    ];
    return [0, 1, 2].map((d): Point => [
      start[0] + s * d * normal[0],
      start[1] + s * d * normal[1],
    ]);
  });
  return { marks: [...marks, ...dots], numeral };
}

/**
 * The H straps and V-ribs laid flat as the reference's, corrected: VH ribs
 * (type 4) cut as the strips, type 5 with the V-ribs' allowance, its
 * corners at its own cutouts and its ellipses closed, type 6 numbered after
 * its own ribs, anchors marked across their edge; the NaN of an edge of no
 * length left out.
 */
export function vRibPatterns(
  design: Pick<LepDesign, VRibPatternSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): VRibPattern[] {
  return referenceVRibPatterns(design, airfoils, {
    traces: traceSteps,
    round: double,
    ownAllowance: true,
    ownCorners: true,
    closedEllipses: true,
    stripVH: true,
    marks: strapMarks,
    continuousMarks: anchorMarks,
    finite: true,
  });
}
