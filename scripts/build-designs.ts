#!/usr/bin/env node
/*
 * build-designs.ts — Builds the oracle/web designs from the official examples.
 *
 * Sources: fortran/original/designs/<id>/, each extracted unmodified from an
 * official LEparagliding or Laboratori d'envol archive (see its SOURCE.txt).
 * Output, for each design:
 *   oracle/designs/<id>/leparagliding.txt  runnable by LEparagliding 3.29
 *   oracle/designs/<id>/<airfoil>.txt      airfoils named in section 2
 * plus oracle/designs/index.json, the single list of designs read by the
 * oracle scripts, the Node runner, the web app and the browser tests.
 *
 * Adaptation to 3.29 (nothing else is changed):
 *   - CRLF -> LF, trailing blank lines removed. How `read(22,*)` (empty list)
 *     handles a blank record is implementation-defined, and a blank line
 *     before an appended header shifts every following read.
 *   - Designs written for an older program stop at section 32 (3.17+, 3.19) or
 *     37 (3.21T-3.28). 3.29 reads sections up to 39: each missing one is
 *     appended with the official 3-line header and its flag at 0 (program
 *     defaults), the contract documented in fortran/original/docs/Updates_log.txt
 *     (report 3.20V, "SIMPLIFIED NEW SECTIONS STRUCTURE").
 *   - When section 32 is the last one, lines after its data (flag, then 10
 *     lines if the flag is 1) are removed: the older program never read them,
 *     3.29 would read them as section 33 (BHL7-22 keeps a second, unused set
 *     of section 32 parameters there).
 *
 * Usage: docker compose run --rm oracle node scripts/build-designs.ts
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './oracle-lib.ts';

const SRC = join(ROOT, 'fortran/original/designs');
const OUT = join(ROOT, 'oracle/designs');

// id, program version the example ships with. Order = order in the web UI.
const DESIGNS = [
  ['swoop2', '3.29'],
  ['gnuC2-27', '3.28'],
  ['swoop', '3.27'],
  ['A8', '3.25'],
  ['gnuA7-26', '3.23'],
  ['gnuC-27', '3.21T'],
  ['gnu-test-3.19', '3.19'],
  ['BHL7-22', '3.17+'],
];

const HDR = '*******************************************************';
const TITLE: Record<number, string> = {
  33: 'DETAILED RISERS',
  34: 'LINES CHARACTERISTICS TABLE',
  35: 'SOLVE EQUILIBRIUM EQUATIONS',
  36: 'CREATE FILES FOR XFLR5 ANALYSIS',
  37: 'SOME SPECIAL PARAMETERS',
  38: 'HVR HOLES',
  39: 'HVR POSITION PARAMETERS',
};
const LAST_SECTION = 39;

const read = (file: string) => readFileSync(file, 'utf8').replaceAll('\r', '');

// The first line after "* <comment>", trimmed, without its quotes.
function valueAfter(lines: string[], comment: string): string {
  const i = lines.findIndex((line) => line.startsWith(`* ${comment}`));
  return i < 0 ? '' : (lines[i + 1] ?? '').trim().replace(/^"(.*)"$/, '$1');
}

rmSync(OUT, { recursive: true, force: true });
const index: object[] = [];
for (const [id, program] of DESIGNS) {
  const src = join(SRC, id);
  const dest = join(OUT, id);
  mkdirSync(dest, { recursive: true });

  const lines = read(join(src, 'leparagliding.txt')).split('\n');
  while (lines.length && !lines[lines.length - 1]?.trim()) lines.pop();

  const sections = lines.flatMap((line) => /^\*\s+(\d+)\. /.exec(line)?.[1] ?? []).map(Number);
  if (!sections.length) throw new Error(`${id}: no section header`);
  let dropped = 0;
  if (Math.max(...sections) === 32) {
    // Data starts after the header line and the line of stars below it.
    const data = lines.findIndex((line) => /^\*\s+32\. /.test(line)) + 2;
    dropped = lines.splice(data + (lines[data]?.trim() === '1' ? 11 : 1)).length;
  }
  const added: number[] = [];
  for (let n = Math.max(...sections) + 1; n <= LAST_SECTION; n++) {
    if (!TITLE[n]) throw new Error(`${id}: no title for the missing section ${n}`);
    lines.push(HDR, `*       ${n}. ${TITLE[n]}`, HDR, '0');
    added.push(n);
  }
  writeFileSync(join(dest, 'leparagliding.txt'), lines.join('\n') + '\n');

  // Airfoils: 2nd field of section 2, up to the next section header.
  const start = lines.findIndex((line) => /^\*\s+2\. AIRFOILS/.test(line));
  const end = lines.findIndex((line, i) => i > start && /^\*\s+3\. /.test(line));
  const airfoils = [
    ...new Set(
      lines
        .slice(start + 1, end < 0 ? undefined : end)
        .map((line) => line.trim().split(/\s+/)[1] ?? '')
        .filter((name) => name.endsWith('.txt')),
    ),
  ].sort();
  if (start < 0 || !airfoils.length) throw new Error(`${id}: no airfoil in section 2`);
  for (const name of airfoils) writeFileSync(join(dest, name), read(join(src, name)));

  const wing = valueAfter(lines, 'Wing name');
  const cells = Number(valueAfter(lines, 'Number of cells'));
  if (!Number.isInteger(cells) || cells < 1) throw new Error(`${id}: no number of cells`);
  const adapted = [
    dropped ? `${dropped} unread lines after section 32 removed` : '',
    added.length ? `sections ${added[0]}-${added.at(-1)} added at 0` : '',
  ]
    .filter(Boolean)
    .join(', ');
  index.push({ id, wing, program, cells, airfoils, adapted });
  console.log(
    `${id}: ${wing} (${program}, ${cells} cells) airfoils: ${airfoils.join(' ')}` +
      (adapted ? ` [${adapted}]` : ''),
  );
}
writeFileSync(
  join(OUT, 'index.json'),
  `[\n${index.map((design) => '  ' + JSON.stringify(design)).join(',\n')}\n]\n`,
);
console.log(`index: ${join(OUT, 'index.json')}`);
