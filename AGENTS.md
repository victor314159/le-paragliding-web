# AGENTS.md

Setup, build and test commands are in [README.md](README.md).

- Run everything through `docker compose`, never `npm` or `node` on the host:
  `node_modules/` holds Linux binaries. `build/` is a Docker volume, empty on
  the host.
- Tests run against `dist/`: rebuild it (`docker build --output dist .`) before
  testing a change. Run one test file with
  `docker compose run --rm web npm test -- inputs`.
- `tests/oracle.spec.ts` checks one design; all of them with
  `docker compose run --rm -e ORACLE_ALL=1 web npm test -- oracle`.
- Use the Playwright MCP to see frontend changes (`docker compose up`).
- Before saying a change is done, run `npm run check` and the tests related to
  it.

## Fortran engine

- `build/fortran/leparagliding.f` is generated from the official zip plus
  `fortran/patches/*.patch`: edit the patches, never the generated file, and
  document them in `fortran/patches/README.md`.
- After an engine change, rebuild the WASM (`docker compose run --rm wasm`) and
  compare it with native gfortran, byte for byte:
  `docker compose run --rm oracle scripts/check-wasm-oracle.sh`. Accepted
  differences are listed in `oracle/wasm-known-diffs.tsv`.
- `oracle/reference/` (native outputs) and `oracle/designs/` are committed.
  Regenerate them only on purpose, with `scripts/run-oracle.sh` and
  `scripts/build-designs.sh` in the `oracle` service.
