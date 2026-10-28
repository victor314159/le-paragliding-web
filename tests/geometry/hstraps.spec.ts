// The H straps of section 12 against the engine's 2D drawing in
// leparagliding.dxf, which lays each flat and draws its end rows as lines
// of color 30, the drawing's y reversed. The engine shortens a strap for
// its tension by moving its second edge, so each strap is checked by the
// vectors from its first row to its last along each edge.
import { expect, test } from '@playwright/test';
import { flatten, hStraps, type Point } from '../../packages/geometry/src/index.ts';
import { designFiles, engine, project } from '../format/helpers';

/** The lines of color `color` of a DXF: their ends. */
function lines(text: string, color: number) {
  const codes = text.split('\n').map((line) => line.trim());
  const result: [Point, Point][] = [];
  codes.forEach((code, i) => {
    if (code !== 'LINE' || codes[i - 1] !== '0') return;
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    if (values.get('62') === color)
      result.push([
        [values.get('10')!, values.get('20')!],
        [values.get('11')!, values.get('21')!],
      ]);
  });
  return result;
}

for (const id of ['swoop2', 'A8', 'gnuC-27'])
  test(`${id}: H straps as the engine lays them flat in leparagliding.dxf`, async () => {
    const files = designFiles(`oracle/designs/${id}`);
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...files].map(([name, text]) => ({ name, bytes: encoder.encode(text) })),
    );
    const dxf = run.files.find((file) => file.name === 'leparagliding.dxf');
    expect(dxf).toBeDefined();
    const drawn = lines(new TextDecoder().decode(dxf!.bytes), 30);
    // The lines by their first point, to the hundredth.
    const key = ([x, y]: Point) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
    const byStart = new Map<string, [Point, Point][]>();
    for (const line of drawn)
      byStart.set(key(line[0]), [...(byStart.get(key(line[0])) ?? []), line]);
    const { design, airfoils } = project(id, files);
    const straps = hStraps(design, airfoils);
    expect(straps.length).toBeGreaterThan(0);
    const gap = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const strap of straps) {
      const { left, right } = flatten(...strap.edges);
      const last = left.length - 1;
      const along = (edge: readonly Point[]): Point => [
        edge[last][0] - edge[0][0],
        -(edge[last][1] - edge[0][1]),
      ];
      const [l, r] = [along(left), along(right)];
      // A first row, and a last row as far along the first edge, whose second ends are as far apart.
      const found = drawn.some(([a, b]) =>
        [-1, 0, 1].some((dx) =>
          [-1, 0, 1].some((dy) =>
            (byStart.get(key([a[0] + l[0] + dx / 100, a[1] + l[1] + dy / 100])) ?? []).some(
              ([c, d]) =>
                gap([c[0] - a[0], c[1] - a[1]], l) <= 3e-3 &&
                gap([d[0] - b[0], d[1] - b[1]], r) <= 3e-3,
            ),
          ),
        ),
      );
      expect(found, `ribs ${strap.ribs.join('–')}, row ${strap.rows.join()}`).toBe(true);
    }
  });
