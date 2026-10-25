#!/usr/bin/env node
/*
 * check-patched-native.ts — Runs every design with the patched source (the
 * one the WASM build compiles), on the official references' toolchain, and
 * compares each output with oracle/reference/: identical, or exactly the
 * difference pinned in oracle/patch-effects.tsv. The toolchain being the same,
 * every difference is the effect of a patch.
 *
 * Usage: docker compose run --rm oracle node scripts/check-patched-native.ts
 */
import { join } from 'node:path';
import {
  compareOutputs,
  designIds,
  parseManifest,
  PATCH_EFFECTS,
  pinnedDiffs,
  referenceManifest,
  ROOT,
  stalePinned,
} from './oracle-lib.ts';
import { buildNativeEngine, outputManifest, runDesign, runOutputs } from './native-engine.ts';

const BIN = buildNativeEngine({ patched: true });
const effects = pinnedDiffs(PATCH_EFFECTS);

let fail = false;
for (const design of designIds()) {
  const tree = join(ROOT, 'build/patched-runs', design);
  if (!runDesign(BIN, design, tree)) {
    fail = true;
    continue;
  }
  const actual = parseManifest(outputManifest(runOutputs(tree)));
  const { problems, pinned } = compareOutputs(design, referenceManifest(design), actual, [effects]);
  for (const diff of pinned) console.log(`[${design}] pinned difference: ${diff.reason}`);
  for (const problem of problems) console.log(`[${design}] ${problem} (outputs in ${tree})`);
  if (problems.length) fail = true;
}

for (const key of stalePinned(effects)) {
  console.log(`${key}: STALE PINNED DIFFERENCE (no such reference file)`);
  fail = true;
}

console.log(fail ? 'PATCHED NATIVE: FAILED' : 'PATCHED NATIVE: OK');
process.exit(fail ? 1 : 0);
