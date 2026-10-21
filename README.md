# LEparagliding web

[LEparagliding](https://www.laboratoridenvol.com/leparagliding/leparagliding.en.html)
3.29, the paraglider design program by Pere Casellas, running in the browser.
The original Fortran source is compiled to WebAssembly and runs locally in a
Web Worker: a static site, no backend.

**Try it: <https://victor314159.github.io/le-paragliding-web/>**

## Safety disclaimer

This application is an experimental browser port of LEparagliding. Errors may
arise from the original software, the port, or the input data.

The results do not constitute a safety assessment or airworthiness
certification. They must not be used as the sole basis for building or flying a
wing. Any real-world use requires independent verification and appropriate
testing by qualified individuals.

The software is provided without warranty, to the extent permitted by
applicable law. See the [GNU GPL v3 license](LICENSE).

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
docker compose run --rm web npm run check   # lint + format
docker build --target engine-pkg --output pkg .   # npm package -> pkg/
```

The release build checks the WASM engine against the native references and
lints before building. CI runs the same two first commands; releases (below)
deploy `dist/` to GitHub Pages or publish the engine to npm.

Generated files live in a Docker volume (`docker compose down -v` deletes it).

## Release

From an up-to-date `main`, on the host (Node 24+, for your git credentials):

```sh
npm run bump:web      # app version, tag web-v<version>; deploys to Pages
npm run bump:engine   # packages/engine, tag engine-v<version>; publishes to npm
```

Both bump the patch version: add `-- minor` or `-- major` for the others.

## Layout

| Path                | Contents                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `src/`, `public/`   | Angular app                                                           |
| `tests/`            | Playwright tests                                                      |
| `fortran/original/` | Official source zip, docs and example designs, unmodified             |
| `fortran/patches/`  | Fixes applied before compiling ([details](fortran/patches/README.md)) |
| `packages/engine/`  | The engine as an npm package ([details](packages/engine/README.md))   |
| `oracle/`           | Example designs and the native outputs the WASM build must match      |
| `scripts/`          | Engine build and oracle scripts                                       |

## Example designs

The example designs are by Pere Casellas,
[Laboratori d'envol](https://www.laboratoridenvol.com/). They come from the
official LEparagliding archives, except BHL7-22, from the
[BHL7 project](https://www.laboratoridenvol.com/projects/BHL7/bhl7.en.html).
Each one's exact source is in `fortran/original/designs/<id>/SOURCE.txt`.

## License

[GPL-3.0](LICENSE).
