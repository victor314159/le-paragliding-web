# Patches applied to the LEparagliding 3.29 source

This file serves two readers: the author of LEparagliding (Pere Casellas),
for the bugs found in the official source, and the maintainers of this
project, for how the patched source is built and checked.

Line numbers refer to the official `leparagliding.f` (3.29). Converting CRLF
to LF does not change them. The [oracle](../../../oracle/README.md) runs the
official source without these patches, on the author's toolchain: those
outputs are the reference. The patched source, on the same toolchain, differs
from them only by the effects of 001, 005 and 007, pinned in
`oracle/patch-effects.tsv`; the other patches change no output.

## Summary by category

| Category                                                      | Patches                    | Relevant upstream     |
| ------------------------------------------------------------- | -------------------------- | --------------------- |
| [Out-of-bounds access](#out-of-bounds-access)                 | 001, 004a-d, 007, 008, 009 | yes                   |
| [Numeral placement convention](#numeral-placement-convention) | 005                        | proposal for upstream |
| [Fortran standard](#fortran-standard)                         | 002                        | yes                   |
| [flang/WASM portability](#flangwasm-portability)              | 003, 006, 010              | no                    |

Some out-of-bounds accesses are the symptom of a deeper bug that the patch
does not fix; these, and the bugs found while reviewing them that no patch
covers, are listed in [Upstream issues not fixed by
the patches](#upstream-issues-not-fixed-by-the-patches).

## Out-of-bounds access

Each of these reads or writes outside an array, i.e. at a location that depends
on the compiler and the memory layout. Most come from an index 0: rib 0
(central cell) or group 0 (rib outside any 3D-shaping group). Each patch either
widens the array bounds or skips the access; when the official binary read a
location that held 0, the output is unchanged.

| #                                     | Site (official source)                                                                                                                                                                                                    | Bug                                                                                                                                                                                                                                                                                                                                                     | Patch                                                       | Effect on native output                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [001](001-hdist-hangle-index-0.patch) | `hdist(100), hangle(100)` l.424, written l.16923-16947                                                                                                                                                                    | Indexed by `i=hvr(k,3)`, which is 0 for the central cell (16.1.4; guard `hvr(k,3).gt.0.or.cencell.gt.0.01` l.16608). `hdist(0)` overwrote `hcpp` (gfortran) or another variable (flang).                                                                                                                                                                | `(0:100)`, like `rib`, `rx`, `pl1x`                         | `lep-out.txt`: "Total height hcp" goes from `0.` to `714.` cm (correct value, cf. "Line heigth = 7.14 m"); `leparagliding.dxf`: 192 lines |
| [004a](004-index-0-bounds.patch)      | `lvcx/lvcy/rvcx/rvcy(500,500)` l.431                                                                                                                                                                                      | Indexed by rib `i` of 16.1.x, which can be 0 (central cell); `lvcx(0,1)` wrote outside the array.                                                                                                                                                                                                                                                       | first bound `0:500`                                         | none                                                                                                                                      |
| [004b](004-index-0-bounds.patch)      | `xanchor*`, `yanchor*` `(100,6)` l.457-459 and in `iam` l.35987-35989                                                                                                                                                     | `iam` is called with `i=iini`, 0 with a central cell (l.11268); the main program writes `xanchoril(i,klz)` in `do i=0,nribss-1` (l.13517). `xanchoril(0,klz)` overwrote the `iam` stack.                                                                                                                                                                | `(0:100,6)`                                                 | none                                                                                                                                      |
| [004c](004-index-0-bounds.patch)      | "cut group" arrays l.510-518 (`ncuts`, `ini29`, `fin29`, `iupp`, `ilow`, `xiupp`, `xilow`, `kiupp`, `kilow`, `uppcuts`, `upptype`, `lowcuts`, `lowtype`), and their dummies in `panels3d` (l.34743) and `czinf` (l.34994) | `ng=rib(i,169)` is 0 for a rib outside any group (l.4133, 9770, 25381); `iupp(1,2,0)`, `uppcuts(0)`... went outside the arrays.                                                                                                                                                                                                                         | group bound `0:200`, `uppcuts(0)=lowcuts(0)=0` (no cut)     | none (under gdb, `uppcuts(0)` already read 0)                                                                                             |
| [004d](004-index-0-bounds.patch)      | `jirr(0:500)` l.465, read l.7334 and l.8720                                                                                                                                                                               | `jirr(i-1)` is read in `do i=0,nribss`; `jirr(-1)` is outside the array. See [`jirr(i-1)` on the right side](#jirri-1-on-the-right-side) for the likely cause.                                                                                                                                                                                          | `jirr(-1:500)`, `jirr(-1)=0`                                | none (under gdb, `jirr(-1)` already read 0)                                                                                               |
| [007](007-iccolor34-size.patch)       | `iccolor34(50)` l.477, written l.15469, 16144, 26713, 26737                                                                                                                                                               | Indexed by line number `i` (1..`cordat` (brakes included), up to 500 like `corda(500,50)`), not by line type, when lines are colored by type (`i37c=1`, code 1341 of section 37). With ~93 lines it overflowed: under flang onto `icode37` (`lep-out.txt` listed every special code as `3`), under gfortran onto whatever sets the color of 4 segments. | `(500)`                                                     | `leparagliding.dxf` (Swoop, Swoop2): 4 segments at y=-4200 get color 5 instead of 3, the color the official binary lost to the overflow   |
| [008](008-n1vr-negative-guard.patch)  | `xlin1(n1vr)=...` in 9 polyline blocks (ribs, VHR): l.18240, 18343, 19251, 19480, 19709, 22727, 22782, 22905, 22961                                                                                                       | `n1vr` is computed from two point indices (e.g. `jcon(i,ii,9)-jcon(i,ii,11)+1`); when the end index precedes the start index, `n1vr<1` and the end point is written outside `xlin1/ylin1` (`xlin1(-4)` for gnuA7/A8; under flang it hit the risers surface: 78.88 m² instead of 0.045). See [Inverted point indices](#inverted-point-indices-008).      | invalid endpoint write skipped; `vredis` remains unresolved | none (verified on the 8 designs)                                                                                                          |
| [009](009-corda-index-0-read.patch)   | `if(i.ge.2.and.corda(i-1,1)...)` l.26200                                                                                                                                                                                  | Fortran `.and.` does not guarantee short-circuit evaluation, so `i=1` reads `corda(0,1)`.                                                                                                                                                                                                                                                               | `corda(max(i-1,1),1)`; same result                          | none                                                                                                                                      |

## Numeral placement convention

[005](005-romanoparc-arc-tie.patch) makes the placement of the Roman numeral labels independent of rounding.
It is a placement convention to discuss with Pere: no convention can reproduce
the official binary, whose choice at a boundary is rounding noise.

`romanoparc` constructs a circular arc with 20 equal angular steps. The original
selection (l.36413-36440) sums rounded chord lengths, then compares the partial
sum with `total * fraction` (`xlen2.le.xlen1*xlenco`). With the default
fraction 0.2, the boundary falls exactly on a point: traced on the official
toolchain, the official source picks `kini=2` in 10 calls and `kini=3` in 20
for gnuC-27 (13 and 32 for gnu-test-3.19), i.e. the label moves by one
segment (about 2.1 cm) from rib to rib. Below a fraction of 0.05, `kini` is
never assigned.

The patch selects directly from section 20's type8 arc fraction:

```fortran
       xlenco=max(0.0d0,min(1.0d0,xlenco))
       kini=max(0,min(18,int(20.0d0*xlenco)-1))
       kfin=kini+2
```

At a boundary `m/20`, the later point pair is selected (points 3 and 5 at
20%), as the `.le.` of the original intends; `int(20.0d0*xlenco)` is exact
for every `m/20`. Between boundaries, the pair is the original one. Endpoints
are clamped to valid pairs (0,2) and (18,20). Only the x/y coordinates of the
Roman numeral points (`mcircles`) change (gnuC-27, gnuC2-27, gnu-test-3.19 in
`oracle/patch-effects.tsv`).

## Fortran standard

| #                                    | Site                      | Bug                                                                                                                                                                                          | Patch              | Effect |
| ------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| [002](002-jconi-jconf-integer.patch) | `jconi(6),jconf(6)` l.463 | Declared `real*8` but used as array subscripts (l.20297-21048); they only receive integer values (`jconi(klz)=j+1`). A REAL subscript is not standard Fortran; flang rejects it (32 errors). | declared `integer` | none   |

## flang/WASM portability

Needed by this project's WASM build only; nothing to change upstream.

| #                                       | Reason                                                                                                                                                                                                                                     | Effect |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| [003](003-common-block-data.patch)      | On wasm, flang emits uninitialized named COMMON blocks with "common" linkage, which wasm-ld cannot resolve (`undefined symbol: markstypes_`). A `BLOCK DATA` at the end of the file defines them, initialized to 0 like the native `.bss`. | none   |
| [006](006-lep-out-integer-format.patch) | In list-directed output (`write(23,*)`), gfortran writes an integer on 12 characters and flang on the minimal width. Explicit `(1X,A,I12)` format = gfortran bytes (`Ribs number`, `Cells number`, l.24629).                               | none   |
| [010](010-scad-integer-format.patch)    | Same as 006 for the `// Cell i Line k from n` comments of `../stl/lep-3d-surfaces.scad` (l.27231, 27326, 27424): `(1X,A,I12,1X,A,I12,1X,A,I12)`, the gfortran bytes including its blank after each integer.                                | none   |

Also outside the patches (build and wrapper):

- flang compiles with `-fno-automatic` (`scripts/build-flang-wasm.sh`).
  gfortran makes local arrays larger than 64 KB static, so they keep their
  value between calls, and the code relies on it (`vredis` reads `xlin2(1)`
  left by the previous call when `n1vr<1`, see 008). flang put them on the
  stack: stale or garbage values (NaN in `leparagliding.dxf`, "Method does not
  converge" for gnuC-27/gnuA7). `-fno-automatic` makes every subprogram local
  static. gfortran keeps its default flags: its output equals the official
  binary's.
- The flang runtime wraps list-directed records at 80 columns, gfortran does
  not. The engine wrapper sets `FORT_FMT_RECL=100000`
  (`packages/engine/src/run.ts`).
- The program creates `../stl` and `../xflr5` with `call system('mkdir ...')`.
  Emscripten's `system()` does nothing: the glue is built for browsers only,
  and Node runs that same glue (`scripts/build-flang-wasm.sh`). The wrapper
  creates the directories in the virtual file system.

## Upstream issues not fixed by the patches

### `jirr(i-1)` on the right side

The left-side reformatting (l.7229, l.8595) loops on `do i=1,nribss` and works
on rib `i-1`, hence `j=jirl(i-1)-1`. The right side (l.7312, l.8694) loops on
`do i=0,nribss` and works on rib `i`, but keeps `j=jirr(i-1)-1` (l.7334) and
`j=jirr(i-1)+1` (l.8720): most likely a copy of the left side, for `jirr(i)`.
No visible effect, since the point copied there (layers 32 and 35 of `u/v`) is
scratch, but with 004d `j=-1` still writes `u(0,-1,32)`, outside the bounds
though inside the array `u`.

### Inverted point indices (008)

008 only removes the memory corruption. With `n1vr<1`, `vredis` still runs and
builds the polyline from `xlin2` left by the previous call: the drawing of
that strap/VHR is meaningless. The observed end index precedes the start
index on gnuA7 and A8. The intended geometric treatment, and whether the input
or the engine causes this case, need confirmation from the author.

### Stale group in section 9 of `lep-out.txt`

l.25381: `ng=rib(i,169)` is computed before `do i=1,nribss` and not inside
it, so every rib of the "9. 3D-SHAPING DETAILS" report uses the group of the
`i` left over by an earlier loop.

### `jconf(0)`

l.20367 (right) and l.20983 (left): `do j=jconf(klz-1)+1,120` under
`if (klz.eq.int(rib(i+1,15)))`, reached with `klz=1` when `rib(i+1,15)=1`,
reads `jconf(0)`. None of the 8 designs reaches it.

### `arc3parc`

Uses variables that are never assigned (`xlen`, `len1`, `len2`), but it is
never called.

## Build

The single source of truth is the official zip
`fortran/engine/original/leparagliding3.29.f.zip`, unmodified (sha256 checked).
`scripts/make-patched.sh` extracts `leparagliding.f` from it and derives
`build/fortran/leparagliding.f` (CRLF -> LF, then the patches, in order; not
versioned). That file is compiled by flang for WASM. The native oracle instead
uses `scripts/extract-engine.sh` and `scripts/native-engine.ts` to compile an
unpatched copy in `build/native-engine/` with the toolchain pinned in
`oracle/toolchain.json`. To change the WASM source, edit or add a patch, never
the generated file. The patches apply to the LF source and in order (004 has
context from 002): they do not apply as-is to the official CRLF file.

Each patch adds a `PATCH lepara-web NNN` comment to the source.

## Method

- Out-of-bounds accesses: AddressSanitizer (`-fsanitize=address
-fsanitize-recover=address`, `ASAN_OPTIONS=halt_on_error=0`) for accesses
  leaving an array, and a gdb watchpoint on `hcpp`. `-fcheck=bounds` is not
  usable: it stops at the first overflow inside an array (see below), and
  there are many. Since 007-009, ASan reports nothing on the 8 designs.
- Numerical divergences: native/WASM traces compared (temporary debug
  `write`s) down to the first discrete decision that diverges.
- An overflow **inside** a single array (e.g. `skinnew(i+1,0,k)` landing on
  `skinnew(i,101,k)`) is not fixed: column-major order is the same for every
  compiler, so the result is deterministic.

## Known residual risks

- Other numeric list-directed writes (two to `lep-out.txt` near the 006
  site): their spacing may differ between gfortran and flang (cosmetic). Not
  exercised by the 8 designs; handle them like 006/010 if a design shows it.
- libm: glibc (native) and emscripten's libm (WASM) differ by 1 ulp on a few %
  of `sin`/`cos`/`tan`/`atan`/`atan2`/`asin`/`acos`/`pow` results. Outputs are
  printed with 3-4 decimals, which absorbs it on the 8 designs except Swoop
  (a zero printed `-0.000`, pinned in `oracle/wasm-known-diffs.tsv`). A
  design whose result sits on a threshold (`if (scontrol.ge.s)`) could
  diverge further: it would show as a new, unaccepted difference.
- Other rounding-sensitive decisions are only detected if a design exercises
  them. 005 stabilizes only Roman numeral point-pair selection. Every design
  added to the oracle is a new test: run it under ASan too.
- Scalars that a subprogram reads before assigning them: gfortran leaves them
  on the stack (value of whatever ran before), flang `-fno-automatic` makes
  them static (value of the previous call, or 0). Identical on the 8 designs.
