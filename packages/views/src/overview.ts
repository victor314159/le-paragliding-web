import type { LepAirfoil, LepDesign } from '@lepara/format';
import {
  balloonedSkin,
  brakeLines,
  suspensionLines,
  suspensionTriangles,
  type LineSections,
  type Point3,
} from '@lepara/geometry/enhanced-v1';
import { colorsModel } from './colors.ts';
import { wingModel, type PreviewModel, type SkinPanel } from './model.ts';
import { ANCHOR_COLORS } from './profile.ts';
import { additionalPointsModel, rodsModel, shapingModel } from './rods.ts';
import { hvrHolesModel, ventsModel } from './special.ts';
import { linesModel } from './suspension.ts';
import { RIB_DEFORMATION_NOTE, suspendedRib } from './suspended-rib.ts';

const LINE_THICKNESS_SCALE = 3;
const ROD_THICKNESS_SCALE = 1;
/** The left half, mirrored, then the right one. */
const SIDES = [([x, y, z]: Point3): Point3 => [-x, y, z], (p: Point3) => p];

export const OVERVIEW_LAYERS = [
  ['skin', 'Skin'],
  ['colors', 'Panel colors and cuts'],
  ['ribs', 'Ribs and holes'],
  ['structure', 'V-ribs, straps and miniribs'],
  ['lines', 'Suspension and brakes'],
  ['anchors', 'Attachment points'],
  ['rods', 'Nylon rods'],
  ['points', 'Additional rib points'],
  ['shaping', 'Shaping cuts'],
] as const;
export type OverviewLayer = (typeof OVERVIEW_LAYERS)[number][0];
/** Only the sections consumed by the assembled view and its existing section models. */
type OverviewSections =
  | 'geometry'
  | 'wingTip'
  | 'airfoils'
  | 'thickness'
  | 'anchors'
  | 'holes'
  | LineSections
  | 'brakes'
  | 'hvRibs'
  | 'hvrHoles'
  | 'glueVents'
  | 'extradosColors'
  | 'intradosColors'
  | 'joncs'
  | 'ribPoints'
  | 'shaping'
  | 'skinTension'
  | 'skinTensionGroups'
  | 'lineTypes'
  | 'sewingAllowances'
  | 'specialParameters';

/** An empty drawing for a section model to populate without rebuilding the skin. */
function empty(): PreviewModel {
  return { title: '', note: '', surfaces: [], fills: [], lines: [], dots: [], legend: [] };
}

/**
 * The ribs layer of the overview, their holes cut out: on a single skin,
 * bent to their turned attachments with `estimateRibDeformation`, else flat
 * with the outlines of the engine's turned triangles; from the suspension
 * `lines` when known.
 */
export function overviewRibs(
  design: Pick<LepDesign, OverviewSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  estimateRibDeformation = true,
  lines = suspensionLines(design, airfoils),
): PreviewModel {
  const ribs = empty();
  const triangles = suspensionTriangles(design, airfoils, lines);
  if (estimateRibDeformation && triangles.length) ribs.note = RIB_DEFORMATION_NOTE;
  // The last hole group naming a rib applies to it, as in the input drawing.
  design.geometry.ribs.forEach((_, index) => {
    const group = [...design.holes]
      .reverse()
      .find((g) => g.firstRib <= index + 1 && index + 1 <= g.lastRib);
    const rib = suspendedRib(
      design,
      airfoils,
      index,
      group?.holes ?? [],
      estimateRibDeformation ? triangles : [],
    );
    if (!rib) return;
    for (const side of SIDES) {
      ribs.lines.push({ points: rib.contour.map(side), kind: 'rib', selected: false });
      for (const fill of rib.fills)
        ribs.fills.push({
          points: fill.points.map(side),
          holes: fill.holes?.filter((hole) => hole.length > 2).map((hole) => hole.map(side)),
          kind: 'skin',
        });
    }
  });
  if (!estimateRibDeformation)
    for (const {
      points: [a, b, tip],
    } of triangles)
      for (const side of SIDES)
        ribs.lines.push({ points: [a, tip, b, a].map(side), kind: 'rib', selected: false });
  return ribs;
}

/**
 * The draft wing at Wing scale in separate visibility layers, reusing the section
 * drawings in their common, unpitched coordinates. Optional ballooning follows
 * the active skin tension curves; colors and surface cuts follow that same mesh.
 */
export function wingOverviewLayers(
  design: Pick<LepDesign, OverviewSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  ballooning = true,
): Readonly<Record<OverviewLayer, PreviewModel>> {
  const panels: SkinPanel[] = [];
  const mesh = ballooning ? balloonedSkin(design, airfoils) : undefined;
  const skin = ventsModel(
    design,
    airfoils,
    -1,
    wingModel(design, airfoils, {
      inlets: design.glueVents.mode === 0,
      miniribs: false,
      skin: mesh,
      panels,
    }),
    mesh,
  );
  // Section 26 uses diagnostic surface colors; the assembled view uses the skin material.
  for (const surface of skin.surfaces) delete surface.color;
  skin.legend = [];
  skin.title = design.geometry.wingName;
  skin.note = mesh?.length
    ? `Skin ballooned by the enhanced model from section ${design.skinTensionGroups.mode === 0 ? '5' : '31'}, with the engine’s panel corrections and, on a double skin, section 2 miniribs.`
    : 'Skin straight between ribs, without ballooning or 3D shaping.';
  const anchors = empty();
  skin.lines = skin.lines.filter((line) => line.kind !== 'rib');
  // Actual terminal line endpoints include fractional brake attachments and virtual anchors.
  // A defined anchor position on a rib alone does not make it a used attachment.
  const suspension = suspensionLines(design, airfoils);
  const attached = [...suspension, ...brakeLines(design, airfoils, suspension)].filter(
    (line) => line.level === line.levels,
  );
  ANCHOR_COLORS.forEach((color, row) => {
    const points = [
      ...new Map(
        attached
          .filter((line) => line.row === row + 1)
          .map((line) => [line.end.join(','), line.end]),
      ).values(),
    ];
    for (const side of SIDES)
      anchors.dots.push(
        ...points.map((point) => ({
          point: side(point),
          kind: 'anchor-dot',
          selected: false,
          color,
        })),
      );
  });
  skin.dots = [];
  const colors = colorsModel(design, airfoils, true, -1, -1, empty(), panels);
  colorsModel(design, airfoils, false, -1, -1, colors, panels);
  const structure = hvrHolesModel(design, airfoils, -1, empty());
  // The complete suspension layer already includes the lines reaching the anchors.
  structure.lines = structure.lines.filter((line) => line.kind !== 'line');
  const shaping = shapingModel(design, airfoils, -1, 'upper', -1, empty(), panels);
  shaping.surfaces = [];
  return {
    skin,
    colors,
    ribs: overviewRibs(design, airfoils, true, suspension),
    anchors,
    structure,
    shaping,
    lines: linesModel(design, airfoils, undefined, empty(), {
      dots: false,
      types: design.lineTypes,
      thicknessScale: LINE_THICKNESS_SCALE,
    }),
    rods: rodsModel(design, airfoils, -1, -1, -1, empty(), ROD_THICKNESS_SCALE),
    points: additionalPointsModel(design, airfoils, -1, -1, empty()),
  };
}

/** Combines visible layers without changing them or their geometry. */
export function wingOverviewModel(
  layers: Readonly<Record<OverviewLayer, PreviewModel>>,
  visible: ReadonlySet<OverviewLayer>,
): PreviewModel {
  const model = empty();
  model.title = 'Wing overview';
  const lineNote = visible.has('lines')
    ? ` Lines and risers shown at ${LINE_THICKNESS_SCALE}× thickness.`
    : '';
  const ribNote = visible.has('ribs') && layers.ribs.note ? ` ${layers.ribs.note}` : '';
  model.note = `Live draft · At Wing scale · ${layers.skin.note}${ribNote}${lineNote} Drag to rotate, scroll to zoom.`;
  if (visible.has('skin')) {
    let min = Infinity,
      max = -Infinity;
    for (const surface of layers.skin.surfaces)
      for (const row of surface.rows)
        for (const [x] of row) {
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
    if (Number.isFinite(min) && max > min)
      model.cutaway = { min, max, feather: (max - min) * 0.15 };
  }
  for (const [key] of OVERVIEW_LAYERS) {
    if (!visible.has(key)) continue;
    const layer = layers[key];
    const cutaway = !!model.cutaway && ['skin', 'colors', 'shaping'].includes(key);
    const tagged = <T>(items: readonly T[]) =>
      cutaway ? items.map((item) => ({ ...item, cutaway: true })) : items;
    if (key !== 'colors' || visible.has('skin')) model.surfaces.push(...tagged(layer.surfaces));
    model.fills.push(...tagged(layer.fills));
    model.lines.push(...tagged(layer.lines));
    model.dots.push(...tagged(layer.dots));
    if (key === 'lines') model.legend.push(...layer.legend);
  }
  return model;
}
