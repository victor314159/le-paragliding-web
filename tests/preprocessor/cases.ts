import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREPROCESSOR_EXAMPLE,
  parsePreData,
  type CircularArc,
  type PreprocessorInput,
  type Result,
} from '../../packages/preprocessor/src/index.ts';

export function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
}

export const OFFICIAL = readFileSync(join(import.meta.dirname, 'fixtures/pre-data.txt'), 'utf8');
export const EXAMPLE = ok(parsePreData(OFFICIAL));

/** The documented example with `cells` cells, proportional to chord. */
export const withCells = (cells: number): PreprocessorInput => ({
  ...PREPROCESSOR_EXAMPLE,
  distribution: { mode: 3, coefficient: 0.7, cells },
});

/** Shared by the TypeScript tests and the live native oracle. No generated references. */
export function preprocessorCases(): { name: string; input: PreprocessorInput }[] {
  const cases = [{ name: 'official', input: EXAMPLE }];
  for (const mode of [1, 2] as const) {
    const vault: PreprocessorInput['vault'] =
      mode === 1
        ? { mode: 1, a: 414.2901, b: 237.43, x1: 265.3489, correction: 28.22 }
        : EXAMPLE.vault;
    for (const cells of [33, 50]) {
      for (const distributionMode of [1, 2, 3, 4] as const) {
        const distribution: PreprocessorInput['distribution'] =
          distributionMode === 4
            ? {
                mode: 4,
                widths: Array.from({ length: Math.floor(cells / 2) + 1 }, (_, i) =>
                  i === 0 && cells % 2 === 0 ? 0 : 38 - i * 0.6,
                ),
              }
            : distributionMode === 1
              ? { mode: 1, cells }
              : { mode: distributionMode, cells, coefficient: 0.6 };
        cases.push({
          name: `vault-${mode}-distribution-${distributionMode}-${cells}`,
          input: { ...EXAMPLE, vault, distribution },
        });
      }
    }
  }
  for (const mode of [2, 3] as const) {
    for (const coefficient of [0, 1]) {
      for (const cells of [32, 45]) {
        cases.push({
          name: `coefficient-${mode}-${coefficient}-${cells}`,
          input: { ...EXAMPLE, distribution: { mode, coefficient, cells } },
        });
      }
    }
  }
  for (const cells of [2, 3, 196, 197, 198, 199]) {
    cases.push({
      name: `cell-limit-${cells}`,
      input: { ...EXAMPLE, distribution: { mode: 1, cells } },
    });
  }
  cases.push(
    {
      name: 'ellipse-late-vault-correction',
      input: {
        ...EXAMPLE,
        vault: { mode: 1, a: 414.2901, b: 237.43, x1: 414.2901 * 0.99999, correction: 28.22 },
      },
    },
    {
      name: 'elliptical-tip',
      input: {
        ...EXAMPLE,
        leadingEdge: { ...EXAMPLE.leadingEdge, a: 575.5, correction1: 0, correction2: 0 },
        trailingEdge: { ...EXAMPLE.trailingEdge, a: 575.5, offset: -100, correction: 0 },
      },
    },
    {
      name: 'double-correction',
      input: {
        ...EXAMPLE,
        leadingEdge: { ...EXAMPLE.leadingEdge, correction2: 12, exponent1: 2.8, exponent2: 4 },
        trailingEdge: { ...EXAMPLE.trailingEdge, correction: -8.9, exponent: 1.5 },
      },
    },
    {
      name: 'no-correction',
      input: {
        ...EXAMPLE,
        leadingEdge: { ...EXAMPLE.leadingEdge, correction1: 0, correction2: 0 },
        trailingEdge: { ...EXAMPLE.trailingEdge, correction: 0 },
      },
    },
    {
      name: 'late-correction',
      input: {
        ...EXAMPLE,
        leadingEdge: { ...EXAMPLE.leadingEdge, x1: 575.49, x2: 575.49, correction1: 0 },
        trailingEdge: { ...EXAMPLE.trailingEdge, x1: 575.49, correction: 0 },
      },
    },
    {
      name: 'first-vault-segment',
      input: { ...EXAMPLE, distribution: { mode: 4, widths: [0.01, 38, 30, 20] } },
    },
    {
      name: 'ellipse-negative-correction',
      input: {
        ...EXAMPLE,
        vault: { mode: 1, a: 414.2901, b: 237.43, x1: 265.3489, correction: -20 },
      },
    },
  );
  // Fixed seed: exercise other scales, angles, correction signs and cell counts reproducibly.
  let seed = 314159;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < 12; i++) {
    const scale = 0.5 + random();
    // Keep generation order fixed: the seed is part of the oracle corpus.
    const leadingCorrection = random() * 40 * scale;
    const secondCorrection = (random() - 0.5) * 8 * scale;
    const trailingCorrection = (random() - 0.5) * 5 * scale;
    const arc = (j: number): CircularArc => ({
      radius: (750 - j * 200) * scale,
      angle: 12 + random() * 12,
    });
    cases.push({
      name: `parameter-${i}`,
      input: {
        ...EXAMPLE,
        halfSpan: 575.5 * scale,
        leadingEdge: {
          ...EXAMPLE.leadingEdge,
          a: 710.21 * scale,
          b: 243.11 * scale,
          x1: 375 * scale,
          x2: 475 * scale,
          correction1: leadingCorrection,
          correction2: secondCorrection,
        },
        trailingEdge: {
          ...EXAMPLE.trailingEdge,
          a: 903.01 * scale,
          b: 243.11 * scale,
          x1: 372.5 * scale,
          correction: trailingCorrection,
          offset: 215.2 * scale,
        },
        vault: { mode: 2, arcs: [arc(0), arc(1), arc(2), arc(3)] },
        distribution: { mode: 3, coefficient: random(), cells: 20 + Math.floor(random() * 60) },
      },
    });
  }
  return cases;
}
