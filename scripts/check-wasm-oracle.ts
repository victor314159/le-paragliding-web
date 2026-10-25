#!/usr/bin/env node
/*
 * check-wasm-oracle.ts — Runs the npm package (scripts/assemble-engine.sh,
 * build/wasm/lepara.js + the packages/engine/ wrapper) in Node on the designs
 * of oracle/designs/index.json and compares the WHOLE output tree BYTE FOR
 * BYTE (sha256) with oracle/reference/<id>/MANIFEST.sha256: same files (run
 * directory, stl/, xflr5/), same content. The manifest is versioned for every
 * output; the large ones (DXF, STL, SCAD) are not (run-oracle.ts regenerates
 * them).
 *
 * Expected content: the official reference, changed only by the pinned
 * differences of oracle/patch-effects.tsv (patches, checked natively by
 * check-patched-native.ts) then oracle/wasm-known-diffs.tsv (flang/libm).
 * Any other content, or a missing file, fails.
 *
 * Each design runs in its own process (scripts/run-wasm-node.ts): a fresh
 * WASM instance and memory per design.
 *
 * Usage: docker compose run --rm web node scripts/check-wasm-oracle.ts
 * Exit code 0 iff every output is identical or a listed known difference.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareOutputs,
  designIds,
  listTree,
  PATCH_EFFECTS,
  pinnedDiffs,
  referenceManifest,
  ROOT,
  sha256,
  stalePinned,
  WASM_DIFFS,
} from './oracle-lib.ts';

execFileSync(join(ROOT, 'scripts/assemble-engine.sh'), { stdio: 'inherit' });

const tables = [pinnedDiffs(PATCH_EFFECTS), pinnedDiffs(WASM_DIFFS)];

let fail = false;
for (const design of designIds()) {
  const out = join(ROOT, 'build/wasm-runs', design);
  rmSync(out, { recursive: true, force: true });
  const run = spawnSync(
    process.execPath,
    [join(ROOT, 'scripts/run-wasm-node.ts'), join(ROOT, 'oracle/designs', design), out],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) {
    console.log(`[${design}] RUN FAILED`);
    fail = true;
    continue;
  }
  const actual = new Map(
    listTree(out).map((name) => [name.slice(2), sha256(readFileSync(join(out, name)))]),
  );
  const reference = referenceManifest(design);
  const { problems, pinned } = compareOutputs(design, reference, actual, tables);
  for (const diff of pinned) console.log(`[${design}] pinned difference: ${diff.reason}`);
  for (const problem of problems) console.log(`[${design}] ${problem}`);
  if (problems.length) fail = true;
  console.log(`[${design}] ${reference.size} reference files checked`);
}

for (const key of tables.flatMap((table) => stalePinned(table))) {
  console.log(`${key}: STALE PINNED DIFFERENCE (no such reference file)`);
  fail = true;
}

console.log(fail ? 'WASM ORACLE: RED' : 'WASM ORACLE: GREEN');
process.exit(fail ? 1 : 0);
