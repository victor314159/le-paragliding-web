import type { Point3 } from '@lepara/geometry';

/**
 * How far top and bottom lean off the vertical, which is the cameras' up axis:
 * towards the side that keeps the leading edge at the top of the screen.
 */
const LEAN = 1e-3;

/** The views of a model: the direction each looks from, and its label. */
export const CAMERA_VIEWS: readonly (readonly [string, string, Point3])[] = [
  ['three-quarter', 'Three-quarter', [1.3, -1, -0.2]],
  ['front', 'Front', [0, -1, 0]],
  ['top', 'Top', [0, LEAN, -1]],
  ['bottom', 'Bottom', [0, -LEAN, 1]],
  ['side', 'Side', [1, 0, 0]],
];
