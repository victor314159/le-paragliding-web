# LEparagliding web

[LEparagliding](https://www.laboratoridenvol.com/leparagliding/leparagliding.en.html)
3.29, the paraglider design program by Pere Casellas, running in the browser.
The original Fortran source is compiled to WebAssembly and runs locally in a
Web Worker: a static site, no backend.

**Try it: <https://victor314159.github.io/le-paragliding-web/>**

**Edit parameters** (experimental, shown only on a local server such as
`docker compose up`) edits the 37 sections of `leparagliding.txt` and the
points of its airfoils in forms; saving them rewrites the changed files without
their comments. **Edit text**, in the menu of each file, edits any file. Most
sections show a live drawing of their input, before the engine's corrections:
zoom with the wheel, pan by dragging.

**Preprocessor** edits `pre-data.txt`, the parameters of the [geometry
preprocessor](https://www.laboratoridenvol.com/leparagliding/pre.en.html), like
an airfoil: saving rewrites it when they change. Without the file, it can be
created in Auto, with a default shape to tune. The editor shows whether the
rib table of section 1 is the one they generate, rounded as
`geometry-out.txt`. **Apply to section 1** replaces that table and keeps the
other rib columns; **Fit to section 1** sets the area, aspect ratio, taper,
sweep, tip angle and cells of Auto to those of the table, as for an imported
wing, and its other settings to follow the table's cells, vault and edges.
Both first show section 1 and what it becomes superposed, with their spans,
areas and aspect ratios at Wing scale. Remove the file from the list of input
files. Focus a parameter group to highlight its edge, correction or
vault arc in the views that draw it; explicit cell widths highlight the same
cell in the planform and cell-width views.

## Safety disclaimer

This application is an experimental browser port of LEparagliding. Errors may
arise from the original software, the port, or the input data.

The results do not constitute a safety assessment or airworthiness
certification. They must not be used as the sole basis for building or flying a
wing. Any real-world use requires independent verification and appropriate
testing by qualified individuals.

Paragliding is inherently dangerous. Designing, building, testing or flying a
wing, even one built from correct results, can cause property damage, serious
injury or death. You do so at your own risk.

The software is provided without warranty, to the extent permitted by
applicable law. See the [GNU GPL v3 license](LICENSE).

## How it works

Nothing is compiled in the browser. The Fortran source is compiled once,
ahead of time, to WebAssembly: with [flang](https://flang.llvm.org/) 21 (the
LLVM Fortran compiler) and [Emscripten](https://emscripten.org/), on Linux in
Docker (the [r-wasm/flang-wasm](https://github.com/r-wasm/flang-wasm)
toolchain). The page then downloads `lepara.wasm` (about 1.2 MB) and runs it in
a Web Worker, on any OS with a recent browser.

The reference is the **unpatched official source**, compiled with the author's
toolchain (Ubuntu 23.04, gfortran 12.3, x86-64, pinned in
[oracle/toolchain.json](oracle/toolchain.json)): on Swoop2 it reproduces the
outputs published with the official binary. Two checks follow, byte for byte:

- the patched source on that same toolchain differs from the reference only
  by the effects of the patches (001: height lost to an array overflow; 005:
  stable Roman numeral placement; 007: line colors), pinned in
  `oracle/patch-effects.tsv`;
- the WASM build differs from the patched native one only by a few `-0.000`
  vs `0.000` (libm), pinned in `oracle/wasm-known-diffs.tsv`.

See [the patches](fortran/engine/patches/README.md) and
[the oracle](oracle/README.md).

## Requirements

Docker with Compose. Every toolchain (Node, flang, gfortran) runs in a
container; nothing else is installed on the host.

## Develop

```sh
docker compose up   # http://localhost:4200
```

It compiles the Fortran engine to WASM (~3 min the first time, then only when
it changes), installs the dependencies and serves the app with live reload.

## Build and test

```sh
docker build --output dist .                # release build -> dist/
docker compose run --rm web npm test        # browser tests against dist/
docker compose run --rm web npm run check   # lint + types + format
docker compose run --rm oracle node scripts/check-patched-native.ts  # patched engine vs official references
docker compose run --rm oracle node scripts/check-preprocessor-native.ts  # geometry preprocessor vs gfortran
docker build --target engine-pkg --output pkg .   # npm package -> pkg/
docker compose run --rm web scripts/assemble-package.sh format   # @lepara/format -> build/format/
```

The release build checks the WASM engine against the official references and
lints before building. CI builds the site and the npm package at once
(`docker build --target release --output . .`, into `dist/` and `pkg/`), then
runs the browser tests and, beside them, the native checks; releases (below)
deploy `dist/` to GitHub Pages or publish `pkg/` to npm.

Generated files live in a Docker volume (`docker compose down -v` deletes it).

To deliberately regenerate the official references after changing the upstream
source, toolchain or example corpus:

```sh
docker compose build oracle
docker compose run --rm oracle node scripts/run-oracle.ts
```

This compiles the official source without our patches, checks that every design
is deterministic, and only replaces the references after all checks pass.
Review changed outputs and pinned differences before committing them.

## Release

From an up-to-date `main`, on the host (Node 24+, for your git credentials):

```sh
npm run bump:web            # app version: deploys to Pages
npm run bump:engine         # packages/engine: publishes to npm
npm run bump -- web engine  # both, in one commit and one CI run
```

They bump the patch version: add `minor` or `major` (`npm run bump:web -- minor`)
for the others. The script commits and pushes `main`. Once every check of that
run passed, CI deploys or publishes each version that has no tag yet, then tags
it `web-v<version>` or `engine-v<version>`. If a check fails, nothing is
released: fix it on `main`, and the next run releases the same version.

## Layout

| Path                     | Contents                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `src/`, `public/`        | Angular app                                                                                        |
| `tests/`                 | Playwright tests                                                                                   |
| `fortran/engine/`        | Official engine source, docs, examples and [patches](fortran/engine/patches/README.md)             |
| `fortran/preprocessor/`  | Official geometry preprocessor source and [oracle patches](fortran/preprocessor/patches/README.md) |
| `packages/design/`       | Design helpers without a native equivalent ([details](packages/design/README.md))                  |
| `packages/engine/`       | The engine as an npm package ([details](packages/engine/README.md))                                |
| `packages/format/`       | Input files as typed objects ([details](packages/format/README.md))                                |
| `packages/preprocessor/` | Geometry preprocessor in TypeScript ([details](packages/preprocessor/README.md))                   |
| `packages/views/`        | Drawings of a design, as scenes and SVG ([details](packages/views/README.md))                      |
| `oracle/`                | Example designs and the official outputs the WASM build must match                                 |
| `scripts/`               | Engine build and oracle scripts                                                                    |

The app bundles `@lepara/format`, `@lepara/preprocessor`, `@lepara/design` and
`@lepara/views` from their source (TypeScript path aliases);
the parameter editor (`src/app/editor/`) is loaded on demand.

## Example designs

The example designs are by Pere Casellas,
[Laboratori d'envol](https://www.laboratoridenvol.com/). They come from the
official LEparagliding archives, except BHL7-22, from the
[BHL7 project](https://www.laboratoridenvol.com/projects/BHL7/bhl7.en.html).
Each one's exact source is in `fortran/engine/original/designs/<id>/SOURCE.txt`.

## License

[GPL-3.0](LICENSE).
