# Geometry preprocessor 1.6 patches

Separate from the main engine's patches. The original source is kept intact
in `fortran/preprocessor/original/`; its hash is checked before each native
comparison. `scripts/check-preprocessor-native.ts` normalizes CRLF and applies
these patches to `build/preprocessor-native/pre-processor.f` before compiling.
Never edit that generated file.

## 001 — deterministic geometry

Each item was checked by removing it and comparing with the TypeScript port
on the oracle cases.

- Integer counters for the circular arcs (99 segments each). The REAL DO
  count `int((alp-alp/99+alp/99)/(alp/99))` rounds to 98 for some angles:
  that arc lost its last segment. On the official example and 36 other
  cases, the original vault is one point short; ribs move by up to 3 cm
  (`xp`) and 1.4° (`beta`). This is the largest difference with the official
  program.
- Fix the final X to the half span before final interpolation, and clamp the
  shared tip positions of a zero final width. Accumulation could move X just
  past the contour: no segment matched, and the tip chord stayed 0 (197 and
  199 cells).
- Same pin during each chord-distribution iteration: a stale chord changed
  the widths by up to 2.7e-3 cm.
- Integer counters for the 0.01-radian edge sampling, up to π/2. The count
  was already fixed, but its last sample (1.56) stopped short of an ellipse
  ending at its apex (`a1 = xm`): the tip rib had no chord. Clip contours at
  the half span even when the last segment starts before the correction:
  those inputs continued past the wingtip.
- Reach π/2 in the ellipse vault (`i=0..300`): a correction starting after
  sample 299 was silently skipped (`beta` 82° instead of 1.4°).
- Initialize the rib matrix. The original never interpolates the first vault
  segment: ribs there keep zeros from static storage, which is exact at the
  centre of an even wing. The patch makes those zeros explicit.
- No effect on outputs, needed by the strict oracle (signaling NaN): correct
  `coeffg` to `coefg` in the even linear distribution (an uninitialized
  scalar; X is recomputed later), and stop chord interpolation at `kmax1`
  instead of the uninitialized `kmax1+1`.

These fixes deliberately define behavior where upstream is unstable. They
can change output; the TypeScript port targets this documented reference.
The main LEparagliding engine and its committed references are unaffected.

## 002 — oracle output only

Add `oracle.txt` with counts, the nine-column rib matrix, sampled contours,
vault and ten geometric metrics, using `ES24.16E3` (all double-precision digits).
Vault coordinates omit CAD offsets and start at the top of the wing.
No computation is changed by this instrumentation. It avoids comparing only
the two decimals printed in the official geometry matrix.

The oracle compiles with double-precision default REAL values (matching
JavaScript), bounds checking, signaling-NaN initialization of
local REAL variables, and traps for invalid operations, division by zero and
overflow. It executes each case in its own directory with a timeout.
