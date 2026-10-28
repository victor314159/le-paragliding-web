// The holes of section 38 in the V-ribs of types 5 and 6 against those the
// engine draws in leparagliding.dxf, each V-rib laid flat with its end rows
// as lines and its holes as polylines of color 3, the drawing's y reversed:
// Swoop2 is the only design with such holes, and the engine runs for it.
import { expect, test } from '@playwright/test';
import { holeOutline, vRibHoles, type Point } from '../../packages/geometry/src/index.ts';
import { designFiles, engine, project } from '../format/helpers';

/** The lines of a DXF, and the vertices of its polylines of color `color`. */
function entities(text: string, color: number) {
  const codes = text.split('\n').map((line) => line.trim());
  const lines: [Point, Point][] = [];
  const polylines: Point[][] = [];
  let current: { color: number; points: Point[] } | undefined;
  codes.forEach((code, i) => {
    if (codes[i - 1] !== '0') return;
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    const point = (x: string, y: string): Point => [values.get(x)!, values.get(y)!];
    if (code === 'LINE') lines.push([point('10', '20'), point('11', '21')]);
    if (code === 'POLYLINE') current = { color: values.get('62') ?? 0, points: [] };
    if (code === 'VERTEX' && current) current.points.push(point('10', '20'));
    if (code === 'SEQEND' && current) {
      if (current.color === color) polylines.push(current.points);
      current = undefined;
    }
  });
  return { lines, polylines };
}

/** The center of an ellipse's vertices, and their largest and smallest distances from it. */
function measure(ring: readonly Point[]) {
  const center: Point = [0, 1].map((k) => ring.reduce((sum, p) => sum + p[k], 0) / ring.length) as [
    number,
    number,
  ];
  const distances = ring.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1]));
  return { center, major: Math.max(...distances), minor: Math.min(...distances) };
}

const near = (a: Point, b: Point, tolerance: number) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;

test('swoop2: V-rib holes as the engine draws them in leparagliding.dxf', async () => {
  const files = designFiles('oracle/designs/swoop2');
  const { runLeparaglidingInWorker } = await engine();
  const encoder = new TextEncoder();
  const run = await runLeparaglidingInWorker(
    [...files].map(([name, text]) => ({ name, bytes: encoder.encode(text) })),
  );
  const dxf = run.files.find((file) => file.name === 'leparagliding.dxf');
  expect(dxf).toBeDefined();
  const { lines, polylines } = entities(new TextDecoder().decode(dxf!.bytes), 3);
  // Without the last vertex, which closes the ring.
  const rings = polylines.map((points) => points.slice(0, -1));
  const drawn = rings.map(measure);
  const { design, airfoils } = project('swoop2', files);
  const holed = vRibHoles(design, airfoils);
  expect(holed.length).toBeGreaterThan(0);
  const reverse = ([x, y]: Point): Point => [x, -y];
  const used = drawn.map(() => false);
  for (const { rib, flat, holes } of holed) {
    const name = `type ${rib.type} ribs ${rib.ribs.join('–')}`;
    // Where the engine draws it: the shift that puts its first end row on a
    // line of the drawing and its last one too (the DXF has 4 decimals).
    const last = flat.left.length - 1;
    const [first, end] = [0, last].map((j) => [flat.left[j], flat.right[j]].map(reverse));
    const shifts = lines.flatMap(([p, q]) =>
      [
        [p, q],
        [q, p],
      ].flatMap(([a, b]): Point[] =>
        near(
          [b[0] - a[0], b[1] - a[1]],
          [first[1][0] - first[0][0], first[1][1] - first[0][1]],
          2e-3,
        )
          ? [[a[0] - first[0][0], a[1] - first[0][1]]]
          : [],
      ),
    );
    const shift = shifts.find(([dx, dy]) =>
      lines.some(([p, q]) => {
        const [a, b] = end.map(([x, y]): Point => [x + dx, y + dy]);
        return (near(p, a, 3e-3) && near(q, b, 3e-3)) || (near(p, b, 3e-3) && near(q, a, 3e-3));
      }),
    );
    expect(shift, `${name}: its end rows`).toBeDefined();
    // Each hole there, with as many vertices as the engine's, at the same angles.
    for (const hole of holes) {
      const mine = measure(holeOutline(hole, rings[0].length).map(reverse));
      const center: Point = [mine.center[0] + shift![0], mine.center[1] + shift![1]];
      const match = drawn.findIndex(
        (e, i) =>
          !used[i] &&
          near(e.center, center, 1e-3) &&
          Math.abs(e.major - mine.major) <= 2e-4 &&
          Math.abs(e.minor - mine.minor) <= 2e-4,
      );
      expect(match, `${name}: hole ${mine.major} × ${mine.minor}`).toBeGreaterThanOrEqual(0);
      used[match] = true;
    }
  }
});
