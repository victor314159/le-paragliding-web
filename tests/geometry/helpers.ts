import { readFileSync } from 'node:fs';
import type { Point } from '@lepara/geometry/fortran-3.29';

/** The lines of lep-out.txt, the engine's report, of an oracle design. */
export const report = (id: string) =>
  readFileSync(`oracle/reference/${id}/lep-out.txt`, 'latin1').split('\n');

/** The rows of numbers of a report after `title`, up to the first other line. */
export function table(lines: readonly string[], title: string, columns: number) {
  const rows: number[][] = [];
  for (const line of lines.slice(lines.findIndex((l) => l.includes(title)) + 1)) {
    const row = line.trim().split(/\s+/).map(Number);
    if (row.length === columns && row.every(Number.isFinite)) rows.push(row);
    else if (rows.length) break;
  }
  return rows;
}

export type Segment = readonly [Point, Point];

/** The segments of a DXF, of color `color` or all: its lines, and its polylines' edges. */
export function dxfSegments(text: string, color?: number): Segment[] {
  const codes = text.split('\n').map((line) => line.trim());
  const result: Segment[] = [];
  const values = (i: number) => {
    const map = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      map.set(codes[j], Number(codes[j + 1]));
    return map;
  };
  let vertices: Point[] | undefined;
  codes.forEach((code, i) => {
    if (codes[i - 1] !== '0') return;
    if (code === 'LINE') {
      const v = values(i);
      if (color === undefined || v.get('62') === color)
        result.push([
          [v.get('10')!, v.get('20')!],
          [v.get('11')!, v.get('21')!],
        ]);
    } else if (code === 'POLYLINE')
      vertices = color === undefined || values(i).get('62') === color ? [] : undefined;
    else if (code === 'VERTEX' && vertices) {
      const v = values(i);
      vertices.push([v.get('10')!, v.get('20')!]);
    } else if (code === 'SEQEND' && vertices) {
      vertices.slice(1).forEach((p, k) => result.push([vertices![k], p]));
      vertices = undefined;
    }
  });
  return result;
}

export const near = (a: Point, b: Point, tolerance: number) =>
  Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;

/** Whether `p` lies on segment `cd`, to the DXF's precision. */
export function covers(c: Point, d: Point, p: Point) {
  const [dx, dy] = [d[0] - c[0], d[1] - c[1]];
  const length = Math.hypot(dx, dy);
  if (length < 3e-3) return near(c, p, 3e-3);
  const along = ((p[0] - c[0]) * dx + (p[1] - c[1]) * dy) / length;
  const across = Math.abs((p[1] - c[1]) * dx - (p[0] - c[0]) * dy) / length;
  return across <= 3e-3 && along >= -3e-3 && along <= length + 3e-3;
}

/** The engine's points of color `color` or all (point): POINTs, or CIRCLEs (section 20, F12.2). */
export function dxfDots(text: string, color?: number): Point[] {
  const codes = text.split('\n').map((line) => line.trim());
  return codes.flatMap((code, i): Point[] => {
    if ((code !== 'CIRCLE' && code !== 'POINT') || codes[i - 1] !== '0') return [];
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    return color === undefined || values.get('62') === color
      ? [[values.get('10')!, values.get('20')!]]
      : [];
  });
}

/** The centres of the engine's crosses (pointg): a horizontal and a vertical segment of one midpoint. */
export function crossCentres(segments: readonly Segment[]): Point[] {
  const middle = ([c, d]: Segment): Point => [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
  const flat = (s: Segment, axis: 0 | 1) =>
    Math.abs(s[1][axis] - s[0][axis]) < 1e-3 && Math.abs(s[1][1 - axis] - s[0][1 - axis]) > 0;
  const vertical = segments.filter((s) => flat(s, 0)).map(middle);
  return segments
    .filter((s) => flat(s, 1))
    .map(middle)
    .filter((p) => vertical.some((q) => near(p, q, 2e-3)));
}

/** The segments of a polyline, but those of no length. */
export const polyline = (line: readonly Point[]) =>
  line
    .slice(1)
    .map((p, j): Segment => [line[j], p])
    .filter(([p, q]) => p[0] !== q[0] || p[1] !== q[1]);

/**
 * The cases of a comparison that runs the engine on each: those named
 * `chosen`, or every one with ORACLE_ALL=1, as CI does.
 */
export function oracleCases<C extends { readonly name: string }>(
  cases: readonly C[],
  chosen: readonly string[],
): readonly C[] {
  const missing = chosen.filter((name) => !cases.some((c) => c.name === name));
  if (missing.length) throw new Error(`No such case: ${missing.join(', ')}`);
  return process.env['ORACLE_ALL'] === '1' ? cases : cases.filter((c) => chosen.includes(c.name));
}
