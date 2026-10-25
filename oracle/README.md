# Engine oracle

The reference is the **unpatched official source**, run natively with the
author's toolchain. Two checks compare our build with it, each with one cause
of difference:

| Check                     | Compares                                        | Pinned differences  | Cause      |
| ------------------------- | ----------------------------------------------- | ------------------- | ---------- |
| `check-patched-native.ts` | patched source, official toolchain → reference  | `patch-effects.tsv` | patches    |
| `check-wasm-oracle.ts`    | WASM (patched, flang) → patched native          | `wasm-known-diffs.tsv` | flang/libm |

The WASM check and the browser test (`tests/oracle.spec.ts`) need no native
build: they apply both tables to the reference hashes (`scripts/oracle-lib.ts`).

```sh
docker compose run --rm oracle node scripts/check-patched-native.ts
docker compose run --rm wasm && docker compose run --rm web node scripts/check-wasm-oracle.ts
```

## Toolchain

The official Linux archive's `lep/Compilation.txt` says Xubuntu 23.04 and
`gfortran -static-libgfortran leparagliding.f`, and its executable was built by
GCC (Ubuntu 12.3.0-1ubuntu1~23.04) 12.3.0: both are recorded in
`fortran/engine/original/docs/` (`Compilation.txt`, `SOURCE.txt`). The
`oracle` image (`Dockerfile`) is that system, x86-64, pinned by digest, with
the package versions of `toolchain.json` from the frozen
`old-releases.ubuntu.com` archive. `toolchain.json` also holds the compiler and
its flags. The scripts refuse to run in an image built from another
`toolchain.json`.

glibc picks its libm routines (`sin`, `cos`, `pow`...) from the CPU at run
time, and their last bits differ: without FMA/AVX2, gnuC-27's DXF changes. The
references use the FMA routines, those of the author's binary on any x86-64
since Haswell/Zen (glibc 2.37 has no AVX-512 variant of them). glibc selects
them on an x86-64-v3 CPU: `toolchain.json` (`cpuLevel`) requires it, as
glibc reports it (`ld.so --help`), and the scripts refuse other CPUs. Docker
Desktop on Apple Silicon (Rosetta) and the GitHub runners qualify.

This is the author's documented environment, not the author's machine. On Swoop2, the
design whose official outputs are published, the reference reproduces them;
the only difference, the source date in `run-log.txt`, is pinned in
`fortran/engine/original/designs/swoop2/official-outputs.known-diffs.tsv`.

## Generate the references deliberately

```sh
docker compose build oracle
docker compose run --rm oracle node scripts/run-oracle.ts
```

`run-oracle.ts` extracts the verified official zip (only CRLF -> LF), builds it
without any patch and runs each design twice. Failed runs, nondeterminism or
unexplained differences from published outputs leave the committed references
untouched. Generated DXF/STL/SCAD files stay in
`build/oracle-runs/<design>-a/` (`run/`, `stl/`); only their SHA-256 is
committed.

## Pinned differences

The two tables above, and `official-outputs.known-diffs.tsv` (published outputs
→ reference, checked by `run-oracle.ts`), have five tab-separated columns:

```text
design    file    from-sha256    to-sha256    reason
```

One line pins one exact pair of contents. Any other content fails, including
a new change to a listed file; a line whose `from` no longer matches (the
reference or a patch changed), or whose design or file no longer exists, fails
too, until reviewed. Inspect each difference before recording it, keep its
reason specific to the design and the observed change, and remove lines that
become identical. Never generate lines to make a check pass.

## Patch policy

The official zip stays unmodified; the patches live in
`fortran/engine/patches/` and are documented there. Portability patches must
not change the outputs. Functional fixes may, with a reproducible explanation
and an exact line in `patch-effects.tsv`. Do not emulate memory corruption
merely to match the reference.
