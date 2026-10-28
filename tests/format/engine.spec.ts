// Criterion 2: the engine package gives the same files, bytes, logs and exit
// code on a design's original inputs and on their rewrites by @lepara/format:
// the examples, the .dat fixture and the variants of variants.ts (reader
// branches and list-directed forms the examples do not use). Each run uses a
// fresh engine in its own worker_threads Worker.
import { expect, test } from '@playwright/test';
import { parseAirfoil, parseLep, writeAirfoil, writeLep } from '../../packages/format/src/index.ts';
import { DAT_FIXTURE, DESIGNS, designFiles, engine, ok } from './helpers.ts';
import { VARIANTS, variantFiles } from './variants.ts';

const encoder = new TextEncoder();

function rewrite(name: string, text: string): string {
  return name === 'leparagliding.txt'
    ? ok(writeLep(ok(parseLep(text))))
    : ok(writeAirfoil(ok(parseAirfoil(name, text))));
}

const allCases = [
  ...[...DESIGNS.map((id) => `oracle/designs/${id}`), DAT_FIXTURE].map((dir) => ({
    name: dir,
    files: () => designFiles(dir),
  })),
  ...VARIANTS.map((variant) => ({
    name: `variant ${variant.name} (${variant.covers})`,
    files: () => variantFiles(variant),
  })),
];
// Each case runs the engine twice, seconds per run: one design by default,
// every case with ORACLE_ALL=1 (CI).
const cases =
  process.env['ORACLE_ALL'] === '1'
    ? allCases
    : allCases.filter(({ name }) => name === 'oracle/designs/gnuA7-26');

for (const { name, files } of cases) {
  test(`${name}: same engine run on the rewritten inputs`, async () => {
    const { runLeparaglidingInWorker } = await engine();
    const inputs = [...files()];
    const original = inputs.map(([file, text]) => ({ name: file, bytes: encoder.encode(text) }));
    const rewritten = inputs.map(([file, text]) => ({
      name: file,
      bytes: encoder.encode(rewrite(file, text)),
    }));
    // The rewritten design is another text: the comparison is not trivial.
    const design = inputs.findIndex(([file]) => file === 'leparagliding.txt');
    expect(Buffer.compare(rewritten[design].bytes, original[design].bytes)).not.toBe(0);

    const before = await runLeparaglidingInWorker(original);
    const after = await runLeparaglidingInWorker(rewritten);
    expect(before.code).toBe(0);
    expect(after.code).toBe(before.code);
    expect(after.stdout).toBe(before.stdout);
    expect(after.stderr).toBe(before.stderr);
    expect(after.files.map((f) => f.name)).toEqual(before.files.map((f) => f.name));
    // Names only in the report: the outputs weigh a few MB.
    const differing = after.files
      .filter((f, k) => Buffer.compare(f.bytes, before.files[k].bytes) !== 0)
      .map((f) => f.name);
    expect(differing).toEqual([]);
    expect(before.files.map((f) => f.name)).toEqual(
      expect.arrayContaining(['leparagliding.dxf', 'lep-out.txt', 'lines.txt']),
    );
  });
}

test('the list-directed variants read as their base design', () => {
  const base = ok(parseLep(designFiles('oracle/designs/gnuA7-26').get('leparagliding.txt')!));
  for (const variant of VARIANTS.filter((v) => v.name.startsWith('list-directed'))) {
    expect(ok(parseLep(variantFiles(variant).get('leparagliding.txt')!)), variant.name).toEqual(
      base,
    );
  }
});
