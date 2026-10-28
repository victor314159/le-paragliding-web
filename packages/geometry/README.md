# @lepara/geometry

The 3D geometry of LEparagliding 3.29 designs as its engine computes it, in
its coordinates at Wing scale (X′ along the span, Y along the chord, Z
down), from the typed design of [`@lepara/format`](../format/README.md):
the ribs, the trim estimate, the suspension lines and the brakes. A port of
parts of the engine, quirks included, checked against its outputs. No other
runtime dependency and no file access; runs in browsers, Workers and Node.
GPL-3.0-only.

```ts
import { parseLep, parseAirfoil } from '@lepara/format';
import { brakeLines, ribPoint, suspensionLines, trimEstimate } from '@lepara/geometry';

const design = parseLep(text);
if (design.ok) {
  const leadingEdge = ribPoint(design.value, 0, [0, 0]); // [x, y, z] in cm
  const trim = trimEstimate(design.value); // attitude, glide, angle of attack (deg)
  const lines = suspensionLines(design.value, airfoils); // airfoils by file name
  const brakes = brakeLines(design.value, airfoils, lines);
}
```

Each function takes the sections it reads (`Pick<LepDesign, ...>`): a whole
design fits. Inputs are readonly and are never mutated.

## Ribs

`ribPoint(design, index, [x, y])` places a rib-local point (fractions of the
chord, y down) as section 6 of the engine does: at Wing scale, washed in
about its rotation point, turned about its vertical axis, then inclined by
beta. `ribWashin` follows the engine in modes 1 and 2: it computes washins
while reading the rib table, before the last chord, so every rib but the
last divides by the central chord. `ribEdges` and `ribChord` apply an angle
wing tip (section 27, mode 1) to the last rib. `ribAirfoil` gives the
airfoil of a rib with its thickness coefficient (section 30), and
`placeOnRib` the placement alone, for other rib tables.

## Trim

`trimEstimate(design)` gives the attitude, glide path angle and angle of
attack of section 8 (§10.1 of the engine), and `karabiner(design)` the right
main karabiner, where the risers start. The engine scales the lines, not the
risers.

## Suspension lines

`suspensionLines(design, airfoils)` places the lines of the right half wing
(§12): their list from the paths of section 9, the action point of each
(the anchors it holds, weighted as section 9 says, by load in mode 3), then
each riser from the karabiner, each line from its parent towards its action
point, to its anchor or to the ramification distance of section 11. As in
the engine, distances along a line are truncated to whole centimeters, and
anchors are displaced after the washin. On a single skin the anchors move to
the extrados, and the lines end at their turned triangles (§12.7).
`anchorPoint` gives an anchor as the lines reach it.

`brakeLines(design, airfoils, lines?)` places the brake lines (§14) in the
plan after the lines': each main brake line from the end of the first riser
of the last line plan, the main brake length long, then as the lines, aiming
at plain means of their anchors. The brake anchors are lengthened along
their rib by the brake distribution of section 10, and a fractional anchor
rib (8.4) takes its anchor between two ribs, in place as the engine does, so
that later paths on these ribs take the moved anchors.

## Build and test

```sh
docker compose run --rm web scripts/assemble-package.sh geometry   # -> build/geometry/
docker compose run --rm web npm test -- geometry
```

The tests compare the ribs, trim and every line and brake of the example
designs with the engine's `lep-out.txt` in `oracle/reference/`: lengths and
centers to 0.01 cm, but only the lengths of the lines of the single-skin
BHL7-22, whose printed centers are not its lines'.
