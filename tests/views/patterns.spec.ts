import { expect, test } from '@playwright/test';
import { parseLep, type Colors } from '../../packages/format/src/index.ts';
import { colorPlanform, tensionCurve, tensionScale } from '../../packages/views/src/index.ts';
import { lep, ok } from '../format/helpers';

function fixture() {
  const design = ok(parseLep(lep()));
  return {
    ...design,
    geometry: {
      ...design.geometry,
      ribs: [
        { ...design.geometry.ribs[0], x: 10, yLE: 5, yTE: 105 },
        { ...design.geometry.ribs[0], x: 40, yLE: 15, yTE: 95 },
      ],
    },
    extradosColors: {
      mode: 'panels',
      panels: [
        { panel: 1, cuts: [{ number: 1, left: 20, right: 40, seamWidth: 10, unused: 0 }] },
        { panel: 2, cuts: [{ number: 1, left: 25, right: 75, seamWidth: 10, unused: 0 }] },
      ],
    } satisfies Colors,
  };
}

test('color cuts use TE distances, adjacent ribs and a half central panel on the symmetry axis', () => {
  const design = fixture();
  const data = colorPlanform(design.geometry, design.extradosColors);
  expect(data.panels[0].cuts[0].points).toEqual([
    [0, 85],
    [10, 65],
  ]);
  expect(data.panels[1].cuts[0].points).toEqual([
    [10, 80],
    [40, 35],
  ]);
  expect(data.panels[1].regions).toHaveLength(2);
  expect(data.omitted).toBe(0);
  expect(data.marks).toHaveLength(0);
});

test('rib marks include virtual rib zero, draw no panel cuts and omit incomplete positions', () => {
  const design = fixture();
  const data = colorPlanform(design.geometry, {
    mode: 'ribs',
    ribs: [
      {
        rib: 0,
        marks: [
          { number: 1, positions: [30, 0] },
          { number: 2, positions: [Number.NaN, 0] },
        ],
      },
    ],
  });
  expect(data.marks).toHaveLength(1);
  expect(data.marks[0].point).toEqual([0, 75]);
  expect(data.panels.every((p) => p.cuts.length === 0)).toBe(true);
  expect(data.omitted).toBe(1);
});

test('crossing cuts retain boundaries without inventing regions and invalid cuts are omitted', () => {
  const design = fixture();
  const data = colorPlanform(design.geometry, {
    mode: 'panels',
    panels: [
      {
        panel: 2,
        cuts: [
          { number: 1, left: 20, right: 80, seamWidth: 10, unused: 0 },
          { number: 2, left: 80, right: 20, seamWidth: 10, unused: 0 },
          { number: 3, left: Number.NaN, right: 60, seamWidth: 10, unused: 0 },
        ],
      },
    ],
  });
  expect(data.panels[1].crossed).toBe(true);
  expect(data.panels[1].cuts).toHaveLength(2);
  expect(data.panels[1].regions).toEqual([]);
  expect(data.omitted).toBe(1);
});

test('tension curves convert intrados positions from TE and preserve gaps and negative overwidth', () => {
  const points = [
    { extradosPosition: 0, extradosOverwidth: 0, intradosPosition: 0, intradosOverwidth: -1 },
    {
      extradosPosition: 40,
      extradosOverwidth: Number.NaN,
      intradosPosition: Number.NaN,
      intradosOverwidth: 2,
    },
    { extradosPosition: 100, extradosOverwidth: 0, intradosPosition: 100, intradosOverwidth: 0 },
  ];
  const lower = tensionCurve(points, 'intrados');
  expect(lower.map((p) => [p.index, p.x, p.value])).toEqual([
    [0, 100, -1],
    [2, 0, 0],
  ]);
  expect(tensionCurve(points, 'extrados').map((p) => p.x)).toEqual([0, 100]);
  for (const values of [[], [0, 0], [-3, -1], [-2, 3], [0.001]]) {
    const scale = tensionScale(values);
    expect(scale.low).toBeLessThanOrEqual(Math.min(0, ...values));
    expect(scale.high).toBeGreaterThanOrEqual(Math.max(0, ...values));
    expect(scale.high).toBeGreaterThan(scale.low);
    expect(scale.ticks.every(Number.isFinite)).toBe(true);
  }
});
