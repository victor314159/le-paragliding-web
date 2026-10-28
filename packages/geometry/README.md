# @lepara/geometry

The 3D geometry of LEparagliding 3.29 designs as its engine computes it, in
its coordinates at Wing scale (X′ along the span, Y along the chord, Z
down), from the typed design of [`@lepara/format`](../format/README.md):
the ribs, the trim estimate, the suspension lines, the brakes and the V and VH
ribs. A port of
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

## V and VH ribs

`vRibs(design, airfoils)` gives the V and VH ribs of section 12 as the
engine draws them in its 3D model (§16): each between two ribs, as two
edges of matching points (21, 121 for type 5), joined point to point. Types
11 to 16, in % of chord, are converted into 1 to 6 by the chords the engine
has read, before the wing tip; H straps (type 1) are not in the 3D model.
`hStraps(design, airfoils)` gives them as the engine computes them before
laying them flat in its 2D drawing: on each rib, the band of intrados about
its anchor that types 2 to 4 take too. Nothing the engine writes in 3D
checks them.
The engine keeps the edges in arrays by rib and anchor row from row to row,
and the port does too: a type 5 is drawn on the last anchor row of its rib
when its neighbours have as many rows, and a type 6 that does not go to the
next rib takes the edge last kept there. As in the engine, a type 3 in % of
chord (column 9 at 1) keeps its widths in cm, unscaled, the section being
read twice, and the profile point nearest the far end of a band is left out
of its polyline.

`vRibHoles(design, airfoils)` gives the holes of section 38 in the V-ribs of
types 5 and 6, as the engine cuts them on the V-ribs laid flat (`flatten`,
its `flatt`: row after row, each quadrilateral of the same sides and
diagonal), from the last row of each type with holes: type 5 turned along
its edge on the anchor rib, a hole at each anchor sized by the distance
across in x to the other edge, as the engine measures it; type 6 holes
evenly along it (`vhholes`). `flatToRib`, `flatAt` and `ribAt` carry a point
between the V-rib laid flat, its rows (along) and fraction across, and 3D. A
hole may overflow its V-rib, as the engine's do.

## Build and test

```sh
docker compose run --rm web scripts/assemble-package.sh geometry   # -> build/geometry/
docker compose run --rm web npm test -- geometry
```

The tests compare the ribs, trim and every line and brake of the example
designs with the engine's `lep-out.txt` in `oracle/reference/`: lengths and
centers to 0.01 cm, but only the lengths of the lines of the single-skin
BHL7-22, whose printed centers are not its lines'. The V and VH ribs are
compared with the engine's `lep-3d.dxf`, which starts with them: its
reference is committed as a hash only, so their test runs the engine
(`build/engine/`), on a few cases, or on every example and the variants of
section 12 with `ORACLE_ALL=1`. The holes of the V-ribs are compared, by
their place in their V-ribs laid flat and their semi-axes, with the ellipses
the engine draws in `leparagliding.dxf` for Swoop2, the one example with
such holes.
