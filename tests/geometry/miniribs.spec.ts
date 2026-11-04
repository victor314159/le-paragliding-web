// The miniribs laid flat against the engine's 2D drawing in leparagliding.dxf
// (§6.12.0), which draws each minirib's airfoil in color 1 between the ribs,
// its holes in color 3, and on the cutting table, 2530 cm further at plan
// scale, its cut lines in color 1, its holes and its number in dots of
// color 7: each minirib is found by its first segment, then all its lines
// must be drawn at that translation.
import { expect, test } from '@playwright/test';
import {
  miniribPatterns,
  miniribSeams,
  skinPanels,
  unloadedRibPatterns,
  type Point,
} from '@lepara/geometry/fortran-3.29';
import { writeLep, type LepDesign } from '../../packages/format/src/index.ts';
import { DESIGNS, designFiles, engine, project } from '../format/helpers';
import { covers, dxfDots, dxfSegments, near, oracleCases, polyline, type Segment } from './helpers';

// Each engine allocates over 1 GiB; run the cases of this file sequentially.
test.describe.configure({ mode: 'default' });

type Case = { name: string; directory: string; edit?: (design: LepDesign) => LepDesign };
const special =
  (transition: 1 | 2 | 3) =>
  (d: LepDesign): LepDesign => ({
    ...d,
    specialParameters: {
      mode: 1,
      entries: [
        ...(d.specialParameters.mode === 1 ? d.specialParameters.entries : []).filter(
          (p) => p.code !== 3001,
        ),
        { code: 3001, transition, values: [5, 0.7] },
      ],
    },
  });
const cases: Case[] = [
  ...DESIGNS.map((id) => ({ name: id, directory: `oracle/designs/${id}` })),
  { name: 'linear transition', directory: 'oracle/designs/gnuC-27', edit: special(1) },
  { name: 'cosine transition', directory: 'oracle/designs/A8', edit: special(3) },
  // The engine sets no point of the parabolic one: lines of no length at the origin.
  { name: 'parabolic transition', directory: 'oracle/designs/gnuC-27', edit: special(2) },
];

// The smallest cases by default: every one with ORACLE_ALL=1.
for (const { name, directory, edit } of oracleCases(cases, ['A8', 'BHL7-22', 'cosine transition']))
  test(`${name}: miniribs as the engine draws them in leparagliding.dxf`, async () => {
    const files = designFiles(directory);
    const input = project(directory, files);
    const design = edit?.(input.design) ?? input.design;
    const written = writeLep(design);
    if (!written.ok) throw new Error(JSON.stringify(written.errors));
    files.set('leparagliding.txt', written.value);
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...files].map(([file, text]) => ({ name: file, bytes: encoder.encode(text) })),
    );
    const dxf = run.files.find((file) => file.name === 'leparagliding.dxf');
    expect(dxf).toBeDefined();
    const text = new TextDecoder().decode(dxf!.bytes);
    const [lines, holes, numerals] = [dxfSegments(text, 1), dxfSegments(text, 3), dxfDots(text, 7)];
    const table = 2530 * design.geometry.drawingScale;
    const isDrawn = (among: Segment[], [a, b]: Segment, [dx, dy]: Point) => {
      const [p, q]: Point[] = [a, b].map(([x, y]) => [x + dx, y + dy]);
      return among.some(([c, d]) => covers(c, d, p) && covers(c, d, q));
    };
    const miniribs = miniribPatterns(design, input.airfoils);
    const expected =
      design.geometry.paragliderType === 'ss'
        ? 0
        : design.airfoils.filter(({ minirib }) => minirib > 1 && minirib !== 100).length;
    expect(miniribs).toHaveLength(expected);
    for (const minirib of miniribs) {
      const sewing = polyline(minirib.sewing);
      const unset = minirib.sewing.every(([u, v]) => u === 0 && v === 0);
      const [a, b] = unset ? [[0, 0] as Point, [0, 0] as Point] : sewing[0];
      const shifts = lines.flatMap(([c, d]): Point[] =>
        near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
          ? [[c[0] - a[0], c[1] - a[1]]]
          : [],
      );
      const missing = shifts
        .map(([dx, dy]) => {
          const onTable: Point = [dx + table, dy];
          return [
            ...sewing.flatMap((line, k) => (isDrawn(lines, line, [dx, dy]) ? [] : [`sewing ${k}`])),
            ...minirib.cut
              .flatMap(polyline)
              .flatMap((line, k) => (isDrawn(lines, line, onTable) ? [] : [`cut ${k}`])),
            ...minirib.holes
              .flatMap(polyline)
              .flatMap((line, k) =>
                isDrawn(holes, line, [dx, dy]) && isDrawn(holes, line, onTable)
                  ? []
                  : [`hole ${k}`],
              ),
            ...minirib.numeral.flatMap(([x, y], k) =>
              numerals.some((c) => near(c, [x + onTable[0], y + onTable[1]], 6e-3))
                ? []
                : [`numeral ${k}`],
            ),
          ];
        })
        .reduce<string[] | undefined>((x, y) => (!x || y.length < x.length ? y : x), undefined);
      expect(missing ?? ['not found'], `minirib ${minirib.rib}`).toEqual([]);
      expect(minirib.numeral.length, `minirib ${minirib.rib} numeral`).toBeGreaterThan(0);
    }
    // Their reference lines on the panels (§8.2.6), each in color 5, by its length and way.
    const references = dxfSegments(text, 5).map(([c, d]): Point => [d[0] - c[0], d[1] - c[1]]);
    const lost = miniribSeams(design, input.airfoils).filter(({ line: [a, b] }) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      return (
        Math.hypot(dx, dy) > 1e-9 &&
        !references.some((v) => near(v, [dx, dy], 2e-3) || near(v, [-dx, -dy], 2e-3))
      );
    });
    expect(lost).toEqual([]);
  });

// The unloaded ribs (§9.9), in their own box: their cut line in colors 1
// and 2, their marks and number in dots of color 7, their inlet ends in
// color 3 and their holes in color 1: on gnuC-27, whose inlets have 2
// points, and A8, whose inlets the engine interpolates on 2 inner points,
// or evenly as a "pc" wing.
const unloaded = (d: LepDesign): LepDesign => ({
  ...d,
  airfoils: d.airfoils.map((row, k) => (k >= 5 && k <= 9 ? { ...row, minirib: 100 } : row)),
  holes: [
    ...d.holes,
    {
      firstRib: 6,
      lastRib: 10,
      holes: [
        { type: 11, parameters: [40, 2, 6, 4, 0.2, 0, 0] },
        { type: 11, parameters: [65, 1, 5, 3, 0, 0, 0] },
      ],
    },
  ],
});

for (const { id, type } of oracleCases(
  [
    { name: 'gnuC-27', id: 'gnuC-27', type: 'ds' },
    { name: 'A8 ds', id: 'A8', type: 'ds' },
    { name: 'A8 pc', id: 'A8', type: 'pc' },
  ] as const,
  ['A8 ds', 'A8 pc'],
))
  test(`${id} (${type}): unloaded ribs as the engine draws them in leparagliding.dxf`, async () => {
    const directory = `oracle/designs/${id}`;
    const files = designFiles(directory);
    const input = project(directory, files);
    const edited = unloaded(input.design);
    const design = { ...edited, geometry: { ...edited.geometry, paragliderType: type } };
    const written = writeLep(design);
    if (!written.ok) throw new Error(JSON.stringify(written.errors));
    files.set('leparagliding.txt', written.value);
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...files].map(([file, text]) => ({ name: file, bytes: encoder.encode(text) })),
    );
    const text = new TextDecoder().decode(
      run.files.find((file) => file.name === 'leparagliding.dxf')!.bytes,
    );
    const [cuts, inlets, sevens] = [
      [...dxfSegments(text, 1), ...dxfSegments(text, 2)],
      dxfDots(text, 3),
      dxfDots(text, 7),
    ];
    const seams = [...dxfDots(text, 4), ...dxfDots(text, 1)];
    const scale = design.geometry.drawingScale;
    const isDrawn = ([a, b]: Segment, [dx, dy]: Point) => {
      const [p, q]: Point[] = [a, b].map(([x, y]) => [x + dx, y + dy]);
      return cuts.some(([c, d]) => covers(c, d, p) && covers(c, d, q));
    };
    const dotted = (dots: readonly Point[], among: readonly Point[], [dx, dy]: Point) =>
      dots.flatMap(([x, y], k) => (among.some((c) => near(c, [x + dx, y + dy], 6e-3)) ? [] : [k]));
    const ribs = unloadedRibPatterns(design, input.airfoils);
    expect(ribs.map((rib) => rib.rib)).toEqual([6, 7, 8, 9, 10]);
    for (const rib of ribs) {
      // Its first segment the engine draws backwards: by its second.
      const [a, b] = polyline(rib.cut)[1];
      const missing = cuts
        .flatMap(([c, d]): Point[] =>
          near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
            ? [[c[0] - a[0], c[1] - a[1]]]
            : [],
        )
        .map((shift) => [
          ...polyline(rib.cut).flatMap((line, k) => (isDrawn(line, shift) ? [] : [`cut ${k}`])),
          ...rib.holes
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(line, shift) ? [] : [`hole ${k}`])),
          ...dotted(rib.marks, sevens, shift).map((k) => `mark ${k}`),
          ...dotted(rib.numeral, sevens, shift).map((k) => `numeral ${k}`),
          ...dotted(rib.inlets, inlets, shift).map((k) => `inlet ${k}`),
        ])
        .reduce<string[] | undefined>((x, y) => (!x || y.length < x.length ? y : x), undefined);
      expect(missing ?? ['not found'], `unloaded rib ${rib.rib}`).toEqual([]);
      expect(rib.marks.length).toBeGreaterThan(2);
      expect(rib.holes).toHaveLength(2);
      // §9.9.10: its seam on its cell's panels, in dots of colors 4 and 1,
      // drawn at the sheet's origin in both boxes, not on the panels.
      const panels = skinPanels(design, input.airfoils).filter((p) => p.cell === rib.rib - 1);
      for (const panel of panels) {
        const top = (panel.surface === 'extrados' ? 400 : 1291) * scale;
        const lost = panel.unloadedSeam.flatMap(([u, v], k) =>
          [1970, 1970 + 2520].every((x) =>
            seams.some((c) => near(c, [x * scale + u, v - top], 6e-3)),
          )
            ? []
            : [k],
        );
        expect(lost, `rib ${rib.rib} ${panel.surface} ${panel.piece} seam`).toEqual([]);
      }
      for (const surface of ['extrados', 'intrados'])
        expect(
          panels.filter((p) => p.surface === surface).flatMap((p) => p.unloadedSeam).length,
        ).toBeGreaterThan(4);
    }
  });
