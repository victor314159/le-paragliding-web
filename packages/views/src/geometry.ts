import type { Point3 } from '@lepara/geometry';

export type Point = readonly [number, number];

/** Circular tube around a polyline; points and diameter use the same units. */
export function tubeSurface(points: readonly Point3[], diameter: number): Point3[][] | undefined {
  if (!Number.isFinite(diameter) || diameter <= 0) return undefined;
  return sweptSurface(
    points,
    Array.from({ length: 13 }, (_, k): Point => {
      const angle = (k * Math.PI) / 6;
      return [(diameter / 2) * Math.cos(angle), (diameter / 2) * Math.sin(angle)];
    }),
  );
}

/**
 * A cross section swept along a polyline, a row per point: its (u, v) offsets
 * in a frame perpendicular to the polyline, carried along it without twist.
 */
export function sweptSurface(
  points: readonly Point3[],
  section: readonly Point[],
): Point3[][] | undefined {
  // Repeated contour endpoints must not create zero-length tangents.
  const path = points.filter((p, i) => !i || p.some((v, axis) => v !== points[i - 1][axis]));
  if (path.length < 2) return undefined;
  let normal: number[] | undefined;
  return path.map((point, i) => {
    const before = path[Math.max(0, i - 1)],
      after = path[Math.min(path.length - 1, i + 1)];
    let tangent = after.map((v, axis) => v - before[axis]);
    let length = Math.hypot(...tangent);
    if (!length) {
      tangent = point.map((v, axis) => v - before[axis]);
      length = Math.hypot(...tangent);
    }
    const [x, y, z] = tangent.map((v) => v / length);
    const along = normal ? normal[0] * x + normal[1] * y + normal[2] * z : 0;
    let u = normal?.map((v, axis) => v - along * [x, y, z][axis]);
    if (!u || Math.hypot(...u) < 1e-8) u = Math.abs(z) < 0.9 ? [-y, x, 0] : [0, -z, y];
    const norm = Math.hypot(...u);
    const frame = u.map((v) => v / norm);
    normal = frame;
    const [a, b, c] = frame;
    const binormal = [y * c - z * b, z * a - x * c, x * b - y * a];
    return section.map(([u, v]): Point3 => {
      const at = (axis: number) => point[axis] + frame[axis] * u + binormal[axis] * v;
      return [at(0), at(1), at(2)];
    });
  });
}
export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A point of the right half wing on the left half. */
export const flipX = ([x, y]: Point): Point => [-x, y];

/** Both halves of a wing from the left tip, given its right half from the center. */
export const mirrored = <T>(half: readonly T[], flip: (item: T) => T): T[] => [
  ...[...half].reverse().map(flip),
  ...half,
];

export function pointPath(points: readonly Point[], close = false): string {
  if (!points.length) return '';
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ') + (close ? ' Z' : '');
}

export function previewBounds(points: readonly Point[], minimum = 1) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(0, ...xs);
  const right = Math.max(minimum, ...xs);
  const top = Math.min(0, ...ys);
  const bottom = Math.max(0, ...ys);
  const padding = Math.max(right - left, bottom - top, minimum) * 0.05;
  return {
    left,
    right,
    top,
    bottom,
    viewBox: `${left - padding} ${top - padding} ${right - left + 2 * padding} ${Math.max(bottom - top, minimum * 0.1) + 2 * padding}`,
  };
}

/** Circular fillets tangent to the two sides meeting at each polygon corner. */
function roundedPolygon(points: readonly Point[], radius: number): string | undefined {
  if (radius === 0) return pointPath(points, true);
  if (radius < 0) return undefined;
  const corners = points.map((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const a = [previous[0] - point[0], previous[1] - point[1]];
    const b = [next[0] - point[0], next[1] - point[1]];
    const la = Math.hypot(...a);
    const lb = Math.hypot(...b);
    const angle = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / la / lb)));
    const distance = radius / Math.tan(angle / 2);
    return {
      start: [point[0] + (a[0] / la) * distance, point[1] + (a[1] / la) * distance],
      end: [point[0] + (b[0] / lb) * distance, point[1] + (b[1] / lb) * distance],
      distance,
      length: lb,
      sweep: a[0] * b[1] - a[1] * b[0] < 0 ? 1 : 0,
    };
  });
  if (
    corners.some(
      (corner, i) =>
        !finite(corner.distance) ||
        corner.distance + corners[(i + 1) % corners.length].distance > corner.length + 1e-10,
    )
  )
    return undefined;
  return (
    corners
      .map(
        (corner, i) =>
          `${i ? 'L' : 'M'}${corner.start.join(',')} A${radius},${radius} 0 0 ${corner.sweep} ${corner.end.join(',')}`,
      )
      .join(' ') + ' Z'
  );
}

/** Normalized SVG coordinates, matching section 6.12.5 of the 3.29 engine. */
export function holeOutline(hole: {
  readonly type: number;
  readonly parameters: readonly number[];
}): { path: string; points: readonly Point[] } | undefined {
  const [px, py, width, height, rotation, corner] = hole.parameters;
  if (
    !finite(px) ||
    !finite(py) ||
    !finite(width) ||
    !finite(height) ||
    !finite(rotation) ||
    width === 0 ||
    height === 0
  )
    return undefined;
  const x = px / 100;
  const y = -py / 100;
  const a = width / 100;
  const b = height / 100;
  if (hole.type === 1) {
    // ellipse() consumes semi-axes and an angle in radians, without conversion.
    const points = Array.from({ length: 121 }, (_, i): Point => {
      const angle = (i / 120) * 2 * Math.PI;
      return [
        x + a * Math.cos(angle) * Math.cos(rotation) - b * Math.sin(angle) * Math.sin(rotation),
        y + a * Math.cos(angle) * Math.sin(rotation) + b * Math.sin(angle) * Math.cos(rotation),
      ];
    });
    return { path: pointPath(points, true), points };
  }
  if ((hole.type !== 3 && hole.type !== 4) || !finite(corner)) return undefined;
  const angle = (rotation * Math.PI) / 180;
  const sign = Math.sign(a);
  const second: Point = [x + a * Math.cos(angle), y - Math.abs(a) * Math.sin(angle)];
  const points: Point[] =
    hole.type === 3
      ? [[x, y], second, [x, y - b]]
      : [
          [x, y],
          second,
          [second[0] - sign * b * Math.sin(angle), second[1] - b * Math.cos(angle)],
          [x - sign * b * Math.sin(angle), y - b * Math.cos(angle)],
        ];
  const path = roundedPolygon(points, corner / 100);
  return path && !/NaN|Infinity/.test(path) ? { path, points } : undefined;
}

/** Rib numbers set off their ribs along `direction`, thinned where they would overlap; `keep` always shows. */
export function ribNumbers(
  ribs: readonly { index: number; point: Point; direction: Point }[],
  fontSize: number,
  keep?: number,
) {
  const labels = ribs.map(({ index, point, direction }) => {
    const length = Math.hypot(direction[0], direction[1]) || 1;
    return {
      index,
      text: `${index + 1}`,
      point: [
        point[0] + (direction[0] / length) * fontSize,
        point[1] + (direction[1] / length) * fontSize,
      ] as Point,
    };
  });
  const shown = labels.filter((l) => l.index === keep);
  for (const l of labels)
    if (
      l.index !== keep &&
      shown.every(
        (s) => Math.hypot(s.point[0] - l.point[0], s.point[1] - l.point[1]) >= fontSize * 1.5,
      )
    )
      shown.push(l);
  return shown;
}

/** Centroid of points, to set labels outward from a drawing. */
export function centroid(points: readonly Point[]): Point {
  const n = points.length || 1;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}
