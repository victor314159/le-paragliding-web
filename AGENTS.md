# AGENTS.md

Setup, build and test commands are in [README.md](README.md).

- Build, lint and test in containers (`docker compose`, `docker build`), never
  on the host: `node_modules/` holds Linux binaries. `build/` is a Docker
  volume, empty on the host. Scripts without dependencies, such as
  `npm run bump:web|bump:engine`, can run on the host; the bump scripts push,
  so run them only on request.
- Tests run against `dist/`: rebuild it (`docker build --output dist .`) before
  testing a change. Run one test file with
  `docker compose run --rm web npm test -- inputs`.
- `tests/oracle.spec.ts` checks one design; all of them with
  `docker compose run --rm -e ORACLE_ALL=1 web npm test -- oracle`.
- Use the Playwright MCP to see frontend changes (`docker compose up`).
- Before saying a change is done, run `npm run check` and the tests related to
  it.

## Input format

- `packages/format/` reads and writes `leparagliding.txt` and the airfoils as
  the engine does: a change to the engine's reading (section 4 of the source)
  goes into `src/read-design.ts`, `src/write-design.ts`, `src/model.ts` and
  `SPEC.md`. Its tests are `tests/format/` (`npm test -- format`); the engine
  equivalence test runs `build/engine/`, or `dist/engine/` without it;
  `docker compose run --rm oracle node scripts/check-format-native.ts` runs
  the same cases on the native build (gfortran).

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
  `fortran/patches/*.patch`: edit the patches, never the generated file, and
  document them in `fortran/patches/README.md`.
- After an engine change, rebuild the WASM (`docker compose run --rm wasm`) and
  compare it with native gfortran, byte for byte:
  `docker compose run --rm oracle node scripts/check-wasm-oracle.ts`. Accepted
  differences are listed in `oracle/wasm-known-diffs.tsv`.
- `oracle/reference/` (native outputs) and `oracle/designs/` are committed.
  Regenerate them only on purpose, with `node scripts/run-oracle.ts` and
  `node scripts/build-designs.ts` in the `oracle` service.
