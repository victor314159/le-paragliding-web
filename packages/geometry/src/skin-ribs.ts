import type { LepAirfoil, LepDesign } from '@lepara/format';
import { ribAirfoil, ribChord, ribPoint, type Point, type Point3 } from './ribs.ts';

export type SkinProfileSections = 'geometry' | 'wingTip' | 'airfoils' | 'thickness';

/** A rib at the airfoil's own points, from 1 as in the engine (0 unused). */
export interface SkinRib {
  /** Its airfoil scaled to its chord (cm), in its plane. */
  readonly local: readonly Point[];
  /** Placed in 3D, at Wing scale. */
  readonly points: readonly Point3[];
  /** The last extrados point, where the air inlet starts. */
  readonly upper: number;
  /** The points of the air inlet. */
  readonly inlet: number;
}

/** datair: retain the engine's moved points and counts, including its unfinished insertion. */
function datProfile(foil: Extract<LepAirfoil, { format: 'dat' }>, start: number, end: number) {
  const points: Point[] = foil.points.map(([x, y]) => [x, -y]);
  let first = 0,
    last = 0,
    addedStart = 0,
    addedEnd = 0;
  const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (let j = 0; j < points.length - 1; j++) {
    for (const boundary of ['start', 'end'] as const) {
      const x = (boundary === 'start' ? start : end) / 100;
      const [a, b] = [points[j], points[j + 1]];
      if (boundary === 'start' && start < 0) {
        if (a[0] >= x && b[0] < x && a[1] < 0) first = j + 1;
        continue;
      }
      if (a[0] > x || b[0] <= x || a[1] < 0) continue;
      if (boundary === 'start') first = j + 1;
      else last = j + 1;
      // xm/xb are implicit single-precision variables in datair.
      const slope = Math.fround((b[1] - a[1]) / (b[0] - a[0]));
      const intercept = Math.fround(a[1] - slope * a[0]);
      const p: Point = [x, slope * x + intercept];
      const d1 = distance(a, p),
        d2 = distance(b, p);
      const mean =
        (distance(a, points[j - 1] ?? [0, 0]) + d1 + d2 + distance(b, points[j + 2] ?? [0, 0])) / 3;
      if (d1 < mean / 5) points[j] = p;
      if (d2 < mean / 5) points[j + 1] = p;
      if (d1 >= mean / 5 && d2 >= mean / 5) {
        if (boundary === 'start') addedStart = 1;
        else addedEnd = 1;
      }
    }
  }
  // remapcont changes only a temporary copy; added points remain zeros upstream.
  for (let j = 0; j < addedStart + addedEnd; j++) points.push([0, 0]);
  return { points, upper: first + addedStart, inlet: last - first + 1 };
}

/** Native airfoil stations, with the engine's rib numbering and mirror rib 0. */
export function skinRibs(
  design: Pick<LepDesign, SkinProfileSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): SkinRib[] {
  const ribs: SkinRib[] = [];
  design.geometry.ribs.forEach((_, index) => {
    const profile = ribAirfoil(design, airfoils, index);
    if (!profile.foil) return;
    const data =
      profile.foil.format === 'txt'
        ? { points: profile.points, upper: profile.foil.extrados, inlet: profile.foil.inlet }
        : datProfile(
            profile.foil,
            design.airfoils[index].intakeStart,
            design.airfoils[index].intakeEnd,
          );
    if (data.upper < 2 || data.inlet < 1 || data.upper + data.inlet - 1 > data.points.length)
      return;
    const points: Point3[] = [[0, 0, 0]];
    for (const p of data.points) {
      const placed = ribPoint(design, index, p);
      if (!placed) return;
      points.push(placed);
    }
    const chord = ribChord(design, index);
    ribs.push({
      local: [[0, 0], ...data.points.map(([x, y]): Point => [x * chord, y * chord])],
      points,
      upper: data.upper,
      inlet: data.inlet,
    });
  });
  if (ribs.length !== design.geometry.ribs.length || !ribs.length) return [];
  // Drafts may temporarily have incompatible airfoil stations while editing.
  if (
    ribs.some(
      (r) =>
        r.points.length !== ribs[0].points.length ||
        r.upper !== ribs[0].upper ||
        r.inlet !== ribs[0].inlet,
    )
  )
    return [];
  return [{ ...ribs[0], points: ribs[0].points.map(([x, y, z]) => [-x, y, z]) }, ...ribs];
}
