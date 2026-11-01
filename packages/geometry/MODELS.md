# Geometry model contracts

## Selection and compatibility

Choose a model by importing named functions from a versioned subpath:
`@lepara/geometry/fortran-3.29` or `@lepara/geometry/enhanced-v1`. Both
export the same names, signatures, coordinates and units. The package root
is an alias of `fortran-3.29`, never a moving “latest”; the previews import
`enhanced-v1` explicitly. There is no class, global mode or
per-call option; alias imports to compare models in one program.

Model names identify algorithms, independently of the package version. Once
released, a model does not change its assumptions: a new one goes into a new
entry (`enhanced-v2`), and older entries stay while projects still select
them. A project-level choice belongs in project metadata, outside
`leparagliding.txt`.

## Layout and rules

```text
src/
  index.ts          compatibility root (fortran-3.29)
  fortran-3.29.ts   reference entry
  enhanced-v1.ts    improved entry
  fortran/          the engine port, quirks included
  enhanced/         intentional differences
  shared/           model-neutral types, vectors and mesh assembly
```

- The reference is a faithful port of `fortran/engine/original/`, checked
  against the engine's reports and DXF. Port faithfully first, then improve
  in `enhanced/`, never while porting.
- `fortran/` and `shared/` never import `enhanced/` or a public entry, and
  `shared/` never imports `fortran/` (ESLint `no-restricted-imports`).
  Model conventions live in each model, not as flags in `shared/`.
- The enhanced entry re-exports unchanged reference functions and overrides
  the others. Replacing one function does not rewire the dependencies
  captured inside another: an improved rib placement must also wire the
  anchors, lines and structures that use it.
- A reference helper may take an internal policy parameter (today `round`,
  `Math.fround` by default, identity in enhanced v1). Once a function
  diverges further, enhanced gets its own implementation, and the reference
  stays a port without options.
- An improvement is judged by invariants (seam lengths, closed contours,
  consistency between developed and 3D lengths, symmetry) and its measured
  difference with the reference. Never update the oracle references to accept
  an enhanced output.
- The previews (`@lepara/views`) draw `enhanced-v1`; the cutting patterns
  and DXF files stay those of the real engine.

## Engine quirks

Found while porting. Kinds: **bug** (no intended effect), **constant**
(arbitrary constant or precision), **model** (physical simplification).

| Where                              | Engine behavior                                                                       | Kind     | Enhanced v1 |
| ---------------------------------- | ------------------------------------------------------------------------------------- | -------- | ----------- |
| `anchors.ts` `turnedTriangle`      | Level 4 turns with `d41`, level 3 with `d21`; signs differ between levels.            | bug?     | kept        |
| `anchors.ts` `anchorOnRib`         | An anchor without a spanning segment falls on the leading edge (initial zeros).       | bug      | kept        |
| `anchors.ts` `brakeAnchors`        | Fractional anchor ribs move anchors in place: later paths take the moved anchors.     | bug      | kept        |
| `anchors.ts` `brakeAnchors`        | A rib beyond the distribution spans keeps the previous rib's lengthening.             | bug      | kept        |
| `lines.ts` `suspensionLines`       | Weightings 1 and 2 take the line's own rib chord for every anchor it holds.           | bug?     | kept        |
| `skin-ribs.ts`                     | Points added by `remapcont` stay zeros (only a temporary copy is changed).            | bug      | kept        |
| `skin-ribs.ts`, `skin-patterns.ts` | Implicit single precision and real literals.                                          | constant | double      |
| `skin-patterns.ts` `reformat`      | Different left/right start indices; asymmetric interpolation and widths (section 31). | bug?     | kept        |
| `skin-patterns.ts`                 | Tolerance `1.001`, correction threshold 0.01, zero clamp 0.001.                       | constant | kept        |
| `skin.ts` `arcHeight`              | 301-step search; no inflation below 0.01 cm of surplus.                               | constant | exact arc   |
| `skin.ts`                          | The central cell copies the heights of the next one (§8.5.0.1).                       | bug      | own length  |
| `skin.ts` normals                  | Median-profile plane through an auxiliary point 10 cm away.                           | constant | geometric   |
| `vribs.ts` `intradosBand`          | Where no segment spans a position, the line of the last segment taken is kept.        | bug?     | kept        |
| `vrib-holes.ts` `keptRow`          | Only the last section 38 row with holes drawn applies.                                | bug?     | kept        |

## Enhanced v1

Only `balloonedSkin` differs. Airfoil preparation and panel development
reuse the reference helpers in double precision, with the engine's
panel-development and sewing conventions; the arcs, central cell and normals
follow the table above.

- **Arc:** solve `theta / sin(theta) = fabric length / chord` on `(0, pi)` by
  64 bisections, with a series for small angles. Any positive surplus
  inflates; fabric no longer than its chord gives a straight segment, as do
  invalid inputs. Samples stay equal-angle (section 37 code 1291, 12 by
  default), with exact zero lift at both seams.
- **Normals:** unit normal of the local span and the median-profile tangent;
  a degenerate direction contributes no displacement.
- **Miniribs:** on double skins, a section 2 `minirib` in `(1, 100)` (percent
  of chord from the trailing edge) sews both skins to the median profile:
  stations within that length (by mean normalized chord) take two congruent
  half-arcs, of chord `d/2`, fabric `L/2` and sagitta `h/2`, which conserve
  the fabric length. Such cells round their subdivisions up to an even count,
  at least 4. Inlets and single skins (whose markers describe attachment
  triangles) are unaffected; `miniribStrain` (section 8) is unrelated.

This is a geometric model, not a pressure, strain or flying-equilibrium
simulation. The minirib is idealized on the median profile: code 3001's
contour modifications are not modeled, and the constraint starts abruptly at
the first station within its length, which depends on the airfoil's station
resolution.
