// Variants of the example designs, edited as text: each one reaches reader
// branches the examples do not use (modes, layouts, list-directed syntax).
// tests/format/engine.spec.ts runs them through the WASM engine (flang) and
// scripts/check-format-native.ts through the native one (gfortran), each
// time against their rewrite by @lepara/format.
import { designFiles } from './helpers.ts';

export interface Variant {
  readonly name: string;
  /** What it covers. */
  readonly covers: string;
  /** The example it derives from, `oracle/designs/<base>`. */
  readonly base: string;
  readonly edit: (design: string) => string;
}

/** The input files of a variant: its base's, with the design edited. */
export function variantFiles(variant: Variant, root = '.'): Map<string, string> {
  const files = designFiles(`${root}/oracle/designs/${variant.base}`);
  files.set('leparagliding.txt', variant.edit(files.get('leparagliding.txt')!));
  return files;
}

type Edit = (lines: string[]) => string[];

/** Applies `edits` to the data lines of their section (after its title rule). */
function sections(edits: Record<number, Edit>): (text: string) => string {
  return (text) => {
    const lines = text.split('\n');
    const titles = lines.flatMap((line, i) => {
      const match = /^\*\s*(\d+)\.\s/.exec(line);
      return match ? [{ section: Number(match[1]), at: i }] : [];
    });
    // From the last section down, so earlier positions stay valid.
    for (let t = titles.length - 1; t >= 0; t--) {
      const { section, at } = titles[t];
      const edit = edits[section];
      if (!edit) continue;
      // Data: after the title and its rule, before the rule of the next title.
      const start = at + 2;
      const end = t + 1 < titles.length ? titles[t + 1].at - 1 : lines.length;
      lines.splice(start, end - start, ...edit(lines.slice(start, end)));
    }
    return lines.join('\n');
  };
}

/** Replaces the line equal to `from` (it must exist). */
const line =
  (from: string, ...to: string[]): Edit =>
  (lines) => {
    const i = lines.indexOf(from);
    if (i < 0) throw new Error(`No line ${JSON.stringify(from)}`);
    return [...lines.slice(0, i), ...to, ...lines.slice(i + 1)];
  };

const all =
  (...edits: Edit[]): Edit =>
  (lines) =>
    edits.reduce((acc, edit) => edit(acc), lines);

/** Replaces every line matching `test` by `map(line)`. */
const rows =
  (test: RegExp, map: (line: string) => string): Edit =>
  (lines) =>
    lines.map((l) => (test.test(l) ? map(l) : l));

const replaceAll =
  (...to: string[]): Edit =>
  () =>
    to;

// gnuA7-26: list-directed forms beyond the examples, in values that reach
// the outputs.
const SYNTAX = sections({
  1: all(
    line(`"Laboratori d'envol"`, `'Laboratori d''envol'`),
    // A delimited constant continued on the next record.
    line('"gnuA7-26-test3.23"', '"gnuA7-26-', 'test3.23"'),
    line('0.980762047 ', '9.80762047D-1'),
    // A blank record skipped while looking for the value; sign, leading zero.
    line('\t33', '', '   +033'),
    line('\t4.5\t1', '4.5,1'),
    rows(/^2\s+55\.52/, () => '2,55.52,0.93,308.84,55.45,2.37,4.83,33.33,2*0.,50.'),
    // A row continued on the next record.
    rows(/^3\s+92\.36/, (l) => l.replace(/^(\S+\s+\S+\s+\S+\s+\S+)\s+/, '$1\n')),
  ),
  6: line('15\t25\t20\tupper panels (mm)', '1.5+1, 25 ,20 / upper panels'),
  8: line('\t7.0', '\t.7e1'),
  // Read twice (BACKSPACE): repeats in both passes.
  12: rows(/^1\t11 /, () => '1,11,0,3*1,2.1,3*0'),
  18: line('100', '1.d2'),
});

export const VARIANTS: readonly Variant[] = [
  {
    name: 'list-directed',
    covers:
      'quotes, continued records, blank records, D exponents, signless exponents, n*v, commas, slashes',
    base: 'gnuA7-26',
    edit: SYNTAX,
  },
  {
    name: 'list-directed-crlf',
    covers: 'the same in a CRLF file, the continued constant included',
    base: 'gnuA7-26',
    edit: (text) => SYNTAX(text).replaceAll('\n', '\r\n'),
  },
  {
    name: 'washin-0-9-columns',
    covers: 'washin mode 0, the 9-column rib table of LEparagliding < 3.16',
    base: 'gnuA7-26',
    edit: sections({
      1: all(
        line('\t4.5\t1', '\t4.5\t0'),
        rows(/^\s*\d+\s+\d/, (l) => l.replace(/\s+\S+\s+\S+\s*$/, '')),
      ),
    }),
  },
  {
    name: 'untyped-rows',
    covers: 'lines and brakes without line types (automatic types, type 6 for the main brake)',
    base: 'gnuA7-26',
    edit: sections({
      9: rows(/\s-\s/, (l) => l.replace(/\s+-\s[\d\s]+$/, '')),
      10: rows(/\s-\s/, (l) => l.replace(/\s+-\s[\d\s]+$/, '')),
    }),
  },
  {
    name: 'typed-4-levels',
    covers: 'typed line rows with 3 and 4 levels',
    base: 'swoop2',
    edit: sections({
      9: rows(/^[345]\t/, (l) => {
        const levels = Number(l.trim().split(/\s+/)[0]);
        return `${l.trimEnd()}\t- ${[1, 2, 3, 4].slice(0, levels).join(' ')}`;
      }),
    }),
  },
  {
    name: 'wing-tip-2',
    covers: 'section 27 mode 2 (parabolic wing tip)',
    base: 'gnuA7-26',
    edit: sections({ 27: replaceAll('2', 'distance 5.0', 'angle 10.0') }),
  },
  {
    name: 'wing-tip-4',
    covers: 'section 27 mode 4 (last rib displacement and rotation)',
    base: 'gnuA7-26',
    edit: sections({ 27: replaceAll('4', 'last 1.0 2.0') }),
  },
  {
    name: 'shaping-2',
    covers: 'section 29 type 2, without cuts: with cuts, the engine uses unset points',
    base: 'gnuA7-26',
    edit: sections({ 29: (lines) => ['2', ...lines.slice(1)] }),
  },
  {
    name: 'risers-2',
    covers: 'section 33 with k33t = 2 (nothing more read)',
    base: 'gnuA7-26',
    edit: sections({ 33: replaceAll('1', '2') }),
  },
  {
    name: 'sections-off',
    covers: 'sections 24, 25, 28, 30, 31, 32, 35, 36 at 0 (engine defaults)',
    base: 'gnuA7-26',
    edit: sections(
      Object.fromEntries([24, 25, 28, 30, 31, 32, 35, 36].map((n) => [n, replaceAll('0')])),
    ),
  },
  {
    name: 'nose-mylars',
    covers: 'section 22 mode 1',
    base: 'gnuA7-26',
    edit: sections({ 22: replaceAll('1', '1', '1 1 5', '1.0 2.0 0.5 0.5 1.0 1.0') }),
  },
  {
    name: 'jonc-blocs',
    covers: 'section 21 scheme 2 with blocs of types 5 and 1',
    base: 'gnuA7-26',
    edit: sections({
      21: replaceAll(
        '2',
        '2',
        '1 5',
        '1',
        '1 1 10',
        '4.2   10.8    1.36   2.0',
        '3.67  10.8    0.79   2.0',
        '2.0   9.35    6.3   9.35',
        '2 1',
        '1',
        '2 11 16',
        '4.2   10.8    1.36   2.0',
        '3.67  10.8    0.79   2.0',
        '2.0   9.35    6.3   9.35',
      ),
    }),
  },
  {
    name: 'nulls-and-number-forms',
    covers: 'null values keeping the engine defaults and labels, -0, D and Q exponents',
    base: 'gnuA7-26',
    edit: sections({
      // -0 in the first skin tension point, exponents in the minirib strain.
      5: all(line('0.\t\t0.\t0.\t\t0.', '-0.0 0 -0. 0'), line('0.0114', '1.14D-2')),
      8: line('\t7.0', '\t.7Q1'),
      // A null label; the default nsegments (12) kept by "/".
      32: line('panel_x\t\t1.0', ',1.0'),
      37: rows(/^1291\t12/, () => '1291 /'),
    }),
  },
  {
    name: 'five-levels',
    covers: 'an untyped path of 5 levels (13 values, level 5 unused by 3.29)',
    base: 'swoop2',
    edit: sections({
      9: line('4\t1 1\t2 1\t3 1\t4 2\t1 3', '5\t1 1\t2 1\t3 1\t4 2\t5 1\t1 3'),
    }),
  },
  {
    name: 'holes-k39-0-k23-1',
    covers: 'section 39 at 0 with section 38 active, section 23 at 1',
    base: 'swoop2',
    edit: sections({ 23: replaceAll('1'), 39: (lines) => ['0', ...lines.slice(1)] }),
  },
  {
    name: 'hv-ribs-5',
    covers: 'H V ribs of type 5',
    base: 'gnuC-27',
    edit: sections({
      12: rows(/^2\s+1\s+2 1\s+3 1\s/, () => '2 5 2 1 3 1 5.0 0. 0. 2.'),
    }),
  },
  {
    name: 'hv-ribs-2-4-12-13-14',
    covers: 'H V ribs of types 2, 4, 12, 13 and 14',
    base: 'gnuC-27',
    edit: sections({
      12: all(
        rows(/^43\s+3\s/, (l) => l.replace(/^43(\s+)3/, '43$12')),
        rows(/^44\s+3\s/, (l) => l.replace(/^44(\s+)3/, '44$113')),
        rows(/^45\s+3\s/, (l) => l.replace(/^45(\s+)3/, '45$14')),
        rows(/^1\t1\s/, (l) => l.replace(/^1\t1/, '1\t12')),
        rows(/^3\t1\s/, (l) => l.replace(/^3\t1/, '3\t14')),
      ),
    }),
  },
];
