import { brakeDistributionScene, networkScene, ramificationScene } from './lines.ts';
import { colorsScene, tensionScene } from './patterns.ts';
import { holesScene, ribScene, thicknessScene } from './ribs.ts';
import { additionalPointsScene, rodsScene, shapingScene } from './rods.ts';
import type { PreviewContext, PreviewScene } from './scene.ts';
import { markTypeScene, sewingMarksScene, sewingScene } from './sewing.ts';
import { hvrHolesScene, ventsScene, wingTipScene } from './special.ts';
import { reinforcementScene } from './structure.ts';
import { anchorsWingScene, geometryScene } from './wing.ts';

/** The views of a preview: value and label. */
export type PreviewViews = readonly (readonly [value: string, label: string])[];

/** A section's scene: its views, whether a view draws the chosen rib, and the drawing. */
export interface SectionScene {
  readonly views: PreviewViews;
  ribs?(view: string): boolean;
  draw(context: PreviewContext): PreviewScene;
}

const WING_VIEWS: PreviewViews = [
  ['planform', 'Planform'],
  ['front', 'Front'],
];
const RIB_VIEWS: PreviewViews = [...WING_VIEWS, ['profile', 'Profile']];
const TENSION_VIEWS: PreviewViews = [
  ['both', 'Both'],
  ['extrados', 'Extrados'],
  ['intrados', 'Intrados'],
];
const always = () => true;
/** Sections 2 and 3: the wing with the selected rib, or its profile. */
const ribRow = (anchors: boolean) => (c: PreviewContext) =>
  c.view === 'profile' ? ribScene(c, anchors) : anchorsWingScene(c, c.selected);

/**
 * The scenes of the sections of leparagliding.txt, by section number. In
 * their context, `selected` is the record focused in the section (rib,
 * group, row...) and `active` the one focused in it (point, cut, hole...).
 */
export const SECTION_SCENES: ReadonlyMap<number, SectionScene> = new Map([
  [1, { views: WING_VIEWS, draw: geometryScene }],
  [2, { views: RIB_VIEWS, draw: ribRow(false) }],
  [3, { views: RIB_VIEWS, draw: ribRow(true) }],
  [
    4,
    {
      views: RIB_VIEWS,
      ribs: (view: string) => view === 'profile',
      draw: (c: PreviewContext) =>
        c.view === 'profile' || !c.design.holes.length
          ? holesScene(c)
          : anchorsWingScene(c, c.rib, c.selected),
    },
  ],
  [5, { views: TENSION_VIEWS, draw: (c: PreviewContext) => tensionScene(c, false) }],
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
  [9, { views: [], draw: (c: PreviewContext) => networkScene(c, false) }],
  [
    10,
    {
      views: [
        ['network', 'Connections'],
        ['distribution', 'Distribution'],
      ],
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
      ],
      draw: ramificationScene,
    },
  ],
  [
    12,
    {
      views: [
        ['planform', 'Planform'],
        ['front', 'Front'],
      ],
      draw: reinforcementScene,
    },
  ],
  [15, { views: [], draw: (c: PreviewContext) => colorsScene(c, true) }],
  [16, { views: [], draw: (c: PreviewContext) => colorsScene(c, false) }],
  [17, { views: [], ribs: always, draw: additionalPointsScene }],
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
  [21, { views: [], ribs: always, draw: rodsScene }],
  [26, { views: [], draw: ventsScene }],
  [27, { views: [], draw: wingTipScene }],
  [
    29,
    {
      views: [
        ['both', 'Both'],
        ['upper', 'Extrados'],
        ['lower', 'Intrados'],
      ],
      ribs: always,
      draw: shapingScene,
    },
  ],
  [30, { views: [], ribs: always, draw: thicknessScene }],
  [31, { views: TENSION_VIEWS, draw: (c: PreviewContext) => tensionScene(c, true) }],
  [38, { views: [], ribs: always, draw: hvrHolesScene }],
]);
