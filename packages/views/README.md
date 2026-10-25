# @lepara/views

Drawings of LEparagliding 3.29 designs: the input schematics of the parameter
editor, as plain scenes and standalone SVG. Typed by
[`@lepara/format`](../format/README.md), without runtime dependencies or file
access; runs in browsers, Workers and Node. GPL-3.0-only.

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
with a view box, a title and a note; `PreviewDrawing` builds one. A scene
function takes a `PreviewContext`: the sections of the design it reads
(`Pick<LepDesign, ...>`: a whole design fits), the airfoils, the view, the rib
(from 0) and the chosen records. Numbers may be missing or invalid, as while a
design is edited: scenes skip them.

`SECTION_SCENES` gives the scene of each section that has one, by section
number, with its views and whether it draws a chosen rib. `toSvg(scene)`
writes an SVG document, with a light default style for the kinds of its paths
and dots. The helpers the scenes build on are exported too: rib profiles
(`ribProfile`, `frontPoint`, `offsetProfile`), line trees, rod curves,
reinforcement attachments, color cuts, skin tension curves, vents, wing tips
and holes.

## Build and test

```sh
docker compose run --rm web scripts/assemble-package.sh views   # -> build/views/
docker compose run --rm web npm test -- views
```
