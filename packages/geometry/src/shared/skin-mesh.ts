import type { LepDesign } from '@lepara/format';
import type { Point3 } from './points.ts';
import type { BalloonedPanel, SkinSections, SkinRib, SkinPatterns } from './skin-types.ts';
import { add, sub, norm } from './vectors.ts';

/** Internal model policies. No policy is chosen or mutated by the assembler. */
export interface SkinModel {
  /** The arc height of each station, by cell (`skinHeights`). */
  readonly heights: readonly (readonly number[])[];
  subdivisions?(cell: number, count: number): number;
  /** Subdivision `k` of `count` across a station of the given chord and height. */
  arc(
    chord: number,
    height: number,
    k: number,
    count: number,
    station: { cell: number; surface: BalloonedPanel['surface']; chord: number },
  ): { span: number; lift: number };
  normals(
    median: readonly Point3[],
    inner: readonly Point3[],
    outer: readonly Point3[],
    upper: number,
  ): Point3[];
}

/** Section 37, code 1291: the subdivisions across each panel, 12 by default. */
export function skinSubdivisions(design: Pick<LepDesign, 'specialParameters'>): number {
  return design.specialParameters.mode === 1
    ? design.specialParameters.entries.reduce((n, p) => (p.code === 1291 ? p.value : n), 12)
    : 12;
}

/** The arc height of each station, by cell, from its rib spacing and developed fabric length. */
export function skinHeights(
  ribs: readonly SkinRib[],
  patterns: SkinPatterns,
  height: (chord: number, length: number) => number,
): number[][] {
  return ribs.slice(1).map((rib, i) =>
    rib.points.map((p, j) => {
      const lower = j >= rib.upper + rib.inlet - 1;
      const flat = (lower ? patterns.lower : j >= rib.upper ? patterns.inlet : patterns.upper)[i];
      const a = flat.left[j],
        b = flat.right[j];
      if (!a || !b) return 0;
      return height(
        norm(sub(p, ribs[i].points[j])),
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2),
      );
    }),
  );
}

/** Assemble a model's arcs into right-half panels; clip the central cell on the axis. */
export function buildSkin(
  design: Pick<LepDesign, SkinSections>,
  ribs: readonly SkinRib[],
  model: SkinModel,
): BalloonedPanel[] {
  if (!ribs.length) return [];
  const subdivisions = skinSubdivisions(design);
  if (!Number.isInteger(subdivisions) || subdivisions < 1 || subdivisions > 98) return [];
  const panels: BalloonedPanel[] = [];
  for (let i = 1; i < ribs.length; i++) {
    const rib = ribs[i],
      inner = ribs[i - 1];
    if (i === 1 && design.geometry.ribs[0].x * design.geometry.wingScale < 0.01) continue;
    const count = model.subdivisions?.(i - 1, subdivisions) ?? subdivisions;
    const innerChord = inner.chord,
      outerChord = rib.chord;
    const median = rib.points.map((p, j) => add(p, sub(inner.points[j], p), 0.5));
    const normals = model.normals(median, inner.points, rib.points, rib.upper);
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
            h = model.heights[i - 1][j];
          const middleChord =
            100 * (1 - (inner.local[j][0] / innerChord + rib.local[j][0] / outerChord) / 2);
          const { span: t, lift } = model.arc(d, h, k, count, {
            cell: i - 1,
            surface,
            chord: middleChord,
          });
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
        panels.push({ cell: i - 1, surface, from, rows: right });
    }
  }
  return panels;
}
