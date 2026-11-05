// What the engine draws on each piece of leparagliding.dxf, against what the port holds of it:
// the other tests look for the port's lines in the DXF, which misses what the port leaves out.
// A few designs by default, every one with ORACLE_ALL=1.
import { expect, test } from '@playwright/test';
import {
  miniribPatterns,
  miniribSeams,
  ribPatterns,
  skinPanels,
  vRibPatterns,
  type Point,
} from '@lepara/geometry/fortran-3.29';
import { DESIGNS, designFiles, engine, project } from '../format/helpers';
import { covers, dxfDots, dxfSegments, near, oracleCases, polyline, type Segment } from './helpers';

const isPoint = (value: unknown): value is Point =>
  Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number');

/** Every polyline held anywhere in `value`. */
function polylines(value: unknown): Point[][] {
  if (typeof value !== 'object' || value === null) return [];
  if (Array.isArray(value) && value.length && value.every(isPoint)) return [value];
  return Object.values(value).flatMap(polylines);
}
const inside = (ring: readonly Point[], [x, y]: Point) =>
  ring.reduce((odd, [x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % ring.length];
    return y0 > y !== y1 > y && x < x0 + ((y - y0) / (y1 - y0)) * (x1 - x0) ? !odd : odd;
  }, false);

/**
 * What the engine draws and the port does not hold, on no seam: a rib's plumb lines down to
 * its chord; a panel's 6 cm lines from its anchors, and 3 cm diagonals nobody has traced yet;
 * the rounded ends of BHL7-22's rods, which rib-patterns.spec.ts leaves out too.
 */
const KNOWN = new Set([
  'rib line 7',
  'panel line 30',
  'panel line 7',
  'rib line 30',
  'rib line 150',
  'rib dot 160',
]);
const BUCKET = 50;
/** How far a drawn dot lies from its point, and a mark's lines at most, in cm. */
const DOT = 0.06;
const MARK = 0.7;
const bucket = ([x, y]: Point) => `${Math.floor(x / BUCKET)},${Math.floor(y / BUCKET)}`;

/** Where a drawn entity lies, by its color: dots, and the ends of segments. */
function entities(text: string) {
  const found = new Map<string, { at: Point; color: number; what: string; reach: number }[]>();
  const add = (at: Point, color: number, what: string, reach: number) => {
    if (!found.has(bucket(at))) found.set(bucket(at), []);
    found.get(bucket(at))!.push({ at, color, what, reach });
  };
  for (let color = 0; color < 256; color++) {
    for (const dot of dxfDots(text, color)) add(dot, color, 'dot', DOT);
    for (const [p, q] of dxfSegments(text, color)) {
      // A short line is an arm of a cross or a circle: of the mark at its middle.
      const reach = Math.hypot(p[0] - q[0], p[1] - q[1]) < MARK ? MARK : DOT;
      add(p, color, 'line', reach);
      add(q, color, 'line', reach);
    }
  }
  return found;
}

for (const { name } of oracleCases(
  DESIGNS.map((name) => ({ name })),
  ['A8', 'gnuC-27'],
))
  test(`${name}: the port holds what the engine draws on each piece of leparagliding.dxf`, async () => {
    test.setTimeout(300_000);
    const files = designFiles(`oracle/designs/${name}`);
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...files].map(([file, text]) => ({ name: file, bytes: encoder.encode(text) })),
    );
    const text = new TextDecoder().decode(
      run.files.find((file) => file.name === 'leparagliding.dxf')!.bytes,
    );
    const { design, airfoils } = project(name, files);
    const drawn = dxfSegments(text);
    const byBucket = entities(text);
    const unknown = new Map<string, string[]>();
    const check = (
      kind: string,
      label: string,
      ring: readonly Point[],
      lines: readonly Segment[],
      piece: unknown,
      from = -Infinity,
    ) => {
      const [a, b] = lines[0];
      const shifts = drawn
        .flatMap(([c, d]): Point[] =>
          near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
            ? [[c[0] - a[0], c[1] - a[1]]]
            : [],
        )
        .filter(
          ([dx, dy]) =>
            dx >= from &&
            lines.every(([p, q]) => {
              const [m, n]: Point[] = [
                [p[0] + dx, p[1] + dy],
                [q[0] + dx, q[1] + dy],
              ];
              return drawn.some(([c, d]) => covers(c, d, m) && covers(c, d, n));
            }),
        );
      if (!shifts.length) {
        unknown.set(`${kind} unplaced`, [...(unknown.get(`${kind} unplaced`) ?? []), label]);
        return;
      }
      const held = polylines(piece);
      const points = held.flat();
      const segments = held.flatMap(polyline);
      const known = ([x, y]: Point, reach: number) =>
        points.some((q) => Math.hypot(q[0] - x, q[1] - y) < reach) ||
        segments.some(([c, d]) => covers(c, d, [x, y]));
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      // Every drawing of it: the cutting table's holds marks the plan's does not.
      const best = shifts.flatMap(([dx, dy]) => {
        const cells = new Set<string>();
        for (let x = Math.min(...xs) + dx - BUCKET; x <= Math.max(...xs) + dx + BUCKET; x += BUCKET)
          for (
            let y = Math.min(...ys) + dy - BUCKET;
            y <= Math.max(...ys) + dy + BUCKET;
            y += BUCKET
          )
            cells.add(bucket([x, y]));
        return [...cells]
          .flatMap((cell) => byBucket.get(cell) ?? [])
          .flatMap(({ at, color, what, reach }) => {
            const p: Point = [at[0] - dx, at[1] - dy];
            return inside(ring, p) && !known(p, reach)
              ? [`${what} ${color} ${label} ${p[0].toFixed(1)},${p[1].toFixed(1)}`]
              : [];
          });
      });
      for (const entry of new Set(best)) {
        const key = `${kind} ${entry.split(' ').slice(0, 2).join(' ')}`;
        unknown.set(key, [...(unknown.get(key) ?? []), entry]);
      }
    };
    for (const rib of ribPatterns(design, airfoils))
      // From box (1, 2): the first lays the ribs over each other.
      check(
        'rib',
        `rib${rib.rib + 1}`,
        rib.sewing,
        polyline(rib.sewing),
        rib,
        700 * design.geometry.drawingScale - 1,
      );
    const seams = miniribSeams(design, airfoils);
    for (const panel of skinPanels(design, airfoils))
      check(
        'panel',
        `cell${panel.cell}${panel.surface[0]}${panel.piece}`,
        panel.sewing,
        polyline(panel.sewing),
        [
          panel,
          seams.filter(
            (seam) =>
              seam.cell === panel.cell &&
              seam.surface === panel.surface &&
              seam.piece === panel.piece,
          ),
        ],
      );
    for (const piece of vRibPatterns(design, airfoils)) {
      check('vrib', `row${piece.rows[0]}`, piece.sewing, piece.cut.flatMap(polyline), piece);
    }
    for (const minirib of miniribPatterns(design, airfoils))
      check('minirib', `minirib${minirib.rib}`, minirib.sewing, polyline(minirib.sewing), minirib);
    const left = [...unknown].filter(([key]) => !KNOWN.has(key));
    expect(left.map(([key, list]) => `${key}: ${list.length}, as ${list[0]}`)).toEqual([]);
  });
