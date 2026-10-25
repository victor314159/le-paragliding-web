# @lepara/preprocessor

[LEparagliding geometry preprocessor 1.6](https://www.laboratoridenvol.com/leparagliding/pre.en.html)
by Pere Casellas, ported to pure TypeScript. No runtime dependencies or file
access; runs in browsers, Workers and Node. GPL-3.0-only.

```ts
import { parsePreData, writePreData, generateGeometry } from '@lepara/preprocessor';

const input = parsePreData(text);
if (input.ok) {
  const geometry = generateGeometry(input.value);
  if (geometry.ok) {
    console.log(geometry.value.ribs, geometry.value.metrics);
  }
  const saved = writePreData(input.value);
}
```

`parsePreData` reads the records without validating the values, like
`parseLep`: `validatePreprocessor(input)` returns their field diagnostics,
and generating or writing fails on them. `cellCount` gives the
cell count of a distribution. `PREPROCESSOR_EXAMPLE` is the documented example
(the official `pre-data.txt`), with its parts `ARC_VAULT_DEFAULTS` and
`DISTRIBUTION_DEFAULTS`; `ELLIPSE_VAULT_DEFAULTS` is a corrected-ellipse
vault. `PRE_DATA_FILE` is the file name. Parsing, writing and
generation return `{ ok: true, value, warnings }` or `{ ok: false, errors }`,
like `@lepara/format`. Inputs are readonly and are never mutated.

The input has leading/trailing ellipses with exponential corrections, a
vault (corrected ellipse or four tangent circular arcs), and a cell
distribution (uniform, linear, proportional to chord, or explicit widths).
Lengths are **cm**, angles **degrees**. Modes retain their official numbers.
The half span `xm`, written in both edge records, is a single `halfSpan`;
reading fails if the two records differ.
Explicit widths describe the half wing: a zero first width means an even
cell count; otherwise it is the full central-cell width. Widths and vault
length are normalized to the flat half span. Supports 2–199 cells.

The result contains the half-wing rib table, sampled contours and vault
(split into its arcs),
and the original geometric metrics. Coordinates start at the central
leading edge / top of the vault, without CAD drawing offsets. Spans are
**m**, areas **m²**, chords **cm**; ratios are dimensionless. Maximum/minimum
chord retain the upstream meaning (first/last rib).

Ribs are structurally compatible with the nine-column `RibGeometry` in
`@lepara/format`. The caller owns integration with a design, including its
11-column rotations, washin, profiles and other rib references. This package
supports the preprocessor's 199-cell limit; the current engine/format allows
197 cells because it reserves an additional virtual rib. This package does
not modify designs, create DXF files, or fit parameters to existing ribs.

`pre-data.txt` uses the fixed records of 1.6. Headings and parameter labels
are skipped as in Fortran; comma/space-separated numbers, `D` exponents,
comments after values, CRLF and quoted names are accepted. Writing produces
canonical records; comments/layout are not retained. Other list-directed
syntax (repetition, null values, record continuation) is not supported.

## Shape

An optional extension, without a native equivalent nor an oracle: a
`WingShape` of ten settings (flat area and aspect ratio, tip chord, sweep,
edge roundness, vault tip angle and curl, cells and their uniformity) sets
every parameter. `fromShape(shape, base)` gives elliptic edges without
corrections, four vault arcs and cells proportional to chord, rounded to
0.01, with the flat area of the shape; it keeps the name and correction starts
of `base`. `shapeOf(input, result)` reads the shape of valid parameters,
clamped to `SHAPE_LIMITS`. `shapeLosses(shape, input)` lists the parts of the
parameters that the shape replaces: none when they are a shape's within
rounding, vault arcs being compared by length and angle.

## Native oracle

```sh
docker compose run --rm oracle node scripts/check-preprocessor-native.ts
```

Applies the documented [patches](../../fortran/preprocessor/patches/README.md)
to the checked upstream source, compiles it with the engine's gfortran (the
`oracle` image), and compares the live native results with TypeScript. Both vaults and all distributions are crossed
with odd/even counts; cases also cover coefficient endpoints, cell limits,
correction signs, narrow central cells and deterministic parameter variants.
Inputs, native outputs and logs stay in `build/preprocessor-native/`.
CI runs this oracle independently of the browser tests.

The port preserves the native sampling (0.01 radians for the edges, 300+100
steps for the ellipse vault, 99 segments per circular arc), piecewise linear
interpolation and **five** chord-distribution iterations. The reference is
the patched algorithm, not undefined/uninitialized upstream results.

The native reference is compiled with `-fdefault-real-8 -fdefault-double-8`
to use double precision, matching JavaScript numbers. This checks the port's
algorithm rather than reproducing float32 rounding at every operation.
Single precision can amplify cancellation near vertical segments (one case
changes the tip inclination by about 0.06°); it is not the numeric contract
of this package.

The oracle exports all double-precision digits, including intermediate
curves. Counts must match exactly. Every number must satisfy
`absError <= 1e-7 + 1e-9 * abs(native)` in its documented unit. The 50-case
corpus has maximum absolute errors of 1.31e-10 cm in coordinates and
7.07e-11° in inclinations. Rounded text and DXF byte identity are outside
this comparison.

## Build and test

```sh
docker compose run --rm web scripts/assemble-preprocessor.sh   # -> build/preprocessor/
docker compose run --rm web npm test -- preprocessor
```

Build output is `build/preprocessor/`: ES modules, declarations, manifest,
README and license. The tests read `src/`, and also assemble the package to
load it in Node and Chromium.
