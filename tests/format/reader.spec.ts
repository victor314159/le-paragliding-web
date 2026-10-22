// Criterion 3: one small fixture per branch of the engine's reader and per
// list-directed case, and the diagnostics (with their position) of what it
// cannot read. Fixtures are the design of helpers.ts lep() with one section
// replaced.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  locateLep,
  parseAirfoil,
  parseLep,
  validate,
  validateDesign,
  writeAirfoil,
  writeLep,
  type Diagnostic,
  type LepAirfoil,
  type LepDesign,
  type LepProject,
  type LineType,
  type ShapingCut,
} from '../../packages/format/src/index.ts';
import { countWords } from '../../packages/format/src/fortran.ts';
import { countLines } from '../../packages/format/src/validate.ts';
import { DAT_FIXTURE, DESIGNS, designFiles, lep, ok, project, section } from './helpers.ts';

/** Parses, checks the round trip, returns the design. */
function read(sections: Parameters<typeof lep>[0]): LepDesign {
  const design = ok(parseLep(lep(sections)));
  expect(ok(parseLep(ok(writeLep(design))))).toEqual(design);
  return design;
}

/** The single error of a failed parse. */
function error(text: string): Diagnostic {
  const result = parseLep(text);
  if (result.ok) throw new Error('parsed without error');
  expect(result.errors).toHaveLength(1);
  return result.errors[0];
}

/** The line number of `needle` in `text` (1-based). */
const lineOf = (text: string, needle: string) => text.split('\n').indexOf(needle) + 1;

// Section 1 of lep(), with `rows` as the rib table and `washin` as the
// "alpha max and parameter" line.
function geometry(washin: string[], rows: string[]): string[] {
  const s1 = lep().split('\n').slice(0, 26);
  return [...s1.slice(0, 21), ...washin, ...s1.slice(22, 26), ...rows];
}
const ROWS = [
  '1 0. 0. 250. 0. 0. 0. 33.33 0. 0. 50.',
  '2 100. 10. 240. 99. 5. 10. 33.33 0. 0. 50.',
];

test.describe('section 1', () => {
  test('9-column rib tables (before 3.16)', () => {
    const d = read({
      1: geometry(
        ['2.5 1'],
        ['1 0. 0. 250. 0. 0. 0. 33.33 0.', '2 100. 10. 240. 99. 5. 10. 33.33 1.'],
      ),
    });
    expect(d.geometry.ribColumns).toBe(9);
    expect(d.geometry.ribs[1]).toEqual({
      number: 2,
      x: 100,
      yLE: 10,
      yTE: 240,
      xp: 99,
      z: 5,
      beta: 10,
      rotationPoint: 33.33,
      washin: 1,
    });
  });

  test('washin modes 0 and 2 (re-read after BACKSPACE)', () => {
    expect(read({ 1: geometry(['3 0'], ROWS) }).geometry.washin).toEqual({ mode: 0, maxAngle: 3 });
    expect(read({ 1: geometry(['5.0 2 -1.5 ignored'], ROWS) }).geometry.washin).toEqual({
      mode: 2,
      maxAngle: 5,
      centerAngle: -1.5,
    });
  });

  test('an unknown washin mode or column count is an error', () => {
    const text = lep({ 1: geometry(['2.5   3'], ROWS) });
    expect(error(text)).toMatchObject({
      section: 1,
      field: 'geometry.washin.mode',
      line: lineOf(text, '2.5   3'),
      column: 7,
    });
    const ten = lep({ 1: geometry(['2.5 1'], ['1 0. 0. 250. 0. 0. 0. 33.33 0. 0.', ROWS[1]]) });
    expect(error(ten)).toMatchObject({
      field: 'geometry.ribColumns',
      line: lineOf(ten, '1 0. 0. 250. 0. 0. 0. 33.33 0. 0.'),
      message: expect.stringContaining('has 10 words'),
    });
  });

  test('a re-read that gives another value is an error', () => {
    // kbbb = 2 on the next line: the re-read after BACKSPACE starts there.
    const text = lep({ 1: geometry(['4.5', '2 1 9'], ROWS) });
    expect(error(text).message).toMatch(/reads geometry.washin.mode twice/);
  });
});

test.describe('section 9 and 10: lines and brakes', () => {
  test('rows without line types, with 5 levels further down', () => {
    const d = read({
      9: section(
        9,
        '3',
        '1',
        '3',
        '2 1 1 2 1 0 0 0 0 1 1',
        '5 1 1 2 1 3 1 4 1 5 1 2 2',
        '2 1 1 2 1 0 0 0 0 1 2 not read',
      ),
    });
    expect(d.lines.typed).toBe(false);
    expect(d.lines.plans[0].paths[1]).toEqual({
      levels: 5,
      branches: [
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
        [5, 1],
      ],
      anchorRow: 2,
      anchorRib: 2,
    });
  });

  test('rows with line types, 2 to 4 levels', () => {
    const d = read({
      9: section(
        9,
        '3',
        '2',
        '1',
        '2 1 1 2 1 0 0 0 0 1 1 - 1 2',
        '2',
        '3 1 1 2 1 3 1 0 0 2 1 type 1 2 3',
        '4 1 1 2 1 3 1 4 1 3 2 "a b" 1 2 3 4',
      ),
    });
    expect(d.lines.typed).toBe(true);
    expect(d.lines.plans.map((p) => p.paths.map((path) => path.lineTypes))).toEqual([
      [[1, 2]],
      [
        [1, 2, 3],
        [1, 2, 3, 4],
      ],
    ]);
  });

  test('unknown numbers of levels are errors', () => {
    const untyped = lep({ 9: section(9, '3', '1', '1', '6 1 1 2 1 0 0 0 0 1 1') });
    expect(error(untyped)).toMatchObject({
      field: 'lines.plans[0].paths[0].levels',
      line: lineOf(untyped, '6 1 1 2 1 0 0 0 0 1 1'),
      column: 1,
    });
    const typed = lep({ 9: section(9, '3', '1', '1', '5 1 1 2 1 3 1 4 1 1 1 - 1 2 3 4 5') });
    expect(error(typed).field).toBe('lines.plans[0].paths[0].levels');
  });

  test('a first row with fewer than 11 words is an error', () => {
    const text = lep({ 9: section(9, '3', '1', '1', '2 1 1 2 1 0 0 0 0 1') });
    expect(error(text)).toMatchObject({
      field: 'lines.typed',
      line: lineOf(text, '2 1 1 2 1 0 0 0 0 1'),
    });
  });

  test('brakes with line types, and no brakes', () => {
    const typed = read({
      10: section(
        10,
        '270',
        '2',
        '3 1 1 2 1 3 1 0 0 6 2.5 - 6 2 3',
        '2 1 1 2 2 0 0 0 0 6 1 - 6 2',
        '* d',
        '0 25 55 70 100',
        '0 0 0 0 0',
      ),
    });
    expect(typed.brakes.typed).toBe(true);
    expect(typed.brakes.paths.map((p) => [p.anchorRib, p.lineTypes])).toEqual([
      [2.5, [6, 2, 3]],
      [1, [6, 2]],
    ]);
    const none = read({ 10: section(10, '270', '0', '* d', '0 25 55 70 100', '0 0 0 0 0') });
    expect(none.brakes).toMatchObject({ typed: false, paths: [] });
  });
});

test.describe('section 12: H V and VH ribs', () => {
  test('types 6 and 16 have 12 columns (second pass)', () => {
    const d = read({
      12: section(
        12,
        '3',
        '80 180',
        '1 1 1 1 1 1 2.1 0 0 0',
        '2 6 1 1 1 1 2. 0 0 0 1. 1.',
        '3 16 1 1 1 1 2. 0 0 0 1. 1.',
      ),
    });
    expect(d.hvRibs.ribs.map((r) => r.parameters.length)).toEqual([8, 10, 10]);
  });

  test('rows the two passes read differently are an error', () => {
    // A 10-column row split on two lines: the second pass starts elsewhere.
    const text = lep({
      12: section(12, '2', '80 180', '1 1 1 1 0', '0 2.1 0 0 0', '2 1 1 1 0 0 2.1 0 0 0'),
    });
    expect(error(text).message).toMatch(/twice/);
  });
});

test.describe('sections 15 to 39', () => {
  test('15, 16: marks on ribs and cuts by panel; -1 is unknown', () => {
    const d = read({
      15: section(15, '1', '1 2', '1 0. 0.', '2 10 20'),
      16: section(16, '-2', '1', '2 1', '1 10 20 30 40'),
    });
    expect(d.extradosColors).toEqual({
      mode: 'ribs',
      ribs: [
        {
          rib: 1,
          marks: [
            { number: 1, positions: [0, 0] },
            { number: 2, positions: [10, 20] },
          ],
        },
      ],
    });
    expect(d.intradosColors).toEqual({
      mode: 'panels',
      panels: [{ panel: 2, cuts: [{ number: 1, left: 10, right: 20, seamWidth: 30, unused: 40 }] }],
    });
    expect(error(lep({ 15: section(15, '-1') })).field).toBe('extradosColors.mode');
  });

  test('21: joncs, scheme 1 and the five bloc types of scheme 2', () => {
    const group = ['1 1 2', '4.2 10.8 1.36 2.0', '3.67 10.8 0.79 2.0', '2.0 9.35 6.3 9.35'];
    expect(read({ 21: section(21, '1', '1', ...group) }).joncs).toMatchObject({
      mode: 1,
      groups: [
        {
          group: 1,
          extrados: { from: 4.2, to: 10.8, deflection: 1.36, exponent: 2 },
          pocket: { offset: 2, outerWidth: 9.35, rodWidth: 6.3, innerWidth: 9.35 },
        },
      ],
    });
    const d = read({
      21: section(
        21,
        '2',
        '5',
        '1 1',
        '1',
        ...group,
        '2 2',
        '1',
        '1 1 2',
        '1 2 3 4 5',
        '6 7 8 9',
        '3 3',
        '1',
        '1 1 2',
        '1 2 3 4',
        '5 6 7 8',
        '15 16 17 18',
        '11 12 13 14',
        '21 22 23 24',
        '4 4',
        '0',
        '5 5',
        '1',
        ...group,
      ),
    });
    if (d.joncs.mode !== 2) throw new Error('scheme 2 expected');
    expect(d.joncs.blocs.map((b) => b.type)).toEqual([1, 2, 3, 4, 5]);
    expect(d.joncs.blocs[1]).toMatchObject({
      groups: [{ x1: 1, y1: 2, x2: 3, y2: 4, deflection: 5, pocket: { offset: 6, innerWidth: 9 } }],
    });
    // Shark nose: extrados, upper rod, lower rod, intrados, in file order.
    expect(d.joncs.blocs[2]).toMatchObject({
      groups: [
        {
          extrados: { from: 1, exponent: 4 },
          upperRod: { from: 5, exponent: 8 },
          lowerRod: { from: 15, exponent: 18 },
          intrados: { from: 11, exponent: 14 },
          pocket: { offset: 21 },
        },
      ],
    });
    expect(d.joncs.blocs[4]).toMatchObject({
      groups: [{ initial: { from: 4.2 }, final: { from: 3.67 }, pocket: { offset: 2 } }],
    });
    expect(error(lep({ 21: section(21, '2', '1', '1 6', '0') })).field).toBe('joncs.blocs[0].type');
    expect(error(lep({ 21: section(21, '3') })).field).toBe('joncs.mode');
  });

  test('22 to 25: nose mylars, tab reinforcements, DXF options', () => {
    const d = read({
      22: section(22, '1', '1', '1 1 2', '1 2 3 4 5 6'),
      23: section(23, '0'),
      24: section(24, '1', 'A 1', 'B 5', 'C 30', 'D 3', 'E 4', 'F 6'),
      25: section(
        25,
        '1',
        'A 1',
        'B 30',
        'C 3',
        'D 4',
        'E 8',
        'F 6',
        'Extrados 1 7',
        'Vents 0 1',
        'Intrados 1 3',
      ),
    });
    expect(d.noseMylars).toEqual({
      mode: 1,
      groups: [{ group: 1, firstRib: 1, lastRib: 2, values: [1, 2, 3, 4, 5, 6] }],
    });
    expect(d.dxf2d).toEqual({ mode: 1, lineColors: [1, 5, 30, 3, 4, 6] });
    expect(d.dxf3d).toMatchObject({
      surfaces: [
        { drawn: 1, color: 7 },
        { drawn: 0, color: 1 },
        { drawn: 1, color: 3 },
      ],
    });
  });

  test('26: glue vents of types ±4, ±5, ±6 re-read their line', () => {
    const d = read({ 26: section(26, '1', '1 -4 0.5 0.6', '2 5 1 2 3') });
    expect(d.glueVents).toEqual({
      mode: 1,
      ribs: [
        { type: -4, parameters: [0.5, 0.6] },
        { type: 5, parameters: [1, 2, 3] },
      ],
    });
    expect(read({ 26: section(26, '1', '1 0', '2 6 1 2') }).glueVents).toMatchObject({
      ribs: [{ parameters: [] }, { parameters: [1, 2] }],
    });
  });

  test('27, 28: wing tips and calage variation', () => {
    expect(read({ 27: section(27, '1', 'a 10', 'b 20') }).wingTip).toEqual({
      mode: 1,
      angleLE: 10,
      angleTE: 20,
    });
    expect(read({ 27: section(27, '2', 'd 5', 'a 30') }).wingTip).toEqual({
      mode: 2,
      distance: 5,
      angle: 30,
    });
    expect(read({ 27: section(27, '4', 'r 1 2') }).wingTip).toEqual({
      mode: 4,
      displacement: 1,
      rotation: 2,
    });
    expect(error(lep({ 27: section(27, '3') })).field).toBe('wingTip.mode');
    expect(
      read({ 28: section(28, '1', '4', '8.5 27.5 53 77 0 0', '-4 10 4 10') }).calageVariation,
    ).toEqual({
      mode: 1,
      risers: 4,
      positions: [8.5, 27.5, 53, 77, 0, 0],
      speedAngle: -4,
      speedSteps: 10,
      trimAngle: 4,
      trimSteps: 10,
    });
  });

  test('29: 3D shaping, types 1 and 2, every number of cuts', () => {
    const print = [
      '* print',
      'Inter3D 0 1 17 1',
      'Ovali3D 0 1 17 0',
      'tesse3D 0 1 18 1',
      'exteDXF 1 1 18 1',
      'exteSTL 1 1 2 0',
    ];
    const groups = [
      'groups 3',
      'group 1 1 1',
      'upper 0 1',
      'lower 1 1',
      '1 10 20 0.5',
      'group 2 2 2',
      'upper 1 1',
      '1 10 20 0.5',
      'lower 0 1',
      'group 3 2 2',
      'upper 2 2',
      '1 10 20 0.5',
      '2 30 40 1.5',
      'lower 0 1',
    ];
    const d = read({ 29: section(29, '1', '1', ...groups, ...print) });
    if (d.shaping.mode === 0) throw new Error('shaping expected');
    expect(d.shaping.groups.map((g) => [g.upper.cuts.length, g.lower.cuts.length])).toEqual([
      [0, 1],
      [1, 0],
      [2, 0],
    ]);
    expect(d.shaping.groups[2].upper.cuts[1]).toEqual({
      number: 2,
      start: 30,
      end: 40,
      depth: 1.5,
    });
    expect(d.shaping.print.stl).toEqual({ draw: 1, first: 1, last: 2, oneSide: 0 });
    // Type 2 reads the same records, but ignores its cut points: not valid.
    const type2 = ok(parseLep(lep({ 29: section(29, '2', '1', ...groups, ...print) })));
    expect(type2.shaping.mode).toBe(2);
    expect(
      validate({ design: type2, airfoils: new Map() })
        .filter((e) => e.section === 29)
        .map((e) => e.field),
    ).toEqual([
      'shaping.groups[0].lower.cuts',
      'shaping.groups[1].upper.cuts',
      'shaping.groups[2].upper.cuts',
    ]);
    const bad = lep({ 29: section(29, '1', '1', 'groups 1', 'group 1 1 2', 'upper 3 1') });
    expect(error(bad)).toMatchObject({
      field: 'shaping.groups[0].upper.cuts',
      line: lineOf(bad, 'upper 3 1'),
      column: 7,
    });
    // xiupp is INTEGER, as iupp.
    expect(
      error(
        lep({ 29: section(29, '2', '1', 'groups 1', 'group 1 1 2', 'upper 1 1', '1 0.5 20 0.5') }),
      ).message,
    ).toMatch(/integer/);
  });

  test('30 to 33', () => {
    const d = read({
      30: section(30, '1', '1 0.9', '2 0.8'),
      31: section(31, '1', '1', '* group', '1 1 2 2 1', '1 0 0.05 0 0', '2 100 0 100 0.1'),
      32: section(
        32,
        '1',
        ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((l, k) => `${l} ${k}`),
      ),
      33: section(33, '1', '1', 'A 47.0 cm'),
    });
    expect(d.thickness).toEqual({ mode: 1, ribs: [0.9, 0.8] });
    expect(d.skinTensionGroups).toMatchObject({
      groups: [
        {
          group: 1,
          firstRib: 1,
          lastRib: 2,
          type: 1,
          points: [
            {
              extradosPosition: 0,
              extradosOverwidth: 0.05,
              intradosPosition: 0,
              intradosOverwidth: 0,
            },
            {
              extradosPosition: 100,
              extradosOverwidth: 0,
              intradosPosition: 100,
              intradosOverwidth: 0.1,
            },
          ],
        },
      ],
    });
    expect(d.partsSeparation).toMatchObject({ panelX: 0, parameter10: 9 });
    expect(d.risers).toEqual({ mode: 1, type: 1, lengths: [47] });
    expect(read({ 33: section(33, '1', '3') }).risers).toEqual({ mode: 1, type: 3 });
  });

  test('34: risers and lines; other kinds are unknown', () => {
    const d = read({
      // Typed brakes: untyped ones would need a type 6.
      10: section(
        10,
        '270',
        '1',
        '2 1 1 2 1 0 0 0 0 6 1.5 - 1 2',
        '* d',
        '0 25 55 70 100',
        '0 0 0 0 0',
      ),
      34: section(
        34,
        '1',
        '2',
        '1 r 12. 2.5 Riser 1000 daN aramid 15.0 g s 12. cm 7',
        '2 c 1.4 "PPSL 160" 160 daN s_dyneem 1.34 g s 12. cm 1',
      ),
    });
    expect(d.lineTypes).toEqual({
      mode: 1,
      types: [
        {
          number: 1,
          kind: 'r',
          width: 12,
          thickness: 2.5,
          name: 'Riser',
          strength: 1000,
          material: 'aramid',
          weight: 15,
          loopType: 's',
          loopLength: 12,
          color: 7,
        },
        {
          number: 2,
          kind: 'c',
          diameter: 1.4,
          name: 'PPSL 160',
          strength: 160,
          material: 's_dyneem',
          weight: 1.34,
          loopType: 's',
          loopLength: 12,
          color: 1,
        },
      ],
    });
    const text = lep({
      34: section(34, '1', '1', '1 R 12. 2.5 Riser 1000 daN aramid 15.0 g s 12. cm 7'),
    });
    expect(error(text)).toMatchObject({
      field: 'lineTypes.types[0].kind',
      line: lineOf(text, '1 R 12. 2.5 Riser 1000 daN aramid 15.0 g s 12. cm 7'),
      column: 3,
    });
  });

  test('35 to 37', () => {
    const d = read({
      35: section(35, '1', ...Array.from({ length: 18 }, (_, k) => `x${k} ${k}.5 unit`)),
      36: section(
        36,
        '1',
        '* Panel parameters',
        '10 chord nr',
        '2 per cell',
        '1 cosine',
        '0 uniform',
        '* billowed',
        '0',
      ),
      37: section(
        37,
        '1',
        '12',
        '1291 12 nsegments',
        '1146 36.',
        '1341 0',
        '1351 6',
        '1352 2',
        '1353 2',
        "2000 '2026-10-21 v2'",
        '2003 -0.03',
        '3001 1 0.25 0.75',
        '3002 55',
        '2005 1',
        '2006 1',
      ),
    });
    expect(d.equilibrium).toMatchObject({ mode: 1, gravity: 0.5, zcp: 17.5 });
    expect(d.xflr5).toEqual({
      mode: 1,
      panels: { chord: 10, span: 2, chordDistribution: 1, spanDistribution: 0 },
      billowed: 0,
    });
    expect(d.specialParameters.mode === 1 && d.specialParameters.entries).toEqual([
      { code: 1291, value: 12 },
      { code: 1146, value: 36 },
      { code: 1341, value: 0 },
      { code: 1351, value: 6 },
      { code: 1352, value: 2 },
      { code: 1353, value: 2 },
      { code: 2000, value: '2026-10-21 v2' },
      { code: 2003, value: -0.03 },
      { code: 3001, transition: 1, values: [0.25, 0.75] },
      { code: 3002, value: 55 },
      { code: 2005, value: 1 },
      { code: 2006, value: 1 },
    ]);
    expect(error(lep({ 37: section(37, '1', '1', '9999 1') })).field).toBe(
      'specialParameters.entries[0].code',
    );
    // Transition 0: the engine leaves the line unread.
    expect(error(lep({ 37: section(37, '1', '1', '3001 0') })).field).toBe(
      'specialParameters.entries[0].transition',
    );
  });

  test('38, 39: section 39 reads its coefficients when section 38 is active, whatever k39d', () => {
    const coefficients = ['6', 'v1 0.5 1.0', 'v2 1 1', 'v3 1 1', 'v4 1 1', 'v5 0.4 1', 'v6 0.4 1'];
    const holes = section(38, '1', '1', '1 16 1 5 70. 50. 0.5 0.0 0.0');
    for (const mode of ['0', '1']) {
      const d = read({ 38: holes, 39: section(39, mode, ...coefficients) });
      expect(d.hvrPositions).toEqual({
        mode: Number(mode),
        coefficients: [0.5, 1, 1, 1, 0.4, 0.4].map((horizontal) => ({ horizontal, vertical: 1 })),
      });
      expect(d.hvrHoles).toEqual({
        mode: 1,
        rows: [
          {
            number: 1,
            type: 16,
            drawn: 1,
            holes: 5,
            height: 70,
            width: 50,
            center: 0.5,
            offset: 0,
            unused: 0,
          },
        ],
      });
    }
    // k38d = 0, k39d = 1: nothing read, nothing set. Readable, not valid.
    const d = ok(parseLep(lep({ 39: section(39, '1', 'anything after is not read') })));
    expect(d.hvrPositions).toEqual({ mode: 1 });
    expect(validate({ design: d, airfoils: new Map() }).map((e) => e.field)).toContain(
      'hvrPositions.mode',
    );
  });
});

test.describe('list-directed input', () => {
  const value = (line: string) =>
    read({
      8: section(
        8,
        '* Finesse GR',
        line,
        ...lep().split('\n').slice(lineOf(lep(), '7.0'), lineOf(lep(), '40')),
      ),
    }).angleOfAttack.glideRatio;

  test('real constants', () => {
    expect(value('1.')).toBe(1);
    expect(value('.5')).toBe(0.5);
    expect(value('1d0')).toBe(1);
    expect(value('1.5D+2')).toBe(150);
    expect(value('2.5e-1')).toBe(0.25);
    expect(value('1.0+2')).toBe(100);
    expect(value('+7')).toBe(7);
    expect(Object.is(value('-0.0'), -0)).toBe(true);
    expect(value('\t 7.0 \t trailing words / are , ignored')).toBe(7);
  });

  test('separators, repeats, continuation and quotes', () => {
    const rows = (row1: string, ...more: string[]) =>
      read({ 1: geometry(['2.5 1'], [row1, ...more]) }).geometry.ribs;
    // Commas and tabs; a repeat counts as as many words as it repeats.
    expect(rows('1,0.,0.,250.,0.\t0.\t0., 33.33 , 3*0.', ROWS[1])[0]).toMatchObject({
      yTE: 250,
      rotationPoint: 33.33,
      washin: 0,
      rotZ: 0,
      rotZPosition: 0,
    });
    // A row continued on the next line (the first row decides the columns).
    expect(rows(ROWS[0], '2 100. 10. 240.', '  99. 5. 10. 33.33', '0. 0. 50.')[1]).toMatchObject({
      xp: 99,
      rotZPosition: 50,
    });
    // Blank lines are skipped while looking for values.
    expect(rows(ROWS[0], '', '   ', ROWS[1])[1].x).toBe(100);
    // Quotes: doubled delimiters, blanks, the other delimiter.
    const names = read({
      1: lep()
        .split('\n')
        .slice(0, 28)
        .map((l) => (l === '"Brand"' ? `'L''envol, "Pere"'` : l === '"Wing"' ? '"two  words"' : l)),
    });
    expect([names.geometry.brandName, names.geometry.wingName]).toEqual([
      `L'envol, "Pere"`,
      'two  words',
    ]);
    // Repeat counts: 1 to 200000000 (gfortran refuses more, flang aborts).
    expect(value('200000000*7.')).toBe(7);
    expect(error(lep().replace('\n7.0\n', '\n200000001*7.\n'))).toMatchObject({
      section: 8,
      field: 'angleOfAttack.glideRatio',
      message: 'A repeat count is at most 200000000: 200000001',
    });
  });

  test('table columns are counted as the engine counts them', () => {
    // count(words /= ""): repeats count, null values and what follows / do not.
    expect(countWords('1 2 3*4 ,, 5 / 6')).toBe(6);
    // Only spaces are blank: a no-break space is a word.
    expect(countWords('1 \u00a0 2')).toBe(3);
    // words is character(100): a value blank in its first 100 bytes is blank.
    expect(countWords(`'${' '.repeat(100)}x' 1`)).toBe(1);
  });

  test('CRLF files read like LF files', () => {
    expect(ok(parseLep(lep().replaceAll('\n', '\r\n')))).toEqual(ok(parseLep(lep())));
  });

  test('character values keep their leftmost bytes, with a warning', () => {
    const long = 'x'.repeat(60);
    const result = parseLep(lep().replace('"Brand"', long));
    expect(result.ok && result.value.geometry.brandName).toBe('x'.repeat(50));
    expect(result.ok && result.warnings).toMatchObject([
      { severity: 'warning', field: 'geometry.brandName', line: 10, column: 1 },
    ]);
  });

  test('null values and slashes without a previous value are errors', () => {
    const text = lep().replace('2.5 1', '2.5,,');
    expect(error(text)).toMatchObject({
      field: 'geometry.washin.mode',
      line: lineOf(text, '2.5,,'),
      column: 5,
    });
    expect(error(lep().replace('2.5 1', '2.5 /')).field).toBe('geometry.washin.mode');
    expect(error(lep().replace('2.5 1', '2*')).field).toBe('geometry.washin.maxAngle');
  });

  test('a real number in an integer is an error', () => {
    const text = lep().replace('* Number of cells\n2', '* Number of cells\n2.');
    expect(error(text)).toMatchObject({
      field: 'geometry.cells',
      line: 18,
      column: 1,
      message: expect.stringContaining('"2."'),
    });
    expect(error(lep().replace('2.5 1', '2.5 1.0')).field).toBe('geometry.washin.mode');
    expect(error(lep().replace('* Wing scale\n1.', '* Wing scale\n"1."')).message).toMatch(
      /character constant/,
    );
  });

  test('unterminated character constants and unsupported characters are errors', () => {
    expect(error(lep().replace('"Brand"', "'Brand")).message).toMatch(/Unterminated/);
    expect(error(lep().replace('"Brand"', '"Brand')).message).toMatch(/after a character constant/);
    expect(error(lep().replace('* Wing scale\n1.', '* Wing scale\n1.;')).message).toMatch(/";"/);
  });
});

test.describe('errors', () => {
  test('a truncated file', () => {
    const text = lep();
    const cut = text.split('\n').slice(0, lineOf(text, '* Brake distribution')).join('\n');
    expect(error(cut)).toMatchObject({
      section: 10,
      line: lineOf(text, '* Brake distribution') + 1,
      message: expect.stringContaining('ends'),
    });
    expect(error('')).toMatchObject({ section: 1, line: 1 });
  });

  test('a wrong count', () => {
    // 2 paths announced, 1 written: the brakes header is read as a path.
    const text = lep({ 9: section(9, '3', '1', '2', '2 1 1 2 1 0 0 0 0 1 1') });
    expect(error(text)).toMatchObject({
      section: 9,
      field: 'lines.plans[0].paths[1].levels',
      line: lineOf(text, '*   10. SECTION 10') - 1,
      message: expect.stringContaining('Expected an integer'),
    });
    expect(error(lep({ 4: section(4, '-1') })).field).toBe('holes.length');
  });

  test('lexical errors keep their file, section and field', () => {
    const result = parseLep(lep().replace('"Brand"', '0*Brand'), { file: 'my-project.txt' });
    expect(result).toMatchObject({
      ok: false,
      errors: [
        { file: 'my-project.txt', section: 1, field: 'geometry.brandName', line: 10, column: 1 },
      ],
    });
  });

  test('a character constant continued on a CRLF line', () => {
    const crlf = lep().replace('"Brand"', '"Bra\nnd"').replaceAll('\n', '\r\n');
    expect(ok(parseLep(crlf)).geometry.brandName).toBe('Brand');
  });

  test('null values keep the value the engine already has', () => {
    // A label (gname), never used.
    expect(read({ 27: section(27, '1', ', 10', 'b 20') }).wingTip).toEqual({
      mode: 1,
      angleLE: 10,
      angleTE: 20,
    });
    // rib(i,1), read in section 1 and again in section 2.
    expect(
      read({ 2: section(2, '* rows', ',gnua.txt 1.6 6.3 1 0 1 15', '2 gnua.txt 1.6 6.3 1 0 1 15') })
        .airfoils[0].number,
    ).toBe(1);
    // Section 37: the engine's defaults (nsegments = 12), then the values read.
    const special = read({ 37: section(37, '1', '3', '1291 /', '3002 40', '3002,,') });
    expect(special.specialParameters).toEqual({
      mode: 1,
      entries: [
        { code: 1291, value: 12 },
        { code: 3002, value: 40 },
        { code: 3002, value: 40 },
      ],
    });
    // Section 39 with k39d = 0: types 1, 2, 3, 5 and 6 at 1 first, not type 4.
    const holes = section(38, '1', '1', '1 16 1 5 70. 50. 0.5 0.0 0.0');
    const rows = ['6', 'v1 /', 'v2 1 1', 'v3 1 1', 'v4 1 1', 'v5 1 1', 'v6 1 1'];
    expect(
      read({ 38: holes, 39: section(39, '0', ...rows) }).hvrPositions.coefficients?.[0],
    ).toEqual({
      horizontal: 1,
      vertical: 1,
    });
    const v4 = lep({
      38: holes,
      39: section(39, '0', ...rows.map((r) => (r === 'v4 1 1' ? 'v4 /' : r))),
    });
    expect(error(v4).field).toBe('hvrPositions.coefficients[3].horizontal');
  });

  test('Q exponents read; infinities and NaN are refused', () => {
    const glide = (value: string) =>
      parseLep(lep().replace('* Finesse GR\n7.0', `* Finesse GR\n${value}`));
    const q = glide('.7q1');
    expect(q.ok && q.value.angleOfAttack.glideRatio).toBe(7);
    for (const value of ['Inf', '-Infinity', 'NaN']) {
      expect(glide(value)).toMatchObject({
        ok: false,
        errors: [{ field: 'angleOfAttack.glideRatio', message: expect.stringContaining('finite') }],
      });
    }
  });

  test('invalid levels do not make validate loop', () => {
    const d = ok(parseLep(lep()));
    const path = d.lines.plans[0].paths[0];
    for (const levels of [100000, Infinity]) {
      const design = { ...d, lines: { ...d.lines, plans: [{ paths: [{ ...path, levels }] }] } };
      expect(validate({ design, airfoils: new Map() }).length).toBeLessThan(10);
    }
  });
});

test('locateLep places each field in the text', () => {
  const text = lep();
  const positions = ok(locateLep(text));
  expect(positions.get('geometry.cells')).toEqual({ line: lineOf(text, '2'), column: 1 });
  expect(positions.get('geometry.washin.mode')).toEqual({ line: lineOf(text, '2.5 1'), column: 5 });
  expect(positions.get('brakes.paths[0].anchorRib')).toEqual({
    line: lineOf(text, '2 1 1 2 1 0 0 0 0 6 1.5'),
    column: 21,
  });
});

/** The errors of a design alone, as "section field". */
const designErrors = (design: LepDesign) =>
  validateDesign(design)
    .filter((e) => e.severity === 'error')
    .map((e) => `${e.section} ${e.field}`);

const lineType = (number: number): LineType => ({
  number,
  kind: 'c',
  diameter: 1,
  name: 'L',
  strength: 100,
  material: 'm',
  weight: 1,
  loopType: 's',
  loopLength: 10,
  color: 1,
});

test.describe('validate', () => {
  const d = ok(parseLep(lep()));
  const path = d.lines.plans[0].paths[0];
  const withPaths = (...paths: Partial<typeof path>[]): LepDesign => ({
    ...d,
    lines: { ...d.lines, plans: [{ paths: paths.map((changes) => ({ ...path, ...changes })) }] },
  });

  test('bounds, row counts and engine arrays', () => {
    const bad: LepDesign = {
      ...d,
      hvRibs: {
        ...d.hvRibs,
        ribs: Array.from({ length: 201 }, (_, i) => ({
          number: i + 1,
          type: 1,
          parameters: [1, 1, 1, 1, 0, 2.1, 0, 0],
        })),
      },
      lines: { ...d.lines, plans: [{ paths: [{ ...path, anchorRib: 3 }] }] },
      dxfLayers: ['default', ''],
    };
    expect(designErrors(bad)).toEqual([
      '9 lines.plans[0].paths[0].anchorRib', // the half wing has 2 ribs
      '12 hvRibs.ribs', // hvr(0:200,50)
      '19 dxfLayers[1]', // blank
    ]);
    expect(writeLep(bad).ok).toBe(false);
    // 300 cells: 151 ribs in the half wing, more than rib(0:100,…) holds.
    expect(validateDesign({ ...d, geometry: { ...d.geometry, cells: 300 } })[0]).toMatchObject({
      severity: 'error',
      section: 1,
      field: 'geometry.cells',
      message: 'Must be from 2 to 197: 300',
    });
    // The engine uses mark types 1 to 10.
    expect(designErrors({ ...d, markTypes: d.markTypes.slice(0, 9) })).toEqual(['20 markTypes']);
    // An absurd number of cells is a diagnostic, not an exception.
    const huge = ok(parseLep(designFiles('oracle/designs/gnuA7-26').get('leparagliding.txt')!));
    const result = writeLep({ ...huge, geometry: { ...huge.geometry, cells: 1e21 } });
    expect(!result.ok && result.errors.map((e) => e.field)).toContain('geometry.cells');
  });

  test('line paths: indices, levels, tree and contiguity', () => {
    // corda(i,2..3) index x1line(10,5,100): levels 0 to 5, orders 0 to 100.
    expect(
      designErrors(
        withPaths({
          branches: [
            [1000, 1],
            [2, 101],
            [0, 0],
            [0, 0],
          ],
        }),
      ),
    ).toEqual([
      '9 lines.plans[0].paths[0].branches[0][0]',
      '9 lines.plans[0].paths[0].branches[1][1]',
    ]);
    // Pair k at level k, (0, 0) past the levels.
    expect(
      designErrors(
        withPaths({
          branches: [
            [1, 1],
            [3, 1],
            [0, 0],
            [4, 1],
          ],
        }),
      ),
    ).toEqual([
      '9 lines.plans[0].paths[0].branches[1][0]',
      '9 lines.plans[0].paths[0].branches[3]',
    ]);
    // Line 2-1 hangs from 1-1, then from 1-2.
    const tree = withPaths(
      {
        branches: [
          [1, 1],
          [2, 1],
          [0, 0],
          [0, 0],
        ],
      },
      {
        branches: [
          [1, 2],
          [2, 1],
          [0, 0],
          [0, 0],
        ],
      },
    );
    expect(designErrors(tree)).toEqual(['9 lines.plans[0].paths[1].branches[1][1]']);
    // Line 1-1 in paths 1 and 3, not 2: the engine counts two lines.
    const split = withPaths(
      {
        branches: [
          [1, 1],
          [2, 1],
          [0, 0],
          [0, 0],
        ],
      },
      {
        branches: [
          [1, 2],
          [2, 2],
          [0, 0],
          [0, 0],
        ],
      },
      {
        branches: [
          [1, 1],
          [2, 3],
          [0, 0],
          [0, 0],
        ],
      },
    );
    expect(designErrors(split)).toEqual(['9 lines.plans[0].paths[2].branches[0][1]']);
  });

  test('anchors and line types', () => {
    // Rib 1 has 4 anchors: no anchor 5; row 6 (F) always exists.
    expect(designErrors(withPaths({ anchorRow: 5 }))).toEqual([
      '9 lines.plans[0].paths[0].anchorRow',
    ]);
    expect(designErrors(withPaths({ anchorRow: 6 }))).toEqual([]);
    // Anchors on the airfoil: 0 to 100 % (F only where the brakes anchor).
    const anchors = d.anchors.map((a) => ({
      ...a,
      positions: [8.5, 27.5, 53, 120, 0, -5] as const,
    }));
    expect(designErrors({ ...d, anchors })).toEqual([
      '3 anchors[0].positions[3]',
      '3 anchors[0].positions[5]',
      '3 anchors[1].positions[3]',
      '3 anchors[1].positions[5]',
    ]);
    // Without line types, level k uses type k and the main brake line type 6.
    const onlyType1: LepDesign = { ...d, lineTypes: { mode: 1, types: [lineType(1)] } };
    expect(designErrors(onlyType1)).toEqual([
      '9 lines.plans[0].paths[0].levels',
      '10 brakes.paths[0].levels',
      '10 brakes.typed',
    ]);
    // The engine stores type i in row i and looks types up by number.
    const table = (...numbers: number[]): LepDesign => ({
      ...d,
      lineTypes: { mode: 1, types: numbers.map(lineType) },
    });
    expect(designErrors(table(1, 2, 3, 4, 5, 6))).toEqual([]);
    expect(designErrors(table(1, 2, 3, 4, 5, 50))).toContain('34 lineTypes.types[5].number');
  });

  test('panels, groups, cuts and print ranges', () => {
    // The panel between ribs panel-1 and panel.
    for (const panel of [-100, 0, 3]) {
      expect(
        designErrors({ ...d, extradosColors: { mode: 'panels', panels: [{ panel, cuts: [] }] } }),
      ).toEqual(['15 extradosColors.panels[0].panel']);
    }
    const range = (draw: number, first: number, last: number) => ({
      draw,
      first,
      last,
      oneSide: 0,
    });
    const shaping = (group: number, cuts: ShapingCut[], stl = range(1, 1, 3)): LepDesign => ({
      ...d,
      shaping: {
        mode: 1,
        model: 1,
        groups: [
          {
            group,
            firstRib: 1,
            lastRib: 2,
            upper: { type: 1, cuts },
            lower: { type: 1, cuts: [] },
          },
        ],
        print: {
          interpolation: range(0, 1, 2),
          ovalization: range(0, 1, 2),
          tessellation: range(0, 1, 2),
          dxf: range(1, 1, 2),
          stl,
        },
      },
    });
    expect(designErrors(shaping(1, [{ number: 1, start: 10, end: 20, depth: 0.5 }]))).toEqual([]);
    // rib(i,169) = group number, an index of the groups read.
    expect(designErrors(shaping(2, []))).toEqual(['29 shaping.groups[0].group']);
    // Cut points: airfoil points, a loop from start to end.
    expect(designErrors(shaping(1, [{ number: 1, start: 20, end: 10, depth: 0.5 }]))).toEqual([
      '29 shaping.groups[0].upper.cuts[0].end',
    ]);
    expect(designErrors(shaping(1, [{ number: 1, start: 0, end: 501, depth: 0.5 }]))).toEqual([
      '29 shaping.groups[0].upper.cuts[0].start',
    ]);
    // The STL export iterates panels first to last, in tesse3d(3,0:100,…).
    expect(designErrors(shaping(1, [], range(1, 101, 101)))).toEqual([
      '29 shaping.print.stl.first',
      '29 shaping.print.stl.last',
    ]);
    // Panels 0 and nribss+1 have no tessellation: written at 0, a warning.
    const stlWarnings = (stl: ReturnType<typeof range>) =>
      validateDesign(shaping(1, [], stl)).filter((e) => e.field === 'shaping.print.stl');
    expect(stlWarnings(range(1, 1, 2))).toEqual([]);
    expect(stlWarnings(range(0, 1, 3))).toEqual([]);
    expect(stlWarnings(range(1, 0, 2))).toMatchObject([{ severity: 'warning' }]);
    expect(stlWarnings(range(1, 1, 3))).toMatchObject([{ severity: 'warning' }]);
  });

  test('H V ribs: ribs, rows and neighbouring ribs', () => {
    const hv = (type: number, parameters: number[]): LepDesign => ({
      ...d,
      hvRibs: { ...d.hvRibs, ribs: [{ number: 1, type, parameters }] },
    });
    // Type 11: column 4 an anchor row, columns 5 and 6 a second rib and row.
    expect(designErrors(hv(11, [1, 7, 1, 1, 2.1, 0, 0, 0]))).toEqual([
      '12 hvRibs.ribs[0].parameters[1]',
    ]);
    expect(designErrors(hv(11, [1, 1, 3, 0, 2.1, 0, 0, 0]))).toEqual([
      '12 hvRibs.ribs[0].parameters[2]',
      '12 hvRibs.ribs[0].parameters[3]',
    ]);
    // Types 2, 3 and 5 use the ribs i-1 to i+1, type 4 i-1 to i+2: all
    // with anchors, ribs 0 to nribss (the virtual rib nribss+1 has none).
    for (const type of [2, 3, 5, 12, 13, 15]) {
      expect(designErrors(hv(type, [1, 1, 1, 0, 60, 60, 80, 2.1])), `type ${type}`).toEqual([]);
      for (const rib of [0, 2]) {
        expect(designErrors(hv(type, [rib, 1, 1, 0, 60, 60, 80, 2.1])), `type ${type}`).toEqual([
          '12 hvRibs.ribs[0].parameters[0]',
        ]);
      }
    }
    expect(designErrors(hv(14, [1, 1, 1, 0, 60, 60, 80, 2.1]))).toEqual([
      '12 hvRibs.ribs[0].parameters[0]',
    ]);
    // The anchor row exists on each of these ribs (F, row 6, always does).
    expect(designErrors(hv(2, [1, 5, 1, 0, 60, 60, 80, 2.1]))).toEqual([
      '12 hvRibs.ribs[0].parameters[1]',
    ]);
    expect(designErrors(hv(2, [1, 6, 1, 0, 60, 60, 80, 2.1]))).toEqual([]);
    expect(designErrors(hv(11, [1, 1, 2, 5, 2.1, 0, 0, 0]))).toEqual([
      '12 hvRibs.ribs[0].parameters[3]',
    ]);
    // Types 6 and 16: column 8 is the final rib.
    expect(designErrors(hv(6, [1, 10, 100, 16, 16, 3, 10, 70, 11, 11]))).toEqual([
      '12 hvRibs.ribs[0].parameters[5]',
    ]);
  });

  test('values the engine divides by or loops on', () => {
    const brake = d.brakes.paths[0];
    // Brake rows have 4 pairs; the spans of the brake distribution increase.
    expect(
      designErrors({ ...d, brakes: { ...d.brakes, paths: [{ ...brake, levels: 100000 }] } }),
    ).toEqual(['10 brakes.paths[0].levels']);
    expect(
      designErrors({ ...d, brakes: { ...d.brakes, distributionSpans: [0, 25, 25, 70, 100] } }),
    ).toEqual(['10 brakes.distributionSpans[2]']);
    // Section 28: steps 1 to 99 (arrays of 100, a division by n), 1 to 6 risers.
    const calage = (risers: number, speedSteps: number, trimSteps: number): LepDesign => ({
      ...d,
      calageVariation: {
        mode: 1,
        risers,
        positions: [8.5, 27.5, 53, 77, 0, 0],
        speedAngle: -4,
        speedSteps,
        trimAngle: 4,
        trimSteps,
      },
    });
    expect(designErrors(calage(4, 99, 1))).toEqual([]);
    expect(designErrors(calage(7, 100, 0))).toEqual([
      '28 calageVariation.risers',
      '28 calageVariation.speedSteps',
      '28 calageVariation.trimSteps',
    ]);
    // nsegments and nelliref size arrays.
    const special = (code: 1291 | 1341 | 1351 | 1353 | 3002, value: number): LepDesign => ({
      ...d,
      specialParameters: { mode: 1, entries: [{ code, value }] },
    });
    expect(designErrors(special(1291, 99))).toEqual(['37 specialParameters.entries[0].value']);
    expect(designErrors(special(3002, 0))).toEqual(['37 specialParameters.entries[0].value']);
    expect(designErrors(special(3002, 499))).toEqual([]);
    // Modes without a branch in the engine: no lines drawn, no solver, no summary.
    expect(designErrors(special(1351, 6))).toEqual([]);
    for (const [code, value] of [
      [1341, 2],
      [1351, 7],
      [1353, 3],
    ] as const) {
      expect(designErrors(special(code, value))).toEqual(['37 specialParameters.entries[0].value']);
    }
    // Lines length, the x of the last rib, chords of washin modes 1 and 2.
    expect(designErrors({ ...d, angleOfAttack: { ...d.angleOfAttack, linesLength: 0 } })).toEqual([
      '8 angleOfAttack.linesLength',
    ]);
    const ribs = d.geometry.ribs;
    expect(
      designErrors({ ...d, geometry: { ...d.geometry, ribs: [ribs[0], { ...ribs[1], x: 0 }] } }),
    ).toEqual(['1 geometry.ribs[1].x']);
    expect(
      designErrors({
        ...d,
        geometry: { ...d.geometry, ribs: [ribs[0], { ...ribs[1], yLE: 0, yTE: 250 }] },
      }),
    ).toEqual(['1 geometry.washin.mode']);
    // The chords themselves.
    expect(
      designErrors({ ...d, geometry: { ...d.geometry, ribs: [{ ...ribs[0], yTE: 0 }, ribs[1]] } }),
    ).toEqual(['1 geometry.ribs[0]']);
    // The panel correction divides by the length of its last points: 0 is 0/0.
    const correction = (points: number): LepDesign => ({
      ...d,
      skinTension: { ...d.skinTension, panelCorrection: { points, factor: 1 } },
    });
    expect(designErrors(correction(0))).toEqual(['5 skinTension.panelCorrection.points']);
    expect(designErrors(correction(1))).toEqual([]);
    // Section 35 divides by g, ro, mu, Cd and its multiplier.
    const equilibrium = ok(
      parseLep(designFiles('oracle/designs/gnuA7-26').get('leparagliding.txt')!),
    );
    if (equilibrium.equilibrium.mode !== 1) throw new Error('gnuA7-26 solves the equilibrium');
    expect(
      designErrors({
        ...equilibrium,
        equilibrium: { ...equilibrium.equilibrium, cd: 0, gravity: -1, speed: 0 },
      }),
    ).toEqual(['35 equilibrium.gravity', '35 equilibrium.speed', '35 equilibrium.cd']);
    // Section 36 divides by the x' difference of consecutive ribs.
    const xflr5: LepDesign = {
      ...d,
      geometry: { ...d.geometry, ribs: [ribs[0], { ...ribs[1], xp: 0 }] },
      xflr5: {
        mode: 1,
        panels: { chord: 10, span: 2, chordDistribution: 1, spanDistribution: 0 },
        billowed: 0,
      },
    };
    expect(designErrors(xflr5)).toEqual(['36 geometry.ribs[1].xp']);
  });

  test('skin tension groups: points and ribs the engine indexes', () => {
    const point = {
      extradosPosition: 0,
      extradosOverwidth: 0,
      intradosPosition: 0,
      intradosOverwidth: 0,
    };
    const group = (firstRib: number, lastRib: number, points: number) => ({
      group: 1,
      type: 1,
      firstRib,
      lastRib,
      points: Array.from({ length: points }, () => point),
    });
    const groups = (...g: ReturnType<typeof group>[]): LepDesign => ({
      ...d,
      skinTensionGroups: { mode: 1, groups: g },
    });
    // Rib nribss+1 may be left out, as in the official examples.
    expect(designErrors(groups(group(1, 2, 2)))).toEqual([]);
    expect(designErrors(groups(group(1, 3, 1)))).toEqual(['31 skinTensionGroups.groups[0].points']);
    expect(designErrors(groups(group(1, 3, 101)))).toEqual([
      '31 skinTensionGroups.groups[0].points',
    ]);
    // Every rib in a group (none at all, too); no fewer points than the rib before.
    expect(designErrors(groups())).toEqual(['31 skinTensionGroups.groups']);
    expect(designErrors(groups(group(1, 1, 3)))).toEqual(['31 skinTensionGroups.groups']);
    expect(designErrors(groups(group(2, 3, 2), group(1, 1, 3)))).toEqual([
      '31 skinTensionGroups.groups',
    ]);
    expect(designErrors(groups(group(1, 1, 2), group(2, 3, 3)))).toEqual([]);
    // Rib 0 takes rib 1's count and the last group's points.
    expect(designErrors(groups(group(1, 3, 3), group(3, 3, 2)))).toEqual([
      '31 skinTensionGroups.groups',
    ]);
  });

  test('risers: mode 0 sets risers 1 to 5', () => {
    const plans = (n: number): LepDesign => ({
      ...d,
      lines: { ...d.lines, plans: Array.from({ length: n }, () => d.lines.plans[0]) },
    });
    expect(designErrors(plans(5))).toEqual([]);
    expect(designErrors(plans(6))).toEqual(['33 risers.mode']);
  });

  test('at most 500 lines, brakes included, counted as the engine does', () => {
    // The engine's count, listed in lep-out.txt, for every example.
    for (const id of DESIGNS) {
      const out = readFileSync(`oracle/reference/${id}/lep-out.txt`, 'utf8');
      const listed = out.split(' Additional detailed lines properties:')[1].split('\nTotal')[0];
      const engine = Math.max(...[...listed.matchAll(/^ *(\d+) /gm)].map((m) => Number(m[1])));
      const design = project(`oracle/designs/${id}`).design;
      const lines = countLines(
        design.lines.plans.map((plan) => plan.paths),
        true,
      );
      expect(lines + countLines([design.brakes.paths], false), id).toBe(engine);
    }
    // Two plans of 100 paths whose 4 levels all differ: 800 lines.
    const plan = {
      paths: Array.from({ length: 100 }, (_, j) => ({
        levels: 4,
        branches: [1, 2, 3, 4].map((level): [number, number] => [level, j + 1]),
        anchorRow: 1,
        anchorRib: 1,
      })),
    };
    expect(designErrors({ ...d, lines: { ...d.lines, plans: [plan, plan] } })).toContain(
      '9 lines.plans',
    );
    // 400 + 100 lines and a brake path that makes none: the engine still
    // uses line 501 for the main brake.
    const quarter = { paths: plan.paths.slice(0, 25) };
    expect(designErrors({ ...d, lines: { ...d.lines, plans: [plan, quarter] } })).toEqual([
      '9 lines.plans',
    ]);
    expect(
      designErrors({
        ...d,
        lines: { ...d.lines, plans: [plan, { paths: plan.paths.slice(0, 24) }] },
      }),
    ).toEqual([]);
  });

  test('file names and strings', () => {
    const airfoils = d.airfoils.map((a, i) => ({
      ...a,
      airfoil: i ? ' gnua.txt' : 'dir/gnua.txt',
    }));
    expect(designErrors({ ...d, airfoils })).toEqual([
      '2 airfoils[0].airfoil',
      '2 airfoils[1].airfoil',
    ]);
    expect(designErrors({ ...d, geometry: { ...d.geometry, brandName: 'a\u0001b' } })).toEqual([
      '1 geometry.brandName',
    ]);
    const xflr5: LepDesign = {
      ...d,
      geometry: { ...d.geometry, wingName: 'a/b' },
      xflr5: {
        mode: 1,
        panels: { chord: 10, span: 2, chordDistribution: 1, spanDistribution: 0 },
        billowed: 0,
      },
    };
    expect(designErrors(xflr5)).toEqual(['36 geometry.wingName']);
  });

  test('values outside what the manual documents are warnings', () => {
    const warned: LepDesign = {
      ...d,
      lines: { ...d.lines, weighting: 7 },
      airfoils: d.airfoils.map((a) => ({ ...a, open: 2, intakeStart: 120 })),
      specialParameters: { mode: 1, entries: [{ code: 1352, value: 3 }] },
      tabReinforcements: { mode: 1 },
    };
    const diagnostics = validateDesign(warned);
    expect(diagnostics.filter((e) => e.severity === 'error')).toEqual([]);
    expect(diagnostics.map((e) => e.field)).toEqual(
      expect.arrayContaining([
        'lines.weighting',
        'airfoils[0].open',
        'airfoils[0].intakeStart',
        'airfoils[0].intakeEnd',
        'specialParameters.entries[0].value',
        'tabReinforcements.mode',
      ]),
    );
  });
});

test.describe('validate: the airfoils of a project', () => {
  const projectErrors = (p: LepProject) =>
    validate(p)
      .filter((e) => e.severity === 'error')
      .map((e) => `${e.section ?? ''} ${e.field}`);

  test('missing, of the wrong format, or unusable', () => {
    const d = ok(parseLep(lep()));
    const dat: LepAirfoil = {
      format: 'dat',
      points: [
        [1, 0],
        [0, 0],
        [1, 0.01],
      ],
    };
    const diagnostics = validate({
      design: {
        ...d,
        xflr5: {
          mode: 1,
          panels: { chord: 10, span: 2, chordDistribution: 1, spanDistribution: 0 },
          billowed: 0,
        },
      },
      airfoils: new Map([['gnua.txt', dat]]),
    });
    expect(diagnostics.filter((e) => e.severity === 'error').map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'gnua.txt holds a .dat airfoil: the engine reads it as .txt',
        'gnua.txt is a .dat airfoil: section 36 (XFLR5) reads every airfoil as .txt and fails on it',
      ]),
    );
    expect(validate({ design: d, airfoils: new Map() })).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        field: 'airfoils[0].airfoil',
        message: 'Missing airfoil gnua.txt',
      }),
    );
    expect(parseAirfoil('foil.TXT', '').ok).toBe(false);
  });

  test('points indexed by the panel correction and the 3D cuts', () => {
    const p = project('oracle/designs/gnu-test-3.19');
    const correction = (points: number) => ({
      ...p,
      design: {
        ...p.design,
        skinTension: { ...p.design.skinTension, panelCorrection: { points, factor: 1 } },
      },
    });
    // gnua.txt has 66 extrados points: the engine reads from np(i,2)-ndif-1.
    expect(projectErrors(correction(1000))).toEqual([]);
    expect(projectErrors(correction(64))).toEqual([]);
    expect(projectErrors(correction(65))).toEqual(['5 skinTension.panelCorrection.points']);
    expect(projectErrors(correction(501))).toEqual(['5 skinTension.panelCorrection.points']);
    expect(projectErrors(correction(-1))).toEqual(['5 skinTension.panelCorrection.points']);
    // Lower cuts are on the intrados: points 74 (66 + 9 - 1) to 111.
    const shaping = p.design.shaping;
    if (shaping.mode === 0) throw new Error('gnu-test-3.19 has 3D shaping');
    const group = shaping.groups[0];
    const lowered = {
      ...p,
      design: {
        ...p.design,
        shaping: {
          ...shaping,
          groups: [
            {
              ...group,
              lower: { ...group.lower, cuts: [{ number: 1, start: 70, end: 84, depth: 1 }] },
            },
            ...shaping.groups.slice(1),
          ],
        },
      },
    };
    expect(projectErrors(lowered)).toEqual(['29 shaping.groups[0].lower.cuts[0].start']);
  });

  test('anchors on the intrados of the airfoil', () => {
    const p = project('oracle/designs/gnuA7-26');
    const anchors = (position: number) => ({
      ...p,
      design: {
        ...p.design,
        anchors: p.design.anchors.map((a, i) =>
          i
            ? a
            : {
                ...a,
                positions: [position, ...a.positions.slice(1)] as unknown as typeof a.positions,
              },
        ),
      },
    });
    // The intrados of gnua.txt starts at 1.6 % of the chord. At 0 % the
    // engine keeps the anchor at the leading edge: right.
    expect(validate(anchors(0)).filter((e) => e.section === 3)).toEqual([]);
    expect(validate(anchors(1)).filter((e) => e.section === 3)).toMatchObject([
      { severity: 'warning', field: 'anchors[0].positions[0]' },
    ]);
  });

  test('the air inlet of a .dat airfoil must fall on its intrados', () => {
    const files = designFiles(DAT_FIXTURE);
    const design = ok(parseLep(files.get('leparagliding.txt')!));
    const airfoils = new Map([['gnua.dat', ok(parseAirfoil('gnua.dat', files.get('gnua.dat')!))]]);
    expect(projectErrors({ design, airfoils })).toEqual([]);
    const moved = {
      ...design,
      airfoils: design.airfoils.map((a, i) => (i ? a : { ...a, intakeStart: -50, intakeEnd: 150 })),
    };
    expect(projectErrors({ design: moved, airfoils })).toEqual([
      '2 airfoils[0].intakeStart',
      '2 airfoils[0].intakeEnd',
    ]);
  });
});

test.describe('airfoils', () => {
  test('.txt: counts then points; what follows is not read', () => {
    const a = ok(parseAirfoil('a.txt', 'name\n3\n2\n1\n2\n1 0\n0 0\n1 -0.01\nnot read\n'));
    expect(a).toEqual({
      format: 'txt',
      extrados: 2,
      inlet: 1,
      intrados: 2,
      points: [
        [1, 0],
        [0, 0],
        [1, -0.01],
      ],
    });
  });

  test('.dat: points to the end of the file, blank lines skipped', () => {
    const a = ok(parseAirfoil('a.dat', 'NACA\n1 0\n\n0.5,0.05\n0 0\n0.5 -0.05\n1 0\n\n'));
    expect(a).toEqual({
      format: 'dat',
      points: [
        [1, 0],
        [0.5, 0.05],
        [0, 0],
        [0.5, -0.05],
        [1, 0],
      ],
    });
  });

  test('a long .dat airfoil reads in linear time', () => {
    const lines = Array.from({ length: 200000 }, (_, j) => `${j / 200000} 0`);
    const a = ok(parseAirfoil('a.dat', `NACA\n${lines.join('\n')}\n\n`));
    expect(a.points).toHaveLength(200000);
  });

  test('a truncated airfoil is an error', () => {
    expect(parseAirfoil('a.dat', 'NACA\n1 0\n0.5')).toMatchObject({
      ok: false,
      errors: [{ file: 'a.dat', line: 4, field: 'points[1][1]' }],
    });
    expect(parseAirfoil('a.txt', 'name\n4\n2\n1\n2\n1 0\n0 0\n')).toMatchObject({
      ok: false,
      errors: [{ file: 'a.txt', line: 8 }],
    });
    expect(parseAirfoil('a.dat', 'NACA\n1 0\nx y\n')).toMatchObject({
      ok: false,
      errors: [{ line: 3, column: 1 }],
    });
  });

  test('too many points for the engine', () => {
    // u(0:100,500,99), and loops that read the point after the last.
    const points = Array.from({ length: 500 }, (_, j): [number, number] => [j / 500, 0]);
    const diagnostics = validate({
      design: ok(parseLep(lep())),
      airfoils: new Map([
        ['gnua.txt', { format: 'txt', extrados: 250, inlet: 3, intrados: 250, points } as const],
      ]),
    });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', file: 'gnua.txt', field: 'points' }),
    );
  });

  test('.txt counts must split the points: the engine indexes with them', () => {
    const points = Array.from({ length: 499 }, (_, j): [number, number] => [j / 499, 0]);
    const counts = (n: number) =>
      writeAirfoil({ format: 'txt', extrados: n, inlet: n, intrados: n, points });
    expect(counts(499)).toMatchObject({ ok: false, errors: [{ field: 'extrados' }] });
    expect(writeAirfoil({ format: 'txt', extrados: 300, inlet: 3, intrados: 198, points }).ok).toBe(
      true,
    );
  });

  test('the title goes on the first line, which the engine skips', () => {
    const airfoil: LepAirfoil = {
      format: 'dat',
      points: [
        [1, 0],
        [0, 0],
        [1, -0.01],
      ],
    };
    const text = ok(writeAirfoil(airfoil, { title: 'NACA 0012' }));
    expect(text.split('\n')[0]).toBe('NACA 0012');
    expect(ok(parseAirfoil('a.dat', text))).toEqual(airfoil);
    expect(writeAirfoil(airfoil, { title: 'two\nlines' }).ok).toBe(false);
  });
});
