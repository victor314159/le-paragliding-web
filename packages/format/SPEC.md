# LEparagliding 3.29 input format

How the engine (the patched 3.29 source, `build/fortran/leparagliding.f`,
section 4 "DATA READING") reads its input files, record by record. The
reader of this package (`src/read-design.ts`, `src/airfoil.ts`) follows it
statement by statement.

## Reading rules

Each line is a record; a CR before the LF belongs to the end of the record. Each READ statement starts on a new record and, once
its list is complete, drops the rest of its last record: comments may follow
the values. The source has no `implicit none`: undeclared variables starting
with `i` to `n` are `integer`, but every real of the input is declared
`real*8`.

- **skip**: `read (22,*)` with an empty list skips one record, whatever it
  holds.
- **List-directed values** are separated by blanks (spaces, tabs, CR), a
  comma or a slash, with optional blanks around them. A list may continue on
  the next records; blank records are skipped while looking for values.
  `n*v` repeats a value, `,,` and `n*` are null values (the variable keeps its
  value: an error here, see below), `/` ends the statement. A repeat count
  is 1 to 200000000: gfortran refuses larger ones, flang aborts on some.
- **integer**: `[+-]digits`. `1.` or `1e0` in an integer is an error of the
  engine ("Bad integer").
- **real**: `[+-]` digits with an optional point, then an optional exponent
  `e`/`d`/`q` with an optional sign, or a sign alone: `1`, `1.`, `.5`,
  `1d0`, `1q0`, `1.5D+2`, `1.0+2`. gfortran also reads `Inf` and `NaN`;
  they are refused here. A `;` stops both engines.
- **char\*n**: a word ending at a blank, comma or slash, or a constant between
  `'` or `"` (doubled to include one, may span records). The engine keeps the
  leftmost n bytes; trailing blanks do not count.
- **label**: a word read into `gname` (`char*50`) and never used. The model
  does not keep labels; writers write standard ones.
- **'(A)' + backspace**: the engine reads a table's first row as a string,
  counts its words (the list-directed values of the line, repeats included,
  null values excluded, values blank in their first 100 bytes excluded: only
  spaces are blank, not a no-break space) and goes back. The count selects
  the layout.
- **backspace**: some rows are read twice. Both readings must give the same
  values, which holds when each row is on its own line.

Diagnostics instead of guesses: an unknown mode, a negative count, a null
value or a slash without a previous value, a re-read giving another value,
or the end of the file inside a section stop the reading. A null value keeps
the value the engine already has: labels (`gname`) and unused counters, a
rib number read in an earlier section, the first reading of a re-read
record, the defaults set before sections 37 (`nsegments = 12`…) and 39.

These rules were checked against both builds of the engine (flang for the
web, gfortran natively) on the forms the tests use, not proven in general.

Lengths are in cm at wing scale 1 unless noted; the engine multiplies them by
`xwf`. `nribss = int(ncells/2.) + 1` is the number of ribs of the half wing.

## leparagliding.txt

Notation: one item per record; `n ×` repeats records; `[if …]` conditions.

### 1. Geometry (`geometry`)

| Records  | Fields                                                                                                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9 skip   |                                                                                                                                                                                                                                                          |
| 1        | `bname` char\*50                                                                                                                                                                                                                                         |
| skip, 1  | `wname` char\*50                                                                                                                                                                                                                                         |
| skip, 1  | `xkf` real: drawing scale                                                                                                                                                                                                                                |
| skip, 1  | `xwf` real: wing scale                                                                                                                                                                                                                                   |
| skip, 1  | `ncells` int                                                                                                                                                                                                                                             |
| skip, 1  | `nribst` int                                                                                                                                                                                                                                             |
| skip, 1  | `alpham` real (deg), `kbbb` int: washin mode 0, 1 or 2. With 2, the record is read again as `alpham kbbb alphac`                                                                                                                                         |
| skip, 1  | `atp` char\*2 (ds, ss, pc, sk), `kaaa` int                                                                                                                                                                                                               |
| 2 skip   |                                                                                                                                                                                                                                                          |
| '(A)'    | words of the first rib row: 11 (since 3.16) or 9                                                                                                                                                                                                         |
| nribss × | `rib(i,1)` number, `rib(i,2)` x, `rib(i,3)` y LE, `rib(i,4)` y TE, `rib(i,6)` xp, `rib(i,7)` z, `rib(i,9)` beta (deg), `rib(i,10)` RP (%), `rib(i,51)` washin (deg) [11 columns: `rib(i,250)` z rotation (deg), `rib(i,251)` its position (%)], all real |

The chord `rib(i,5)` = y TE − y LE divides several computations: it must be
positive.

### 2. Airfoils (`airfoils`)

4 skip, then nribss × `rib(i,1)` real, `nomair(i)` char\*50 (file name: its
last three characters, `txt` or `dat`, select the format), `rib(i,11)`
intake start (%), `rib(i,12)` intake end (%), `rib(i,14)` open 1 / closed 0,
`rib(i,50)` displacement, `rib(i,55)`, `rib(i,56)`: reals.

### 3. Anchor points (`anchors`)

4 skip, then nribss × `rib(i,1)`, `rib(i,15)` number of anchors,
`rib(i,16..21)` positions of A to F (% of chord): reals.

The engine finds each anchor on the intrados (from point `np(i,2)`) at its
position. Not found, it stays at (0, 0), the leading edge: right for 0 %,
which the examples use at the tip. It computes the 3D points of anchors 1 to
`rib(i,15)` only, and of F separately.

### 4. Holes (`holes`)

3 skip; `ndis` int; ndis × (`nrib1` int; `nrib2` int; `nhols` int; nhols ×
`hol(ir,l,9)` type, `hol(ir,l,2..8)`: reals). At most 200 holes (`hol(0:100,200,20)`).

### 5. Skin tension (`skinTension`)

4 skip; 6 × `skin(k,1..4)` reals; `htens` real; `ndif` int, `xndif` real.

`ndif` = 1000 turns the panel correction off. Otherwise the engine reads the
extrados points `np(i,2)-ndif-1` to `np(i,2)` and divides by the length of
the last ndif points: 1 ≤ ndif ≤ extrados points − 2.

### 6. Sewing allowances (`sewingAllowances`), mm

3 skip; `xupp xupple xuppte`; `xlow xlowle xlowte`; `xrib`; `xvrib`: reals.

### 7. Marks (`marks`)

3 skip; `xmark xcir xdes` reals.

### 8. Angle of attack estimation (`angleOfAttack`)

4 skip; `finesse`; skip; `cpress` (%); skip; `calage` (%); skip; `clengr`;
skip; `clengl`; skip; `clengk`: reals.

### 9. Suspension lines (`lines`)

3 skip; `zcontrol` real; `slp` int (1 to 9 plans). Then the engine reads the
next record (`cam(1)`) as `i`, the first path as '(A)', and backs up two
records: 11 words means rows without line types, more than 11 with them.

slp × (`cam(ii)` int, at most 100; cam(ii) × path). A path is read once for
its first value `mc(ii,i,1)` (levels), then again whole, all int. Pair k is
(k, order); the engine counts a line where a pair changes between
consecutive paths (at most 500 lines with the brakes, `corda(500,50)`, and
at most 499 without them: the engine uses line `cordam+1`, the main brake,
even when the brakes make none), so the paths through a line follow each
other:

| Layout  | Levels  | Values                                                                       |
| ------- | ------- | ---------------------------------------------------------------------------- |
| untyped | ≤ 4     | levels, 4 pairs (level, order) `mc(2..9)`, anchor row `mc(14)`, rib `mc(15)` |
| untyped | 5       | levels, 5 pairs `mc(2..11)`, `mc(14)`, `mc(15)`                              |
| typed   | 2, 3, 4 | the 11 values, a label, then one line type per level `mc(31..34)`            |

Other levels: the engine reads nothing and loses its place (an error here).

### 10. Brakes (`brakes`)

3 skip; `clengb` real; `cam(slp+1)` int; '(A)' of the first path (11 words:
untyped, more: typed; ignored without paths); paths:

- untyped: `mc(1..9)` int, `mc(14)` int, `brake(i,3)` real (rib, its
  fraction places the anchor between ribs);
- typed: levels read first (2 to 4), then the same 11 values, a label and the
  line types.

skip; `bd(1..5,1)` reals; `bd(1..5,2)` reals.

### 11. Ramification lengths (`ramifications`)

3 skip; `raml(3,1) raml(3,3)`; `raml(4,1) raml(4,3) raml(4,4)`;
`raml(5,1) raml(5,3)`; `raml(6,1) raml(6,3) raml(6,4)`: reals.

### 12. H, V and VH ribs (`hvRibs`)

3 skip; `nhvr` int (at most 200); `xrsep yrsep` reals; nhvr × `hvr(i,1..10)`
reals. Then nhvr backspaces and a second pass: types (`hvr(i,2)`) 6 and 16
read `hvr(i,1..12)`, the others `hvr(i,1..10)` again. Types: 1 to 6, 11 to 16
(the same in % of chord).

Types 1 to 5 place themselves on anchors `u(i,ii,6)` (`ii` = column 4, 1 to
6), computed on ribs 0 to nribss only (rib 0 is rib 1; the virtual rib
nribss+1 has none). Type 1 uses its rib (column 3) and a second one (column
5, row in column 6); types 2, 3 and 5 the ribs i−1, i and i+1; type 4 the
ribs i−1 to i+2. Each must be a rib 0 to nribss with that anchor (F, row 6,
uses its own position). Types 6 and 16 use their ribs of columns 3 and 8.

### 15, 16. Extrados and intrados colors (`extradosColors`, `intradosColors`)

3 skip; `npce` int:

- ≥ 0: npce × (`npc1e(k) npc2e(k)` int; npc2e(k) × `npc3e(k,l)` int,
  `xpc1e xpc2e` reals);
- -2: `npace` int; npace × (`npac1e npac2e` int; npac2e × `npac3e` int,
  `xpac1e..xpac4e` reals);
- other values: nothing read (an error here).

Section 16 is the same with `i` names.

### 17. Additional rib points (`ribPoints`)

3 skip; `narp` int (at most 10); narp × `xarp yarp` reals.

### 18. Elastic lines corrections (`elasticLines`)

3 skip; `csusl`; `cdis(2,1..2)`; `cdis(3,1..3)`; `cdis(4,1..4)`;
`cdis(5,1..5)`; 5 × `csus(i,1..4)`: reals.

### 19. DXF layer names (`dxfLayers`)

3 skip; `k19d` int (at most 50); k19d × label, `lyname(i)` char\*50. 3.29
does not use `lyname`.

### 20. Marks types (`markTypes`)

3 skip; `k20d` int (at most 50); k20d × label, `typm1` int, `typm2 typm3`
reals, `typm4` int, `typm5 typm6` reals. The engine uses the types 1 to 10,
read or not.

### 21. Joncs (`joncs`)

3 skip; `k21d` int:

- 0: nothing.
- 1: `ng21` int; ng21 × group.
- 2: `k21blocs` int (at most 20); per bloc `k21blocf(m,1)` number,
  `k21blocf(m,2)` type (int), `k21blocf(m,3)` groups (int), then the groups.

A group starts with `ngoo(m,ng,1..3)` int (group, first rib, last rib):

| Bloc type            | Then (reals, 4 per record unless noted)                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| 1, 4, 5 (and k21d=1) | `xextraa(1..4)`, `xintraa(1..4)`, `sjoo(1..4)`                                   |
| 2 (arc joncs)        | `x21(1..5)` (5 values), `sjoo(1..4)`                                             |
| 3 (shark nose)       | `xextraa(1..4)`, `xextraa(5..8)`, `xintraa(5..8)`, `xintraa(1..4)`, `sjoo(1..4)` |

### 22. Nose mylars (`noseMylars`)

3 skip; `k22d` int; 1: `ng22` int; ng22 × (`ngo(ng,1..3)` int;
`xmy(ng,1..6)` reals).

### 23. Tab reinforcements (`tabReinforcements`)

3 skip; `k23d` int. Nothing else is read.

### 24, 25. 2D and 3D DXF options (`dxf2d`, `dxf3d`)

3 skip; `k24d` int; nonzero: 6 × label, `iccolor(1..6)` int.

3 skip; `k25d` int; nonzero: 6 × label, `iccolor(11..16)` int; 3 × label,
`ele3d(k)` int, `ele3dc(k)` int (extrados, vents, intrados).

Only 0 and 1 are accepted here.

### 26. Glue vents (`glueVents`)

3 skip; `k26d` int; 1: nribss × `j` int (row number, unused), `rib(i,165)`
real. Types ±4 and ±6 are read again with `csi(i,19) csi(i,20)`, types ±5
with `csi(i,19) csi(i,20) csi(i,18)`.

### 27. Special wing tip (`wingTip`)

3 skip; `k27d` int: 1: label `alc1`; label `alc2` (deg). 2: label
`sectx(27,3)`; label `sectx(27,4)` (deg). 4: label `sectx(27,10)
sectx(27,11)`. Other values than 0, 1, 2, 4 read nothing (an error here).

### 28. Calage variation (`calageVariation`)

3 skip; `k28d` int; 1: `nriser28` int; `p28(1..6)` reals; `a128` real,
`n128` int, `a228` real, `n228` int.

### 29. 3D shaping (`shaping`)

3 skip; `k29d` int; 1 or 2: `k29dd` int; label `ng29` int (at most 200);
ng29 × group:

- label, `k` group, `ini29(ng)`, `fin29(ng)`: int;
- label, `uppcuts(ng)` (0 to 2), `upptype(ng)`: int; uppcuts × `iupp(c,1)`,
  `iupp(c,2..3)` (k29d=1) or `xiupp(c,2..3)` (k29d=2), all int, `kiupp(c)` real;
- label, `lowcuts(ng)` (0 or 1), `lowtype(ng)`: int; lowcuts × the same with
  `ilow`, `xilow`, `kilow`.

Then skip; 5 × label, `pp29(k,1..4)` int.

The STL export (`pp29(5,…)`) writes panels first to last, but the
tessellation covers panels 1 to nribss: the others have all their vertices
at 0. The official examples A8 and gnuA7-26 export panel nribss+1 (a
warning here).

Type 2 reads its cut points into `xiupp`/`xilow`, never used, then works as
type 1: `iupp(c,2..3)` and `ilow(c,2..3)` stay unset (0) and index the
airfoil points out of range (the native build crashes). `validate` rejects
type 2 with cuts.

### 30. Airfoil thickness (`thickness`)

3 skip; `k30d` int; 1: nribss × `i9` int (unused), `rib(i,160)` real.

### 31. New skin tension (`skinTensionGroups`)

3 skip; `k31d` int; 1: `ngskt` int; ngskt × (skip; `ngi nribini nribfin
npoints ntype31` int; npoints × `ksk` int (unused), `skinew(k,1..4)` reals).
The engine interpolates between points k and k+1 of a rib and, for the
right side of the panel after rib i, uses the points of rib i+1 counted with
those of rib i: 2 to 100 points per group, every rib 1 to nribss in a group,
no rib with fewer points than the rib before it, and the last group with at
least the points of rib 1 (rib 0 copies rib 1's count but the last group's
points). Rib nribss+1 may be left out, as in the official examples: the
engine reads it out of its arrays without using the result.

### 32. Parts separation (`partsSeparation`)

3 skip; `k32d` int; 1: 10 × label, real (`panel_x_coe`, `panel_x_min`,
`panel_y_coe`, `rib_x_coe`, `rib_y_coe`, `rib_1_coe`, `jonc_x_coe`,
`jonc_y_coe`, `jonc_i_coe`, `xgname`).

### 33. Detailed risers (`risers`)

3 skip; `k33d` int; nonzero: `k33t` int; 1: slp × label, `x33(i)` real (one
riser per line plan of section 9). 2 to 4 read nothing more and leave every
riser length at 0. At 0, only risers 1 to 5 get the length of section 8:
6 to 9 line plans need k33d = 1.

### 34. Lines characteristics (`lineTypes`)

3 skip; `k34d` int; 0: the engine's 6 default types. 1: `k34n` int (at most
50); per type `jltype(i)` int, `tylinea(i,1)` char\*30 (kind), backspace,
then the whole record:

- `r` (riser): `j` int, kind, `tyline(i,2)` width, `tyline(i,3)` thickness;
- `c` (line): `j` int, kind, `tyline(i,2)` diameter;

then `tylinea(i,4)` name, `tyline(i,5)` strength (daN), label,
`tylinea(i,6)` material, `tyline(i,7)` weight (g), label, `tylinea(i,8)`,
`tyline(i,9)` (cm), label, `tyline(i,10)` color. Other kinds read nothing
(an error here).

### 35. Equilibrium equations (`equilibrium`)

3 skip; `k35d` int; 1: 18 × label, real: `x35grav`, `x35ro`, `x35mu`,
`x35v`, `x35alpha` (deg), `x35cl`, `x35cle`, `x35cd`, `x35cde`, `x35cm`,
`x35spilot`, `x35dpcoef`, `x35wingmass`, `x35pilotmass`, `x35pmc`,
`x35qlmass`, `x35ycp`, `x35zcp`. The engine divides by the gravity, the
density, the viscosity, the speed (Reynolds numbers), `x35cd` and `x35cde`.

### 36. XFLR5 files (`xflr5`)

3 skip; `k36d` int; 1: label; `k36_a`; `k36_b`; `k36_c`; `k36_d`; label;
`k36_e`: int. The engine then reads every airfoil as `.txt`: `.dat`
airfoils fail.

### 37. Special parameters (`specialParameters`)

3 skip; `k37d` int; 1: `k37n` int (at most 250); per entry `icode` int,
backspace, then by code `icode37(i)` int and:

| Code                                           | Value                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1291, 1341, 1351, 1352, 1353, 3002, 2005, 2006 | int (`nsegments`, `i37c`, `i37solve`, `i37fparea`, `i37output`, `nelliref`, `i37_2005`, `i37_2006`) |
| 1146, 2003                                     | real (`chord_pcdg`, `assiette2003`)                                                                 |
| 2000                                           | char\*30 (`a37date`)                                                                                |
| 3001                                           | `i3001(1..2)` int, backspace; transitions 1 to 3: `i3001(1..2)` int, `c3001(3..4)` reals            |

Unknown codes, and 3001 with another transition, leave the record unread
(an error here). 1341 (0, 1), 1351 (solvers 1 to 6) and 1353 (0 to 2) have no
branch for other values: no line drawn, no equilibrium solved (infinite
speeds), no summary written (errors here). 1352, 2005 and 2006 work as one
of their documented values (warnings).

### 38. HVR holes (`hvrHoles`)

3 skip; `k38d` int; > 0: `k38lines` int (at most 100); k38lines ×
`x38data(k,1..9)` reals.

### 39. HVR position parameters (`hvrPositions`)

3 skip; `k39d` int (0 sets the coefficients to 1). Whatever k39d, only if
`k38d` > 0: `i` int (unused); 6 × label, `vrib_n_coe1 vrib_n_coe2` reals.
With k38d = 0 and k39d = 1, the coefficients are neither read nor set.

Nothing after section 39 is read.

## Airfoils

The engine opens the airfoils that section 2 names, by exact name, and no
other file. The first record is skipped in both formats.

- **`.txt`**: `np(i,1)` total, `np(i,2)` extrados, `np(i,3)` intake,
  `np(i,4)` intrados: one int per record; then np(i,1) × `u v` reals. The
  three parts share their end points (extrados + intake + intrados =
  total + 2) and the engine looks for a nose point at (0, 0), within 0.0001.
  Without one, it uses point 0, out of its arrays: a warning here, since the
  official example swoop has none (`gnuReflex.txt`). Nothing after the
  points is read.
- **`.dat`**: `u v` reals until the end of the file (subroutine `datair`).
  The engine places the air intake from section 2 and may add two points.

Arrays: 500 points per airfoil (`u(0:100,500,99)`), and loops over the points
read the one after the last (9.2 of the program, the air inlet): at most 499
points for `.txt` and 497 for `.dat`.
