import type { Point3 } from '@lepara/geometry';

/** The views of a model: the direction each looks from, and its label. */
export const CAMERA_VIEWS: readonly (readonly [string, string, Point3])[] = [
  ['perspective', 'Three-quarter', [1.3, -1, -0.2]],
  ['front', 'Front', [0, -1, 0]],
  ['top', 'Top', [0, 0, -1]],
  ['side', 'Side', [1, 0, 0]],
];
