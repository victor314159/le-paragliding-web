// The H straps and V and VH ribs laid flat as the engine draws them in its
// 2D drawing (§16.1.4, 16.2.5, 16.3.1.5, 16.3.2.5, 16.4.5, 16.6.4): their
// edges, cut lines and holes, in double precision.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { markOffset, polylineLength, romanDots } from './marks.ts';
import { middle } from '../shared/points.ts';
import type { Point } from './ribs.ts';
import { ellipsePolyline, ellipseSegments } from './rib-patterns.ts';
import {
  cutoutPoint,
  flatAnchors,
  flatt,
  laidContinuous,
  vRibHoles,
  type FlatCutout,
  type Flatt,
  type VRibHoleSections,
} from './vrib-holes.ts';
import {
  columns,
  engineTraces,
  hStraps,
  vRibs,
  type Continuous,
  type TraceSteps,
} from './vribs.ts';

export type VRibPatternSections =
  | VRibHoleSections
  | 'sewingAllowances'
  | 'skinTension'
  | 'specialParameters'
  | 'marks'
  | 'markTypes';

/** A strap or V-rib laid flat, in cm, v up as in the engine's drawing. */
export interface VRibPattern {
  /** The rows of section 12 that build it, from 1. */
  readonly rows: readonly number[];
  /** 1 for an H strap, else the V-rib type: 2 to 6. */
  readonly type: number;
  /** The rib numbers of its left and right edges as laid. */
  readonly ribs: readonly [number, number];
  /** Its sewing outline: the left edge, then the right one back. */
  readonly sewing: readonly Point[];
  /** Its cut lines, as the engine draws them: open polylines, NaN on an edge of no length. */
  readonly cut: readonly (readonly Point[])[];
  /** Cut lines of its holes (section 38, types 5 and 6) and of the elliptic cutouts of type 5. */
  readonly holes: readonly (readonly Point[])[];
  /** Its sewing control points: about the middle and the ends of its edges. */
  readonly marks: readonly Point[];
  /** The numbers of its ribs and anchor row in roman numerals of dots. */
  readonly numeral: readonly Point[];
}

/** What a piece's marks take: the engine's columns of its row, mark offset, allowances, numeral spacing. */
export interface MarkForm {
  readonly h: readonly number[];
  readonly offset: number;
  readonly allowance: number;
  readonly spacing: number;
}

/** The engine's angle of an edge from `p` to `q`, in [0, π): what its cut lines move across. */
export const edgeAngle = (p: Point, q: Point) => {
  const alpha = -Math.atan((p[1] - q[1]) / (p[0] - q[0]));
  return alpha < 0 ? alpha + Math.PI : alpha;
};
/** `p` moved `across` across angle `alpha` (sin, cos) and `along` it (cos, −sin), y down. */
export const moved = ([x, y]: Point, alpha: number, across: number, along = 0): Point => [
  x + across * Math.sin(alpha) + along * Math.cos(alpha),
  y + across * Math.cos(alpha) - along * Math.sin(alpha),
];

/**
 * §16.1.4, 16.2.5, 16.3.1.5, 16.4.5, 16.6.4: the marks of an H strap and
 * of the pieces of V-ribs of types 2, 3, 4 and 6, in the engine's drawing (y down): a
 * control point at the middle of an edge on an anchor rib, points at the
 * ends (and the middle, type 2) of an edge on a neighbour or of types 4 and 6, and
 * the ribs' and the anchor row's numbers along the edges, `romano` from
 * points of y down. Type 6 numbers its right edge after its left rib, and
 * its row by a tenth of column 4.
 */
export function stripMarks(
  { l1, l2, r1, r2 }: Flatt,
  type: number,
  ribs: readonly [number, number],
  { h, offset, allowance, spacing }: MarkForm,
) {
  const [left, right] = [edgeAngle(l1[0], l2[19]), edgeAngle(r1[0], r2[19])];
  const [leftMiddle, rightMiddle] = [
    moved(middle(l1[0], l2[19]), left, -offset),
    moved(middle(r1[0], r2[19]), right, offset),
  ];
  const numeral = (n: number, [x, y]: Point, alpha: number) =>
    romanDots(Math.trunc(n), [x, -y], alpha, spacing);
  if (type === 1)
    return {
      marks: [leftMiddle, rightMiddle],
      numeral: [
        ...numeral(h[3], moved(leftMiddle, left, -0.6 * allowance, 0.4 * h[7]), left),
        ...numeral(h[4], moved(leftMiddle, left, -0.6 * allowance, -0.6 * h[7]), left),
      ],
    };
  /** The points of an edge on a neighbour: at its ends, and type 2 its middle. */
  const ends = (start: Point, end: Point, alpha: number, sign: number) => {
    const [p6, p8] = [
      moved(start, alpha, sign * offset, -2 * offset),
      moved(end, alpha, sign * offset, 2 * offset),
    ];
    return type === 2 ? [p6, middle(p6, p8), p8] : [p6, p8];
  };
  if (type === 4 || type === 6) {
    // Type 4's piece after the anchor rib, and type 6, number closer to the middle.
    const along = (type === 4 && ribs[0] !== Math.trunc(h[3]) + 1 ? 0.5 : 0.2) * h[8];
    return {
      marks: [...ends(l1[0], l1[20], left, -1), ...ends(r1[0], r1[20], right, 1)],
      numeral: [
        ...numeral(ribs[0], moved(leftMiddle, left, -0.3 * allowance, 0.3 * h[7]), left),
        ...numeral(ribs[0] + 1, moved(rightMiddle, right, 0.3 * allowance, along), right),
        ...numeral(
          type === 4 ? h[4] : h[4] * 0.1,
          moved(rightMiddle, right, 0.3 * allowance, -along),
          right,
        ),
      ],
    };
  }
  // Blue, the anchor rib on the right; red, on the left.
  if (ribs[1] === Math.trunc(h[3]))
    return {
      marks: [...ends(l1[0], l1[20], left, -1), rightMiddle],
      numeral: [
        ...numeral(ribs[0], moved(leftMiddle, left, -0.3 * allowance, 0.5 * h[8]), left),
        ...numeral(h[4], moved(leftMiddle, left, -0.3 * allowance, -0.5 * h[8]), left),
        ...numeral(ribs[1], moved(rightMiddle, right, 0.3 * allowance, 0.3 * h[7]), right),
      ],
    };
  return {
    marks: [moved(middle(l1[0], l1[20]), left, -offset), ...ends(r1[0], r1[20], right, 1)],
    numeral: [
      ...numeral(ribs[0], moved(leftMiddle, left, -0.3 * allowance, 0.3 * h[7]), left),
      ...numeral(ribs[1], moved(rightMiddle, right, 0.3 * allowance, 0.5 * h[8]), right),
      ...numeral(h[4], moved(rightMiddle, right, 0.3 * allowance, -0.5 * h[8]), right),
    ],
  };
}

export const offset = ([x, y]: Point, distance: number, angle: number, sign: number): Point => [
  x + sign * distance * Math.sin(angle),
  y + sign * distance * Math.cos(angle),
];

/**
 * The cut lines of H straps and of V-ribs of types 2, 3 and 6: each edge
 * moved by the allowance across its segments' slopes, from each segment's
 * start and, at the end, the last one's, joined to the end rows.
 */
function stripCut({ l1, l2, r1, r2 }: Flatt, allowance: number): Point[][] {
  const edge = (starts: readonly Point[], ends: readonly Point[], sign: number) => {
    const angles = ends.map((end, j) => edgeAngle(starts[j], end));
    const last = ends.length - 1;
    return [
      starts[0],
      ...angles.map((angle, j) => offset(starts[j], allowance, angle, sign)),
      offset(ends[last], allowance, angles[last], sign),
      ends[last],
    ];
  };
  const n = l1.length - 1;
  return [[l1[0], r1[0]], [l1[n], r1[n]], edge(l1, l2, -1), edge(r1, r2, 1)];
}

/**
 * The cut lines of VH ribs (type 4): each segment of an edge moved apart by
 * the allowance across its slope, taken unsigned (`abs(datan)`), the ends
 * joined to the end rows.
 */
function segmentCut({ l1, l2, r1, r2 }: Flatt, allowance: number): Point[][] {
  const edge = (starts: readonly Point[], ends: readonly Point[], sign: number) =>
    ends.map((end, j) => {
      const start = starts[j];
      const angle = Math.abs(Math.atan((end[1] - start[1]) / (end[0] - start[0])));
      const move = ([x, y]: Point): Point => [
        x + sign * allowance * Math.sin(angle),
        y - sign * allowance * Math.cos(angle),
      ];
      return [
        ...(j === 0 ? [start] : []),
        move(start),
        move(end),
        ...(j === ends.length - 1 ? [end] : []),
      ];
    });
  const n = l1.length - 1;
  return [[l1[0], r1[0]], [l1[n], r1[n]], ...edge(l1, l2, -1), ...edge(r1, r2, 1)];
}

/**
 * The cut lines of a type 5 V-rib: the other edge moved by the allowance
 * as type 2's, the anchor rib's edge moved by it (by `atan2`) and cut out
 * between anchors, joined to the cutouts by corners: P1 and P2 moved
 * across the edge at its points `jconi − 1` and `jconf + 1`, but the
 * corners between two cutouts, at the next cutout's `jconf − 1` and the
 * previous one's `jconi − 1`. A cutout the engine cannot compute leaves
 * the edge whole.
 */
function continuousCut(
  laid: ReturnType<typeof laidContinuous>,
  cuts: readonly FlatCutout[],
  allowance: number,
  { ownCorners, closedEllipses }: Pick<VRibPatternSteps, 'ownCorners' | 'closedEllipses'>,
) {
  const { left, l1, l2, r1, r2 } = laid;
  // Right edges move out by +, left ones by −; the anchor rib is on the right of the left V-rib.
  const sign = left ? 1 : -1;
  const [anchored, anchoredEnds, other, otherEnds] = left ? [r1, r2, l1, l2] : [l1, l2, r1, r2];
  const n = anchored.length - 1;
  const angles = (points: readonly Point[], ends: readonly Point[], angle: typeof edgeAngle) => {
    const values = ends.map((end, j) => angle(points[j], end));
    return [...values, values[values.length - 1]];
  };
  const otherAngles = angles(other, otherEnds, edgeAngle);
  const anchoredAngles = angles(
    anchored,
    anchoredEnds,
    (p, q) => -Math.atan2(p[1] - q[1], p[0] - q[0]),
  );
  const moved = (j: number) => offset(anchored[j - 1], allowance, anchoredAngles[j - 1], sign);
  const corner = (p: Point, j: number) => offset(p, allowance, anchoredAngles[j - 1], sign);
  const lines: Point[][] = [];
  const holes: Point[][] = [];
  let line: Point[] = [anchored[0]];
  // Points `from` to `to` (from 1); the engine draws none between them backwards.
  const join = (from: number, to: number, point: (j: number) => Point) => {
    if (from <= to) for (let j = from; j <= to; j++) line.push(point(j));
    else {
      lines.push([...line, point(from)]);
      line = [point(to)];
    }
  };
  join(1, cuts.length ? cuts[0].jconi - 1 : n + 1, moved);
  cuts.forEach((cutout, k) => {
    const { p1, p2, ellipse, jconi, jconf } = cutout;
    line.push(corner(p1, k === 0 || ownCorners ? jconi - 1 : jconf - 1), p1);
    if (ellipse) {
      lines.push(line);
      holes.push(ellipsePoints(ellipse, closedEllipses));
      line = [];
    } else join(jconi, jconf, (j) => cutoutPoint(cutout, anchored[j - 1][1]));
    const last = k === cuts.length - 1;
    line.push(p2, corner(p2, last || ownCorners ? jconf + 1 : jconi - 1));
    join(jconf + 1, last ? n + 1 : cuts[k + 1].jconi - 1, moved);
  });
  lines.push([...line, anchored[n]]);
  const otherSide = [
    other[0],
    ...other.map((p, j) => offset(p, allowance, otherAngles[j], -sign)),
    other[n],
  ];
  return { cut: [[l1[0], r1[0]], [l1[n], r1[n]], otherSide, ...lines], holes };
}

/**
 * §16.3.2.5: the marks of a type 5 V-rib, in the engine's drawing (y down):
 * the numbers of its ribs on its first row, a fifth of the way in from each
 * edge, `ribAllowance` cm (twice the ribs' allowance) aside; along its
 * neighbour's edge, the rib's marks every section 7 `marks` spacing from the
 * trailing edge, past its extrados there; on its anchor rib's edge, each
 * anchor in three dots 1 cm apart in x, unturned.
 */
export function continuousMarks(
  { left, l1, r1 }: ReturnType<typeof laidContinuous>,
  { anchors, extrados }: Continuous,
  ribs: readonly [number, number],
  { offset, spacing }: MarkForm,
  ribAllowance: number,
  marks: number,
) {
  const sign = left ? -1 : 1;
  const across = edgeAngle(l1[0], r1[0]);
  const numeral = (n: number, share: number) => {
    const [x, y] = moved(
      [l1[0][0] * share + r1[0][0] * (1 - share), l1[0][1] * share + r1[0][1] * (1 - share)],
      across,
      sign * ribAllowance,
    );
    return romanDots(n, [x, -y], across, spacing);
  };
  // The neighbour's edge, and the anchor rib's, as laid: dots inwards.
  const [neighbour, anchored] = left ? [l1, r1] : [r1, l1];
  const inwards =
    (edge: readonly Point[], side: number) =>
    ({ point, j }: { point: Point; j: number }): Point => {
      const alpha = edgeAngle(edge[j], edge[j - 1]);
      return [
        point[0] + side * offset * Math.sin(alpha),
        point[1] - side * offset * Math.cos(alpha),
      ];
    };
  const length = polylineLength(neighbour);
  const positions =
    extrados === undefined
      ? []
      : Array.from({ length: 60 }, (_, k) => marks * (k + 1)).filter(
          (at) => at >= extrados && at <= extrados + length,
        );
  return {
    marks: [
      ...flatAnchors(
        neighbour,
        positions.map((at) => at - (extrados ?? 0)),
      ).map(inwards(neighbour, left ? -1 : 1)),
      ...flatAnchors(anchored, anchors)
        .map(inwards(anchored, left ? 1 : -1))
        .flatMap(([x, y]): Point[] => [0, 1, 2].map((d) => [x + sign * d, y])),
    ],
    numeral: [...numeral(ribs[0], 0.8), ...numeral(ribs[1], 0.2)],
  };
}

/**
 * A cutout's ellipse as the engine draws it: 99 of 100 segments, by an
 * accumulated angle; `closed`, all 100.
 */
function ellipsePoints({ center, a, b }: NonNullable<FlatCutout['ellipse']>, closed: boolean) {
  const step = (2 * Math.PI) / 100;
  const points: Point[] = [];
  for (let l = 0, g = 0; l < (closed ? 101 : 100); l++, g += step)
    points.push([center[0] + a * Math.cos(g), center[1] + b * Math.sin(g)]);
  return points;
}

/** The engine's drawing is y down: the pattern v up. */
export const up = (points: readonly Point[]) => points.map(([x, y]): Point => [x, -y]);

/**
 * The steps of `vRibPatterns` each model takes its own way, the engine's
 * when false: the pieces on `traces`; the holes in `round`; type 5 cut
 * with the V-ribs' allowance (`ownAllowance`), its corners at its own
 * cutouts (`ownCorners`), its ellipses closed (`closedEllipses`); type 4
 * cut as the strips (`stripVH`); the marks of the strips and of type 5;
 * the NaN of an edge of no length left out (`finite`).
 */
export interface VRibPatternSteps {
  readonly traces: TraceSteps;
  readonly round: (value: number) => number;
  readonly ownAllowance: boolean;
  readonly ownCorners: boolean;
  readonly closedEllipses: boolean;
  readonly stripVH: boolean;
  readonly marks: typeof stripMarks;
  readonly continuousMarks: typeof continuousMarks;
  readonly finite: boolean;
}

const engineVRibPatterns: VRibPatternSteps = {
  traces: engineTraces,
  round: Math.fround,
  ownAllowance: false,
  ownCorners: false,
  closedEllipses: false,
  stripVH: false,
  marks: stripMarks,
  continuousMarks,
  finite: false,
};

/**
 * The H straps and the V and VH ribs of section 12 laid flat as the engine
 * draws them in leparagliding.dxf, the straps shortened by their strain
 * (section 5), the types 5 and 6 with their holes (section 38).
 */
export function vRibPatterns(
  design: Pick<LepDesign, VRibPatternSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  steps: VRibPatternSteps = engineVRibPatterns,
): VRibPattern[] {
  // An edge of no length has no slope: the engine writes NaN lines and marks.
  const kept = (points: readonly Point[]) =>
    steps.finite ? points.filter((p) => p.every(Number.isFinite)) : points;
  const allowance = design.sewingAllowances.vRibs / 10;
  const hvr = columns(design);
  const form = (row: number): MarkForm => ({
    h: hvr[row - 1],
    offset: markOffset(design),
    allowance,
    spacing: (design.markTypes[9]?.laser.offset ?? 0) * 0.1,
  });
  const pattern = (
    rows: readonly number[],
    type: number,
    ribs: readonly [number, number],
    { l1, r1 }: Flatt,
    cut: readonly (readonly Point[])[],
    holes: readonly (readonly Point[])[] = [],
    { marks, numeral }: { marks: readonly Point[]; numeral: readonly Point[] } = {
      marks: [],
      numeral: [],
    },
  ): VRibPattern => ({
    rows,
    type,
    ribs,
    sewing: up([...l1, ...[...r1].reverse()]),
    cut: cut.map((line) => up(kept(line))),
    holes: holes.map(up),
    marks: up(kept(marks)),
    numeral: kept(numeral),
  });
  // §16.1.4: the right edge moved towards the left by the strain of the width at row 10.
  const strain = design.skinTension.miniribStrain;
  const straps = hStraps(design, airfoils, steps.traces).map(({ rows, ribs, edges }) => {
    const laid = flatt(...edges);
    const [l, r] = [laid.l1[9], laid.r1[9]];
    const width = Math.hypot(r[0] - l[0], r[1] - l[1]);
    const angle = Math.atan((r[1] - l[1]) / (r[0] - l[0]));
    const shift = ([x, y]: Point): Point => [
      x - strain * width * Math.cos(angle),
      y - strain * width * Math.sin(angle),
    ];
    const strained = { ...laid, r1: laid.r1.map(shift), r2: laid.r2.map(shift) };
    return pattern(
      rows,
      1,
      ribs,
      strained,
      stripCut(strained, allowance),
      [],
      steps.marks(strained, 1, ribs, form(rows[0])),
    );
  });
  const segments = ellipseSegments(design);
  const holed = new Map(
    vRibHoles(design, airfoils, steps.traces).map((vrib) => [
      `${vrib.rib.rows.join()}/${vrib.rib.ribs.join()}`,
      vrib,
    ]),
  );
  const ribs = vRibs(design, airfoils, steps.traces).flatMap((rib) => {
    const { rows, type, ribs: ends, edges } = rib;
    const [a, b] = ends;
    const vrib = holed.get(`${rows.join()}/${ends.join()}`);
    const holes = (vrib?.holes ?? []).map(({ center, a, b, angle }) =>
      ellipsePolyline(center, a, b, angle, segments, steps.round),
    );
    // The neighbour on the left of types 2, 3 and 5 is laid as the left edge.
    const swap = type !== 6 && b < a;
    const numbers: [number, number] = swap ? [b, a] : [a, b];
    if (type === 5) {
      if (!vrib) return [];
      const laid = laidContinuous(rib);
      // The engine cuts type 5 with the ribs' allowance.
      const cut = continuousCut(
        laid,
        vrib.cutouts,
        steps.ownAllowance ? allowance : design.sewingAllowances.ribs / 10,
        steps,
      );
      const marks =
        rib.continuous &&
        steps.continuousMarks(
          laid,
          rib.continuous,
          numbers,
          form(rows[0]),
          0.2 * design.sewingAllowances.ribs,
          design.marks.spacing,
        );
      return [pattern(rows, type, numbers, laid, cut.cut, [...holes, ...cut.holes], marks)];
    }
    const laid = swap ? flatt(edges[1], edges[0]) : flatt(...edges);
    const cut = (type === 4 && !steps.stripVH ? segmentCut : stripCut)(laid, allowance);
    const marks = steps.marks(laid, type, numbers, form(rows[0]));
    return [pattern(rows, type, numbers, laid, cut, holes, marks)];
  });
  return [...straps, ...ribs];
}
