# Geometry preprocessor 1.6 patches

Patches to Pere Casellas' geometry preprocessor 1.6 "Canigo" (2021-01-17).
The official source is kept unmodified in `fortran/preprocessor/original/`
(SHA-256 checked before each native comparison).
`scripts/check-preprocessor-native.ts` normalizes CRLF, applies these patches
to `build/preprocessor-native/pre-processor.f` and compiles it. Never edit that
generated file.

- `001-deterministic-geometry.patch` corrects the geometry. Its items are
  listed below.
- `002-oracle-output.patch` only adds a full-precision output file for
  testing. It changes no computation.

Line numbers refer to the official `pre-processor.f`. Unless stated
otherwise, each problem was reproduced with the unmodified source compiled as
is (`gfortran -std=legacy pre-processor.f`, default single-precision REAL),
on the official `pre-data.txt`, and again in double precision.

## 001 — geometry corrections

### Vault type 2: one arc can lose its last segment

Each arc is meant to have 99 segments (lines 650–713):

```fortran
do angle=0.,alp1-(alp1/99.),alp1/99.
```

A REAL DO loop runs `INT((end-start+step)/step)` times. That count is 99
mathematically, but rounding can make it 98. In the official example, the
third arc (18.62°) has 98 segments, in single and in double precision. The
vault has 396 points instead of 4 × 99 + 1 = 397, and the missing segment
changes the length scaling of the whole vault. On the official example, the
patch changes:

- the vault points: 396 → 397;
- the projected span: 9.47 m → 9.45 m;
- the ribs, by up to 1.01 cm in `xp` (rib 26), 0.66 cm in `z` (rib 25) and
  0.72° in `beta` (rib 23).

The patch counts segments with an integer, `do j=0,98`, and computes
`angle = start + j*step` instead of accumulating it.

### Tip rib with a zero chord

Section 5 (lines 1192–1195) places the ribs by summing the cell widths. The
last rib should land exactly on the half span `xm`, which is also the end of
the last edge segment (`xp1(kmax1) = xm`). Rounding can put it slightly past
`xm`. Then the test `xp1(k).ge.rib(i,2)` (lines 1204 and 1219) fails for
every segment, and y-LE and y-TE stay 0: the tip rib has no chord.

This is frequent. On the official example, for every cell count from 2 to
200 in single precision:

- uniform distribution (mode 1): 80 of 199 counts, including 27, 29, 36,
  38, 41, 43, 44, 45 and 49;
- linear distribution (mode 2, coefficient 0.7): 70 of 199 counts,
  including 6, 14, 23, 25, 27, 29 and 30.

In double precision the counts differ but are as frequent (77 and 68).
Distribution 3 avoids it on the official example, because the tip keeps the
chord from its last width iteration.

To reproduce, replace section 4 of the official `pre-data.txt` with mode `1`
and `36` cells. Rib 19 (x = 575.50) then has y-LE = 0.00 and y-TE = 0.00
instead of 148.95 and 212.80.

The patch:

- sets `rib(nribss,2)=xm` after each summation: in section 5, and in each
  iteration of distribution 3 (lines 993–996 and 1080–1083), where the same
  miss would feed a stale or zero tip chord into the width correction;
- clamps every rib to `xm`. When the last cell has zero width (linear
  distribution with coefficient 0), the last two ribs share x = `xm`, and
  rounding can put the second-to-last one past it.

### Leading and trailing edges: stop exactly at the half span

The edges are sampled every 0.01 rad (lines 221 and 358):

```fortran
do tetha=0,pi/2-0.01,0.01
```

The contour stops at `xm` only when a segment that starts after the
correction point `x1` crosses `xm` (`jcontrol=2`). Two inputs escape this
test:

- **An ellipse ending at its apex (`a1 = xm`).** The last sample is 1.56,
  and its segment ends at a1·sin(1.57), just short of `xm`. The tip rib
  finds no segment and gets y-LE = 0.
- **A correction starting less than one step before `xm`, or after it.**
  The segment that crosses `xm` starts before `x1`, so it is not clipped.
  The contour then continues along the ellipse to x = `a1`. With the official
  example and `x1 = x2 = 575.49` on both edges, the leading edge has 158
  points and ends at x = 710.21, past the half span (575.5). Patched, it has
  96 points and ends at 575.50.

The patch:

- uses an integer counter `itheta=0..157` (`tetha = 0.01*itheta`), with
  the end of each segment capped at π/2;
- clips every segment at `xm` and stops at the first sample past it.

On ordinary inputs the only change is the end of accumulated rounding in
`tetha`: on the official example, edge coordinates move by at most 3e-4 cm
in single precision, and the rib matrix is unchanged.

### Vault type 1: a correction starting in the last sample is ignored

The vault ellipse is sampled at `i=0..299` (line 495). The modification
zone starts at the first sample with `xq ≥ x1`. If `x1 > a1·sin(299π/600)`
(about 0.999986·`a1`), no sample reaches it. The modification zone is then
silently skipped, and the vault ends at (`x1`, y1) with y1 > 0.

The patch adds sample `i=300` (θ = π/2), so the zone always runs when
`x1 < a1`. With `x1 = a1`, y1 = 0 and the zone would divide 0 by 0. The patch
skips it there (`x1.lt.a1`), so that input still gives the original vault.

This one is a choice for an extreme input rather than a clear bug fix. The
tip ribs change completely. Example: the official example with a type 1 vault
(`a1=414.2901`, `b1=237.43`, `x1=414.286`, `c1=28.22`). Rib 25 goes from
`beta` 82.44° to 1.42°.

### Explicit zeros in the rib matrix

The vault interpolation (lines 1251–1294) assigns a rib to segment k+1 when
its x lies between the vault lengths after k and k+1 segments. The first
vault segment is therefore never used. A rib within it keeps `xp`, `z` and
`beta` from storage, which is 0 when the compiler zero-initializes static
storage. That 0 is exact for the centre rib of an even wing (x = 0).
`rib=0.` at the start makes this explicit, without changing results.

### No effect on results

- Line 952 (distribution 2, even cells) multiplies by `coeffg`, a typo for
  `coefg`. `coeffg` is an implicit, uninitialized variable. The positions it
  produces are recomputed in section 5, so only uninitialized-variable
  checks notice it.
- Lines 1001 and 1088 (distribution 3) loop to `kmax1+1`. The arrays
  `xq1`/`xp1` are never written at that index. The patch stops at `kmax1`.

## 002 — oracle output only

Adds `oracle.txt` with the counts, the nine-column rib matrix, the sampled
contours, the vault and ten geometric metrics in `ES24.16E3` (all
double-precision digits). Vault coordinates omit CAD offsets and start at
the top of the wing. The official geometry matrix prints only two decimals,
too few for a comparison.

The repository's oracle compiles with double-precision default REAL
(matching JavaScript numbers), bounds checking, signaling-NaN initialization
of local REAL variables, and traps for invalid operations, division by zero
and overflow. It runs each case in its own directory with a timeout. The
TypeScript port in `packages/preprocessor/` reproduces this patched program.
The main LEparagliding engine and its committed references are unaffected.
