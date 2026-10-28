// The V and VH ribs against the engine's 3D model, lep-3d.dxf, which it
// begins with them: only the hash of the reference DXF is committed, so
// each case runs the engine (a design by default, every one with
// ORACLE_ALL=1, as CI does).
import { expect, test } from '@playwright/test';
import { vRibs, type Point3 } from '../../packages/geometry/src/index.ts';
import { DESIGNS, designFiles, engine, project } from '../format/helpers';
import { VARIANTS, variantFiles } from '../format/variants';

/** The LINE entities of a DXF: their ends and color. */
function dxfLines(text: string) {
  const codes = text.split('\n').map((line) => line.trim());
  const lines: { ends: number[]; color: number }[] = [];
  codes.forEach((code, i) => {
    if (code !== 'LINE' || codes[i - 1] !== '0') return;
    const values = new Map<string, number>();
    for (let j = i + 1; j + 1 < codes.length && codes[j] !== '0'; j += 2)
      values.set(codes[j], Number(codes[j + 1]));
    const ends = ['10', '20', '30', '11', '21', '31'].map((key) => values.get(key) ?? Number.NaN);
    lines.push({ ends, color: values.get('62') ?? 0 });
  });
  return lines;
}

const cases = [
  ...DESIGNS.map((id) => ({ name: id, files: () => designFiles(`oracle/designs/${id}`) })),
  ...VARIANTS.filter(({ name }) => name.startsWith('hv-ribs')).map((variant) => ({
    name: `variant ${variant.name}`,
    files: () => variantFiles(variant),
  })),
];
const all = process.env['ORACLE_ALL'] === '1';
const chosen = ['gnuC-27', 'A8', 'variant hv-ribs-2-4-12-13-14'];

for (const { name, files } of cases.filter((c) => all || chosen.includes(c.name))) {
  test(`${name}: V and VH ribs as the engine draws them in lep-3d.dxf`, async () => {
    const inputs = files();
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...inputs].map(([file, text]) => ({ name: file, bytes: encoder.encode(text) })),
    );
    const dxf = run.files.find((file) => file.name === 'lep-3d.dxf');
    expect(dxf, name).toBeDefined();
    const { design, airfoils } = project(name, inputs);
    const mirror = ([x, y, z]: Point3): Point3 => [-x, y, z];
    // Each segment, then its mirror on the left half wing.
    const segments = vRibs(design, airfoils).flatMap(({ rows, color, edges: [a, b] }) =>
      a.flatMap((point, j) => [
        { row: rows.at(-1), color, ends: [...point, ...b[j]] },
        { row: rows.at(-1), color, ends: [...mirror(point), ...mirror(b[j])] },
      ]),
    );
    // The engine writes 3 decimals, and draws type 4 point by point across its cells.
    const lines = dxfLines(new TextDecoder().decode(dxf!.bytes)).slice(0, segments.length);
    const close = (a: readonly number[], b: readonly number[]) =>
      a.every((value, k) => Math.abs(value - b[k]) <= 0.0011);
    const swap = (ends: readonly number[]) => [...ends.slice(3), ...ends.slice(0, 3)];
    const used = lines.map(() => false);
    for (const segment of segments) {
      const match = lines.findIndex(
        (line, i) =>
          !used[i] &&
          line.color === segment.color &&
          (close(segment.ends, line.ends) || close(swap(segment.ends), line.ends)),
      );
      expect(match, `${name} row ${segment.row}`).toBeGreaterThanOrEqual(0);
      used[match] = true;
    }
  });
}
