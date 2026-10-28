import { colorsModel } from './colors.ts';
import { brakeDistributionScene, networkScene, ramificationScene } from './lines.ts';
import {
  holesModel,
  tensionGroupsModel,
  tensionModel,
  wingModel,
  type PreviewModel,
} from './model.ts';
import { colorsScene, tensionScene } from './patterns.ts';
import { holesScene, ribScene, thicknessScene } from './ribs.ts';
import {
  additionalPointsModel,
  additionalPointsScene,
  rodsModel,
  rodsScene,
  shapingModel,
  shapingScene,
} from './rods.ts';
import type { PreviewContext, PreviewScene } from './scene.ts';
import { markTypeScene, sewingMarksScene, sewingScene } from './sewing.ts';
import {
  hvrHolesModel,
  hvrHolesScene,
  ventsModel,
  ventsScene,
  wingTipModel,
  wingTipScene,
} from './special.ts';
import { reinforcementModel, reinforcementScene } from './structure.ts';
import { linesModel } from './suspension.ts';
import { trimModel, trimScene } from './trim.ts';
import { anchorsWingScene, geometryScene } from './wing.ts';

/** The views of a preview: value and label. */
export type PreviewViews = readonly (readonly [value: string, label: string])[];

/** A section's scene: its views, whether a view draws the chosen rib, and the drawing, or its 3D `model` view. */
export interface SectionScene {
  readonly views: PreviewViews;
  ribs?(view: string): boolean;
  draw(context: PreviewContext): PreviewScene;
  model?(context: PreviewContext): PreviewModel;
}

const WING_VIEWS: PreviewViews = [
  ['planform', 'Planform'],
  ['front', 'Front'],
];
const RIB_VIEWS: PreviewViews = [...WING_VIEWS, ['profile', 'Profile']];
/** The view of a section's `model`. */
export const MODEL_VIEW = ['3d', '3D'] as const;
/** The wing in 3D, the focused rib row highlighted, with the anchor rows or not. */
const wingRowModel = (anchors: boolean) => (c: PreviewContext) =>
  wingModel(c.design, c.airfoils, { row: c.selected, anchors });
const TENSION_VIEWS: PreviewViews = [
  ['both', 'Both'],
  ['extrados', 'Extrados'],
  ['intrados', 'Intrados'],
];
const always = () => true;
/** Sections 2 and 3: the wing with the selected rib, or its profile. */
const ribRow = (anchors: boolean) => (c: PreviewContext) =>
  c.view === 'profile' ? ribScene(c, anchors) : anchorsWingScene(c, c.selected);

/** Sections 15 and 16: the color layout of the extrados or intrados, or the wing in 3D. */
const colorsSection = (upper: boolean): SectionScene => ({
  views: [['planform', 'Planform'], MODEL_VIEW],
  draw: (c: PreviewContext) => colorsScene(c, upper),
  model: (c: PreviewContext) => colorsModel(c.design, c.airfoils, upper, c.selected, c.active),
});

/**
 * The scenes of the sections of leparagliding.txt, by section number. In
 * their context, `selected` is the record focused in the section (rib,
 * group, row...) and `active` the one focused in it (point, cut, hole...).
 */
export const SECTION_SCENES: ReadonlyMap<number, SectionScene> = new Map([
  [1, { views: [...WING_VIEWS, MODEL_VIEW], draw: geometryScene, model: wingRowModel(false) }],
  [2, { views: [...RIB_VIEWS, MODEL_VIEW], draw: ribRow(false), model: wingRowModel(false) }],
  [3, { views: [...RIB_VIEWS, MODEL_VIEW], draw: ribRow(true), model: wingRowModel(true) }],
  [
    4,
    {
      views: [...RIB_VIEWS, MODEL_VIEW],
      ribs: (view: string) => view === 'profile',
      draw: (c: PreviewContext) =>
        c.view === 'profile' || !c.design.holes.length
          ? holesScene(c)
          : anchorsWingScene(c, c.rib, c.selected),
      model: (c: PreviewContext) => holesModel(c.design, c.airfoils, c.selected, c.active),
    },
  ],
  [
    5,
    {
      views: [...TENSION_VIEWS, MODEL_VIEW],
      draw: (c: PreviewContext) => tensionScene(c, false),
      model: (c: PreviewContext) => tensionModel(c.design, c.airfoils),
    },
  ],
  [
    6,
    {
      views: [
        ['panels', 'Panels'],
        ['rib', 'Rib'],
        ['v-rib', 'V-rib'],
      ],
      ribs: (view: string) => view !== 'panels',
      draw: sewingScene,
    },
  ],
  [7, { views: [], draw: sewingMarksScene }],
  [
    8,
    {
      views: [['side', 'Side'], MODEL_VIEW],
      draw: trimScene,
      model: (c: PreviewContext) => trimModel(c.design, c.airfoils),
    },
  ],
  [
    9,
    {
      views: [['network', 'Connections'], MODEL_VIEW],
      draw: (c: PreviewContext) => networkScene(c, false),
      model: (c: PreviewContext) =>
        linesModel(c.design, c.airfoils, { plan: c.selected, path: c.active }),
    },
  ],
  [
    10,
    {
      views: [['network', 'Connections'], ['distribution', 'Distribution'], MODEL_VIEW],
      model: (c: PreviewContext) => linesModel(c.design, c.airfoils, { plan: -1, path: c.active }),
      draw: (c: PreviewContext) =>
        c.view === 'distribution' ? brakeDistributionScene(c) : networkScene(c, true),
    },
  ],
  [
    11,
    {
      views: [
        ['lines3', 'Lines · 3'],
        ['lines4', 'Lines · 4'],
        ['brakes3', 'Brakes · 3'],
        ['brakes4', 'Brakes · 4'],
        MODEL_VIEW,
      ],
      draw: ramificationScene,
      model: (c: PreviewContext) => linesModel(c.design, c.airfoils),
    },
  ],
  [
    12,
    {
      views: [['planform', 'Planform'], ['front', 'Front'], MODEL_VIEW],
      draw: reinforcementScene,
      model: (c: PreviewContext) => reinforcementModel(c.design, c.airfoils, c.selected),
    },
  ],
  [15, colorsSection(true)],
  [16, colorsSection(false)],
  [
    17,
    {
      views: [['profile', 'Profile'], MODEL_VIEW],
      ribs: always,
      draw: additionalPointsScene,
      model: (c: PreviewContext) => additionalPointsModel(c.design, c.airfoils, c.rib, c.selected),
    },
  ],
  [
    20,
    {
      views: [
        ['print', 'Print'],
        ['laser', 'Laser'],
      ],
      draw: markTypeScene,
    },
  ],
  [
    21,
    {
      views: [['profile', 'Profile'], MODEL_VIEW],
      ribs: always,
      draw: rodsScene,
      model: (c: PreviewContext) => rodsModel(c.design, c.airfoils, c.rib, c.secondary, c.selected),
    },
  ],
  [
    26,
    {
      views: [['inlet', 'Inlet'], MODEL_VIEW],
      draw: ventsScene,
      model: (c: PreviewContext) => ventsModel(c.design, c.airfoils, c.selected),
    },
  ],
  [
    27,
    {
      views: [['tip', 'Tip'], MODEL_VIEW],
      draw: wingTipScene,
      model: (c: PreviewContext) => wingTipModel(c.design, c.airfoils),
    },
  ],
  [
    29,
    {
      views: [['both', 'Both'], ['upper', 'Extrados'], ['lower', 'Intrados'], MODEL_VIEW],
      ribs: always,
      draw: shapingScene,
      model: (c: PreviewContext) =>
        shapingModel(c.design, c.airfoils, c.selected, c.surface, c.active),
    },
  ],
  [
    30,
    {
      views: [['profile', 'Profile'], MODEL_VIEW],
      ribs: always,
      draw: thicknessScene,
      model: wingRowModel(false),
    },
  ],
  [
    31,
    {
      views: [...TENSION_VIEWS, MODEL_VIEW],
      draw: (c: PreviewContext) => tensionScene(c, true),
      model: (c: PreviewContext) => tensionGroupsModel(c.design, c.airfoils, c.selected),
    },
  ],
  [
    38,
    {
      views: [['holes', 'Holes'], MODEL_VIEW],
      ribs: always,
      draw: hvrHolesScene,
      model: (c: PreviewContext) => hvrHolesModel(c.design, c.airfoils, c.selected),
    },
  ],
]);
