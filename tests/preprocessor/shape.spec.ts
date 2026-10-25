import { expect, test } from '@playwright/test';
import {
  PREPROCESSOR_EXAMPLE,
  SHAPE_DEFAULTS,
  SHAPE_LIMITS,
  fromShape,
  generateGeometry,
  shapeLosses,
  shapeOf,
  shapeOfRibs,
  type WingShape,
} from '../../packages/preprocessor/src/index.ts';
import { ok } from './cases.ts';

test('a shape sets parameters that give it back, with its flat area', () => {
  const shape: WingShape = {
    area: 22,
    aspectRatio: 5.4,
    taper: 0.3,
    sweep: 0.7,
    leadingEdgeRoundness: 0.8,
    trailingEdgeRoundness: 0.6,
    tipAngle: 88,
    tipCurl: 0.4,
    cells: 47,
    cellUniformity: 0.6,
  };
  const input = fromShape(shape, PREPROCESSOR_EXAMPLE);
  const result = ok(generateGeometry(input));
  expect(result.metrics.flatArea).toBeCloseTo(22, 2);
  expect(result.cells).toBe(47);
  const back = shapeOf(input, result);
  for (const key of Object.keys(shape) as (keyof WingShape)[])
    expect(back[key], key).toBeCloseTo(shape[key], 2);
  expect(shapeLosses(back, input)).toEqual([]);
  const example = ok(generateGeometry(PREPROCESSOR_EXAMPLE));
  expect(shapeLosses(shapeOf(PREPROCESSOR_EXAMPLE, example), PREPROCESSOR_EXAMPLE)).toEqual([
    'leadingEdge',
    'trailingEdge',
    'vault',
  ]);
});

test('the parameters of any shape within the limits are read back without losses', () => {
  const keys = Object.keys(SHAPE_LIMITS) as (keyof WingShape)[];
  for (let i = 0; i < 100; i++) {
    // Settings spread over their limits, in a different combination each time.
    const shape = Object.fromEntries(
      keys.map((key, k) => {
        const [min, max] = SHAPE_LIMITS[key];
        const value = min + (((i * 7 + k * 13) % 100) / 99) * (max - min);
        return [key, key === 'cells' ? Math.round(value) : value];
      }),
    ) as WingShape;
    const input = fromShape(shape, PREPROCESSOR_EXAMPLE);
    expect(shapeLosses(shapeOf(input, ok(generateGeometry(input))), input), `${i}`).toEqual([]);
  }
});

test('a rib table gives the settings it sets; the others, or all without a table, keep the defaults', () => {
  const shape: WingShape = {
    ...SHAPE_DEFAULTS,
    area: 21,
    aspectRatio: 6.1,
    taper: 0.3,
    sweep: 0.6,
  };
  const { ribs, cells } = ok(generateGeometry(fromShape(shape, PREPROCESSOR_EXAMPLE)));
  // As section 1 has them: to 0.01 cm or degree.
  const table = ribs.map((rib) => ({
    x: Math.round(rib.x * 100) / 100,
    yLE: Math.round(rib.yLE * 100) / 100,
    yTE: Math.round(rib.yTE * 100) / 100,
    beta: Math.round(rib.beta * 100) / 100,
  }));
  const back = shapeOfRibs(table, cells);
  // The tip rib's angle is its last vault segment's, a little short of the total.
  for (const key of Object.keys(shape) as (keyof WingShape)[])
    expect(Math.abs(back[key] - shape[key]), key).toBeLessThan(key === 'tipAngle' ? 0.5 : 0.05);
  expect(shapeOfRibs([], 40)).toEqual(SHAPE_DEFAULTS);
  expect(shapeOfRibs([{ ...table[0], yTE: table[0].yLE }, ...table.slice(1)], cells)).toEqual(
    SHAPE_DEFAULTS,
  );
});
