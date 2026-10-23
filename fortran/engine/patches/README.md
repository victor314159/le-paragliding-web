# Patches applied to the LEparagliding 3.29 source

The optional geometry preprocessor has [separate patches](../../preprocessor/patches/README.md)
and its own native oracle; the engine build does not apply them.

The single source of truth is the official zip
`fortran/engine/original/leparagliding3.29.f.zip`, unmodified (sha256 checked).
`scripts/make-patched.sh` extracts `leparagliding.f` from it and derives
`build/fortran/leparagliding.f` (CRLF -> LF, then the patches below, in order;
not versioned). That file is what gets compiled, both by gfortran (native
oracle) and by flang (WASM). To change the source, edit or add a patch, never
the generated file.

Each patch adds a `PATCH lepara-web NNN` comment to the source.

| #   | File                               | Reason                                                                                                                                                                                                                                                                                                                                               | Effect on native output                                                                                                                      |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | `001-hdist-hangle-index-0.patch`   | `hdist`/`hangle` are declared `(100)` but indexed by `i=hvr(k,3)`, which is 0 for the central cell (16.1.4). `hdist(0)` overwrote `hcpp` (gfortran) or another variable (flang).                                                                                                                                                                     | `lep-out.txt`: "Total height hcp" goes from `0.` to `714.` cm (correct value, cf. "Line heigth = 7.14 m"); `leparagliding.dxf`: 192 lines    |
| 002 | `002-jconi-jconf-integer.patch`    | `jconi`/`jconf` are declared `real*8` but only hold integer indices; flang rejects a REAL subscript (32 errors). Declared `integer`.                                                                                                                                                                                                                 | none                                                                                                                                         |
| 003 | `003-common-block-data.patch`      | On wasm, flang emits uninitialized named COMMON blocks with "common" linkage, which wasm-ld cannot resolve (`undefined symbol: markstypes_`). A `BLOCK DATA` defines them, initialized to 0 like the native `.bss`.                                                                                                                                  | none                                                                                                                                         |
| 004 | `004-index-0-bounds.patch`         | Other arrays indexed by rib or by group with an out-of-bounds index 0 (or -1): `lvcx/lvcy/rvcx/rvcy`, `xanchor*` (main program and `iam`), every "cut group" array (`ng=rib(i,169)` is 0 outside any group, including in `panels3d`/`czinf`), and `jirr(-1)`. These accesses read or wrote outside the array, i.e. at a compiler-dependent location. | none (native output unchanged, verified; under gdb, `jirr(-1)` and `uppcuts(0)` were already 0)                                              |
| 005 | `005-romanoparc-arc-tie.patch`     | `romanoparc`: arc of 20 equal segments and `xlenco=0.2`, so `xlen2 = xlen1*xlenco` **exactly** at segment 4. The `.le.` was decided by the last bit (libm, compiler, platform) and moved the roman numeral by one segment (about 2.1 cm). Equality now counts as true.                                                                               | `leparagliding.dxf`: 276 lines (`mcircles` layer)                                                                                            |
| 006 | `006-lep-out-integer-format.patch` | In list-directed output (`write(23,*)`), gfortran writes an integer on 12 characters and flang on the minimal width. Explicit `(1X,A,I12)` format = gfortran bytes.                                                                                                                                                                                  | none                                                                                                                                         |
| 007 | `007-iccolor34-size.patch`         | `iccolor34(50)` is indexed by line number (1..`cordam`, up to 500 like `corda`) when lines are colored by type (`i37c=1`, code 1341 of section 37). With ~93 lines it overflowed: under flang onto `icode37` (`lep-out.txt` listed every special code as `3`), under gfortran onto whatever sets the color of 4 segments. Declared `(500)`.          | `leparagliding.dxf` (Swoop, Swoop2): 4 segments at y=-4200 get color 5 instead of 3, i.e. the color the official binary lost to the overflow |
| 008 | `008-n1vr-negative-guard.patch`    | 9 polyline blocks (ribs, VHR) compute `n1vr` from two point indices; when the end index precedes the start index, `n1vr<1` and the end point was written to `xlin1/ylin1(n1vr)` outside the array (`xlin1(-4)` for gnuA7/A8; under flang it hit the risers surface: 78.88 m² instead of 0.045). The write is skipped; the loops using it do not run. | none (verified on the 7 designs)                                                                                                             |
| 009 | `009-corda-index-0-read.patch`     | `if(i.ge.2.and.corda(i-1,1)...)`: Fortran `.and.` does not short-circuit, so `i=1` read `corda(0,1)` (outside the array). Index clamped; same result.                                                                                                                                                                                                | none                                                                                                                                         |
| 010 | `010-scad-integer-format.patch`    | Same as 006 for the `// Cell i Line k from n` comments of `../stl/lep-3d-surfaces.scad` (3 sites): explicit `(1X,A,I12,1X,A,I12,1X,A,I12)`, the gfortran bytes including its blank after each integer.                                                                                                                                               | none                                                                                                                                         |

Outside the patches:

- The flang runtime wraps list-directed records at 80 columns, gfortran does
  not. The engine wrapper sets `FORT_FMT_RECL=100000`
  (`packages/engine/src/run.ts`).
- The program creates `../stl` and `../xflr5` with `call system('mkdir ...')`.
  Emscripten's `system()` does nothing: the glue is built for browsers only,
  and Node runs that same glue (`scripts/build-flang-wasm.sh`). The wrapper
  creates the directories in the virtual file system.
- flang compiles with `-fno-automatic` (`scripts/build-flang-wasm.sh`). gfortran
  makes local arrays larger than 64 KB static, so they keep their value between
  calls; the code relies on it (`vredis` reads `xlin2(1)` left by the previous
  call when `n1vr<1`). flang put them on the stack: stale or garbage values
  (NaN in `leparagliding.dxf`, "Method does not converge" for gnuC-27/gnuA7).
  `-fno-automatic` makes every subprogram local static. gfortran keeps its
  default flags: its output equals the official binary's.

## Method

- Out-of-bounds accesses: AddressSanitizer (`-fsanitize=address
-fsanitize-recover=address`, `ASAN_OPTIONS=halt_on_error=0`) for accesses
  leaving an array, and a gdb watchpoint on `hcpp`. `-fcheck=bounds` is not
  usable: it stops at the first overflow inside an array (see below), and
  there are many. Since 007-009, ASan reports nothing on the 7 designs.
- Numerical divergences: native/WASM traces compared (temporary debug
  `write`s) down to the first discrete decision that diverges.
- An overflow **inside** a single array (e.g. `skinnew(i+1,0,k)` landing on
  `skinnew(i,101,k)`) is not fixed: column-major order is the same for every
  compiler, so the result is deterministic.

## Known residual risks

- Other numeric list-directed writes (two to `lep-out.txt` near the 006
  site): their spacing may differ between gfortran and flang (cosmetic). Not
  exercised by the 7 designs; handle them like 006/010 if a design shows it.
- libm: glibc (native) and emscripten's libm (WASM) differ by 1 ulp on a few %
  of `sin`/`cos`/`tan`/`atan`/`atan2`/`asin`/`acos`/`pow` results. Outputs are
  printed with 3-4 decimals, which absorbs it on the 7 designs except Swoop
  (a zero printed `-0.000`, accepted in `oracle/wasm-known-diffs.tsv`). A
  design whose result sits on a threshold (`if (scontrol.ge.s)`) could
  diverge further: it would show as a new, unaccepted difference.
- Ties like the one fixed by 005 elsewhere in the code are only detected if a
  design exercises them. Every design added to the oracle is a new test: run
  it under ASan too.
- Scalars that a subprogram reads before assigning them: gfortran leaves them
  on the stack (value of whatever ran before), flang `-fno-automatic` makes
  them static (value of the previous call, or 0). Identical on the 7 designs.
- `arc3parc` uses variables that are never assigned (`xlen`, `len1`, `len2`),
  but it is never called.
