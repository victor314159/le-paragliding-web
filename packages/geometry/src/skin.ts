// The engine's panels3d and tessella, fed by its developed/corrected panels.
import type { LepAirfoil, LepDesign } from '@lepara/format';
import { ribChord, type Point3 } from './ribs.ts';
import { skinRibs, type SkinProfileSections } from './skin-ribs.ts';
import { skinPatterns, type SkinPatternSections } from './skin-patterns.ts';

export type SkinSections =
  SkinProfileSections | SkinPatternSections | 'specialParameters' | 'glueVents';

/** A right-half panel of the engine's skin mesh, rows from its inner rib outwards. */
export interface BalloonedPanel {
  /** Outer rib index from 0; 0 is the central half cell, if any. */
  readonly cell: number;
  readonly surface: 'extrados' | 'intrados' | 'inlet';
  readonly rows: readonly (readonly {
    readonly point: Point3;
    readonly span: number;
    readonly chord: number;
  }[])[];
}

const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Point3, b: Point3, k = 1): Point3 => [
  a[0] + k * b[0],
  a[1] + k * b[1],
  a[2] + k * b[2],
];
const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (p: Point3) => Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
const unit = (p: Point3): Point3 => {
  const d = norm(p);
  return [p[0] / d, p[1] / d, p[2] / d];
};

/** Section 37, code 1291: the subdivisions across each panel, 12 by default. */
export function skinSubdivisions(design: Pick<LepDesign, 'specialParameters'>): number {
  return design.specialParameters.mode === 1
    ? design.specialParameters.entries.reduce((n, p) => (p.code === 1291 ? p.value : n), 12)
    : 12;
}

/** panels3d: retain the original 301-step search and its 0.01 cm flat threshold. */
function arcHeight(s: number, sm: number): number {
  const max = 0.5 * Math.sqrt(Math.abs(sm * sm - s * s));
  const q = (sm * s) / (8 * max + 0.00001);
  const range = q - max;
  for (let l = 0; l <= 300; l++) {
    const h = ((l + 0.00001) / 300) * range * 4;
    const theta = Math.atan((0.5 * s) / h);
    const radius = sm / (2 * theta);
    if (2 * radius * Math.sin(theta) >= s) return Math.abs(sm - s) <= 0.01 ? 0 : radius - h;
  }
  return 0;
}

/**
 * The skin in lep-3d-surfaces.dxf (§8.5, panels3d, tessella). The Fortran
 * does not pinch this tessellation over miniribs. Shaping cuts do not change
 * these arcs: their lengths come from the panels before the shaping cuts.
 */
export function balloonedSkin(
  design: Pick<LepDesign, SkinSections>,
  airfoils: ReadonlyMap<string, LepAirfoil>,
): BalloonedPanel[] {
  const ribs = skinRibs(design, airfoils);
  if (!ribs.length) return [];
  const patterns = skinPatterns(design, ribs);
  const heights = ribs.slice(1).map((rib, i) =>
    rib.points.map((p, j) => {
      const lower = j >= rib.upper + rib.inlet - 1;
      const flat = (lower ? patterns.lower : j >= rib.upper ? patterns.inlet : patterns.upper)[i];
      const a = flat.left[j],
        b = flat.right[j];
      if (!a || !b) return 0;
      return arcHeight(
        norm(sub(p, ribs[i].points[j])),
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2),
      );
    }),
  );
  // §8.5.0.1: upstream replaces hautok(0,:) and hautok(1,:) with hautok(2,:).
  if (heights[1]) heights[0] = heights[1];
  const count = skinSubdivisions(design);
  if (!Number.isInteger(count) || count < 1 || count > 98) return [];
  const panels: BalloonedPanel[] = [];
  for (let i = 1; i < ribs.length; i++) {
    const rib = ribs[i],
      inner = ribs[i - 1];
    if (i === 1 && design.geometry.ribs[0].x * design.geometry.wingScale < 0.01) continue;
    const innerChord = ribChord(design, Math.max(0, i - 2)),
      outerChord = ribChord(design, i - 1);
    const median = rib.points.map((p, j) => add(p, sub(inner.points[j], p), 0.5));
    const first = median[1],
      mid = median[Math.trunc((1 + rib.upper) / 2)],
      last = median[rib.upper];
    const plane = unit(cross(sub(mid, first), sub(last, first)));
    const normals = median.map((p, j) => {
      if (j === 0) return [0, 0, 0] as Point3;
      const prev = median[Math.max(1, j - 1)],
        next = median[Math.min(j + 1, median.length - 1)];
      const origin = j === median.length - 1 ? prev : p;
      return unit(cross(sub(next, prev), sub(add(origin, plane, 10), prev)));
    });
    for (const surface of ['extrados', 'inlet', 'intrados'] as const) {
      if (surface === 'intrados' && design.geometry.paragliderType === 'ss') continue;
      if (surface === 'inlet') {
        const type = design.glueVents.mode === 1 ? design.glueVents.ribs[i - 1]?.type : 0;
        if (design.airfoils[i - 1]?.open !== 0 && type !== 1 && type !== -1) continue;
      }
      const from =
        surface === 'extrados' ? 1 : surface === 'inlet' ? rib.upper : rib.upper + rib.inlet - 1;
      const to =
        surface === 'extrados'
          ? rib.upper
          : surface === 'inlet'
            ? rib.upper + rib.inlet - 1
            : rib.points.length - 1;
      if (to <= from) continue;
      const rows = Array.from({ length: count + 1 }, (_, k) =>
        Array.from({ length: to - from + 1 }, (_, n) => {
          const j = from + n,
            a = inner.points[j],
            b = rib.points[j];
          const d = norm(sub(a, b)),
            h = heights[i - 1][j];
          let t = k / count,
            lift = 0;
          if (h >= 0.01) {
            const q = (d * d) / (8 * h) - 0.5 * h,
              R = q + h;
            const theta = Math.atan(q / (0.5 * d));
            const alpha = theta + ((Math.PI - 2 * theta) * (count - k)) / count;
            const x = 0.5 * d - R * Math.cos(alpha);
            t = 1 - x / d;
            lift = R * Math.sin(alpha) - q;
          }
          const point = add(add(a, sub(b, a), t), normals[j], lift);
          const chord =
            100 *
            (1 - ((inner.local[j][0] / innerChord) * (1 - t) + (rib.local[j][0] / outerChord) * t));
          return { point, span: i === 1 ? 2 * t - 1 : t, chord };
        }),
      );
      const right = i === 1 ? rows.slice(Math.ceil(count / 2)) : rows;
      if (i === 1 && count % 2) {
        const before = rows[Math.floor(count / 2)],
          after = rows[Math.ceil(count / 2)];
        right.unshift(
          before.map((a, j) => ({
            point: add(a.point, sub(after[j].point, a.point), 0.5),
            span: 0,
            chord: (a.chord + after[j].chord) / 2,
          })),
        );
      }
      if (right.every((row) => row.every((v) => v.point.every(Number.isFinite))))
        panels.push({ cell: i - 1, surface, rows: right });
    }
  }
  return panels;
}
