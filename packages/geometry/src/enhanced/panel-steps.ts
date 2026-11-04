// The steps of the reference's panels and unloaded ribs that enhanced v1
// corrects: see "Panels" and "Unloaded ribs" in MODELS.md.
import type { Hole, LepDesign } from '@lepara/format';
import { middle, slope, type Point } from '../shared/points.ts';
import type { Flat, SkinPatterns, SkinRib } from '../shared/skin-types.ts';
import {
  cornerMarks,
  panelAnchors,
  sideMarks,
  triangle,
  type LaserForm,
  type MarkRun,
  type PieceSides,
  type TableMarks,
} from '../fortran/marks.ts';
import type { PanelSteps, SeamDot } from '../fortran/skin-panels.ts';
import { skinPatterns, type PatternSteps } from '../fortran/skin-patterns.ts';
import type { UnloadedSteps } from '../fortran/unloaded-ribs.ts';
import { double } from './double.ts';
import { stations } from './stations.ts';

/**
 * A cell's panel sides as they are sewn, by point index: the extrados, the
 * inlet and the intrados as developed.
 */
export function sewnSides(
  _design: Pick<LepDesign, 'skinTension'>,
  rib: SkinRib,
  patterns: SkinPatterns,
  cell: number,
): Flat {
  const lowest = rib.upper + rib.inlet - 1;
  const side = (key: keyof Flat) =>
    rib.local.map((_, j): Point =>
      // Point 0 of the engine's arrays is unused.
      j === 0
        ? [0, 0]
        : j <= rib.upper
          ? patterns.upper[cell][key][j]
          : j < lowest
            ? patterns.inlet[cell][key][j]
            : patterns.lower[cell][key][j],
    );
  return { left: side('left'), right: side('right') };
}

/**
 * The seam of an unloaded rib along its cell's midline, as the reference's,
 * its dots all `offset` on one side of it, each turned by its own segment:
 * the ends by the segment of their surface.
 */
export function sewnSeam(sides: Flat, rib: SkinRib, spacing: number, offset: number) {
  const midline = sides.left.map((point, j) => middle(point, sides.right[j]));
  const aside = ([u, v]: Point, angle: number): Point => [
    u - offset * Math.sin(angle),
    v + offset * Math.cos(angle),
  ];
  const end = (j: number, k: number): SeamDot => ({
    at: j,
    point: aside(midline[j], slope(midline[j], midline[k])),
  });
  const marks = (run: readonly number[]) => {
    const dots: SeamDot[] = [];
    const steps = run
      .slice(1)
      .map((j, n) => Math.hypot(...[0, 1].map((c) => midline[j][c] - midline[run[n]][c])));
    for (let k = 1; k <= 60; k++) {
      const at = spacing * k;
      let sum = 0;
      steps.forEach((step, n) => {
        const [p, q] = [midline[run[n]], midline[run[n + 1]]];
        if (at >= sum && at < sum + step) {
          const t = (at - sum) / step;
          dots.push({
            at: Math.min(run[n], run[n + 1]),
            point: aside([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], slope(p, q)),
          });
        }
        sum += step;
      });
    }
    return dots;
  };
  const last = midline.length - 1;
  const lowest = rib.upper + rib.inlet - 1;
  const range = (from: number, to: number) =>
    Array.from({ length: Math.abs(to - from) + 1 }, (_, k) => from + Math.sign(to - from) * k);
  return {
    extrados: [end(1, 2), end(rib.upper, rib.upper - 1), ...marks(range(1, rib.upper))],
    intrados: [end(last, last - 1), end(lowest, lowest + 1), ...marks(range(last, lowest))],
  };
}

/** Section 4's holes of type 11, of the last row holding them: the unloaded ribs' ellipses. */
function elevenHoles({ holes }: Pick<LepDesign, 'holes'>): readonly Hole[] {
  const row = [...holes].reverse().find((group) => group.holes.some((hole) => hole.type === 11));
  return row?.holes.filter((hole) => hole.type === 11) ?? [];
}

/**
 * The sewing marks of a surface's pieces as the reference's, each piece's
 * marks along its sides starting where the previous piece's left off,
 * however many pieces.
 */
export function sewnMarks(
  pieces: readonly PieceSides[],
  corners: readonly PieceSides[],
  backwards: boolean,
  spacing: number,
  offset: number,
): Point[][] {
  const marks: Point[][] = [];
  let run: MarkRun = { left: 0, right: 0, through: true };
  for (let n = 0; n < pieces.length; n++) {
    const k = backwards ? pieces.length - 1 - n : n;
    const found = sideMarks(pieces[k], run, spacing, offset, backwards);
    marks[k] = [...cornerMarks(corners[k], offset), ...found.marks];
    run = { ...found.next, through: true };
  }
  return marks;
}

/**
 * The anchors of a piece of intrados panel marked as the reference's, every
 * mark moved outwards on both sides.
 */
export function anchorMarks(
  piece: PieceSides,
  start: { readonly left: number; readonly right: number },
  distances: { readonly left: readonly number[]; readonly right: readonly number[] },
  form: LaserForm,
  offset: number,
  allowance: number,
): TableMarks {
  const dots: Point[] = [];
  const lines: Point[][] = [];
  const spacing = (0.5 * (allowance - 20 * offset)) / 10;
  for (const {
    side,
    point: [x, y],
    alpha,
  } of panelAnchors(piece, start, distances)) {
    const s = side === 'left' ? -1 : 1;
    // Outwards: (-sin, -cos) on the left, (sin, cos) on the right.
    const out = (from: number, d: number): Point => [
      x + s * (from + d) * Math.sin(alpha),
      y + s * (from + d) * Math.cos(alpha),
    ];
    if (form.type === 1) dots.push(...[0, 1, 2].map((k) => out(offset, k * spacing)));
    if (form.type === 2) dots.push(...[0, 1, 2].map((k) => out(form.offset, k * form.size)));
    if (form.type === 3)
      lines.push(triangle(out(form.offset, 0), form.size, s < 0 ? -alpha : Math.PI - alpha));
  }
  return { dots, lines };
}

export const panelSteps: PanelSteps = {
  sides: sewnSides,
  seam: sewnSeam,
  marks: sewnMarks,
  anchors: anchorMarks,
  // The inlet's first points' middle onto the extrados' last ones'.
  inletOrigin: (middle) => middle,
  // An anchor on an inlet glued to the intrados, where the inlet is drawn.
  inletAnchor: (_, glued) => glued,
};
/** Each panel edge on its own rib's terms, its cut line off its corrected sewing line. */
export const patternSteps: PatternSteps = { symmetric: true, ownAngle: true, correctedCuts: true };

export const unloadedSteps: UnloadedSteps = {
  sides: sewnSides,
  holes: elevenHoles,
  stations,
  patterns: (design, ribs) => skinPatterns(design, ribs, double, patternSteps),
};
