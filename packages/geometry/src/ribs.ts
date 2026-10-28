// The ribs in 3D, as section 6 of the engine places them: its scaled rib
// table (section 1 at Wing scale), washin, rotations and airfoils.
import type { LepAirfoil, LepDesign, RibGeometry } from '@lepara/format';

/** A point of an airfoil or a rib: chord position and height, in fractions of the chord, y down. */
export type Point = readonly [number, number];
/** A point in the engine's absolute coordinates: span X′, chord Y and Z down, at Wing scale. */
export type Point3 = readonly [number, number, number];

export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The columns of a rib table row that place a rib, in its units. */
export type RibPlacement = Pick<
  RibGeometry,
  'yLE' | 'yTE' | 'xp' | 'z' | 'beta' | 'rotationPoint' | 'rotZPosition'
>;

/**
 * Rib-local (chord, height) to absolute coordinates, as the engine places a
 * rib (§6.4 to 6.7), in the units of `r`: its washin and vertical-axis
 * rotation (deg), and the displacement of its airfoil, resolved. Anchors
 * (§12.3) take the displacement `after` the washin.
 */
export function placeOnRib(
  r: RibPlacement,
  washin: number,
  rotZ: number,
  displacement: number,
  point: Point,
  after = false,
): Point3 | undefined {
  if (![r.yLE, r.yTE, r.xp, r.z, r.beta, r.rotationPoint, washin].every(finite)) return undefined;
  const chord = r.yTE - r.yLE;
  const theta = (washin * Math.PI) / 180;
  const beta = (r.beta * Math.PI) / 180;
  const rotation = (rotZ * Math.PI) / 180;
  const pivot = (r.rotationPoint * chord) / 100;
  const position = ((r.rotZPosition ?? 0) * chord) / 100;
  const u = point[0] * chord;
  const v = -point[1] * chord - (after ? 0 : displacement);
  const along = (u - pivot) * Math.cos(theta) + v * Math.sin(theta) + pivot;
  const height = (-u + pivot) * Math.sin(theta) + v * Math.cos(theta) - (after ? displacement : 0);
  const transverse = (position - along) * Math.sin(rotation);
  const result: Point3 = [
    r.xp + transverse * Math.cos(beta) + height * Math.sin(beta),
    r.yLE + along * Math.cos(rotation) + position * (1 - Math.cos(rotation)),
    r.z + transverse * Math.sin(beta) - height * Math.cos(beta),
  ];
  return result.every(finite) ? result : undefined;
}

/**
 * The washin of rib `index` (deg), `rib(i,8)`. In modes 1 and 2 the engine
 * reads the rib table and computes washins in one loop, before the last
 * rib's chord: every rib but the last divides by the central chord, the
 * last by the central chord less its own; all before the wing tip.
 */
export function ribWashin({ geometry }: Pick<LepDesign, 'geometry'>, index: number) {
  const { washin, ribs } = geometry;
  const rib = ribs[index];
  if (!rib) return undefined;
  if (washin.mode === 0) return rib.washin;
  const chord = (r: RibGeometry | undefined) => (r ? r.yTE - r.yLE : Number.NaN);
  const center = chord(ribs[0]);
  const range = index === ribs.length - 1 ? center - chord(rib) : center;
  const fraction = (center - chord(rib)) / range;
  return washin.mode === 2
    ? (washin.maxAngle - washin.centerAngle) * fraction + washin.centerAngle
    : washin.maxAngle * fraction;
}

/**
 * The leading and trailing edges of rib `index` (Y), at Wing scale. An
 * angle wing tip (section 27, mode 1) moves the last rib's from the
 * previous rib's, at the angles of the last cell's edges.
 */
export function ribEdges(
  { geometry, wingTip }: Pick<LepDesign, 'geometry' | 'wingTip'>,
  index: number,
) {
  const { ribs, wingScale: scale } = geometry;
  const [r, previous] = [ribs[index], ribs[index - 1]];
  if (!r) return undefined;
  if (wingTip.mode !== 1 || index !== ribs.length - 1 || !previous)
    return { leading: r.yLE * scale, trailing: r.yTE * scale };
  const span = (r.x - previous.x) * scale;
  const tan = (angle: number) => Math.tan((angle * Math.PI) / 180);
  return {
    leading: previous.yLE * scale + span * tan(wingTip.angleLE),
    trailing: previous.yTE * scale + span * tan(wingTip.angleTE),
  };
}

/** The chord of rib `index` at Wing scale, `rib(i,5)`, after the wing tip. */
export function ribChord(design: Pick<LepDesign, 'geometry' | 'wingTip'>, index: number) {
  const edges = ribEdges(design, index);
  return edges ? edges.trailing - edges.leading : Number.NaN;
}

/**
 * Rib-local (chord, height) of rib `index` to absolute coordinates, at Wing
 * scale, with the engine's washin and wing tip; as an `anchor`, displaced
 * after the washin (§12.3). Like the engine, a rotation point of 0 is
 * 0.01 % and a central X′ of 0 is 0.01 (§3).
 */
export function ribPoint(
  design: Pick<LepDesign, 'geometry' | 'airfoils' | 'wingTip'>,
  index: number,
  point: Point,
  anchor = false,
): Point3 | undefined {
  const { ribs, wingScale: scale, ribColumns } = design.geometry;
  const r = ribs[index];
  const edges = ribEdges(design, index);
  const washin = ribWashin(design, index);
  if (!r || !edges || !finite(scale) || !finite(washin)) return undefined;
  const scaled: RibPlacement = {
    yLE: edges.leading,
    yTE: edges.trailing,
    xp: (index === 0 && r.xp === 0 ? 0.01 : r.xp) * scale,
    z: r.z * scale,
    beta: r.beta,
    rotationPoint: r.rotationPoint === 0 ? 0.01 : r.rotationPoint,
    rotZPosition: r.rotZPosition,
  };
  const rotZ = ribColumns === 11 ? (r.rotZ ?? 0) : 0;
  const displacement = (design.airfoils[index]?.displacement ?? 0) * scale;
  return placeOnRib(scaled, washin, rotZ, displacement, point, anchor);
}

/**
 * The airfoil of rib `index` as the engine reads it, its heights times the
 * thickness coefficient of section 30, as rib-local (chord, height) points
 * from the trailing edge over the extrados; `extrados`, its number of
 * extrados points (`np(i,2)`), to its nose for a .dat airfoil.
 */
export function ribAirfoil(
  design: Pick<LepDesign, 'airfoils' | 'thickness'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  index: number,
) {
  const row = design.airfoils[index];
  const foil = row && airfoils.get(row.airfoil);
  const coefficient = design.thickness.mode === 1 ? design.thickness.ribs[index] : 1;
  const thickness = finite(coefficient) ? coefficient : 1;
  const points: Point[] = (foil?.points ?? [])
    .filter(([x, y]) => finite(x) && finite(y))
    .map(([x, y]) => [x, -y * thickness]);
  let nose = 0;
  points.forEach((p, i) => {
    if (p[0] < points[nose][0]) nose = i;
  });
  return {
    foil,
    points,
    thickness,
    extrados: foil?.format === 'txt' ? foil.extrados : nose + 1,
  };
}
