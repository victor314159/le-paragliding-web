#!/usr/bin/env node
/*
 * check-format-native.ts — The native engine (the patched source, the one the
 * WASM build compiles, with gfortran) gives the same outputs on a design's
 * original inputs and on their rewrites by @lepara/format (packages/format): the
 * examples of oracle/designs/, the .dat fixture and the variants of
 * tests/format/variants.ts. tests/format/engine.spec.ts checks the same with
 * the WASM engine (flang): together they check that both compilers read the
 * list-directed forms the package accepts as it does.
 *
 * Each input runs in its own tree build/format-native/<case>/<a|b>/{run,stl,
 * xflr5}; every file the run writes, stdout, stderr and the exit code must
 * be identical.
 *
 * Usage: docker compose run --rm native node scripts/check-format-native.ts
 * Exit code 0 iff every case is identical.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAirfoil,
  parseLep,
  writeAirfoil,
  writeLep,
  type Result,
} from '../packages/format/src/index.ts';
import { DAT_FIXTURE, designFiles } from '../tests/format/helpers.ts';
import { VARIANTS, variantFiles } from '../tests/format/variants.ts';
import { designIds, listTree, ROOT, sha256 } from './oracle-lib.ts';
import { buildNativeEngine, runEngine } from './native-engine.ts';

// Two runs of the same binary: any gfortran, natively (the native image).
const BIN = buildNativeEngine({ patched: true, official: false });
const OUT = join(ROOT, 'build/format-native');

const ok = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.value;
};

function rewrite(name: string, text: string): string {
  return name === 'leparagliding.txt'
    ? ok(writeLep(ok(parseLep(text))))
    : ok(writeAirfoil(ok(parseAirfoil(name, text))));
}

/** Runs the native engine on `files`; returns its outputs as name -> sha256. */
function run(dir: string, files: Map<string, string>): Map<string, string> {
  const result = runEngine(BIN, dir, files);
  const outputs = new Map([['exit code', String(result.error?.message ?? result.status)]]);
  for (const name of listTree(dir).map((path) => path.slice(2))) {
    if (name.startsWith('run/') && files.has(name.slice(4))) continue;
    outputs.set(name, sha256(readFileSync(join(dir, name))));
  }
  return outputs;
}

const cases = [
  ...designIds().map((id) => ({
    name: id,
    files: () => designFiles(join(ROOT, 'oracle/designs', id)),
  })),
  { name: 'dat-airfoil', files: () => designFiles(join(ROOT, DAT_FIXTURE)) },
  ...VARIANTS.map((v) => ({ name: `variant-${v.name}`, files: () => variantFiles(v, ROOT) })),
];

let fail = false;
for (const { name, files } of cases) {
  const original = files();
  const rewritten = new Map([...original].map(([file, text]) => [file, rewrite(file, text)]));
  const a = run(join(OUT, name, 'a'), original);
  const b = run(join(OUT, name, 'b'), rewritten);
  const names = new Set([...a.keys(), ...b.keys()]);
  const differing = [...names].filter((key) => a.get(key) !== b.get(key));
  if (a.get('exit code') !== '0') differing.unshift(`exit code ${a.get('exit code')}`);
  if (differing.length || !existsSync(join(OUT, name, 'a/run/lep-out.txt'))) {
    console.log(`[${name}] DIFFERENT: ${differing.join(' ')}`);
    fail = true;
  } else {
    console.log(`[${name}] ${a.size - 1} outputs identical`);
  }
}

console.log(fail ? 'FORMAT NATIVE: RED' : 'FORMAT NATIVE: GREEN');
process.exit(fail ? 1 : 0);
