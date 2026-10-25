import type { LepAirfoil, LepDesign } from '@lepara/format';
import { finite, type Point } from './geometry.ts';

/** The sections a rib profile reads. */
export type ProfileSections = 'geometry' | 'airfoils' | 'thickness' | 'anchors';

export const ANCHOR_COLORS = ['#d04b47', '#b38900', '#13899d', '#6270c9', '#a55aba', '#4d913a'];
export const ANCHOR_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/** The part of a .txt airfoil a point belongs to: the parts share their end points, given to the first. */
export function airfoilPart(
  airfoil: { readonly extrados: number | null; readonly inlet: number | null },
  index: number,
): 'extrados' | 'inlet' | 'intrados' {
  if (index < (airfoil.extrados ?? 0)) return 'extrados';
  if (index < (airfoil.extrados ?? 0) + (airfoil.inlet ?? 0) - 1) return 'inlet';
  return 'intrados';
}

/** Interpolate the input contour at a chord position. No extrapolation across missing data. */
export function contourPoint(points: readonly Point[], x: number): Point | undefined {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    if (a[0] === b[0]) return [x, Math.min(a[1], b[1])];
    return [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  }
  return undefined;
}

export function ribProfile(
  design: Pick<LepDesign, ProfileSections>,
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
  const lowerStart = foil?.format === 'txt' ? Math.max(0, foil.extrados + foil.inlet - 2) : nose;
  const lower = points.slice(lowerStart);
  const upper = points.slice(0, foil?.format === 'txt' ? foil.extrados : nose + 1);
  const intakePoints =
    foil?.format === 'txt'
      ? points.slice(Math.max(0, foil.extrados - 1), foil.extrados + foil.inlet - 1)
      : [];
  if (foil?.format === 'dat' && finite(row?.intakeStart) && finite(row?.intakeEnd)) {
    const start = row.intakeStart / 100;
    const end = row.intakeEnd / 100;
    const a = contourPoint(lower, start);
    const b = contourPoint(lower, end);
    if (a && b) intakePoints.push(a, ...lower.filter(([x]) => x > start && x < end), b);
  }
  const anchor = design.anchors[index];
  const anchors = (anchor?.positions ?? []).flatMap((x, i) => {
    // F at 0 % marks a rib without brake anchor (the central rib in the examples).
    if (!finite(x) || x < 0 || x > 100 || (i === 5 ? x === 0 : i >= (anchor?.count ?? 0)))
      return [];
    const point = contourPoint(lower, x / 100);
    return [
      {
        name: ANCHOR_NAMES[i],
        color: ANCHOR_COLORS[i],
        x: x / 100,
        y: point?.[1] ?? 0,
        onSurface: !!point,
      },
    ];
  });
  const geometry = design.geometry.ribs[index];
  const chord =
    geometry && finite(geometry.yLE) && finite(geometry.yTE) && finite(design.geometry.wingScale)
      ? Math.abs(geometry.yTE - geometry.yLE) * design.geometry.wingScale
      : undefined;
  return {
    name: row?.airfoil,
    points,
    lower,
    upper,
    anchors,
    thickness,
    chord,
    open: row?.open,
    intake: intakePoints,
  };
}

/** An illustrative parallel offset of the input profile, before engine panel corrections. */
export function offsetProfile(input: readonly Point[], distance: number): Point[] {
  if (!finite(distance) || distance <= 0) return [];
  const points = input.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - input[i - 1][0], p[1] - input[i - 1][1]) > 1e-10,
  );
  if (
    points.length > 1 &&
    Math.hypot(
      points[0][0] - points[points.length - 1][0],
      points[0][1] - points[points.length - 1][1],
    ) < 1e-10
  )
    points.pop();
  if (points.length < 3) return [];
  const area = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0);
  if (Math.abs(area) < 1e-12) return [];
  const sign = Math.sign(area);
  const normals = points.map((a, i): Point => {
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(sign * (b[1] - a[1])) / length, (-sign * (b[0] - a[0])) / length];
  });
  return points.map((p, i): Point => {
    const a = normals[(i + points.length - 1) % points.length];
    const b = normals[i];
    const denominator = Math.max(0.25, 1 + a[0] * b[0] + a[1] * b[1]);
    return [
      p[0] + (distance * (a[0] + b[0])) / denominator,
      p[1] + (distance * (a[1] + b[1])) / denominator,
    ];
  });
}

/** Rib-local (chord, height) to front projection, using the engine's input rotations. */
export function frontPoint(
  design: Pick<LepDesign, 'geometry' | 'airfoils'>,
  index: number,
  point: Point,
): Point | undefined {
  const r = design.geometry.ribs[index];
  if (!r || ![r.yLE, r.yTE, r.xp, r.z, r.beta, r.rotationPoint].every(finite)) return undefined;
  const chord = r.yTE - r.yLE;
  const ribs = design.geometry.ribs;
  const center = ribs[0];
  const tip = ribs[ribs.length - 1];
  const centerChord =
    center && finite(center.yTE) && finite(center.yLE) ? center.yTE - center.yLE : chord;
  const tipChord = tip && finite(tip.yTE) && finite(tip.yLE) ? tip.yTE - tip.yLE : chord;
  const mode = design.geometry.washin;
  const fraction = centerChord === tipChord ? 0 : (centerChord - chord) / (centerChord - tipChord);
  const angle =
    mode.mode === 0
      ? r.washin
      : mode.mode === 2
        ? mode.centerAngle + (mode.maxAngle - mode.centerAngle) * fraction
        : mode.maxAngle * fraction;
  if (!finite(angle)) return undefined;
  const theta = (angle * Math.PI) / 180;
  const beta = (r.beta * Math.PI) / 180;
  const rotation = ((design.geometry.ribColumns === 11 ? (r.rotZ ?? 0) : 0) * Math.PI) / 180;
  const pivot = (r.rotationPoint * chord) / 100;
  const u = point[0] * chord;
  const v = -point[1] * chord - (design.airfoils[index]?.displacement ?? 0);
  const along = (u - pivot) * Math.cos(theta) + v * Math.sin(theta) + pivot;
  const height = (-u + pivot) * Math.sin(theta) + v * Math.cos(theta);
  const transverse = (((r.rotZPosition ?? 0) * chord) / 100 - along) * Math.sin(rotation);
  const result: Point = [
    r.xp + transverse * Math.cos(beta) + height * Math.sin(beta),
    r.z + transverse * Math.sin(beta) - height * Math.cos(beta),
  ];
  return result.every(finite) ? result : undefined;
}
