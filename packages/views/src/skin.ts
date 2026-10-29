import type { Point3 } from '@lepara/geometry';
import type { SkinPanel, SkinVertex } from './model.ts';

/** A line across a panel, in % chord from TE on its inner and outer ribs. */
export interface SkinCut {
  readonly left: number;
  readonly right: number;
}
const distance = (p: SkinVertex, cut: SkinCut) =>
  p.chord - (cut.left + (cut.right - cut.left) * p.span);
const between = (a: SkinVertex, b: SkinVertex, t: number): SkinVertex => ({
  point: [
    a.point[0] + (b.point[0] - a.point[0]) * t,
    a.point[1] + (b.point[1] - a.point[1]) * t,
    a.point[2] + (b.point[2] - a.point[2]) * t,
  ],
  span: a.span + (b.span - a.span) * t,
  chord: a.chord + (b.chord - a.chord) * t,
});

/** The same triangles as the 3D renderer; clipped overlays remain on their planes. */
function* triangles(panel: SkinPanel): Generator<readonly SkinVertex[]> {
  for (let r = 1; r < panel.rows.length; r++)
    for (let k = 1; k < panel.rows[r].length; k++) {
      const a = panel.rows[r - 1][k - 1],
        b = panel.rows[r][k - 1];
      const c = panel.rows[r - 1][k],
        d = panel.rows[r][k];
      yield [a, b, c];
      yield [c, b, d];
    }
}

/** Clip a polygon in span/chord coordinates, interpolating its 3D points on the skin. */
function clip(points: readonly SkinVertex[], cut: SkinCut, sign: number): SkinVertex[] {
  return points.flatMap((b, i) => {
    const a = points[(i + points.length - 1) % points.length];
    const da = sign * distance(a, cut),
      db = sign * distance(b, cut);
    const crossing = da >= 0 !== db >= 0 ? [between(a, b, da / (da - db))] : [];
    return db >= 0 ? [...crossing, b] : crossing;
  });
}

/** Triangles covering a color region, exactly on the straight or ballooned skin mesh. */
export function skinRegion(panel: SkinPanel, from: SkinCut, to: SkinCut): Point3[][][] {
  const rows: Point3[][][] = [];
  for (const triangle of triangles(panel)) {
    const polygon = clip(clip(triangle, from, 1), to, -1);
    for (let i = 2; i < polygon.length; i++) {
      const [a, b, c] = [polygon[0].point, polygon[i - 1].point, polygon[i].point];
      // A two-by-two grid represents this triangle and a degenerate second triangle.
      rows.push([
        [a, b],
        [c, b],
      ]);
    }
  }
  return rows;
}

/** Segments of a cut following the actual skin triangles, including the minirib pinch. */
export function skinCut(panel: SkinPanel, cut: SkinCut): Point3[][] {
  const segments: Point3[][] = [];
  for (const triangle of triangles(panel)) {
    const points: SkinVertex[] = [];
    const add = (point: SkinVertex) => {
      if (
        !points.some((p) => Math.abs(p.span - point.span) + Math.abs(p.chord - point.chord) < 1e-8)
      )
        points.push(point);
    };
    triangle.forEach((a, i) => {
      const b = triangle[(i + 1) % triangle.length];
      const da = distance(a, cut),
        db = distance(b, cut);
      if (Math.abs(da) < 1e-8) add(a);
      if (da * db < 0) add(between(a, b, da / (da - db)));
    });
    if (points.length === 2) segments.push(points.map((p) => p.point));
  }
  return segments;
}
