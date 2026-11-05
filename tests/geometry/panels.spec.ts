// The skin panels against the engine's 2D drawing in leparagliding.dxf,
// which draws each panel's sewing lines as lines of color 1 and its cut
// lines and holes as lines of color 3 (§8.6, drwvent), translated onto its
// sheet: each panel is found by its first segment, then all its lines must
// be drawn at that translation. drwvent draws the last segments before a
// trimmed inlet (types 4 and 5) in color 2. Its sewing marks are the centres
// of crosses of color 3 (4 at its corners, prinifp), the dots of its roman
// numeral circles of color 7 (to the hundredth).
import { expect, test } from '@playwright/test';
import { skinPanels, type Point, type SkinPanel } from '@lepara/geometry/fortran-3.29';
import { writeLep, type LepDesign } from '../../packages/format/src/index.ts';
import { DAT_FIXTURE, DESIGNS, designFiles, engine, project } from '../format/helpers';
import { crossCentres, dxfDots, dxfSegments, oracleCases, polyline } from './helpers';

// Each engine allocates over 1 GiB; run the cases of this file sequentially.
test.describe.configure({ mode: 'default' });

type Case = { name: string; directory: string; edit?: (design: LepDesign) => LepDesign };
const cases: Case[] = [
  ...DESIGNS.map((id) => ({ name: id, directory: `oracle/designs/${id}` })),
  { name: 'dat airfoil', directory: DAT_FIXTURE },
  {
    name: 'classic section 5',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({ ...d, skinTensionGroups: { mode: 0 } }),
  },
  {
    name: 'legacy panel correction',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      skinTension: { ...d.skinTension, panelCorrection: { points: 15, factor: 0.9 } },
    }),
  },
  {
    name: 'closed air inlets',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({
      ...d,
      skinTensionGroups: { mode: 0 },
      airfoils: d.airfoils.map((a) => ({ ...a, open: 0 })),
    }),
  },
  {
    name: 'without glued vents',
    directory: 'oracle/designs/swoop2',
    edit: (d) => ({ ...d, glueVents: { mode: 0 } }),
  },
  {
    name: 'diagonal inlets',
    directory: 'oracle/designs/A8',
    edit: (d) =>
      d.glueVents.mode === 1
        ? {
            ...d,
            glueVents: {
              ...d.glueVents,
              ribs: d.glueVents.ribs.map((r, i) => ({ ...r, type: [-1, -2, -3, 1, 0][i % 5] })),
            },
          }
        : d,
  },
  {
    name: 'trimmed, arched and elliptical inlets',
    directory: 'oracle/designs/A8',
    edit: (d) =>
      d.glueVents.mode === 1
        ? {
            ...d,
            glueVents: {
              ...d.glueVents,
              ribs: d.glueVents.ribs.map((r, i) => {
                const vents = [
                  { type: 4, parameters: [30, 45] },
                  { type: 5, parameters: [35, 25, 12] },
                  { type: 6, parameters: [60, 50] },
                  { type: -4, parameters: [40, 20] },
                  { type: -5, parameters: [25, 35, 8] },
                  { type: -6, parameters: [70, 40] },
                ];
                return vents[i % vents.length];
              }),
            },
          }
        : d,
  },
  ...(
    [
      ['one extrados cut', [{ number: 1, start: 25, end: 33, depth: 1 }]],
      [
        'two extrados cuts',
        [
          { number: 1, start: 25, end: 33, depth: 1 },
          { number: 2, start: 33, end: 44, depth: 0.5 },
        ],
      ],
      ['a forward extrados cut', [{ number: 1, start: 10, end: 20, depth: -1 }]],
    ] as const
  ).map(([name, cuts]) => ({
    name,
    directory: 'oracle/designs/gnu-test-3.19',
    edit: (d: LepDesign): LepDesign =>
      d.shaping.mode === 1
        ? {
            ...d,
            shaping: {
              ...d.shaping,
              groups: d.shaping.groups.map((g) => ({
                ...g,
                upper: { ...g.upper, cuts: [...cuts] },
              })),
            },
          }
        : d,
  })),
  ...(
    [
      ['upright anchor dots', 1],
      ['turned anchor dots', 2],
    ] as const
  ).map(([name, type]) => ({
    name,
    directory: 'oracle/designs/gnu-test-3.19',
    edit: (d: LepDesign): LepDesign => ({
      ...d,
      markTypes: d.markTypes.map((row, k) =>
        k === 4 ? { ...row, laser: { type, size: 2.5, offset: 1.5 } } : row,
      ),
    }),
  })),
  // iam marks an anchor past the intrados on its glued inlet, moved back
  // by the inlet side's span (A8's inlets span 1.6 to 6.3 % of chord).
  {
    name: 'anchors on inlets glued to the intrados',
    directory: 'oracle/designs/A8',
    edit: (d) => ({
      ...d,
      anchors: d.anchors.map((row) => ({
        ...row,
        positions: [3, ...row.positions.slice(1)] as unknown as typeof row.positions,
      })),
      glueVents:
        d.glueVents.mode === 1
          ? { ...d.glueVents, ribs: d.glueVents.ribs.map(() => ({ type: -1, parameters: [] })) }
          : d.glueVents,
    }),
  },
  {
    name: 'distinct sewing allowances',
    directory: 'oracle/designs/A8',
    edit: (d) => ({
      ...d,
      sewingAllowances: {
        ...d.sewingAllowances,
        upper: { sides: 7, leadingEdge: 15, trailingEdge: 25 },
        lower: { sides: 9, leadingEdge: 12, trailingEdge: 30 },
      },
    }),
  },
];

/**
 * Known, open difference (MODELS.md): on single-skin wings, the last point
 * of an inlet's left cut line can take the sign of the other quadrant
 * (§8.3.1), the segment after the inlet differing from the one we develop.
 * Those of its cut line segments a panel may miss.
 */
const known = (design: LepDesign, panel: SkinPanel) =>
  design.geometry.paragliderType === 'ss' && panel.joins.length ? [panel.cut.length / 2 - 4] : [];

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

type Segment = readonly [Point, Point];
/** The segments of a closed line, but those of no length. */
const segments = (line: readonly Point[]) =>
  line
    .map((p, j): Segment => [p, line[(j + 1) % line.length]])
    .filter(([p, q]) => p[0] !== q[0] || p[1] !== q[1]);

/** Whether `p` lies on segment `cd`, to the DXF's precision. */
function covers(c: Point, d: Point, p: Point) {
  const [dx, dy] = [d[0] - c[0], d[1] - c[1]];
  const length = Math.hypot(dx, dy);
  if (length < 3e-3) return near(c, p, 3e-3);
  const along = ((p[0] - c[0]) * dx + (p[1] - c[1]) * dy) / length;
  const across = Math.abs((p[1] - c[1]) * dx - (p[0] - c[0]) * dy) / length;
  return across <= 3e-3 && along >= -3e-3 && along <= length + 3e-3;
}

const near = (a: Point, b: Point, tolerance: number) =>
  Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;

// The smallest cases by default: every one with ORACLE_ALL=1.
const chosen = [
  'A8',
  'BHL7-22',
  'dat airfoil',
  'diagonal inlets',
  'two extrados cuts',
  'turned anchor dots',
  'anchors on inlets glued to the intrados',
  'distinct sewing allowances',
];

for (const { name, directory, edit } of oracleCases(cases, chosen))
  test(`${name}: skin panels as the engine draws them in leparagliding.dxf`, async () => {
    const files = designFiles(directory);
    const input = project(directory, files);
    const design = edit?.(input.design) ?? input.design;
    const written = writeLep(design);
    if (!written.ok) throw new Error(JSON.stringify(written.errors));
    files.set('leparagliding.txt', written.value);
    const { runLeparaglidingInWorker } = await engine();
    const encoder = new TextEncoder();
    const run = await runLeparaglidingInWorker(
      [...files].map(([name, text]) => ({ name, bytes: encoder.encode(text) })),
    );
    const dxf = run.files.find((file) => file.name === 'leparagliding.dxf');
    expect(dxf).toBeDefined();
    const text = new TextDecoder().decode(dxf!.bytes);
    const [drawn, cuts] = [
      [1, 2],
      [3, 2],
    ].map((colors) => colors.flatMap((c) => lines(text, c)));
    const crosses = crossCentres([3, 4].flatMap((c) => lines(text, c)));
    const dots = dxfDots(text, 7);
    const lines30 = lines(text, 30);
    const [anchorDots, triangles] = [dxfDots(text, 30), dxfSegments(text, 1)];
    const table = 2520 * design.geometry.drawingScale;
    // A segment is drawn when a line covers it: the engine draws some ends in one line.
    const isDrawn = (among: Segment[], [a, b]: Segment, [dx, dy]: Point) => {
      const [p, q]: Point[] = [a, b].map(([x, y]) => [x + dx, y + dy]);
      return among.some(([c, d]) => covers(c, d, p) && covers(c, d, q));
    };
    const panels = skinPanels(design, input.airfoils);
    expect(panels.length).toBeGreaterThan(0);
    // Four corners each, and marks along the sides of most.
    expect(panels.every((panel) => panel.marks.length >= 4)).toBe(true);
    expect(panels.filter((panel) => panel.marks.length > 4).length).toBeGreaterThan(
      panels.length / 2,
    );
    for (const panel of panels) {
      const label = `cell ${panel.cell} ${panel.surface} ${panel.piece}`;
      const lines = [...segments(panel.sewing), ...panel.joins];
      const [a, b] = lines[0];
      // Translations putting the first segment on a drawn line of the same vector.
      const shifts = drawn.flatMap(([c, d]): Point[] =>
        near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
          ? [[c[0] - a[0], c[1] - a[1]]]
          : [],
      );
      const placed = shifts.filter((shift) => lines.every((line) => isDrawn(drawn, line, shift)));
      expect(placed.length, `${label} sewing lines`).toBeGreaterThan(0);
      // The engine may draw a panel more than once: the best drawing of its cut lines.
      const missing = placed
        .map((shift) =>
          [...segments(panel.cut), ...panel.holes.flatMap(segments)].flatMap((line, k) =>
            isDrawn(cuts, line, shift) ? [] : [k],
          ),
        )
        .reduce((a, b) => (b.length < a.length ? b : a));
      const allowed = known(design, panel);
      expect(
        missing.filter((k) => !allowed.includes(k)),
        `${label} cut lines`,
      ).toEqual([]);
      const unmarked = placed
        .map(([dx, dy]) =>
          panel.marks.flatMap(([x, y], k) =>
            crosses.some((c) => near(c, [x + dx, y + dy], 3e-3)) ? [] : [k],
          ),
        )
        .reduce((a, b) => (b.length < a.length ? b : a));
      expect(unmarked, `${label} marks`).toEqual([]);
      expect(panel.numeral.length, `${label} numeral`).toBeGreaterThan(0);
      const undotted = placed
        .map(([dx, dy]) =>
          panel.numeral.flatMap(([x, y], k) =>
            dots.some((c) => near(c, [x + dx, y + dy], 6e-3)) ? [] : [k],
          ),
        )
        .reduce((a, b) => (b.length < a.length ? b : a));
      expect(undotted, `${label} numeral`).toEqual([]);
      // Each anchor's line into the panel, on its plan.
      const unplotted = placed
        .map((shift) =>
          panel.anchors.plan
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(lines30, line, shift) ? [] : [k])),
        )
        .reduce((a, b) => (b.length < a.length ? b : a));
      expect(unplotted, `${label} anchor lines`).toEqual([]);
      // The cutting table, 2520 cm further at plan scale.
      const unanchored = placed
        .map(([dx, dy]): Point => [dx + table, dy])
        .map(([dx, dy]) => [
          ...panel.anchors.dots.flatMap(([x, y], k) =>
            anchorDots.some((c) => near(c, [x + dx, y + dy], 6e-3)) ? [] : [`dot ${k}`],
          ),
          ...panel.anchors.lines
            .flatMap(polyline)
            .flatMap(([a, b], k) =>
              triangles.some(
                ([c, d]) =>
                  covers(c, d, [a[0] + dx, a[1] + dy]) && covers(c, d, [b[0] + dx, b[1] + dy]),
              )
                ? []
                : [`line ${k}`],
            ),
        ])
        .reduce((a, b) => (b.length < a.length ? b : a));
      expect(unanchored, `${label} anchors`).toEqual([]);
    }
    // Each anchor of a cell's ribs on its intrados, twice at a vertex; at the
    // tip, an anchor near the leading edge may lie on the air inlet instead.
    const form = design.markTypes[4]?.laser.type ?? 0;
    const cells = Math.max(...panels.map((p) => p.cell));
    for (const cell of new Set(panels.map((p) => p.cell).filter((c) => c < cells))) {
      const intrados = panels.filter((p) => p.cell === cell && p.surface === 'intrados');
      if (!intrados.length || form < 1 || form > 3) continue;
      const count = (rib: number) => design.anchors[Math.max(rib, 1) - 1]?.count ?? 0;
      const marks = intrados.reduce(
        (sum, p) => sum + (form === 3 ? p.anchors.lines.length : p.anchors.dots.length / 3),
        0,
      );
      expect(marks, `cell ${cell} anchors`).toBeGreaterThanOrEqual(count(cell) + count(cell + 1));
    }
  });
