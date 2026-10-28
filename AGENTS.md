# AGENTS.md

Before each commit, review the diff, take a step back, and ensure that:

- The changes are as simple, lean, and clean as possible.
- The code follows best practices and shared logic is refactored where appropriate.
- The solution addresses the root problem and achieves the intended goal in the best possible way.

Setup, build and test commands are in [README.md](README.md).

- Build, lint and test in containers (`docker compose`, `docker build`), never
  on the host: `node_modules/` holds Linux binaries. `build/` is a Docker
  volume, empty on the host. Scripts without dependencies, such as
  `npm run bump:web|bump:engine`, can run on the host; the bump scripts push,
  so run them only on request.
- Browser tests run against `dist/`: rebuild it (`docker build --output dist .`)
  before testing an app change.
- Run the tests of what you changed, not the whole suite (CI runs it):
  `docker compose run --rm web npm test -- <filters>`, which match test file
  paths.

  | Changed                  | Filters                          |
  | ------------------------ | -------------------------------- |
  | `packages/format/`       | `format`                         |
  | `packages/preprocessor/` | `preprocessor`                   |
  | `packages/design/`       | `design`                         |
  | `packages/geometry/`     | `geometry views`                 |
  | `packages/views/`        | `views`                          |
  | `packages/engine/`       | `format/engine compute oracle`   |
  | `src/app/editor/`        | `editor`                         |
  | rest of `src/app/`       | `inputs compute previews editor` |

- The equivalence tests `tests/oracle.spec.ts` and `tests/format/engine.spec.ts`
  check one design; every design and variant with `-e ORACLE_ALL=1`, as CI
  does. Use it when changing the engine or how `packages/format/` reads or
  writes.
- Use the Playwright MCP to see frontend changes (`docker compose up`).
- Before saying a change is done, run `npm run check` and the tests of what
  you changed.

## Input format

- `packages/format/` reads and writes `leparagliding.txt` and the airfoils as
  the engine does: a change to the engine's reading (section 4 of the source)
  goes into `src/read-design.ts`, `src/write-design.ts`, `src/model.ts` and
  `SPEC.md`. Its tests are `tests/format/` (`npm test -- format`); the engine
  equivalence test runs `build/engine/`, or `dist/engine/` without it;
  `docker compose run --rm oracle node scripts/check-format-native.ts` runs
  the same cases on the native build (the author's gfortran).

## Parameter editor

- `src/app/editor/` edits the design in one Signal Form over the model
  (`DesignForm`, field paths as in the diagnostics), validated by
  `validateDesign`. A section form is a component that injects `EditorState`
  and binds `form.<section key>`, registered in `SECTION_FORMS`
  (`sections.ts`). A section with modes keeps the fields of every mode in
  `DesignForm`: add it to `toForm` and `toDesign` (`editor-draft.ts`), with
  its engine defaults in `@lepara/format`.

## Fortran engine

- `packages/engine/` is the npm package around the WASM build (TypeScript,
  compiled into `build/engine/` by `scripts/assemble-engine.sh`); the app and
  the oracle check both run it. After changing it, rerun that script (or
  restart `docker compose up`) and check the package with
  `docker build --target engine-pkg --output pkg .`.

- `build/fortran/leparagliding.f` is generated from the official zip plus
  `fortran/engine/patches/*.patch`: edit the patches, never the generated file, and
  document them in `fortran/engine/patches/README.md`.
- After an engine change, check the patched source on the official toolchain
  (`docker compose run --rm oracle node scripts/check-patched-native.ts`), then
  rebuild the WASM (`docker compose run --rm wasm`) and check it
  (`docker compose run --rm web node scripts/check-wasm-oracle.ts`). Both
  compare byte for byte with `oracle/reference/`, through the pinned
  differences of `oracle/patch-effects.tsv` (patches) and
  `oracle/wasm-known-diffs.tsv` (flang/libm). See `oracle/README.md`.
- `oracle/reference/` (outputs of the unpatched official source) and
  `oracle/designs/` are committed. Regenerate them only on purpose, with
  `node scripts/build-designs.ts` (`web` service) and
  `node scripts/run-oracle.ts` (`oracle` service, whose toolchain
  `oracle/toolchain.json` pins).

## Geometry preprocessor

- `packages/preprocessor/` is the TypeScript port. Its native oracle uses
  the official source in `fortran/preprocessor/original/` and the documented
  patches in `fortran/preprocessor/patches/`: never edit the official source.
  Run `docker compose run --rm oracle node scripts/check-preprocessor-native.ts`
  and `docker compose run --rm web npm test -- preprocessor` after changing it.

## Design helpers

- `packages/design/` holds what acts on a design without a native
  equivalent (Auto shape, applying pre-data.txt to section 1), on
  `LepDesign` and the preprocessor's types. A new helper goes there, typed on
  the sections it reads (`Pick<LepDesign, ...>`), never in the ports
  (`format`, `preprocessor`, `engine`), which hold only what their oracles
  check. The editor's form adapters stay in `src/app/editor/`.
  Run `docker compose run --rm web npm test -- design` after changing it.
- `packages/geometry/` ports the engine's 3D geometry (rib placement,
  trim, suspension and brake lines, V and VH ribs), quirks included, at
  Wing scale; its tests compare it with `lep-out.txt` in `oracle/reference/`,
  the V and VH ribs with the `lep-3d.dxf` of the engine, and their holes with
  its `leparagliding.dxf`, which they run (`build/engine/`). What the engine computes in
  space goes there, typed on the sections it reads, not in `views`.
  Run `docker compose run --rm web npm test -- geometry views` after changing it.
- `packages/views/` draws a design: each scene is a function of a
  `PreviewContext` (the `LepDesign` sections it reads), or of the file it
  draws, returning a `PreviewScene`, which the editor renders with
  `ScenePreview` and `toSvg` writes. Drawing code goes there, not in
  components; a new section scene goes into `SECTION_SCENES`. Run `npm test -- views` after changing it.
