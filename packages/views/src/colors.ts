import type { LepAirfoil, LepDesign } from '@lepara/format';
import { ribPoint, type Point3 } from '@lepara/geometry';
import { wingModel, type PreviewModel } from './model.ts';
import { colorPlanform, SURFACE_COLORS } from './patterns.ts';
import { contourPoint, ribProfile, type ProfileSections } from './profile.ts';

/** Points across a panel, and along the chord of its regions. */
const STEPS = 12;
/** The colors of the regions of a panel, from its TE, as in the planform (the first one the skin's). */
const BANDS = [undefined, SURFACE_COLORS.extrados, SURFACE_COLORS.intrados];

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ends of a line across a panel, in % of chord from the TE: on its left and right ribs. */
type Ends = { readonly left: number; readonly right: number };

/**
 * Sections 15 and 16: the wing in 3D with the color regions and cuts, or
 * the rib marks, of its extrados or intrados, both halves, placed as the
 * engine places them (% of chord from the trailing edge, on that surface),
 * straight across each panel. The panel or rib record `selected` is
 * highlighted, and its cut or mark `active`.
 */
export function colorsModel(
  design: Pick<LepDesign, ProfileSections | 'extradosColors' | 'intradosColors'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  upper: boolean,
  selected = -1,
  active = -1,
): PreviewModel {
  const colors = upper ? design.extradosColors : design.intradosColors;
  const layout = colorPlanform(design.geometry, colors);
  const marks = layout.marks.filter((mark) => mark.rib >= 1);
  const model = wingModel(design, airfoils, {
    row: colors.mode === 'ribs' ? (marks.find((m) => m.record === selected)?.rib ?? 0) - 1 : -1,
  });
  const surface = upper ? 'extrados' : 'intrados';
  model.title = `Wing 3D model · ${surface} colors`;
  if (!upper) model.camera = [0.3, -1, 0.8];
  if (!upper && design.geometry.paragliderType === 'ss') {
    model.note = `Single skin: no intrados, the engine draws no intrados colors. ${model.note}`;
    return model;
  }
  const profiles = new Map<number, ReturnType<typeof ribProfile>>();
  /** The point of rib `index` (from 0) at `percent` of its chord from the TE; -1 is the axis. */
  const point = (index: number, percent: number): Point3 | undefined => {
    if (index < 0) {
      const p = point(0, percent);
      return p && [0, p[1], p[2]];
    }
    if (!profiles.has(index)) profiles.set(index, ribProfile(design, airfoils, index));
    const profile = profiles.get(index)!;
    const contour = upper ? profile.upper : profile.lower;
    // The intrados begins after the air inlet: what is before stays at its start.
    const xs = contour.map(([x]) => x);
    const x = Math.min(Math.max(1 - percent / 100, Math.min(...xs)), Math.max(...xs));
    const p = contourPoint(contour, x);
    return p && ribPoint(design, index, p);
  };
  /**
   * The part of the panel between ribs `a` and `b` from line `from` to line
   * `to`: rows across the panel of `columns` + 1 points along the chord,
   * each between the ribs' points at its % of chord.
   */
  const grid = (a: number, b: number, from: Ends, to: Ends, columns: number) => {
    const rows: Point3[][] = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const row: Point3[] = [];
      for (let k = 0; k <= columns; k++) {
        const s = columns ? k / columns : 0;
        const percent = lerp(lerp(from.left, from.right, t), lerp(to.left, to.right, t), s);
        const [p, q] = [point(a, percent), point(b, percent)];
        if (!p || !q) return undefined;
        row.push([lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]);
      }
      rows.push(row);
    }
    return rows;
  };
  const sides = [mirror, (p: Point3) => p];
  const add = (rows: Point3[][] | undefined, kind: string, color?: string) => {
    if (rows)
      for (const side of sides)
        model.surfaces.push({ rows: rows.map((row) => row.map(side)), kind, color });
  };
  for (const panel of layout.panels) {
    const [left, right] = [panel.number - 2, panel.number - 1];
    const chosen = panel.record === selected && panel.record >= 0;
    for (const region of panel.regions) {
      const color = BANDS[region.band % 3];
      if (color) add(grid(left, right, region.from, region.to, STEPS), 'skin', color);
    }
    if (chosen)
      add(grid(left, right, { left: 0, right: 0 }, { left: 100, right: 100 }, STEPS), 'selected');
    for (const cut of panel.cuts) {
      const rows = grid(left, right, cut, cut, 0);
      if (rows)
        for (const side of sides)
          model.lines.push({
            points: rows.map(([p]) => side(p)),
            kind: 'color-cut',
            selected: chosen && cut.index === active,
          });
    }
  }
  for (const mark of marks) {
    const p = point(mark.rib - 1, mark.percent);
    if (p)
      for (const side of sides)
        model.dots.push({
          point: side(p),
          kind: 'color-mark',
          selected: mark.record === selected && mark.index === active,
          color: SURFACE_COLORS[surface],
        });
  }
  model.note =
    (colors.mode === 'panels'
      ? 'Color cuts straight across each panel, from % of chord from TE on each rib; ' +
        'shading distinguishes regions, not fabric colors. Selected panel and cut highlighted. '
      : 'Rib marks at % of chord from TE; the selected rib and mark highlighted. ') +
    (layout.omitted ? `${layout.omitted} incomplete or out-of-range marks/cuts omitted. ` : '') +
    model.note;
  return model;
}
