import type { LepAirfoil, LepDesign } from '@lepara/format';
import { hStraps, suspensionLines, vRibs, type LineSections, type Point3 } from '@lepara/geometry';
import { centroid, finite, type Point } from './geometry.ts';
import { wingModel, type PreviewModel } from './model.ts';
import { contourPoint, frontPoint, ribProfile, type ProfileSections } from './profile.ts';
import { PreviewDrawing, type PreviewContext } from './scene.ts';
import { planColor } from './suspension.ts';

interface Attachment {
  rib: number;
  x: number;
  height: number;
  before: number;
  after: number;
}
export interface Reinforcement {
  attachments: readonly [Attachment, Attachment];
  row: number;
  type: number;
}

/** Input attachment footprints. Rib zero is the virtual rib at the symmetry axis. */
export function reinforcementAttachments(
  design: Pick<LepDesign, 'geometry' | 'anchors' | 'hvRibs'>,
): Reinforcement[] {
  const result: Reinforcement[] = [];
  const chord = (rib: number) => {
    const r = design.geometry.ribs[Math.max(0, rib - 1)];
    return r && finite(r.yLE) && finite(r.yTE) ? r.yTE - r.yLE : 0;
  };
  design.hvRibs.ribs.forEach((hvr, row) => {
    const percent = hvr.type > 10;
    const type = percent ? hvr.type - 10 : hvr.type;
    const p = hvr.parameters;
    const anchor = (rib: number, line: number) =>
      design.anchors[Math.max(0, rib - 1)]?.positions[line - 1];
    const length = (width: number, rib: number) => (percent ? width / 100 : width / chord(rib));
    const attachment = (
      rib: number,
      x: number,
      height: number,
      before: number,
      after = before,
    ): Attachment => ({ rib, x, height, before, after });
    const add = (a: Attachment, b: Attachment) => {
      if (
        [a, b].some(
          (v) =>
            !Object.values(v).every(finite) ||
            !Number.isInteger(v.rib) ||
            v.rib < 0 ||
            v.rib > design.geometry.ribs.length ||
            !chord(v.rib),
        )
      )
        return;
      result.push({ row, type, attachments: [a, b] });
    };
    if (!finite(type) || !finite(p[0]) || !finite(p[1])) return;
    const i = p[0],
      line = p[1];
    if (type === 6) {
      if (!p.slice(0, 10).every(finite)) return;
      const j = p[5];
      add(
        attachment(i, p[1] / 100, p[2] / 100, length(p[3], i), length(p[4], i)),
        attachment(j, p[6] / 100, p[7] / 100, length(p[8], j), length(p[9], j)),
      );
    } else if (type === 1) {
      if (!p.slice(0, 5).every(finite)) return;
      const j = p[2],
        a = anchor(i, line),
        b = anchor(j, p[3]);
      if (!finite(a) || !finite(b)) return;
      add(attachment(i, a / 100, 0, length(p[4], i)), attachment(j, b / 100, 0, length(p[4], j)));
    } else if ([2, 3, 4, 5].includes(type)) {
      if (!p.slice(0, 8).every(finite)) return;
      const connect = (
        from: number,
        to: number,
        fromHeight: number,
        toHeight: number,
        aWidth: number,
        bWidth: number,
      ) => {
        const a = anchor(from, line),
          b = anchor(to, line);
        if (!finite(a) || !finite(b)) return;
        add(
          attachment(from, a / 100, fromHeight, length(aWidth, from)),
          attachment(to, b / 100, toHeight, length(bWidth, to)),
        );
      };
      const centralWidth = type === 5 ? p[7] : p[4];
      const outerWidth = type === 5 ? p[7] : p[5];
      const height = type === 2 || type === 4 ? p[6] / 100 : 1;
      if (type === 4) {
        connect(i, i + 1, 0, 0, centralWidth, centralWidth);
        if (p[2] === 1) connect(i, i - 1, 0, height, centralWidth, outerWidth);
        if (p[3] === 1) connect(i + 1, i + 2, 0, height, centralWidth, outerWidth);
      } else {
        if (p[2] === 1) connect(i, i - 1, 0, height, centralWidth, outerWidth);
        if (p[3] === 1) connect(i, i + 1, 0, height, centralWidth, outerWidth);
      }
    }
  });
  return result;
}

export function reinforcementScene(context: PreviewContext<ProfileSections | 'hvRibs'>) {
  const { design, airfoils, selected, view } = context;
  const d = new PreviewDrawing(
    `H, V and VH reinforcements · ${view === 'front' ? 'front projection' : 'planform'}`,
    'Attachment layout schematic, before orientation corrections. Selected row highlighted; final shaping and cutting patterns require the engine.',
  );
  const projection = (number: number, x: number, height: number): Point | undefined => {
    const index = Math.max(0, number - 1),
      r = design.geometry.ribs[index];
    if (!r || !finite(r.x) || !finite(r.yLE) || !finite(r.yTE)) return undefined;
    if (view !== 'front') return [number === 0 ? 0 : r.x, r.yLE + x * (r.yTE - r.yLE)];
    const profile = ribProfile(design, airfoils, index);
    const low = contourPoint(profile.lower, x),
      high = contourPoint(profile.upper, x);
    if (!low || !high) return undefined;
    const p = frontPoint(design, index, [x, low[1] + height * (high[1] - low[1])]);
    return p && [number === 0 ? 0 : p[0], p[1]];
  };
  const pieces = reinforcementAttachments(design).sort(
    (a, b) => Number(a.row === selected) - Number(b.row === selected),
  );
  const ends = design.geometry.ribs.flatMap((_, index) => {
    const a = projection(index + 1, 0, 0),
      b = projection(index + 1, 1, 0);
    return a && b ? [{ index, a, b }] : [];
  });
  for (const side of [-1, 1]) {
    const mirror = (p: Point): Point => [p[0] * side, p[1]];
    for (const { a, b } of ends) d.path([mirror(a), mirror(b)], 'rib');
    for (const piece of pieces) {
      const [a, b] = piece.attachments;
      const corners = [
        projection(a.rib, a.x - a.before, a.height),
        projection(b.rib, b.x - b.before, b.height),
        projection(b.rib, b.x + b.after, b.height),
        projection(a.rib, a.x + a.after, a.height),
      ];
      const chosen = piece.row === selected;
      if (corners.every((p) => !!p))
        d.path(
          corners.map((p) => mirror(p)),
          'reinforcement',
          chosen,
          `HVR row ${piece.row + 1} · type ${design.hvRibs.ribs[piece.row].type}`,
          true,
        );
      for (const a of piece.attachments) {
        const p = projection(a.rib, a.x, a.height);
        if (p && chosen) {
          d.dot(mirror(p), 5, `Rib ${a.rib}`, true, 'reinforcement-point');
        }
      }
    }
  }
  const fontSize = Math.max(0, ...ends.map(({ a }) => Math.abs(a[0]))) * 2 * 0.016;
  const center = centroid(ends.flatMap(({ a, b }) => [a, b, [-a[0], a[1]] as Point]));
  if (fontSize > 0)
    d.ribNumbers(
      ends.map(({ index, a, b }) =>
        view === 'front'
          ? { index, point: a, direction: [a[0] - center[0], a[1] - center[1]] as Point }
          : { index, point: b, direction: [b[0] - a[0], b[1] - a[1]] as Point },
      ),
      fontSize,
    );
  const row = design.hvRibs.ribs[selected];
  if (row) {
    const scene = d.finish();
    scene.note += ` Row ${selected + 1} · type ${row.type ?? '—'}.`;
    return scene;
  }
  d.label([0, 0], 'Add an HVR row to show its attachment layout');
  return d.finish();
}

const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];

/**
 * Section 12: the ribs of the wing, without its skin, its V and VH ribs as
 * the engine draws them in its 3D model, and the lines that reach the
 * anchors (the last level of each path), which they spread over the ribs,
 * both halves; and the H straps, which the engine computes but leaves out
 * of its 3D model. The record `selected` (from 0) is highlighted: its V
 * and VH ribs, those of type 5 from any of their rows, or its H strap.
 */
export function reinforcementModel(
  design: Pick<LepDesign, ProfileSections | LineSections | 'hvRibs'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  selected = -1,
): PreviewModel {
  const model = wingModel(design, airfoils);
  const ribs = vRibs(design, airfoils);
  const straps = hStraps(design, airfoils);
  model.surfaces = [...ribs, ...straps].flatMap(({ rows, edges }) => {
    const kind = rows.includes(selected + 1) ? 'selected' : 'skin';
    return [
      { rows: edges.map((edge) => edge.map(mirror)), kind },
      { rows: edges.map((edge) => [...edge]), kind },
    ];
  });
  const lines = suspensionLines(design, airfoils).filter((line) => line.level === line.levels);
  for (const line of lines)
    for (const side of [mirror, (p: Point3) => p])
      model.lines.push({
        points: [line.start, line.end].map(side),
        kind: 'line',
        selected: false,
        color: planColor(line.plan),
      });
  model.legend = [...new Set(lines.map((line) => line.plan))]
    .sort((a, b) => a - b)
    .map((plan) => ({
      text: `Plan ${plan}`,
      color: planColor(plan),
    }));
  model.title = 'Wing 3D model · V and VH ribs';
  model.note =
    `${ribs.length} V and VH ribs a side between ribs, as the engine draws them in its 3D ` +
    `model (§16), and ${straps.length} H straps (type 1), which it computes but leaves out ` +
    'of it; with the lines that reach the anchors, as the engine places ' +
    'them before load (§12). At Wing scale, ribs placed as the engine places them, without ' +
    'the skin. Drag to rotate, scroll to zoom.';
  return model;
}
