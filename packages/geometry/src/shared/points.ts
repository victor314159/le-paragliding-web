/** A point of an airfoil or a rib: chord position and height, in fractions of the chord, y down. */
export type Point = readonly [number, number];
/** A point in the engine's absolute coordinates: span X′, chord Y and Z down, at Wing scale. */
export type Point3 = readonly [number, number, number];

export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
