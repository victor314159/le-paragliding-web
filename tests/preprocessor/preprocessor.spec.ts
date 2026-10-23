import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseLep, validateDesign } from '../../packages/format/src/index.ts';
import {
  generateGeometry,
  parsePreData,
  validatePreprocessor,
  writePreData,
  type PreprocessorInput,
} from '../../packages/preprocessor/src/index.ts';
import { EXAMPLE, OFFICIAL, ok, preprocessorCases } from './cases.ts';

test('reads the official 1.6 file and produces the native example dimensions', () => {
  expect(EXAMPLE.name).toBe('gnuGUI-test');
  expect(EXAMPLE.distribution).toEqual({ mode: 3, coefficient: 0.7, cells: 50 });
  const result = ok(generateGeometry(EXAMPLE));
  expect(result.ribs).toHaveLength(26);
  expect(result.ribs[0]).toMatchObject({
    number: 1,
    x: 0,
    yLE: 0,
    rotationPoint: 33.33,
    washin: 0,
  });
  expect(result.metrics.flatSpan).toBe(11.51);
  expect(result.metrics.projectedSpan).toBeCloseTo(9.45, 2);
  expect(result.metrics.maxChord).toBeCloseTo(271.02, 5);
  expect(result.curves.vault).toHaveLength(397);
});

const parsedDesign = parseLep(readFileSync('oracle/designs/swoop2/leparagliding.txt', 'utf8'));
if (!parsedDesign.ok) throw new Error('Unreadable example design');
const design = parsedDesign.value;
for (const { name, input } of preprocessorCases()) {
  test(`${name}: round trip, finite geometry and engine compatibility limits`, () => {
    const frozen = structuredClone(input);
    const result = ok(generateGeometry(input));
    expect(input).toEqual(frozen);
    expect(ok(parsePreData(ok(writePreData(input))))).toEqual(input);
    expect(result.ribs).toHaveLength(Math.floor(result.cells / 2) + 1);
    expect(result.ribs.at(-1)!.x).toBe(input.halfSpan);
    expect(result.metrics.flatArea).toBeGreaterThan(0);
    expect(result.metrics.projectedArea).toBeGreaterThan(0);
    expect(result.curves.vault[0]).toEqual([0, 0]);
    const vaultLength = result.curves.vault.slice(1).reduce((sum, p, i) => {
      const previous = result.curves.vault[i];
      return sum + Math.hypot(p[0] - previous[0], p[1] - previous[1]);
    }, 0);
    expect(vaultLength).toBeCloseTo(input.halfSpan, 8);
    const errors = validateDesign({
      ...design,
      geometry: {
        ...design.geometry,
        cells: result.cells,
        ribCount: result.cells + 1,
        ribs: result.ribs.map((rib) => ({ ...rib, rotZ: 0, rotZPosition: 0 })),
      },
    }).filter((d) => d.severity === 'error' && d.section === 1);
    // The preprocessor supports 100 half-wing ribs; the engine reserves a virtual rib.
    if (result.cells <= 197) expect(errors).toEqual([]);
    else expect(errors).toContainEqual(expect.objectContaining({ field: 'geometry.cells' }));
  });
}

test('uniform and chord/linear distributions agree at coefficient one', () => {
  for (const cells of [32, 45]) {
    const uniform = ok(generateGeometry({ ...EXAMPLE, distribution: { mode: 1, cells } }));
    for (const mode of [2, 3] as const) {
      const result = ok(
        generateGeometry({ ...EXAMPLE, distribution: { mode, cells, coefficient: 1 } }),
      );
      result.ribs.forEach((rib, i) => expect(rib.x).toBeCloseTo(uniform.ribs[i].x, 10));
    }
  }
});

test('explicit widths are normalized and retain the central-cell parity', () => {
  for (const first of [0, 10]) {
    const a = ok(
      generateGeometry({ ...EXAMPLE, distribution: { mode: 4, widths: [first, 30, 20, 10] } }),
    );
    const b = ok(
      generateGeometry({ ...EXAMPLE, distribution: { mode: 4, widths: [first * 2, 60, 40, 20] } }),
    );
    expect(a).toEqual(b);
    expect(a.cells).toBe(first === 0 ? 6 : 7);
    expect(a.ribs[0].x === 0).toBe(first === 0);
  }
});

test('quoted names, CRLF, Fortran exponents, labels and comments', () => {
  const input = { ...EXAMPLE, name: `L'aile "été"` };
  const text = ok(writePreData(input))
    .replace('a1= 710.21', 'ignored 7.1021D+2 ! radius')
    .replace(/\n/g, '\r\n');
  expect(ok(parsePreData(text))).toEqual(input);
  expect(ok(parsePreData(OFFICIAL.replace('gnuGUI-test', '"Wing with spaces"'))).name).toBe(
    'Wing with spaces',
  );
});

test('bad records return located diagnostics', () => {
  for (const text of [
    '',
    OFFICIAL.slice(0, 100),
    OFFICIAL.replace('a1= 710.21', 'a1= NaN'),
    OFFICIAL.replace('gnuGUI-test', "'unclosed"),
    OFFICIAL.replace('xm= 575.5\nc0=', 'xm= 500\nc0='),
  ]) {
    const parsed = parsePreData(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.errors[0]).toMatchObject({ file: 'pre-data.txt', line: expect.any(Number) });
  }
  expect(parsePreData(OFFICIAL.replace('1\na1=', '9\na1=')).ok).toBe(false);
});

test('invalid domains fail before computation or writing', () => {
  const invalid: PreprocessorInput[] = [
    { ...EXAMPLE, name: '' },
    { ...EXAMPLE, name: 'a\nb' },
    { ...EXAMPLE, leadingEdge: { ...EXAMPLE.leadingEdge, a: 0 } },
    { ...EXAMPLE, halfSpan: Infinity },
    { ...EXAMPLE, leadingEdge: { ...EXAMPLE.leadingEdge, x2: EXAMPLE.halfSpan } },
    { ...EXAMPLE, leadingEdge: { ...EXAMPLE.leadingEdge, exponent1: NaN } },
    { ...EXAMPLE, vault: { mode: 1, a: 100, b: 100, x1: 100, correction: 0 } },
    { ...EXAMPLE, distribution: { mode: 1, cells: 200 } },
    { ...EXAMPLE, distribution: { mode: 1, cells: 2.5 } },
    { ...EXAMPLE, distribution: { mode: 2, cells: 50, coefficient: -1 } },
    { ...EXAMPLE, distribution: { mode: 4, widths: [0, -10] } },
    { ...EXAMPLE, distribution: { mode: 4, widths: [0.001, 10] } },
  ];
  for (const input of invalid) {
    expect(validatePreprocessor(input).length).toBeGreaterThan(0);
    expect(generateGeometry(input).ok).toBe(false);
    expect(writePreData(input).ok).toBe(false);
  }
});

test('crossing contours fail without exporting invalid coordinates', () => {
  expect(
    generateGeometry({ ...EXAMPLE, leadingEdge: { ...EXAMPLE.leadingEdge, correction1: 1000 } }).ok,
  ).toBe(false);
});
