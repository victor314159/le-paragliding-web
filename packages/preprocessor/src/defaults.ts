import type { CellDistribution, PreprocessorInput, Vault } from './model.ts';

/** The four tangent arcs of the documented 1.6 example. */
export const ARC_VAULT_DEFAULTS = {
  mode: 2,
  arcs: [
    { radius: 746.1, angle: 15.33 },
    { radius: 527.47, angle: 20.44 },
    { radius: 373.09, angle: 18.62 },
    { radius: 104.64, angle: 35.38 },
  ],
} as const satisfies Vault;

/** A corrected ellipse close to the arcs of the example. */
export const ELLIPSE_VAULT_DEFAULTS = {
  mode: 1,
  a: 414.2901,
  b: 237.43,
  x1: 265.3489,
  correction: 28.22,
} as const satisfies Vault;

/** The cell distribution of the documented 1.6 example: proportional to chord. */
export const DISTRIBUTION_DEFAULTS = {
  mode: 3,
  coefficient: 0.7,
  cells: 50,
} as const satisfies CellDistribution;

/** The documented 1.6 example (pre-data.txt of the official distribution). */
export const PREPROCESSOR_EXAMPLE: PreprocessorInput = {
  name: 'gnuGUI-test',
  halfSpan: 575.5,
  leadingEdge: {
    a: 710.21,
    b: 243.11,
    x1: 375,
    x2: 475,
    correction1: 48.3,
    exponent1: 2,
    correction2: 0,
    exponent2: 2,
  },
  trailingEdge: { a: 903.01, b: 243.11, x1: 372.5, correction: -2.45, offset: 215.2, exponent: 2 },
  vault: ARC_VAULT_DEFAULTS,
  distribution: DISTRIBUTION_DEFAULTS,
};
