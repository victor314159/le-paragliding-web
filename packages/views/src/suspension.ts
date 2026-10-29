import {
  LINE_TYPES_DEFAULTS,
  type LepAirfoil,
  type LepDesign,
  type LineType,
  type LineTypes,
} from '@lepara/format';
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
import { sweptSurface, tubeSurface } from './geometry.ts';

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];
/** The color of line plan `plan` (from 1): those of the anchor rows A to E, in turn. */
export const planColor = (plan: number) => ANCHOR_COLORS[(plan - 1) % (ANCHOR_COLORS.length - 1)];
/** Standard riser-group label: A, B, C…; anchor rows can be mixed within a group. */
export const planLabel = (plan: number) => String.fromCharCode(64 + plan);
/** The brakes take the color of the F row of anchors. */
const BRAKE_COLOR = ANCHOR_COLORS[5];

/** The path to highlight: of a line plan (from 0) or of the brakes (`plan` -1). */
export interface HighlightedPath {
  readonly plan: number;
  readonly path: number;
}

/** Overview drawing options; section previews keep their schematic lines and junctions. */
export interface LineModelOptions {
  readonly dots?: boolean;
  readonly types?: LineTypes;
  /** Visual cross-section multiplier; lengths and attachment positions stay at Wing scale. */
  readonly thicknessScale?: number;
}

/** A circular line or rectangular riser at its actual cross section, mm converted to cm. */
function lineSurface(
  start: Point3,
  end: Point3,
  type: LineType,
  scale: number,
): Point3[][] | undefined {
  if (type.kind === 'c') return tubeSurface([start, end], (type.diameter * scale) / 10);
  const [u, v] = [type.width / 20, type.thickness / 20].map((half) => half * scale);
  if (![u, v].every((value) => Number.isFinite(value) && value > 0)) return undefined;
  // Riser twist is not specified by the design: the default frame of the sweep.
  return sweptSurface(
    [start, end],
    [
      [-u, -v],
      [u, -v],
      [u, v],
      [-u, v],
      [-u, -v],
    ],
  );
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
  layer?: PreviewModel,
  options: LineModelOptions = {},
): PreviewModel {
  const model = layer ?? wingModel(design, airfoils);
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
  const types = options.types?.mode === 1 ? options.types.types : LINE_TYPES_DEFAULTS.types;
  const lineType = (line: SuspensionLine) => {
    const brake = line.plan === brakePlan;
    const source = brake ? design.brakes : design.lines;
    const paths = brake ? design.brakes.paths : (design.lines.plans[line.plan - 1]?.paths ?? []);
    const path = [...paths].reverse().find((path) => {
      const branch = path.branches[line.level - 1];
      return branch?.[0] === line.level && branch[1] === line.order;
    });
    // The engine defaults to type k at level k, except its first main brake (type 6).
    const number = source.typed
      ? path?.lineTypes?.[line.level - 1]
      : brake && line === brakes[0]
        ? 6
        : line.level;
    return types.find((type) => type.number === number);
  };
  for (const line of [...lines, ...brakes]) {
    const color = line.plan === brakePlan ? BRAKE_COLOR : planColor(line.plan);
    const type = options.types && lineType(line);
    const rows = type && lineSurface(line.start, line.end, type, options.thicknessScale ?? 1);
    for (const side of [mirror, (p: Point3) => p]) {
      if (rows)
        model.surfaces.push({ rows: rows.map((row) => row.map(side)), kind: 'line', color });
      else
        model.lines.push({
          points: [line.start, line.end].map(side),
          kind: 'line',
          selected: selected(line),
          color,
        });
      if (options.dots !== false && line.level < line.levels)
        model.dots.push({ point: side(line.end), kind: 'knot', selected: false, color });
    }
  }
  const right = karabiner(design);
  if (options.dots !== false && right)
    for (const point of [mirror(right), right])
      model.dots.push({ point, kind: 'karabiner', selected: true, color: '#d04b47' });
  const plans = [...new Set(lines.map((line) => line.plan))];
  model.title = 'Wing 3D model · suspension lines';
  model.legend = [
    ...plans.map((number) => ({ text: planLabel(number), color: planColor(number) })),
    ...(brakes.length ? [{ text: 'Brakes', color: BRAKE_COLOR }] : []),
  ];
  model.note =
    `${lines.length} lines and ${brakes.length} brake lines a side, placed as the engine ` +
    'places them before load (§12, 14): from the karabiners towards the anchors each line ' +
    'holds, cut at the ramification lengths of section 11. ' +
    model.note;
  return model;
}
