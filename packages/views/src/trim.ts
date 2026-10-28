import type { LepAirfoil, LepDesign } from '@lepara/format';
import { karabiner, ribPoint, trimEstimate, type Point3 } from '@lepara/geometry';
import type { Point } from './geometry.ts';
import { wingModel, type PreviewModel } from './model.ts';
import { ribProfile, type ProfileSections } from './profile.ts';
import { PreviewDrawing } from './scene.ts';

const COLORS = {
  karabiners: '#d04b47',
  pressure: '#13899d',
  calage: '#b38900',
  glide: '#6270c9',
};

/**
 * The trim of section 8 at Wing scale (Z down), the wing pitched so that
 * the line from the karabiners to the center of pressure is vertical, as
 * the engine's estimate assumes: `place` puts a point of the unpitched wing
 * there; the karabiners, both, where the engine starts the risers, the
 * calage point and the center of pressure on the central chord; the glide
 * path direction.
 */
function trimGeometry(design: Pick<LepDesign, ProfileSections | 'angleOfAttack'>) {
  const estimate = trimEstimate(design);
  const right = karabiner(design);
  const chord = design.geometry.ribs[0];
  const onChord = (distance: number) =>
    ribPoint(design, 0, [distance / ((chord.yTE - chord.yLE) * design.geometry.wingScale), 0]);
  const [calage, pressure] = estimate ? [onChord(estimate.calage), onChord(estimate.pressure)] : [];
  if (!estimate || !right || !calage || !pressure) return undefined;
  const center: Point3 = [0, right[1], right[2]];
  // The pitch that brings the center of pressure straight above the karabiners.
  const pitch = Math.atan2(-1, 0) - Math.atan2(pressure[2] - center[2], pressure[1] - center[1]);
  const [cos, sin] = [Math.cos(pitch), Math.sin(pitch)];
  const place = ([x, y, z]: Point3): Point3 => {
    const [v, w] = [y - center[1], z - center[2]];
    return [x, center[1] + v * cos - w * sin, center[2] + v * sin + w * cos];
  };
  const glide = (estimate.glide * Math.PI) / 180;
  return {
    estimate,
    place,
    karabiners: [[-right[0], right[1], right[2]] as Point3, right],
    center,
    calage: place(calage),
    pressure: place(pressure),
    // Forwards, towards the leading edge (-Y), and down (+Z).
    path: [0, -Math.cos(glide), Math.sin(glide)] as Point3,
    reach: Math.abs(chord.yTE - chord.yLE) * design.geometry.wingScale * 1.2,
  };
}

/** An angle to the hundredth of a degree, as lep-out.txt gives it. */
const angleLabel = (angle: number) => `${angle.toFixed(2)}°`;

const note = (estimate: NonNullable<ReturnType<typeof trimEstimate>>) =>
  `Attitude ${angleLabel(estimate.attitude)} · glide path ${angleLabel(estimate.glide)} · ` +
  `angle of attack ${angleLabel(estimate.angleOfAttack)}, as the engine estimates them ` +
  '(§10.1): the line from the karabiners to the center of pressure vertical.';
const INCOMPLETE =
  'Enter a glide ratio, the center of pressure and calage, and line lengths longer than ' +
  'their distance, to estimate the trim.';

const LEGEND = [
  { text: 'Karabiners', color: COLORS.karabiners },
  { text: 'Center of pressure', color: COLORS.pressure },
  { text: 'Calage', color: COLORS.calage },
  { text: 'Glide path', color: COLORS.glide },
];

/** Section 8: the wing at its estimated trim, with the karabiners and the glide path. */
export function trimModel(
  design: Pick<LepDesign, ProfileSections | 'angleOfAttack'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): PreviewModel {
  const model = wingModel(design, airfoils);
  model.title = 'Wing 3D model · estimated trim';
  const trim = trimGeometry(design);
  if (!trim) {
    model.note = `${INCOMPLETE} ${model.note}`;
    return model;
  }
  const { place, center, pressure, calage, path, reach } = trim;
  for (const surface of model.surfaces) surface.rows = surface.rows.map((row) => row.map(place));
  for (const fill of model.fills) fill.points = fill.points.map(place);
  for (const line of model.lines) line.points = line.points.map(place);
  for (const dot of model.dots) dot.point = place(dot.point);
  const offset = (point: Point3, direction: Point3, distance: number): Point3 => [
    point[0] + direction[0] * distance,
    point[1] + direction[1] * distance,
    point[2] + direction[2] * distance,
  ];
  for (const karabiner of trim.karabiners)
    model.lines.push({
      points: [karabiner, pressure],
      kind: 'trim',
      selected: false,
      color: COLORS.karabiners,
    });
  model.lines.push(
    {
      points: [offset(center, [0, 1, 0], reach / 2), offset(center, [0, -1, 0], reach)],
      kind: 'horizon',
      selected: false,
    },
    {
      points: [center, offset(center, path, reach)],
      kind: 'trim',
      selected: false,
      color: COLORS.glide,
    },
  );
  model.dots.push(
    ...trim.karabiners.map((point) => ({
      point,
      kind: 'trim',
      selected: true,
      color: COLORS.karabiners,
    })),
    { point: pressure, kind: 'trim', selected: true, color: COLORS.pressure },
    { point: calage, kind: 'trim', selected: true, color: COLORS.calage },
  );
  model.legend = LEGEND;
  model.note = `${note(trim.estimate)} Horizontal line: the horizon. ${model.note}`;
  // From the right of the wing, a little ahead and above.
  model.camera = [1, -0.2, -0.15];
  return model;
}

/** Section 8, side view: the central rib at its estimated trim, with the karabiners and the glide path. */
export function trimScene({
  design,
  airfoils,
}: {
  design: Pick<LepDesign, ProfileSections | 'angleOfAttack'>;
  airfoils: ReadonlyMap<string, LepAirfoil>;
}) {
  const trim = trimGeometry(design);
  const d = new PreviewDrawing(
    'Estimated trim · side view',
    trim ? note(trim.estimate) : INCOMPLETE,
  );
  if (!trim) {
    d.label([0, 0], 'Trim unavailable');
    return d.finish();
  }
  d.legend.push(...LEGEND);
  // Y along the flight, Z down: the side view as the SVG draws it.
  const side = ([, y, z]: Point3): Point => [y, z];
  const rib = ribProfile(design, airfoils, 0).points.flatMap((p) => {
    const point = ribPoint(design, 0, p);
    return point ? [side(trim.place(point))] : [];
  });
  const { center, pressure, calage, path, reach } = trim;
  d.path(
    [side([0, center[1] + reach / 2, center[2]]), side([0, center[1] - reach, center[2]])],
    'axis',
  );
  d.path(rib, 'profile', false, 'Central rib', true);
  d.path(
    [side(center), side(pressure)],
    'detail',
    false,
    'Karabiners to center of pressure',
    false,
    COLORS.karabiners,
  );
  d.path(
    [side(center), side([0, center[1] + path[1] * reach, center[2] + path[2] * reach])],
    'detail',
    false,
    'Glide path',
    false,
    COLORS.glide,
  );
  const radius = reach * 0.012;
  d.dot(side(center), radius, 'Karabiners', false, 'point', COLORS.karabiners);
  d.dot(side(pressure), radius, 'Center of pressure', false, 'point', COLORS.pressure);
  d.dot(side(calage), radius, 'Calage', false, 'point', COLORS.calage);
  return d.finish();
}
