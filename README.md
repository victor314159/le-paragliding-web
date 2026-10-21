# LEparagliding web

[LEparagliding](https://www.laboratoridenvol.com/leparagliding/leparagliding.en.html)
3.29, the paraglider design program by Pere Casellas, running in the browser.
The original Fortran source is compiled to WebAssembly and runs locally in a
Web Worker: a static site, no backend.

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
```

The release build checks the WASM engine against the native references and
lints before building. CI runs the same two first commands, then deploys
`dist/` to GitHub Pages.

Generated files live in a Docker volume (`docker compose down -v` deletes it).

## Layout

| Path                | Contents                                                              |
| ------------------- | --------------------------------------------------------------------- |
| `src/`, `public/`   | Angular app                                                           |
| `tests/`            | Playwright tests                                                      |
| `fortran/original/` | Official source zip, docs and example designs, unmodified             |
| `fortran/patches/`  | Fixes applied before compiling ([details](fortran/patches/README.md)) |
| `oracle/`           | Example designs and the native outputs the WASM build must match      |
| `scripts/`          | Engine build and oracle scripts                                       |

## License

[GPL-3.0](LICENSE).
