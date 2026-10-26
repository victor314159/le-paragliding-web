# @lepara/design

Helpers for LEparagliding 3.29 designs that have no native equivalent, and
so no oracle: they act on the typed design of
[`@lepara/format`](../format/README.md) and the parameters of
[`@lepara/preprocessor`](../preprocessor/README.md). No other runtime
dependency and no file access; runs in browsers, Workers and Node.
GPL-3.0-only.

```ts
import { applyGeometry, newPreData } from '@lepara/design';
import { parseLep, writeLep } from '@lepara/format';
import { generateGeometry } from '@lepara/preprocessor';

const design = parseLep(text);
if (design.ok) {
  const geometry = generateGeometry(newPreData(design.value));
  if (geometry.ok) {
    const shaped = { ...design.value, geometry: applyGeometry(design.value, geometry.value) };
    const saved = writeLep(shaped); // { ok, value } or { ok: false, errors }
  }
}
```

Each helper takes the sections it reads (`Pick<LepDesign, ...>`): a whole
design fits. Inputs are readonly and are never mutated.

## Shape

A `WingShape` of ten settings (flat area and aspect ratio, tip chord, sweep,
edge roundness, vault tip angle and curl, cells and their uniformity) sets
every parameter of pre-data.txt. `fromShape(shape, base)` gives elliptic
edges without corrections, four vault arcs and cells proportional to chord,
rounded to 0.01, with the flat area of the shape; it keeps the name and
correction starts of `base`. `shapeOf(input, result)` reads the shape of
valid parameters, clamped to `SHAPE_LIMITS`; `SHAPE_DEFAULTS` is that of the
documented example. `shapeLosses(shape, input)` lists the parts of the
parameters that the shape replaces: none when they are a shape's within
rounding, vault arcs being compared by length and angle.
`shapeOfRibs(ribs, cells)` gives the settings of a rib table as section 1 has
them (area, aspect ratio, tip chord, sweep, tip angle and cells), none
without a positive chord.

## pre-data.txt and section 1

The native user copies the rib table of `geometry-out.txt` into section 1.
`applyGeometry(design, result)` gives section 1 with the cells, rib count and
`GENERATED_COLUMNS` of the result, rounded to F7.2 as that file; the other
columns of existing rows stay, and new rows take the preprocessor's washin
settings, with no rotation in an 11-column table.
`isGeneratedGeometry(design, result)` tells whether section 1 has that rib
table, within the rounding. `fitShape(shape, design)` sets the settings of
`shapeOfRibs` from section 1, and searches the others (cell uniformity, tip
curl, edge roundness) for the least distance to its rib columns; without a
valid table or vault, it keeps them. `newPreData(design)` gives
the parameters of a new pre-data.txt: `SHAPE_DEFAULTS`, with the wing name of
section 1.

## Metrics

`wingMetrics(design)` gives the flat and projected spans (m), areas (m²) and
aspect ratios of the rib table of section 1, at Wing scale, which the engine
applies to its lengths: the main parameters of its lep-out.txt, and those of
the preprocessor's result before Wing scale, within the F7.2 rounding of the
table. None while a coordinate is missing or an area is not positive.

## Build and test

```sh
docker compose run --rm web scripts/assemble-package.sh design   # -> build/design/
docker compose run --rm web npm test -- design
```

`build/design/` imports `@lepara/format` and `@lepara/preprocessor` by name:
the script assembles them too, and links all three in `build/node_modules/`,
so that a Node script in `build/` resolves them. The tests read `src/`, and
also load the assembled package in Node.
