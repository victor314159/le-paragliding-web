import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  brakeLines,
  karabiner,
  suspensionLines,
  type LineSections,
  type Point3,
  type SuspensionLine,
} from '@lepara/geometry';
import { wingModel, type PreviewModel } from './model.ts';
import { ANCHOR_COLORS } from './profile.ts';

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];
const planColor = (plan: number) => ANCHOR_COLORS[(plan - 1) % (ANCHOR_COLORS.length - 1)];
/** The brakes take the color of the F row of anchors. */
const BRAKE_COLOR = ANCHOR_COLORS[5];

/** The path to highlight: of a line plan (from 0) or of the brakes (`plan` -1). */
export interface HighlightedPath {
  readonly plan: number;
  readonly path: number;
}

/**
 * Sections 9 to 11: the wing with its suspension and brake lines, both
 * halves, as the engine places them before load, a color per plan and the
 * brakes in that of the F anchors; the ramification points and the
 * karabiners as dots; the lines of `highlighted` from its riser or main
 * brake line to its anchor, wider.
 */
export function linesModel(
  design: Pick<LepDesign, LineSections | 'brakes'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  highlighted?: HighlightedPath,
): PreviewModel {
  const model = wingModel(design, airfoils);
  const lines = suspensionLines(design, airfoils);
  const brakes = brakeLines(design, airfoils, lines);
  const brakePlan = design.lines.plans.length + 1;
  const chosen =
    highlighted &&
    (highlighted.plan < 0 ? design.brakes.paths : design.lines.plans[highlighted.plan]?.paths)?.[
      highlighted.path
    ];
  const plan = highlighted && (highlighted.plan < 0 ? brakePlan : highlighted.plan + 1);
  const selected = (line: SuspensionLine) =>
    !!chosen &&
    line.plan === plan &&
    chosen.branches
      .slice(0, chosen.levels)
      .some(([level, order]) => level === line.level && order === line.order);
  for (const line of [...lines, ...brakes]) {
    const color = line.plan === brakePlan ? BRAKE_COLOR : planColor(line.plan);
    for (const side of [mirror, (p: Point3) => p]) {
      model.lines.push({
        points: [line.start, line.end].map(side),
        kind: 'line',
        selected: selected(line),
        color,
      });
      if (line.level < line.levels)
        model.dots.push({ point: side(line.end), kind: 'knot', selected: false, color });
    }
  }
  const right = karabiner(design);
  if (right)
    for (const point of [mirror(right), right])
      model.dots.push({ point, kind: 'karabiner', selected: true, color: '#d04b47' });
  const plans = [...new Set(lines.map((line) => line.plan))];
  model.title = 'Wing 3D model · suspension lines';
  model.legend = [
    ...plans.map((number) => ({ text: `Plan ${number}`, color: planColor(number) })),
    ...(brakes.length ? [{ text: 'Brakes', color: BRAKE_COLOR }] : []),
  ];
  model.note =
    `${lines.length} lines and ${brakes.length} brake lines a side, placed as the engine ` +
    'places them before load (§12, 14): from the karabiners towards the anchors each line ' +
    'holds, cut at the ramification lengths of section 11. ' +
    model.note;
  return model;
}
