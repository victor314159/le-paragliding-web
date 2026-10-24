import { expect, test } from '@playwright/test';
import {
  PREPROCESSOR_EXAMPLE,
  SHAPE_LIMITS,
  fromShape,
  generateGeometry,
  shapeLosses,
  shapeOf,
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
