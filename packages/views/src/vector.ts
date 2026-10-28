import type { Point3 } from '@lepara/geometry';

/** A vector in 3D, or a point. */
export type Vector = readonly [number, number, number];

export const sub = (a: Vector, b: Vector): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const distance = (a: Vector, b: Vector) => Math.hypot(...sub(a, b));
export const unit = (a: Vector): Point3 => {
  const length = Math.hypot(...a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
/** The point `t` of the way from `a` to `b`. */
export const lerp3 = (a: Vector, b: Vector, t: number): Point3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
