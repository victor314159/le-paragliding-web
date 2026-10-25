import { brakeDistributionScene, networkScene, ramificationScene } from './lines.ts';
import { additionalPointsScene, rodsScene, shapingScene } from './rods.ts';
import type { PreviewContext, PreviewScene } from './scene.ts';
import { markTypeScene, sewingMarksScene, sewingScene } from './sewing.ts';
import { hvrHolesScene, ventsScene, wingTipScene } from './special.ts';
import { reinforcementScene } from './structure.ts';

/** The views of a preview: value and label. */
export type PreviewViews = readonly (readonly [value: string, label: string])[];

/** A section's scene: its views, whether it draws the chosen rib, and the drawing. */
export interface SectionScene {
  readonly views: PreviewViews;
  readonly ribs?: boolean;
  draw(context: PreviewContext): PreviewScene;
}
/** The scenes of the sections of leparagliding.txt, by section number. */
export const SECTION_SCENES: ReadonlyMap<number, SectionScene> = new Map([
  [
    6,
    {
      views: [
        ['panels', 'Panels'],
        ['rib', 'Rib'],
        ['v-rib', 'V-rib'],
      ],
      ribs: true,
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
  [17, { views: [], ribs: true, draw: additionalPointsScene }],
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
  [21, { views: [], ribs: true, draw: rodsScene }],
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
      ribs: true,
      draw: shapingScene,
    },
  ],
  [38, { views: [], ribs: true, draw: hvrHolesScene }],
]);
