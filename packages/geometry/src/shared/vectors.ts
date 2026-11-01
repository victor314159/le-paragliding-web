import type { Point3 } from './points.ts';
export const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Point3, b: Point3, k = 1): Point3 => [
  a[0] + k * b[0],
  a[1] + k * b[1],
  a[2] + k * b[2],
];
export const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (p: Point3) => Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
export const unit = (p: Point3): Point3 => {
  const d = norm(p);
  return [p[0] / d, p[1] / d, p[2] / d];
};
