export type Point = readonly [number, number];
export const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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
  readonly type: number | null;
  readonly parameters: readonly (number | null)[];
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
