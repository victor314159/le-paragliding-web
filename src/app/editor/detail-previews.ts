import { brakeDistributionScene, networkScene, ramificationScene } from './preview-lines';
import { additionalPointsScene, rodsScene, shapingScene } from './preview-profiles';
import { markTypeScene, sewingMarksScene, sewingScene } from './preview-sewing';
import { hvrHolesScene, ventsScene, wingTipScene } from './preview-special';
import { reinforcementScene } from './preview-structure';
import type { PreviewContext, PreviewScene } from './preview-scene';

/** The views of a preview: value and label. */
export type PreviewViews = readonly (readonly [value: string, label: string])[];

interface DetailPreviewDefinition {
  views: PreviewViews;
  ribs?: boolean;
  draw(context: PreviewContext): PreviewScene;
}
export const DETAIL_PREVIEWS: ReadonlyMap<number, DetailPreviewDefinition> = new Map([
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
