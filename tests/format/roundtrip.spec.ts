// Criterion 1: the example designs and their airfoils read without error and
// parse(write(parse(x))) equals parse(x); objects built or changed by code
// write, read back and validate.
import { expect, test } from '@playwright/test';
import {
  parseAirfoil,
  parseLep,
  validate,
  writeAirfoil,
  writeLep,
  type LepDesign,
  type LepProject,
} from '../../packages/format/src/index.ts';
import { DAT_FIXTURE, DESIGNS, designFiles, lep, ok, project } from './helpers.ts';

const errors = (p: LepProject) => validate(p).filter((d) => d.severity === 'error');

for (const dir of [...DESIGNS.map((id) => `oracle/designs/${id}`), DAT_FIXTURE]) {
  test(`${dir} reads, validates and round-trips`, () => {
    const files = designFiles(dir);
    const parsed = parseLep(files.get('leparagliding.txt')!);
    expect(parsed.ok && parsed.warnings).toEqual([]);
    const p = project(dir);
    expect(errors(p)).toEqual([]);

    const written = ok(writeLep(p.design));
    expect(ok(parseLep(written))).toEqual(p.design);
    // Canonical: writing again gives the same text.
    expect(ok(writeLep(ok(parseLep(written))))).toBe(written);

    for (const [name, airfoil] of p.airfoils) {
      const text = ok(writeAirfoil(airfoil));
      expect(ok(parseAirfoil(name, text)), name).toEqual(airfoil);
    }
  });
}

test('a design changed by code writes, reads back and validates', () => {
  const p = project('oracle/designs/gnuA7-26');
  const d = p.design;
  const plans = d.lines.plans;
  const changed: LepDesign = {
    ...d,
    geometry: {
      ...d.geometry,
      brandName: 'Brand "quoted", with/slash',
      wingName: 'Крыло-1 ßäôçñlè',
      washin: { mode: 2, maxAngle: 4.5, centerAngle: -0.5 },
      ribs: d.geometry.ribs.map((rib) => ({ ...rib, beta: rib.beta + 0.1, rotZ: 0.25 })),
    },
    lines: {
      ...d.lines,
      // One more plan: a single path to the last rib, and its riser.
      plans: [
        ...plans,
        {
          paths: [
            {
              ...plans[0].paths[0],
              branches: [
                [1, 1],
                [2, 1],
                [3, 1],
                [0, 0],
              ],
              anchorRib: 3,
            },
          ],
        },
      ],
    },
    risers:
      d.risers.mode === 1 && d.risers.type === 1
        ? { ...d.risers, lengths: [...d.risers.lengths, 47] }
        : d.risers,
    hvRibs: {
      ...d.hvRibs,
      ribs: [
        ...d.hvRibs.ribs,
        { number: 45, type: 6, parameters: [3, 1, 1, 0, 2.1, 4, 0, 0, 1, 1] },
      ],
    },
    extradosColors: {
      mode: 'panels',
      panels: [{ panel: 2, cuts: [{ number: 1, left: 10, right: 20, seamWidth: 30, unused: -0 }] }],
    },
    dxf2d: { mode: 0 },
    wingTip: { mode: 4, displacement: 1e-7, rotation: 1.5e21 },
    specialParameters: {
      mode: 1,
      entries: [
        { code: 2000, value: '2026-10-21 edition' },
        { code: 3001, transition: 2, values: [0.3, 0.7] },
        { code: 1146, value: 36.5 },
      ],
    },
    hvrHoles: {
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
    },
    hvrPositions: {
      mode: 0,
      coefficients: [
        { horizontal: 0.5, vertical: 1 },
        { horizontal: 1, vertical: 1 },
        { horizontal: 1, vertical: 1 },
        { horizontal: 1, vertical: 1 },
        { horizontal: 0.4, vertical: 1 },
        { horizontal: 0.4, vertical: 1 },
      ],
    },
  };
  expect(errors({ ...p, design: changed })).toEqual([]);
  const back = ok(parseLep(ok(writeLep(changed))));
  expect(back).toEqual(changed);
  // -0 survives the round trip.
  const colors = back.extradosColors;
  expect(colors.mode === 'panels' && Object.is(colors.panels[0].cuts[0].unused, -0)).toBe(true);
});

const markType = {
  print: { type: 1, size: 0.25, offset: 1.2 },
  laser: { type: 2, size: 0.3, offset: 1.2 },
};
const skinPoint = (
  extradosPosition: number,
  extradosOverwidth: number,
  intradosPosition: number,
  intradosOverwidth: number,
) => ({ extradosPosition, extradosOverwidth, intradosPosition, intradosOverwidth });
const path = (anchorRow: number, anchorRib: number) => ({
  levels: 2,
  branches: [
    [1, 1],
    [2, 1],
    [0, 0],
    [0, 0],
  ] as const,
  anchorRow,
  anchorRib,
});

// The design of helpers.ts lep(), as an object.
const BUILT: LepDesign = {
  geometry: {
    brandName: 'Brand',
    wingName: 'Wing',
    drawingScale: 1,
    wingScale: 1,
    cells: 2,
    ribCount: 3,
    washin: { mode: 1, maxAngle: 2.5 },
    paragliderType: 'ds',
    paragliderParameter: 1,
    ribColumns: 11,
    ribs: [
      {
        number: 1,
        x: 0,
        yLE: 0,
        yTE: 250,
        xp: 0,
        z: 0,
        beta: 0,
        rotationPoint: 33.33,
        washin: 0,
        rotZ: 0,
        rotZPosition: 50,
      },
      {
        number: 2,
        x: 100,
        yLE: 10,
        yTE: 240,
        xp: 99,
        z: 5,
        beta: 10,
        rotationPoint: 33.33,
        washin: 0,
        rotZ: 0,
        rotZPosition: 50,
      },
    ],
  },
  airfoils: [1, 2].map((number) => ({
    number,
    airfoil: 'gnua.txt',
    intakeStart: 1.6,
    intakeEnd: 6.3,
    open: 1,
    displacement: 0,
    relativeWeight: 1,
    minirib: 15,
  })),
  anchors: [
    { number: 1, count: 4, positions: [8.5, 27.5, 53, 77, 0, 0] },
    { number: 2, count: 4, positions: [8.5, 27.5, 53, 77, 0, 100] },
  ],
  holes: [],
  skinTension: {
    points: [
      skinPoint(0, 0, 0, 0),
      skinPoint(7.5, 1.3, 10, 1.33),
      skinPoint(15, 2.5, 20, 2.5),
      skinPoint(80, 2.5, 80, 2.5),
      skinPoint(90, 1.33, 90, 1.33),
      skinPoint(100, 0, 100, 0),
    ],
    miniribStrain: 0.0114,
    panelCorrection: { points: 1000, factor: 1 },
  },
  sewingAllowances: {
    upper: { sides: 15, leadingEdge: 25, trailingEdge: 20 },
    lower: { sides: 15, leadingEdge: 25, trailingEdge: 20 },
    ribs: 15,
    vRibs: 15,
  },
  marks: { spacing: 25, pointRadius: 0.5, pointOffset: 0.15 },
  angleOfAttack: {
    glideRatio: 7,
    centerOfPressure: 32.9,
    calage: 33,
    risersLength: 47,
    linesLength: 650,
    karabinerSeparation: 40,
  },
  lines: { weighting: 3, typed: false, plans: [{ paths: [path(1, 1)] }] },
  brakes: {
    length: 270,
    typed: false,
    paths: [path(6, 1.5)],
    distributionSpans: [0, 25, 55, 70, 100],
    distributionIncrements: [0, 0, 0, 0, 0],
  },
  ramifications: {
    lines3: { level: 3, l2: 150 },
    lines4: { level: 4, l3: 300, l2: 150 },
    brakes3: { level: 3, l2: 100 },
    brakes4: { level: 4, l3: 200, l2: 80 },
  },
  hvRibs: { separationX: 80, separationY: 180, ribs: [] },
  extradosColors: { mode: 'ribs', ribs: [] },
  intradosColors: { mode: 'ribs', ribs: [] },
  ribPoints: [],
  elasticLines: {
    flightLoad: 100,
    distribution: [
      [75, 25],
      [40, 40, 20],
      [35, 35, 20, 10],
      [35, 35, 15, 10, 5],
    ],
    deformation: [1, 2, 3, 4, 5].map((lines) => ({
      lines,
      lower: 0.08,
      medium: 0.2,
      higher: 0.2,
    })) as unknown as LepDesign['elasticLines']['deformation'],
  },
  dxfLayers: ['default'],
  markTypes: Array.from({ length: 10 }, () => markType),
  joncs: { mode: 0 },
  noseMylars: { mode: 0 },
  tabReinforcements: { mode: 0 },
  dxf2d: { mode: 0 },
  dxf3d: { mode: 0 },
  glueVents: { mode: 0 },
  wingTip: { mode: 0 },
  calageVariation: { mode: 0 },
  shaping: { mode: 0 },
  thickness: { mode: 0 },
  skinTensionGroups: { mode: 0 },
  partsSeparation: { mode: 0 },
  risers: { mode: 0 },
  lineTypes: { mode: 0 },
  equilibrium: { mode: 0 },
  xflr5: { mode: 0 },
  specialParameters: { mode: 0 },
  hvrHoles: { mode: 0 },
  hvrPositions: { mode: 0 },
};

test('a design built from scratch writes, reads back and validates', () => {
  expect(ok(parseLep(lep()))).toEqual(BUILT);
  const built = BUILT;
  const airfoils = new Map([
    ['gnua.txt', ok(parseAirfoil('gnua.txt', designFiles('oracle/designs/A8').get('gnua.txt')!))],
  ]);
  expect(errors({ design: built, airfoils })).toEqual([]);
  expect(ok(parseLep(ok(writeLep(built))))).toEqual(built);
});

test('the writers refuse invalid objects and keep warnings', () => {
  const p = project('oracle/designs/gnuA7-26');
  const tooMany = { ...p.design, geometry: { ...p.design.geometry, cells: 34 } };
  const refused = writeLep(tooMany);
  expect(refused.ok).toBe(false);
  expect(!refused.ok && refused.errors.map((e) => e.field)).toContain('geometry.ribs');

  const notInteger = { ...p.design, geometry: { ...p.design.geometry, cells: 33.5 } };
  expect(writeLep(notInteger).ok).toBe(false);

  const warned = writeLep({ ...p.design, geometry: { ...p.design.geometry, ribCount: 40 } });
  // gnuA7-26 also exports STL panel nribss+1, which the engine writes at 0.
  expect(warned.ok && warned.warnings.map((w) => w.field)).toEqual([
    'geometry.ribCount',
    'shaping.print.stl',
  ]);

  expect(writeAirfoil({ format: 'dat', points: [[0, Number.NaN]] }).ok).toBe(false);
});
