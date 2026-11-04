// The airfoil stations as the reference reads them, a .dat airfoil
// corrected: see "Airfoil stations" in MODELS.md.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import type { Point } from '../shared/points.ts';
import { double } from './double.ts';
import { ribAirfoil } from '../fortran/ribs.ts';
import { ribStations } from '../fortran/skin-ribs.ts';

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * datair's inlet ends on a .dat airfoil's points `points` (v down, as the
 * engine holds them): at each end's chord position on the intrados, the
 * nearer point moved onto it if within a fifth of the mean segment, else a
 * point inserted there; the inlet from its start's point to its end's.
 */
function datInlet(points: Point[], start: number, end: number) {
  const at = (x: number, from: number, negative: boolean) => {
    for (let j = from; j + 1 < points.length; j++) {
      const [a, b] = [points[j], points[j + 1]];
      if (negative) {
        if (a[0] >= x && b[0] < x && a[1] < 0) return j;
        continue;
      }
      if (a[0] > x || b[0] <= x || a[1] < 0) continue;
      const p: Point = [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
      const [d1, d2] = [distance(a, p), distance(b, p)];
      const mean =
        (distance(a, points[j - 1] ?? a) + d1 + d2 + distance(b, points[j + 2] ?? b)) / 3;
      if (d1 < mean / 5) return ((points[j] = p), j);
      if (d2 < mean / 5) return ((points[j + 1] = p), j + 1);
      points.splice(j + 1, 0, p);
      return j + 1;
    }
    return undefined;
  };
  const first = at(start / 100, 0, start < 0);
  const last = first === undefined ? undefined : at(end / 100, first, false);
  return first === undefined || last === undefined
    ? undefined
    : { points, upper: first + 1, inlet: last - first + 1 };
}

/**
 * The stations of rib `index` as the reference's, a .dat airfoil scaled by
 * section 33's thickness coefficient as a .txt one, its inlet ends inserted
 * where no point is near them.
 */
export function stations(
  design: Pick<LepDesign, 'airfoils' | 'thickness'>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
  index: number,
  round: (value: number) => number = double,
) {
  const { foil, points } = ribAirfoil(design, airfoils, index);
  if (foil?.format !== 'dat') return ribStations(design, airfoils, index, round);
  const row = design.airfoils[index];
  return datInlet([...points], row.intakeStart, row.intakeEnd);
}
