import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { applyGeometry, wingMetrics } from '../../packages/design/src/index.ts';
import { parseLep } from '../../packages/format/src/index.ts';
import { PREPROCESSOR_EXAMPLE, generateGeometry } from '../../packages/preprocessor/src/index.ts';
import { DESIGNS, designFiles, lep, ok } from '../format/helpers';

/** The main parameters of lep-out.txt, in F5.2 (F4.2 for the aspect ratios). */
const MAIN_PARAMETERS = {
  flatArea: 'Flat area',
  flatSpan: 'Flat span',
  flatAspectRatio: 'Flat A/R',
  projectedArea: 'Projected area',
  projectedSpan: 'Projected span',
  projectedAspectRatio: 'Projected A/R',
} as const;

for (const id of DESIGNS)
  test(`${id}: section 1 has the main parameters of lep-out.txt`, () => {
    const design = ok(parseLep(designFiles(`oracle/designs/${id}`).get('leparagliding.txt')!));
    const out = readFileSync(`oracle/reference/${id}/lep-out.txt`, 'utf8');
    const metrics = wingMetrics(design)!;
    for (const [key, label] of Object.entries(MAIN_PARAMETERS)) {
      const printed = Number(new RegExp(`^${label} = +(\\S+)`, 'm').exec(out)![1]);
      // Half the last printed digit, with room for floating-point error.
      expect(Math.abs(metrics[key as keyof typeof MAIN_PARAMETERS] - printed), key).toBeLessThan(
        0.005 + 1e-9,
      );
    }
  });

test('section 1 has the metrics of the preprocessor, at Wing scale', () => {
  const design = ok(parseLep(lep()));
  const result = ok(generateGeometry(PREPROCESSOR_EXAMPLE));
  const geometry = applyGeometry(design, result);
  const metrics = (wingScale: number) => wingMetrics({ geometry: { ...geometry, wingScale } })!;
  const m = result.metrics;
  // Section 1 holds the F7.2 rounding of the generated ribs.
  for (const [key, value] of Object.entries(metrics(1)))
    expect(value, key).toBeCloseTo(m[key as keyof typeof m], 2);
  expect(metrics(2)).toMatchObject({
    flatSpan: 2 * metrics(1).flatSpan,
    flatArea: 4 * metrics(1).flatArea,
    projectedAspectRatio: metrics(1).projectedAspectRatio,
  });
});

test('section 1 has no metrics while a coordinate is missing or an area is not positive', () => {
  const { geometry } = ok(parseLep(lep()));
  const [rib] = geometry.ribs;
  const without = (ribs: typeof geometry.ribs) => wingMetrics({ geometry: { ...geometry, ribs } });
  expect(without([{ ...rib, xp: null as unknown as number }])).toBeUndefined();
  expect(without([{ ...rib, yTE: rib.yLE }])).toBeUndefined();
  expect(without([])).toBeUndefined();
});
