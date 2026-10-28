# @lepara/views

Drawings of LEparagliding 3.29 designs: every preview of the parameter
editor, as plain scenes and standalone SVG. Typed by
[`@lepara/format`](../format/README.md) and
[`@lepara/preprocessor`](../preprocessor/README.md); its runtime
dependencies are [`@lepara/design`](../design/README.md), for the metrics of
section 1, and [`@lepara/geometry`](../geometry/README.md), for the 3D
geometry of the engine. No file access; runs in browsers, Workers and Node. GPL-3.0-only.

```ts
import { parseLep } from '@lepara/format';
import { SECTION_SCENES, toSvg } from '@lepara/views';

const design = parseLep(text);
if (design.ok) {
  const scene = SECTION_SCENES.get(11)!.draw({
    design: design.value,
    airfoils, // LepAirfoil by file name
    view: 'lines4',
    rib: 0,
    selected: 0,
    active: 0,
    secondary: 0,
    surface: 'upper',
  });
  writeFileSync('ramifications.svg', toSvg(scene));
}
```

A `PreviewScene` holds paths, dots and labels in the units of its drawing,
with a view box, a title, a note and a legend; `PreviewDrawing` builds one.
The `kind` of an item names its style; a `color`, for colors that carry
meaning such as the anchor rows, is the stroke of a path or the fill of a dot. A scene
function takes a `PreviewContext`: the sections of the design it reads
(`Pick<LepDesign, ...>`: a whole design fits), the airfoils, the view, the rib
(from 0) and the chosen records. Numbers may be missing or invalid, as while a
design is edited: scenes skip them.

`SECTION_SCENES` gives the scene of each section that has one, by section
number, with its views and whether a view draws a chosen rib. Two scenes
draw files instead: `airfoilScene(name, airfoil, point)` and
`preprocessorScene(result, input, view, focus)`, the geometry pre-data.txt
generates. `toSvg(scene)`
writes an SVG document, with a light default style for the kinds of its items. The helpers the scenes build on are exported too: rib profiles
(`ribProfile`, `frontPoint`, `offsetProfile`), line trees, rod curves,
reinforcement attachments, color cuts, skin tension curves, vents, wing tips
and holes.

A `PreviewModel` is a 3D drawing, at Wing scale in the engine's coordinates
(Z down) of [`@lepara/geometry`](../geometry/README.md): grids of skin, some
colored over it, planar fills with holes, lines and dots. A section with one
gives it as the `model` of its `SECTION_SCENES` entry, for its `MODEL_VIEW`
view: `wingModel` (sections 1 to 3 and 30, the skin open at the inlets of
open cells), `tensionModel` (section 5, the skin ballooned as the engine
does: by section 5, or by the groups of section 31 when active),
`tensionGroupsModel` (section 31, the skin ballooned by each rib's group),
`holesModel` (section 4), `trimModel` (section 8, beside its `trimScene`),
`linesModel` (sections 9 to 11, the lines and brakes), `reinforcementModel`
(section 12, the V and VH ribs and the H straps among the ribs, without the
skin, with the lines that reach the anchors), `colorsModel` (sections 15 and
16, the color regions and cuts, or the rib marks, on the skin),
`additionalPointsModel` (section 17, the points on every rib, without the
skin), `rodsModel` (section 21, the rods on the ribs of their groups,
without the skin), `ventsModel` (section 26, the air inlets open or closed
by the vents), `wingTipModel` (section 27), `shapingModel` (section 29, the
cuts and their zones of influence on the skin), `hvrHolesModel` (section 38, the
holes of the type 5 and 6 V-ribs). `preDataModel(result)` draws
the wing pre-data.txt generates on a generic airfoil, without the rest of
the design.

## Build and test

```sh
docker compose run --rm web scripts/assemble-package.sh views   # -> build/views/
docker compose run --rm web npm test -- views
```

`build/views/` imports `@lepara/design` and `@lepara/geometry` by name: the
script assembles them and their dependencies too, and links them in
`build/node_modules/`.
