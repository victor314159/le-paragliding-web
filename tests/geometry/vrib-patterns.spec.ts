// The H straps and V-ribs laid flat against the engine's 2D drawing in
// leparagliding.dxf (§16), which draws each piece's end rows and cut lines
// as lines, its holes as polylines, translated onto its sheet: each piece is
// found by its first end row, then all its lines must be drawn at that
// translation, its control points dotted and its numbers in dots of color 7.
import { expect, test } from '@playwright/test';
import { vRibPatterns, type Point } from '@lepara/geometry/fortran-3.29';
import { DESIGNS, designFiles, engine, project } from '../format/helpers';
import { VARIANTS, variantFiles } from '../format/variants';
import { covers, dxfDots, dxfSegments, near, oracleCases, polyline, type Segment } from './helpers';

// Each engine allocates over 1 GiB; run the cases of this file sequentially.
test.describe.configure({ mode: 'default' });

const cases = [
  ...DESIGNS.map((id) => ({ name: id, files: () => designFiles(`oracle/designs/${id}`) })),
  ...VARIANTS.filter(({ name }) => name.startsWith('hv-ribs')).map((variant) => ({
    name: `variant ${variant.name}`,
    files: () => variantFiles(variant),
  })),
];

// The smallest cases by default: every one with ORACLE_ALL=1.
const chosen = ['A8', 'BHL7-22', 'gnu-test-3.19', 'variant hv-ribs-15-ellipses'];

for (const { name, files } of oracleCases(cases, chosen))
  test(`${name}: H straps and V-ribs as the engine draws them in leparagliding.dxf`, async () => {
    const inputs = files();
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...inputs].map(([file, text]) => ({ name: file, bytes: encoder.encode(text) })),
    );
    const dxf = run.files.find((file) => file.name === 'leparagliding.dxf');
    expect(dxf).toBeDefined();
    const text = new TextDecoder().decode(dxf!.bytes);
    const drawn = dxfSegments(text);
    const [dots, sevens] = [dxfDots(text), dxfDots(text, 7)];
    // An edge of no length gives NaN, which the engine writes: matched by its other coordinate.
    const same = (p: Point, q: Point) =>
      p.every((v, i) => (Number.isNaN(v) ? Number.isNaN(q[i]) : Math.abs(v - q[i]) < 6e-3));
    const undotted = (points: readonly Point[], among: readonly Point[], [dx, dy]: Point) =>
      points.flatMap(([x, y], k) => (among.some((c) => same(c, [x + dx, y + dy])) ? [] : [k]));
    const isDrawn = ([a, b]: Segment, [dx, dy]: Point) => {
      const [p, q]: Point[] = [a, b].map(([x, y]) => [x + dx, y + dy]);
      return [p, q].every((r) => r.every(Number.isFinite))
        ? drawn.some(([c, d]) => covers(c, d, p) && covers(c, d, q))
        : drawn.some(([c, d]) => (same(c, p) && same(d, q)) || (same(c, q) && same(d, p)));
    };
    const { design, airfoils } = project(name, inputs);
    const pieces = vRibPatterns(design, airfoils);
    // The edges of no length of the first ribs, NaN.
    expect(
      pieces
        .filter((p) => [...p.cut.flat(), ...p.marks, ...p.numeral].some((q) => q.some(isNaN)))
        .map((p) => `${p.type}:${p.ribs.join('-')}`),
    ).toEqual(name === 'variant hv-ribs-2-4-12-13-14' ? ['2:1-2', '4:1-2'] : []);
    // Each type has some marks and numbers.
    for (const type of new Set(pieces.map((piece) => piece.type)))
      for (const key of ['marks', 'numeral'] as const)
        expect(
          pieces.filter((piece) => piece.type === type).some((piece) => piece[key].length),
          `type ${type} ${key}`,
        ).toBe(true);
    for (const piece of pieces) {
      const label = `type ${piece.type} ribs ${piece.ribs.join('–')}, rows ${piece.rows.join()}`;
      const [a, b] = piece.cut[0];
      const lines = [...piece.cut, ...piece.holes].flatMap(polyline);
      // Translations putting its first end row on a drawn line of the same vector.
      const shifts = drawn.flatMap(([c, d]): Point[] =>
        near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
          ? [[c[0] - a[0], c[1] - a[1]]]
          : [],
      );
      expect(shifts.length, `${label}: its first end row`).toBeGreaterThan(0);
      const [missing, shift] = shifts
        .map(
          (shift) =>
            [lines.flatMap((line, k) => (isDrawn(line, shift) ? [] : [k])), shift] as const,
        )
        .reduce((x, y) => (y[0].length < x[0].length ? y : x));
      expect(missing, `${label}: cut lines and holes`).toEqual([]);
      expect(undotted(piece.marks, dots, shift), `${label}: control points`).toEqual([]);
      expect(undotted(piece.numeral, sevens, shift), `${label}: numbers`).toEqual([]);
    }
  });
