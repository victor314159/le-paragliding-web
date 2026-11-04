// The rib patterns against the engine's 2D drawing in leparagliding.dxf
// (§6.12), which draws each rib's airfoil as lines of color 1, its cut line
// and its holes in color 3 (ellipses as polylines), translated onto its
// sheet: each rib is found by its first segment, then all its lines must be
// drawn at that translation. Its sewing marks (§11.3) are the centres of
// crosses of color 3 (4 at the trailing edge). Its drawing on the cutting
// table, 2530 cm further at plan scale, marks its anchors with dots or
// triangles of color 30 (§9.3.2), its inlet's ends with dots or lines of
// color 3 (§9.4), the points of section 17 with dots of color 5, and its
// number with dots of color 7 (§6.13). Its rods (§6.12.6) are drawn on it
// in color 150, their pockets in color 30, their ends dotted on the
// cutting table in color 160, and each pocket again as its own piece
// elsewhere (colors 30, type 2 10, its number in their color); its nose
// mylar (§6.12.7) is drawn on it in color 10, its ends on the cutting
// table in segments of color 2, and as its own piece in color 10, its
// number in color 7.
import { expect, test } from '@playwright/test';
import { ribPatterns, type Point, type RibRod } from '@lepara/geometry/fortran-3.29';
import {
  writeLep,
  type Hole,
  type JoncBloc,
  type LepDesign,
  type RodPocket,
} from '../../packages/format/src/index.ts';
import { DAT_FIXTURE, DESIGNS, designFiles, engine, project } from '../format/helpers';
import { VARIANTS, variantFiles } from '../format/variants';
import {
  covers,
  crossCentres,
  dxfDots,
  dxfSegments,
  near,
  oracleCases,
  polyline,
  type Segment,
} from './helpers';

// Each engine allocates over 1 GiB; run the cases of this file sequentially.
test.describe.configure({ mode: 'default' });

const holes =
  (list: Hole[]) =>
  (d: LepDesign): LepDesign => ({
    ...d,
    holes: [{ firstRib: 1, lastRib: d.geometry.ribs.length, holes: list }],
  });

const pocket: RodPocket = { offset: 2, outerWidth: 9.35, rodWidth: 6.3, innerWidth: 9.35 };
const rods =
  (...blocs: ((ribs: number) => JoncBloc)[]) =>
  (d: LepDesign): LepDesign => ({
    ...d,
    joncs: { mode: 2, blocs: blocs.map((bloc) => bloc(d.geometry.ribs.length)) },
  });

type Case = {
  name: string;
  directory: string;
  files?: () => Map<string, string>;
  edit?: (design: LepDesign) => LepDesign;
};
const cases: Case[] = [
  ...DESIGNS.map((id) => ({ name: id, directory: `oracle/designs/${id}` })),
  // V-ribs of types 2 and 4.
  ...VARIANTS.filter(({ name }) => name === 'hv-ribs-2-4-12-13-14').map((variant) => ({
    name: `variant ${variant.name}`,
    directory: `variant ${variant.name}`,
    files: () => variantFiles(variant),
  })),
  { name: 'dat airfoil', directory: DAT_FIXTURE },
  {
    name: 'triangles, rectangles and rotated ellipses',
    directory: 'oracle/designs/A8',
    edit: holes([
      { type: 3, parameters: [20, 2, 8, 5, 10, 1, 0] },
      { type: 3, parameters: [35, -1, -6, 4, -15, 0.8, 0] },
      { type: 4, parameters: [50, -2, 7, 4, 5, 1, 0] },
      { type: 4, parameters: [62, -2, -5, 3, 0, 0.5, 0] },
      { type: 1, parameters: [75, 1, 5, 2, 0.3, 0, 0] },
    ]),
  },
  {
    name: 'upright anchor dots, double inlet dots and rib points',
    directory: 'oracle/designs/A8',
    edit: (d) => ({
      ...d,
      markTypes: d.markTypes.map((row, k) =>
        k === 3
          ? { ...row, laser: { type: 1, size: 3, offset: 1 } }
          : k === 4
            ? { ...row, laser: { type: 1, size: 2.5, offset: 1.5 } }
            : row,
      ),
      ribPoints: [
        [10.8, 5.53],
        [40, -2],
      ],
    }),
  },
  {
    name: 'turned anchor dots, split inlet lines and trimmed inlets',
    directory: 'oracle/designs/A8',
    edit: (d) => ({
      ...d,
      markTypes: d.markTypes.map((row, k) =>
        k === 3
          ? { ...row, laser: { type: 3, size: 3, offset: 1 } }
          : k === 4
            ? { ...row, laser: { type: 2, size: 2.5, offset: 1.5 } }
            : row,
      ),
      glueVents:
        d.glueVents.mode === 1
          ? {
              ...d.glueVents,
              ribs: d.glueVents.ribs.map((_, i) => {
                const vents = [
                  { type: 4, parameters: [30, 45] },
                  { type: 5, parameters: [35, 25, 12] },
                  { type: -4, parameters: [40, 20] },
                  { type: -5, parameters: [25, 35, 8] },
                  { type: 1, parameters: [] },
                  { type: -3, parameters: [] },
                  { type: 6, parameters: [60, 50] },
                ];
                return vents[i % vents.length];
              }),
            }
          : d.glueVents,
    }),
  },
  {
    name: 'intrados rods, arcs and nose mylars',
    directory: 'oracle/designs/BHL7-22',
    edit: (d) =>
      rods(
        (n) => ({
          number: 1,
          type: 5,
          groups: [
            {
              group: 1,
              firstRib: 1,
              // The last rib is flat: no intrados to run along.
              lastRib: n - 1,
              initial: { from: 5, to: 12, deflection: 0.5, exponent: 2 },
              final: { from: 40, to: 55, deflection: 0.8, exponent: 1.5 },
              pocket,
            },
          ],
        }),
        (n) => ({
          number: 2,
          type: 2,
          groups: [
            {
              group: 1,
              firstRib: 1,
              lastRib: 4,
              x1: 20,
              y1: 2,
              x2: 60,
              y2: -1,
              deflection: -2,
              pocket,
            },
            {
              group: 2,
              firstRib: 5,
              lastRib: 8,
              x1: 30,
              y1: 6,
              x2: 33,
              y2: -4,
              deflection: 1.5,
              pocket,
            },
            {
              group: 3,
              firstRib: 9,
              lastRib: n,
              x1: 15,
              y1: 1,
              x2: 70,
              y2: 3,
              deflection: 0,
              pocket,
            },
          ],
        }),
      )({
        ...d,
        noseMylars: {
          mode: 1,
          groups: [
            { group: 1, firstRib: 1, lastRib: 6, values: [10, 8, 1, 6, 5, 1] },
            { group: 2, firstRib: 4, lastRib: 12, values: [12, 6, 0.8, 4, 4, 0.5] },
          ],
        },
      }),
  },
  // The engine's rod subroutines keep their locals from one call to the
  // next: a rising steep arc takes the last falling one's sign (0 at
  // first), a rod finding no segment (a flat last rib) the last points
  // found; single skin, joncs4 leaves the point after the inlet at (0, 0).
  {
    name: 'rising steep arcs, before and after a falling one',
    directory: 'oracle/designs/gnuC-27',
    edit: rods(() => ({
      number: 1,
      type: 2,
      groups: [1, 4, 7].map((firstRib, k) => ({
        group: k + 1,
        firstRib,
        lastRib: firstRib + 2,
        x1: 30,
        y1: k === 1 ? 6 : -4,
        x2: 33,
        y2: k === 1 ? -4 : 6,
        deflection: 1.5,
        pocket,
      })),
    })),
  },
  {
    name: 'nose rods on a flat last rib',
    directory: 'oracle/designs/gnuC2-27',
    edit: rods((n) => ({
      number: 1,
      type: 1,
      groups: [
        {
          group: 1,
          firstRib: 1,
          lastRib: n,
          extrados: { from: 4.2, to: 10.8, deflection: 1, exponent: 2 },
          intrados: { from: 3.67, to: 10, deflection: 1, exponent: 2 },
          pocket,
        },
      ],
    })),
  },
  {
    name: 'single skin: extrados rods before nose mylars',
    directory: 'oracle/designs/BHL7-22',
    edit: (d) =>
      rods((n) => ({
        number: 1,
        type: 4,
        groups: [
          {
            group: 1,
            firstRib: 1,
            lastRib: n - 1,
            initial: { from: 20, to: 30, deflection: 1, exponent: 2 },
            final: { from: 60, to: 70, deflection: 1, exponent: 2 },
            pocket,
          },
        ],
      }))({
        ...d,
        noseMylars: {
          mode: 1,
          groups: [{ group: 1, firstRib: 1, lastRib: 16, values: [10, 8, 1, 6, 5, 1] }],
        },
      }),
  },
  {
    name: 'arc rods after a rectangle hole',
    directory: 'oracle/designs/A8',
    edit: rods((n) => ({
      number: 1,
      type: 2,
      groups: [
        { group: 1, firstRib: 1, lastRib: n, x1: 15, y1: 1, x2: 70, y2: 3, deflection: 1, pocket },
      ],
    })),
  },
  // "pc" wings close their inlets: of 9, 7 and 4 points, A8's under nose
  // mylars ending past them, then inside them (1.6 to 6.3 % of chord).
  ...['A8', 'swoop2', 'gnuC2-27'].map((id) => ({
    name: `${id} as a "pc" wing`,
    directory: `oracle/designs/${id}`,
    edit: (d: LepDesign): LepDesign => ({
      ...d,
      geometry: { ...d.geometry, paragliderType: 'pc' },
      noseMylars:
        id === 'A8'
          ? {
              mode: 1,
              groups: [
                { group: 1, firstRib: 1, lastRib: 15, values: [10, 8, 1, 15, 5, 1] },
                { group: 2, firstRib: 16, lastRib: 17, values: [10, 6, 1, 4, 2, 1] },
              ],
            }
          : d.noseMylars,
    }),
  })),
  {
    name: 'coarse ellipses and a wide rib allowance',
    directory: 'oracle/designs/gnuC-27',
    edit: (d) => ({
      ...d,
      sewingAllowances: { ...d.sewingAllowances, ribs: 25 },
      specialParameters: { mode: 1, entries: [{ code: 3002, value: 24 }] },
    }),
  },
];

// A rod ending on an airfoil point has its last two points a rounding
// apart: the direction of their offset is rounding (MODELS.md).
const roundingEnd = ({ line }: RibRod) =>
  [line.slice(0, 2), line.slice(-2)].some(([[u0, v0], [u1, v1]]) => {
    const d = Math.hypot(u1 - u0, v1 - v0);
    return d > 0 && d < 1e-9;
  });

// The smallest cases by default: every one with ORACLE_ALL=1.
const chosen = [
  'A8',
  'BHL7-22',
  'dat airfoil',
  'triangles, rectangles and rotated ellipses',
  'upright anchor dots, double inlet dots and rib points',
  'turned anchor dots, split inlet lines and trimmed inlets',
  'intrados rods, arcs and nose mylars',
  'single skin: extrados rods before nose mylars',
  'A8 as a "pc" wing',
];

for (const { name, directory, files: variant, edit } of oracleCases(cases, chosen))
  test(`${name}: rib patterns as the engine draws them in leparagliding.dxf`, async () => {
    const files = variant?.() ?? designFiles(directory);
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
    const [drawn, cuts] = [dxfSegments(text, 1), dxfSegments(text, 3)];
    const tableCuts = [...drawn, ...dxfSegments(text, 2)];
    const crosses = crossCentres([...cuts, ...dxfSegments(text, 4)]);
    const table = 2530 * design.geometry.drawingScale;
    const dotted = (color: number | undefined) => {
      const dots = dxfDots(text, color);
      return (points: readonly Point[], [dx, dy]: Point) =>
        points.flatMap(([x, y], k) =>
          dots.some((c) => near(c, [x + dx, y + dy], 6e-3)) ? [] : [k],
        );
    };
    const [anchorDots, inletDots, ribPoints, numerals] = [30, 3, 5, 7].map(dotted);
    const [anchorLines, inletLines] = [30, 3].map((color) => dxfSegments(text, color));
    const isDrawn = (among: Segment[], [a, b]: Segment, [dx, dy]: Point) => {
      const [p, q]: Point[] = [a, b].map(([x, y]) => [x + dx, y + dy]);
      return among.some(([c, d]) => covers(c, d, p) && covers(c, d, q));
    };
    const [rodLines, mylarLines, mylarEnds] = [150, 10, 2].map((c) => dxfSegments(text, c));
    const [pocketLines, arcPocketLines] = [30, 10].map((c) => dxfSegments(text, c));
    const [rodEnds, pocketDots, arcPocketDots, mylarDots] = [160, 30, 10, 7].map(dotted);
    /** Segments not drawn at the best of the translations putting the first on a drawn one. */
    const asPiece = (
      lines: readonly (readonly Point[])[],
      among: Segment[],
      dots: readonly Point[],
      drawnDots: (points: readonly Point[], shift: Point) => number[],
    ) => {
      const [a, b] = polyline(lines[0])[0];
      return among
        .flatMap(([c, d]): Point[] =>
          near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
            ? [[c[0] - a[0], c[1] - a[1]]]
            : [],
        )
        .map((shift) => [
          ...lines
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(among, line, shift) ? [] : [`line ${k}`])),
          ...drawnDots(dots, shift).map((k) => `numeral ${k}`),
        ])
        .reduce((x, y) => (y.length < x.length ? y : x), ['not found']);
    };
    const everything = dxfSegments(text);
    const anyDot = dotted(undefined);
    const ribs = ribPatterns(design, input.airfoils);
    expect(ribs).toHaveLength(design.geometry.ribs.length);
    // Mylars ending inside a "pc" inlet are left open.
    expect(ribs.flatMap((r) => (r.mylar && r.mylar.outline.length > 1 ? [r.rib + 1] : []))).toEqual(
      name === 'A8 as a "pc" wing' ? [16, 17] : [],
    );
    for (const rib of ribs) {
      const sewing = polyline(rib.sewing);
      const [a, b] = sewing[0];
      // Translations putting the first segment on a drawn line of the same vector.
      const shifts = drawn.flatMap(([c, d]): Point[] =>
        near([d[0] - c[0], d[1] - c[1]], [b[0] - a[0], b[1] - a[1]], 2e-3)
          ? [[c[0] - a[0], c[1] - a[1]]]
          : [],
      );
      const placed = shifts.filter((shift) => sewing.every((line) => isDrawn(drawn, line, shift)));
      expect(placed.length, `rib ${rib.rib + 1} airfoil`).toBeGreaterThan(0);
      // The engine draws a rib more than once: the best drawing of its
      // holes, and of its cut lines on the cutting table, a "pc" nose in color 2.
      const missing = placed
        .map(([dx, dy]) => [
          ...rib.cut
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(tableCuts, line, [dx + table, dy]) ? [] : [`cut ${k}`])),
          ...rib.holes
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(cuts, line, [dx, dy]) ? [] : [`hole ${k}`])),
        ])
        .reduce((x, y) => (y.length < x.length ? y : x));
      expect(missing, `rib ${rib.rib + 1} cut lines and holes`).toEqual([]);
      const unmarked = placed
        .map(([dx, dy]) =>
          rib.marks.flatMap(([x, y], k) =>
            crosses.some((c) => near(c, [x + dx, y + dy], 3e-3)) ? [] : [k],
          ),
        )
        .reduce((x, y) => (y.length < x.length ? y : x));
      // §11.3 leaves out a last rib of no thickness.
      if (rib.rib < ribs.length - 1 || rib.sewing.some(([, v]) => v !== 0))
        expect(rib.marks.length, `rib ${rib.rib + 1} marks`).toBeGreaterThan(1);
      expect(unmarked, `rib ${rib.rib + 1} marks`).toEqual([]);
      // The cutting table: the best of the drawings moved onto it.
      const missed = placed
        .map(([dx, dy]): Point => [dx + table, dy])
        .map((shift) => [
          ...anchorDots(rib.anchors.dots, shift).map((k) => `anchor dot ${k}`),
          ...rib.anchors.lines
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(anchorLines, line, shift) ? [] : [`anchor line ${k}`])),
          ...inletDots(rib.inlets.dots, shift).map((k) => `inlet dot ${k}`),
          ...rib.inlets.lines
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(inletLines, line, shift) ? [] : [`inlet line ${k}`])),
          ...ribPoints(rib.points, shift).map((k) => `point ${k}`),
          ...numerals(rib.numeral, shift).map((k) => `numeral ${k}`),
        ])
        .reduce((x, y) => (y.length < x.length ? y : x));
      expect(missed, `rib ${rib.rib + 1} cutting table`).toEqual([]);
      // From the first rib with a rectangle hole, the engine's arcs are NaN, written as such.
      const rectangle = design.holes.some(
        (g) => g.firstRib <= rib.rib + 1 && g.holes.some((hole) => hole.type === 4),
      );
      const nan = (rod: RibRod) => !rod.edges.flat().every((p) => p.every(Number.isFinite));
      expect(
        rib.rods.filter(nan).map((rod) => rod.type),
        `rib ${rib.rib + 1} NaN rods`,
      ).toEqual(rectangle ? rib.rods.filter((rod) => rod.type === 2).map(() => 2) : []);
      if (rib.rods.some(nan))
        expect(rodLines.some((line) => line.flat().some(Number.isNaN))).toBe(true);
      const checked = rib.rods.flatMap((rod, r): [RibRod, number][] =>
        roundingEnd(rod) || nan(rod) ? [] : [[rod, r]],
      );
      // Rods and mylar on the rib, their ends on the cutting table.
      const reinforced = placed
        .map(([dx, dy]) => {
          const at: Point = [dx, dy];
          const onTable: Point = [dx + table, dy];
          return [
            ...checked.flatMap(([rod, r]) => [
              ...rod.edges
                .flatMap(polyline)
                .flatMap((line, k) => (isDrawn(rodLines, line, at) ? [] : [`rod ${r} edge ${k}`])),
              ...polyline(rod.pocket).flatMap((line, k) =>
                isDrawn(pocketLines, line, at) ? [] : [`rod ${r} pocket ${k}`],
              ),
              ...rodEnds(
                rod.edges.flatMap((edge) => [edge[0], edge.at(-1)!]),
                onTable,
              ).map((k) => `rod ${r} end ${k}`),
            ]),
            ...polyline(rib.mylar?.edge ?? []).flatMap((line, k) =>
              isDrawn(mylarLines, line, at) ? [] : [`mylar edge ${k}`],
            ),
            ...(rib.mylar?.ends ?? [])
              .flatMap(polyline)
              .flatMap((line, k) => (isDrawn(mylarEnds, line, onTable) ? [] : [`mylar end ${k}`])),
          ];
        })
        .reduce((x, y) => (y.length < x.length ? y : x));
      expect(reinforced, `rib ${rib.rib + 1} rods and mylar`).toEqual([]);
      // Each pocket and the mylar as their own pieces.
      for (const [rod, r] of checked)
        expect(
          rod.type === 2
            ? asPiece([rod.pocket], arcPocketLines, rod.numeral, arcPocketDots)
            : asPiece([rod.pocket], pocketLines, rod.numeral, pocketDots),
          `rib ${rib.rib + 1} pocket ${r}`,
        ).toEqual([]);
      if (rib.mylar)
        expect(
          // A "pc" inlet crosses it in color 3.
          asPiece(
            rib.mylar.outline,
            design.geometry.paragliderType === 'pc' ? [...mylarLines, ...cuts] : mylarLines,
            rib.mylar.numeral,
            mylarDots,
          ),
          `rib ${rib.rib + 1} mylar`,
        ).toEqual([]);
      const named = (g: { firstRib: number; lastRib: number }) =>
        g.firstRib <= rib.rib + 1 && rib.rib + 1 <= g.lastRib;
      const { joncs, noseMylars } = design;
      const blocs =
        joncs.mode === 0
          ? []
          : joncs.mode === 1
            ? [{ type: 1, groups: joncs.groups }]
            : joncs.blocs;
      expect(rib.rods.length, `rib ${rib.rib + 1} rods`).toBe(
        blocs.reduce((sum, b) => sum + b.groups.filter(named).length * (b.type === 3 ? 2 : 1), 0),
      );
      expect(!!rib.mylar, `rib ${rib.rib + 1} mylar`).toBe(
        noseMylars.mode === 1 && noseMylars.groups.some(named),
      );
      // The V-ribs sewn to it: on its drawing, and marked on the cutting table.
      const sewnAt = placed
        .map(([dx, dy]) => [
          ...rib.vRibs.lines
            .flatMap(polyline)
            .flatMap((line, k) => (isDrawn(everything, line, [dx, dy]) ? [] : [`line ${k}`])),
          ...rib.vRibs.table.lines
            .flatMap(polyline)
            .flatMap((line, k) =>
              isDrawn(everything, line, [dx + table, dy]) ? [] : [`table line ${k}`],
            ),
          ...anyDot(rib.vRibs.table.dots, [dx + table, dy]).map((k) => `dot ${k}`),
        ])
        .reduce((x, y) => (y.length < x.length ? y : x));
      expect(sewnAt, `rib ${rib.rib + 1} V-ribs`).toEqual([]);
      // Each anchor off the leading edge marked at least once.
      const row = design.anchors[rib.rib];
      const anchored = row ? row.positions.slice(0, row.count).filter((p) => p > 0).length : 0;
      const form = design.markTypes[4]?.laser.type;
      if (form === 3)
        expect(rib.anchors.lines.length, `rib ${rib.rib + 1} anchors`).toBeGreaterThanOrEqual(
          anchored,
        );
      if (form === 1 || form === 2)
        expect(rib.anchors.dots.length, `rib ${rib.rib + 1} anchors`).toBeGreaterThanOrEqual(
          3 * anchored,
        );
      expect(
        rib.inlets.dots.length + rib.inlets.lines.length,
        `rib ${rib.rib + 1} inlet`,
      ).toBeGreaterThan(0);
      expect(rib.numeral.length, `rib ${rib.rib + 1} numeral`).toBeGreaterThan(0);
    }
    if (design.hvRibs.ribs.some(({ type }) => type !== 1 && type !== 11))
      expect(ribs.some((rib) => rib.vRibs.table.dots.length > 0)).toBe(true);
  });
