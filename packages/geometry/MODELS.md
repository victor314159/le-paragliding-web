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
- A reference function may take internal policy parameters, which default
  to the engine's: `round` (`Math.fround`, identity in enhanced v1), or the
  steps enhanced corrects (`PanelSteps`, `UnloadedSteps`, `RibSteps`,
  `ShapingSteps`, `TraceSteps`, `PatternSteps`, `VRibPatternSteps`,
  `LineSteps`, `MiniribSteps`, `Stations`: the engine's own ones by
  default). Enhanced
  passes its steps rather than copying the reference; only where its model
  differs throughout (the rods, a list of points per rod, not the engine's
  shared array) does it get its own implementation from the reference's
  exported helpers.
- An improvement is judged by invariants (seam lengths, closed contours,
  consistency between developed and 3D lengths, symmetry) and its measured
  difference with the reference. Never update the oracle references to accept
  an enhanced output.
- The previews (`@lepara/views`) draw `enhanced-v1`, the 2D patterns
  included; `fortran-3.29` is their oracle, checked against the engine's
  reports and DXF. The downloadable DXF files stay those of the real engine.

## Engine quirks

Found while porting. Kinds: **bug** (no intended effect), **constant**
(arbitrary constant or precision), **model** (physical simplification),
**format** (how the engine reads its input, which every model follows).
Enhanced v1 corrects every bug that changes what is cut, sewn or shown; a
kept one says why below.

| Where                                      | Engine behavior                                                                                                                                                                                                                                                        | Kind     | Enhanced v1         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------- |
| `anchors.ts` `turnedTriangle`              | Level 4 turns with `d41`, level 3 with `d21`; signs differ between levels.                                                                                                                                                                                             | bug      | to its line         |
| `anchors.ts` `anchorOnRib`                 | An anchor without a spanning segment falls on the leading edge (initial zeros).                                                                                                                                                                                        | bug      | nearer end          |
| `anchors.ts` `brakeAnchors`                | Fractional anchor ribs move anchors in place: later paths take the moved anchors.                                                                                                                                                                                      | bug      | per path            |
| `anchors.ts` `brakeAnchors`                | A rib beyond the distribution spans keeps the previous rib's lengthening.                                                                                                                                                                                              | bug      | end increment       |
| `lines.ts` `suspensionLines`               | Weightings 1 and 2 take the line's own rib chord for every anchor it holds.                                                                                                                                                                                            | bug      | anchor's rib        |
| `network.ts` `toward`                      | A line's length is truncated to whole centimeters: the engine assigns it to `t`, declared integer.                                                                                                                                                                     | bug      | exact               |
| `lines.ts` `suspensionLines`               | Every line of level 2 starts from the first riser of its plan (`x2line(plan,1,1)`), whichever riser it hangs on.                                                                                                                                                       | bug      | own riser           |
| `network.ts` `lineList`                    | The count of paths through a line is carried across levels and plans until a line is counted; weighting 0 and the brakes divide their action points by it.                                                                                                             | bug      | anchors summed      |
| `skin-ribs.ts`                             | Points added by `remapcont` stay zeros (only a temporary copy is changed).                                                                                                                                                                                             | bug      | inserted            |
| `skin-ribs.ts` `ribStations`               | datair leaves a .dat airfoil unscaled by section 33's thickness coefficient, which a .txt one takes, and its 3D ribs too: its panels and patterns keep the full thickness.                                                                                             | bug      | scaled              |
| `skin-ribs.ts`, `skin-patterns.ts`         | Implicit single precision and real literals.                                                                                                                                                                                                                           | constant | double              |
| `skin-patterns.ts` `reformat`              | Different left/right start indices; asymmetric interpolation and widths (section 31).                                                                                                                                                                                  | bug?     | symmetric           |
| `skin-patterns.ts`                         | Tolerance `1.001`, correction threshold 0.01, zero clamp 0.001.                                                                                                                                                                                                        | constant | kept                |
| `skin-patterns.ts` cut lines               | Computed before the §8.2.4/§8.4.4 corrections, which move the sewing lines alone.                                                                                                                                                                                      | bug?     | after them          |
| `skin-patterns.ts` §8.2.3                  | The legacy correction moves the right cut line on unsigned normals.                                                                                                                                                                                                    | bug?     | after them          |
| `skin-patterns.ts` §8.4.1                  | The classic intrados starts on the angle of the last vent segment, in its own frame.                                                                                                                                                                                   | bug      | own segment         |
| `skin-panels.ts` `xrxs`                    | End corners intersect lines in implicit single precision.                                                                                                                                                                                                              | constant | double              |
| `skin-panels.ts` `drwvent`                 | An inlet glued to the extrados is turned after translating its u only, not its v.                                                                                                                                                                                      | bug      | about its middle    |
| `skin-panels.ts` `drwvent`                 | The central cell's trimmed inlets (±4, ±5) take their left parameter on both sides.                                                                                                                                                                                    | model    | kept                |
| `rib-patterns.ts` `inletMarks`             | §9.4 marks the central rib's trimmed inlet (±4, ±5) at its left parameter too.                                                                                                                                                                                         | model    | kept                |
| `marks.ts` `cornerMarks`                   | prinifp reads the left sides after §8.4.4 reflects their point np2 + np3 − 2 through the previous one: with inlets of 1 or 2 points, an extrados corner moves.                                                                                                         | bug      | sides as sewn       |
| `marks.ts` `sideMarks`                     | With two extrados cuts, the second and third pieces' marks stop at the first piece's length, and the third's start from 0.                                                                                                                                             | bug      | continued           |
| `marks.ts` `edgeNumeral`                   | romanop takes the extrados' v unreversed: the numeral is mirrored about v = 0, the trailing edge's own line in the panel's frame, which leaves it in place.                                                                                                            | bug      | kept                |
| `marks.ts` `arcNumeral`                    | The numeral's place on a seam sums 20 equal arc segments against a fraction: 0.2 is an equality, taken exactly as the engine's drawings do.                                                                                                                            | constant | exact               |
| `marks.ts` `panelAnchorMarks`              | iam's type 2 starts both sides' dots off the anchor the same way, inside the panel on the right; type 3 moves the left triangle along v the right one's way (the sides running nearly along v, it barely shows).                                                       | bug      | outwards            |
| `marks.ts` `panelAnchorMarks`              | iam marks an anchor past the intrados on its glued inlet as developed, moved back by that inlet side's span (part 4, "SOLUCIÓ PROVISIONAL"), not where the inlet is drawn.                                                                                             | bug      | on its inlet        |
| `skin-shaping.ts`                          | The first extrados cut's zone of influence is empty: its start is overwritten (l. 4138).                                                                                                                                                                               | bug      | from its start      |
| `skin-shaping.ts`                          | Without a nose point at (0, 0) (.dat airfoils), the chord the seams' lengths are measured along runs from the unset point 0, the origin.                                                                                                                               | bug      | from its nose       |
| `rib-patterns.ts` `cutLine`                | Both ends of the cut line keep the last loop's sawtooth factor (`xcosk`).                                                                                                                                                                                              | bug      | allowance           |
| `rib-patterns.ts` `ribPatterns`            | A rectangle hole (§6.12.5) assigns its `x21` to the whole array of section 21's arcs: from the first rib with one, the arc rods (type 2) are NaN.                                                                                                                      | bug      | true arcs           |
| `rods.ts` `extradosRod`                    | joncs4 deflects each part of an extrados rod (type 4) by the other part's deflection and exponent.                                                                                                                                                                     | bug      | own part's          |
| `rods.ts` `sharkUpperRod`, `sharkLowerRod` | The shark nose's transitions take their exponent in % of chord, like their lengths; the upper rod's nose points overwrite its extrados start, and the lower rod's deflection starts two points after its intrados start.                                               | bug      | corrected           |
| `rods.ts` `alongAirfoil`                   | A rod ending on an airfoil point has its last two points a rounding apart: the direction of their offset is rounding.                                                                                                                                                  | constant | one point           |
| `rods.ts` `ribRods`                        | A rod finding no segment on its rib (a flat last rib) takes the points its subroutine found last (static locals, zero at first).                                                                                                                                       | bug      | no rod              |
| `rods.ts` `arcRod`                         | A rising arc closer to vertical than horizontal reads a sign (`xsign3`) only falling arcs set: the last one's, static, 0 at first (a straight line).                                                                                                                   | bug      | by the chord        |
| `rods.ts` `extradosRod`                    | Single skin, joncs4 restores the point after the inlet from `x4`, `y4`, never set (static, 0): the rib's later rods, mylar, marks, anchors and inlet ends read (0, 0) there.                                                                                           | bug      | kept point          |
| `vribs.ts` `vRibTraces`                    | Type 2 moves its dots on the left neighbour 2·`xdes` inwards along the segment, not on the right.                                                                                                                                                                      | bug      | alike               |
| `vribs.ts` `vRibTraces`                    | Type 4 turns the dots of its middle ribs by points 6 and 8's `jcon`, never set: 0, the slope from the origin to the trailing edge.                                                                                                                                     | bug      | across its line     |
| `vribs.ts` `vRibTraces`                    | Type 5 turns the dots on its own rib by its left neighbour's lines.                                                                                                                                                                                                    | bug      | across its intrados |
| `vribs.ts` `vRibTraces`                    | Type 6 marks rib i + 1 even when it goes to another rib, with what the engine kept for it there, and joins in 3D the band it last kept for it. Not ported in the reference: it would take the engine's whole `ucnt` state of types 2 to 6, by rib and row.             | bug      | its own rib         |
| `vrib-patterns.ts` `stripMarks`            | Type 6 numbers its right edge after its left rib (i + 1), wherever it goes, a fifth of column 8 (that rib's number) along, and a row by a tenth of column 4 (its position, % of chord).                                                                                | bug?     | own ribs            |
| `vrib-patterns.ts` `continuousMarks`       | Type 5 draws each anchor as three dots 1 cm apart in x, not along its edge.                                                                                                                                                                                            | bug?     | across              |
| `vrib-patterns.ts`                         | An edge of no length gives NaN marks and numbers, which the engine writes.                                                                                                                                                                                             | bug      | left out            |
| `miniribs.ts`                              | Section 37's code 3001 transition 2 (parabolic) sets none of the minirib's points: the engine draws lines of no length at the origin, with its holes and number.                                                                                                       | bug      | parabola            |
| `miniribs.ts`                              | A transition (code 3001) starts from `hautok(i − 1)`, the arc heights of the cell before the minirib's, rib 2's for the first two ribs, of the engine's patterns and arcs.                                                                                             | bug      | own cell            |
| `miniribs.ts`                              | The holes of section 38 (type 9) centre `center` of the height below the trailing edge, whose v is 0 in the rib's frame.                                                                                                                                               | format   | kept                |
| `skin-panels.ts` `engineSides`             | The midline of an unloaded rib's cell (u44) takes vector 9 as §8.4.4 leaves it, reflected over the extrados' last point when the inlet has 2 points; on the inlet, vectors 9 and 10 hold zeros past the point §8.2.4 extrapolates, which turn the intrados seam's end. | bug      | sides as sewn       |
| `unloaded-ribs.ts`                         | Every unloaded rib takes the holes of the last rib of the last section 4 row holding a type 11 (its "parameters for unloaded"), as a later row naming that rib leaves them, all drawn as ellipses.                                                                     | bug      | type 11 only        |
| `skin-panels.ts` `unloadedSeam`            | §9.9.10 draws the seam of an unloaded rib at the sheet's origin, not on its cell's panels (a layout, which no model has: both put it on them); its extrados marks turn the other way below the chord, its ends by unsigned angles, the intrados' by the inlet's zeros. | bug      | one side            |
| `rib-patterns.ts` `closedInlet`            | A "pc" rib's inlet corners are written over the cut line's points np2 + 1, np2 + 2, np2 + np3 − 3 and np2 + np3 − 2: with fewer than 4 inlet points, over the extrados' and the intrados' own, which §6.13 then cuts.                                                  | bug      | own points          |
| `rib-patterns.ts` `closedInlet`            | On the cutting table, a "pc" rib's nose is cut straight between its inlet ends' cut points, not by the corners drawn on the rib (§6.13, "Erase old code").                                                                                                             | bug?     | corners             |
| `rods.ts` `ribMylar`                       | A nose mylar ending inside a "pc" inlet: the engine draws the inlet's line to its end, past the mylar, which it leaves open.                                                                                                                                           | bug      | along the nose      |
| `rib-patterns.ts` holes                    | An ellipse's rotation is read as radians; triangles and rectangles take degrees.                                                                                                                                                                                       | format   | kept                |
| `skin.ts` `arcHeight`                      | 301-step search; no inflation below 0.01 cm of surplus.                                                                                                                                                                                                                | constant | exact arc           |
| `skin.ts`                                  | The central cell copies the heights of the next one (§8.5.0.1).                                                                                                                                                                                                        | bug      | own length          |
| `skin.ts` normals                          | Median-profile plane through an auxiliary point 10 cm away.                                                                                                                                                                                                            | constant | geometric           |
| `vribs.ts` `intradosBand`                  | Where no segment spans a position, the line of the last segment taken is kept: only on an intrados turning back, which none runs.                                                                                                                                      | bug?     | kept                |
| `vrib-holes.ts` `keptRow`                  | Only the last section 38 row of a type with holes drawn applies: the section names no ribs.                                                                                                                                                                            | format   | kept                |
| `vrib-patterns.ts` `segmentCut`            | VH ribs move each edge segment apart on its unsigned slope (`abs(datan)`), unjoined.                                                                                                                                                                                   | bug?     | as strips           |
| `vrib-patterns.ts`                         | An edge of no length has no slope: NaN cut lines, which the engine writes.                                                                                                                                                                                             | bug      | left out            |
| `vrib-holes.ts` `flatAnchors`              | Type 5 anchors sit at their airfoil length from point 4, walked on the flat 121-point edge, which cuts the airfoil's corners: under a thousandth of a millimetre on the examples.                                                                                      | constant | kept                |
| `vrib-patterns.ts` `continuousCut`         | Type 5 takes the ribs' sewing allowance, not the V-ribs'.                                                                                                                                                                                                              | bug?     | V-ribs'             |
| `vrib-patterns.ts` `continuousCut`         | Corners between two type 5 cutouts move across at the next one's `jconf − 1` and the previous one's `jconi − 1`.                                                                                                                                                       | bug?     | own cutout          |
| `vrib-patterns.ts` `ellipsePoints`         | Elliptic type 5 cutouts draw 99 of their 100 segments.                                                                                                                                                                                                                 | bug      | closed              |

Open: on single-skin wings, the last point of a glued inlet's left cut
line sometimes takes the other quadrant's sign in the engine (§8.3.1): the
segment after the inlet that decides it is not the one `skinPatterns`
develops. The sewing lines agree; `tests/geometry/panels.spec.ts` allows
that one cut segment.

## Enhanced v1

`balloonedSkin`, `skinPanels`, `ribPatterns`, `vRibPatterns`,
`unloadedRibPatterns`, `miniribPatterns`, `vRibs`, `vRibHoles`, `hStraps`,
`anchorPoint`, `suspensionLines`, `brakeLines` and `suspensionTriangles`
differ, each correcting the bugs below. Airfoil
preparation and panel development reuse the reference helpers in double
precision, with the engine's panel-development and sewing conventions; the
3D-shaping seams' sagitta follows the ballooning below; the arcs, central
cell and normals follow the table above.

- **Kept:** how the engine reads its input (kind **format**: an ellipse's
  rotation in radians, the last section 38 row of a type, the minirib
  holes' side) stays, since a design is written for the engine and must
  give the same pieces in both models; so do its tolerances (kind
  **constant**) and its central cell's trimmed inlets on their left
  parameter (kind **model**), a choice of the engine's, not an error.
- **Arc:** solve `theta / sin(theta) = fabric length / chord` on `(0, pi)` by
  64 bisections, with a series for small angles. Any positive surplus
  inflates; fabric no longer than its chord gives a straight segment, as do
  invalid inputs. Samples stay equal-angle (section 37 code 1291, 12 by
  default), with exact zero lift at both seams.
- **Normals:** unit normal of the local span and the median-profile tangent;
  a degenerate direction contributes no displacement.
- **Lines:** a single-skin attachment triangle turns about its base until
  its tip points to its line's start (the engine mixes components of
  different axes, by level); an anchor beyond its intrados sits at its
  nearer end, not at the leading edge; each anchor weighs by its own rib
  (weightings 1 and 2), and every action point is the mean of the anchors
  summed, not over a carried count; lines of level 2 start from their own
  riser; lengths are exact, not whole centimeters. A fractional brake
  anchor rib interpolates for its own path, from the ribs' anchors (the
  engine moves them in place, for the paths after it), and a rib beyond the
  brake distribution takes its end's increment.
- **Minirib transition:** every transition starts from the arc heights of
  the minirib's own cell, those of the skin (the engine takes the cell
  before, rib 2's for the first two ribs). The parabolic transition (section
  37, code 3001, 2), which the engine reads and draws nothing of, eases the
  minirib's back from its full height at its front to nothing, flat, at the
  transition's length: `(1 − t)²`.
- **Airfoil stations:** the panels, ribs and V-ribs of a .dat airfoil take
  section 33's thickness coefficient, as its 3D ribs and a .txt airfoil do
  (the engine's datair does not: a tip at 0.01 keeps its full thickness).
  Where no point is near an inlet end, the engine counts a point it never
  inserts (`remapcont` changes a copy), its airfoil ending in zeros, and
  where it moves the point after the end onto it, it counts the one before:
  enhanced v1 inserts the point, and counts the one at the end
  (`enhanced/stations.ts`, the `stations` steps).
- **Panel development:** the engine develops a panel's right edge on the
  left rib's terms in places: section 31 cuts the right rib's tension
  curve to the left rib's count of points and, on the intrados, takes the
  next cell's width; §8.4.4 rewrites the intrados right side from the left
  start index and the extrados left side from the right one. Enhanced v1
  takes each edge's own curve, cell width and start (`PatternSteps`). The
  engine's cut lines are moved off the sewing lines before §8.2.3, §8.2.4
  and §8.4.4 correct those (§8.2.3 then moving the right one near the nose
  on unsigned normals): the allowance varies where they act. Enhanced v1
  moves the cut lines off the corrected sewing lines. The classic intrados
  starts on its own first segment's angle, not the inlet's last.
- **Shaping and inlets:** the first extrados cut's zone of influence runs
  from its start, as the second's (the engine's is empty, so its seam
  takes half the sagitta); the seams' chord runs from the airfoil's nose,
  its least u, where a .dat airfoil has no point at (0, 0); an inlet glued
  to the extrados turns about the middle of its first points, not about a
  point at v = 0, which shifted it off the extrados' end.
- **V-rib traces:** type 2 marks both neighbours alike (the engine moves
  the left one's end dots 2·`xdes` in); type 4 turns its middle ribs' dots
  across their own line, not by a slope never set; type 5 marks its own
  rib across its intrados, not by its left neighbour's lines. Type 6 marks
  and joins the rib it goes to, any rib (`vRibs`, `vRibHoles`).
- **Rods:** the engine builds each rod in one array per rib, which its
  subroutines index as the airfoil and partly overwrite, and keeps their
  locals from one call to the next. Enhanced v1 builds each rod as its own
  list of points (`enhanced/rods.ts`): a rod finding no segment is not
  drawn, and nothing passes from a rod or a rib to the next. The arcs are
  those of section 21, whatever the holes; a steep arc bulges by its
  deflection's sign across its chord, rising or falling; a type 4 part
  takes its own deflection and exponent; the shark nose keeps the points it
  passes, deflects its lower rod from its intrados start, and its
  transitions' exponent is a plain exponent (the engine scales it as a
  length, % of chord). A point a rounding after the previous one, whose
  offset has no direction, is dropped; NaN rods are left out.
- **Rib cut lines:** the sawtooth factor of a single-skin intrados point
  widens the allowance where its two segments meet; the engine moves both
  ends of the cut line by the last point's factor too, where there is one
  segment. Enhanced v1 moves them by the allowance.
- **"pc" ribs:** the engine cuts on the table a straight nose between the
  cut points of the inlet's ends, offset on the mean normals of the
  extrados and the intrados: the allowance off the closed inlet varies. On
  the rib it draws the intended cut, the inlet's line offset by the allowance
  meeting the extrados' and the intrados' cut lines at their intersections,
  but writes these corners over cut points of the extrados and the intrados
  when the inlet has fewer than 4 points. Enhanced v1 cuts the corners, the
  cut line's own points kept: a constant allowance along the whole contour.
  A mylar follows the contour as sewn, the straight inlet included, so that
  one ending inside the inlet ends on it, closed; ribs without thickness keep
  their nose open, as there is no inlet line to cut.
- **V-ribs:** an edge of no length has no direction to move its cut line
  and marks across; the engine writes NaN for them, which no reader can
  place. Enhanced v1 leaves those points out. The VH ribs' edges are cut as
  the other strips': on the signed slope, the allowance moves each edge
  outwards, where the unsigned one turns some segments inwards, and the
  segments join. Type 5 is a V-rib, cut with the V-ribs' allowance; the
  corners of a cutout move across the edge at that cutout's ends (the
  engine takes the next cutout's for some), and its ellipses close. Type 6
  numbers its edges after their own ribs (the engine names i + 1 for a rib
  elsewhere, which would sew it wrong) the same way in, without the anchor
  row it does not hang on. Type 5 marks an anchor by three dots across its
  edge, as intended, not along x.
- **Panels:** with two cuts on a surface, the engine stops the second and
  third pieces' marks at the first piece's length and starts the third's
  from 0: their marks no longer meet the rib's. Enhanced v1 runs each
  piece's marks on from where the previous one's left off, a piece too short
  for a mark passing the run on, and marks the
  anchors outwards on both sides, in the allowance, those past the
  intrados on its glued inlet where that inlet is drawn. Its corner marks
  read the sides as sewn (see the unloaded ribs below). The extrados
  numeral's mirror is kept: in the panel's frame it is about the trailing
  edge's own line, which leaves the numeral in place.
- **Unloaded ribs:** the engine measures an unloaded rib, and marks its
  panels, on its vectors 9 and 10 as §8.2.4 and §8.4.4 leave them: zeros
  on the inlet, the left side reflected at its point np2 + np3 − 2, over
  the extrados' last point when the inlet has 2 points, which the panels as
  drawn do not take. Enhanced v1 takes the sides as sewn (`sewnSides`) for
  the rib's lengths, its seam and the panels' marks. The seam's dots stay
  on one side of the midline, each turned by its own segment, the
  intrados' end by the intrados. The engine reads section 4's type 11 holes
  back from a rib a later row may override, with the row's other holes;
  enhanced v1 takes the type 11 holes of the last row holding them.
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
