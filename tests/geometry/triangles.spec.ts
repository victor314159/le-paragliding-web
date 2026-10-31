import { expect, test } from '@playwright/test';
import { suspensionLines, suspensionTriangles } from '../../packages/geometry/src/index.ts';
import { designFiles, engine, project } from '../format/helpers';

test('BHL7 attachment triangles match the turned edges in the engine DXF', async () => {
  const inputs = designFiles('oracle/designs/BHL7-22');
  const { design, airfoils } = project('', inputs);
  const triangles = suspensionTriangles(design, airfoils, suspensionLines(design, airfoils));
  expect(triangles).toHaveLength(42);
  const { runLeparaglidingInWorker } = await engine();
  const run = await runLeparaglidingInWorker(
    [...inputs].map(([name, text]) => ({ name, bytes: new TextEncoder().encode(text) })),
  );
  const dxf = run.files.find((file) => file.name === 'lep-3d.dxf');
  expect(dxf).toBeDefined();
  const codes = new TextDecoder()
    .decode(dxf!.bytes)
    .split('\n')
    .map((line) => line.trim());
  const edges: number[][] = [];
  codes.forEach((code, i) => {
    if (code !== 'LINE' || codes[i - 1] !== '0') return;
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    // §12.7 draws the two turned sides in DXF color 2 (yellow).
    if (values.get('62') === 2)
      edges.push(['10', '20', '30', '11', '21', '31'].map((key) => values.get(key)!));
  });
  const close = (a: readonly number[], b: readonly number[]) =>
    a.every((value, axis) => Math.abs(value - b[axis]) <= 0.0011);
  // §12.7 emits these triangles on the right half wing only.
  for (const {
    points: [a, b, tip],
  } of triangles)
    for (const base of [a, b]) {
      const edge = [...base, ...tip];
      const index = edges.findIndex((candidate) => close(edge, candidate));
      expect(index, `turned edge ${edge.join(',')}`).toBeGreaterThanOrEqual(0);
      edges.splice(index, 1);
    }
});
