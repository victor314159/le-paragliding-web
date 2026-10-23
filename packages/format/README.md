# @lepara/format

The input files of [LEparagliding](https://www.laboratoridenvol.com/leparagliding/leparagliding.en.html)
3.29 as typed objects: `leparagliding.txt` and its airfoils, read, validated
and written back.

It reads the files exactly as the engine does (the patched 3.29 Fortran
source, `build/fortran/leparagliding.f`): the same records, the same
list-directed rules, the same types. What the engine does not read is not in
the model, and what it cannot read consistently is a diagnostic, never a
guess. The engine gives byte-identical outputs on a file and on its
rewrite, built with flang (WASM, `tests/format/engine.spec.ts`) and with
gfortran (`scripts/check-format-native.ts`), on the 8 examples, a `.dat`
airfoil and 17 variants that reach the other branches of the reader and
edge list-directed forms.

Pure TypeScript with no runtime dependency: it runs in browsers, Workers and
Node. It does not read files: pass it their text.

## API

```ts
DESIGN_FILE: 'leparagliding.txt';
parseLep(text: string, options?: { file?: string }): Result<LepDesign>;
writeLep(design: LepDesign): Result<string>;

parseAirfoil(name: string, text: string): Result<LepAirfoil>; // .txt or .dat, from the name
writeAirfoil(airfoil: LepAirfoil, options?: { title?: string }): Result<string>;

readProject(files: ReadonlyMap<string, string>): ProjectReading; // texts by file name
validate(project: LepProject, options?: { reading?, design?: readonly Diagnostic[] }): readonly Diagnostic[];
validateDesign(design: LepDesign): Diagnostic[]; // without the airfoils
locateLep(text: string, options?: { file?: string }): Result<ReadonlyMap<string, FieldPosition>>;

SECTIONS: readonly { number, key: keyof LepDesign, title }[]; // the 37 sections, in file order
DXF2D_DEFAULTS, DXF3D_DEFAULTS; // sections 24 and 25 in mode 1, with the engine's mode 0 values
```

- `LepDesign` holds the sections of `leparagliding.txt` (1 to 12, then 15 to
  39), with named, readonly properties. Each one documents its meaning and
  unit (from the LEparagliding 3.29 manual), its Fortran variable, and its
  type when it is an integer. Values are as written in the file, before the
  engine scales or converts them. A few values the manual leaves undefined
  keep generic names (`noseMylars.groups[].values`, `hvRibs.ribs[].parameters`
  of types other than 6).
- `LepAirfoil` is `{ format: 'txt', extrados, inlet, intrados, points }` or
  `{ format: 'dat', points }`. The engine picks the format from the last
  three characters of the name.
- `LepProject` is `{ design, airfoils }`, the airfoils by exact file name. It
  may be incomplete: `validate` reports missing airfoils.
- `readProject` reads the files the engine reads: `leparagliding.txt` and the
  airfoils it names (the others are not read). `ProjectReading` is
  `{ project?, reading, diagnostics }`: the project, absent when
  `leparagliding.txt` is missing or unreadable; the diagnostics of reading
  the files; and those, then the diagnostics of `validate`. To validate a
  changed project (an editor), pass `reading` to `validate`: they come first,
  and an airfoil that could not be read is not reported missing too. Pass
  `design`, the diagnostics of `validateDesign`, if you already have them.
- `Result<T>` is `{ ok: true, value, warnings }` or `{ ok: false, errors }`.
  A `Diagnostic` has a `severity`, a `message` and, when they apply, the
  `file`, the `section`, the model `field` (`lines.plans[0].paths[3].anchorRib`),
  and the `line` and `column` (in characters) of a reading error.
- `locateLep` gives the line and column of each field of a text, to place the
  diagnostics of `validate` in it.
- `writeAirfoil` writes `title` on the first line, which the engine skips
  (other programs read the airfoil's name there).

Variants are explicit: disabled sections are `{ mode: 0 }`, a section at 0
uses the engine's defaults, and each mode has its own fields (`washin.mode`
0, 1 or 2, 9- or 11-column rib tables, typed or untyped line rows…).
[SPEC.md](SPEC.md) describes the format section by section.

### Validation

The types are the contract. `validate` checks what they cannot say:

- integer fields, strings (bytes, control characters, file names), modes;
- row counts: `int(cells/2)+1` ribs in sections 1, 2, 3, 26 and 30, a riser
  per line plan, at least the 10 mark types the engine uses…;
- references between sections: anchor ribs and rows (within the anchors of
  the rib), line types of section 34 (explicit or implied), section 39
  following section 38;
- the values the engine uses as array indices or loop bounds: the 500
  lines of `corda` (counted as the engine counts them), level and order
  numbers, the tree of the line paths, shaping groups, panels, H V ribs,
  their neighbouring ribs and anchors, the ribs and points of the skin
  tension groups, STL ranges, steps of section 28…;
- the values it divides by: chords, washin chords, lines length, brake
  spans, the panel correction points, section 35 coefficients and speed, x'
  of consecutive ribs for section 36…;
- modes the engine has no branch for: special parameters 1341, 1351
  (solver) and 1353, default risers for more than 5 line plans;
- with the airfoils of a project: missing ones, a format that does not
  match the name, too many points, anchors and 3D cuts on the airfoil,
  the panel correction points, the air inlet of a `.dat` airfoil, a `.dat`
  airfoil with section 36.

Errors are what makes the engine misread, index out of its arrays, divide
by zero or use unset values; warnings, values outside what the manual
documents.

`writeLep` and `writeAirfoil` refuse objects with errors (warnings pass) and
write canonical files: standard comments and labels, one row per line,
numbers as the shortest decimal that reads back to the same value. The
comments and layout of a parsed file are not kept.

## Example

```ts
import { parseLep, validate, writeLep, parseAirfoil } from '@lepara/format';

const parsed = parseLep(await (await fetch('leparagliding.txt')).text());
if (!parsed.ok)
  throw new Error(parsed.errors.map((e) => `${e.line}:${e.column} ${e.message}`).join('\n'));

// Change it: 2 degrees more washin, and a 3D DXF with default colors.
const design = {
  ...parsed.value,
  geometry: {
    ...parsed.value.geometry,
    washin: {
      ...parsed.value.geometry.washin,
      maxAngle: parsed.value.geometry.washin.maxAngle + 2,
    },
  },
  dxf3d: { mode: 0 },
} as const;

const airfoil = parseAirfoil('gnua.txt', await (await fetch('gnua.txt')).text());
if (airfoil.ok) {
  const problems = validate({ design, airfoils: new Map([['gnua.txt', airfoil.value]]) });
  console.log(problems.filter((d) => d.severity === 'error'));
}

const written = writeLep(design);
if (written.ok) console.log(written.value); // the new leparagliding.txt
```

## Limits

- Only complete files that 3.29 reads are accepted. Older formats (missing
  sections) are not adapted.
- Null values (`,,`, `n*`) and `/` are accepted only where the engine has a
  previous value: labels and unused counters, rib numbers read again,
  values read twice, the defaults of sections 37 and 39. Elsewhere they are
  errors.
- Infinities and NaN are refused (gfortran reads them, and computes with
  them). Unknown modes are refused, even those 3.29 silently treats as
  another (`k24d = 2`).
- 3D shaping of type 2 with cuts is refused: the engine ignores the cut
  points it reads (the native build crashes).
- Engine defects that official examples have are not errors: a `.txt`
  airfoil without a nose point at (0, 0) (swoop, `gnuReflex.txt`: the
  engine reads point 0, out of its arrays; a warning), an STL export of
  panel nribss+1 (A8, gnuA7-26: vertices at 0; a warning), skin tension
  groups that leave out rib nribss+1 (read out of the arrays, unused;
  accepted).
- No conversion between `.dat` and `.txt` airfoils: the engine converts
  `.dat` points itself.

## Build

`scripts/assemble-format.sh` compiles `src/` into `build/format/` (ES2022
modules and `.d.ts` declarations), in the `web` container:

```sh
docker compose run --rm web scripts/assemble-format.sh
docker compose run --rm web npm test -- format
docker compose run --rm oracle node scripts/check-format-native.ts   # gfortran
```

## License

GPL-3.0-only.
