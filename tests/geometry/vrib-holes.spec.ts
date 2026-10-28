// The holes of section 38 in the V-ribs of types 5 and 6 against the
// ellipses the engine draws in leparagliding.dxf, polylines of color 3:
// Swoop2 is the only design with such holes, and the engine runs for it.
import { expect, test } from '@playwright/test';
import { holeOutline, vRibHoles } from '../../packages/geometry/src/index.ts';
import { designFiles, engine, project } from '../format/helpers';

/** The closed polylines of a DXF of color `color`: their vertices. */
function polylines(text: string, color: number) {
  const codes = text.split('\n').map((line) => line.trim());
  const result: [number, number][][] = [];
  let current: { color: number; points: [number, number][] } | undefined;
  codes.forEach((code, i) => {
    if (codes[i - 1] !== '0') return;
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    if (code === 'POLYLINE') current = { color: values.get('62') ?? 0, points: [] };
    if (code === 'VERTEX' && current) current.points.push([values.get('10')!, values.get('20')!]);
    if (code === 'SEQEND' && current) {
      if (current.color === color) result.push(current.points);
      current = undefined;
    }
  });
  return result;
}

test('swoop2: V-rib holes as the engine draws them in leparagliding.dxf', async () => {
  const files = designFiles('oracle/designs/swoop2');
  const { runLeparaglidingInWorker } = await engine();
  const encoder = new TextEncoder();
  const run = await runLeparaglidingInWorker(
    [...files].map(([name, text]) => ({ name, bytes: encoder.encode(text) })),
  );
  const dxf = run.files.find((file) => file.name === 'leparagliding.dxf');
  expect(dxf).toBeDefined();
  // The largest and smallest distances of an ellipse's vertices from their mean, its center.
  const radii = (ring: readonly (readonly [number, number])[]) => {
    const center = [0, 1].map((k) => ring.reduce((sum, p) => sum + p[k], 0) / ring.length);
    const distances = ring.map((p) => Math.hypot(p[0] - center[0], p[1] - center[1]));
    return [Math.max(...distances), Math.min(...distances)];
  };
  // Without the last vertex, which closes the ring.
  const rings = polylines(new TextDecoder().decode(dxf!.bytes), 3).map((points) =>
    points.slice(0, -1),
  );
  const ellipses = rings.map(radii);
  const { design, airfoils } = project('swoop2', files);
  const holes = vRibHoles(design, airfoils).flatMap(({ rib, holes }) =>
    holes.map((hole) => ({ type: rib.type, ribs: rib.ribs, ...hole })),
  );
  expect(holes.length).toBeGreaterThan(0);
  // Each hole with as many vertices as the engine's, at the same angles; the DXF has 4 decimals.
  const used = ellipses.map(() => false);
  for (const hole of holes) {
    const [major, minor] = radii(holeOutline(hole, rings[0].length));
    const match = ellipses.findIndex(
      ([a, b], i) => !used[i] && Math.abs(a - major) <= 2e-4 && Math.abs(b - minor) <= 2e-4,
    );
    expect(
      match,
      `type ${hole.type} ribs ${hole.ribs.join('–')}: ${major} × ${minor}`,
    ).toBeGreaterThanOrEqual(0);
    used[match] = true;
  }
});
