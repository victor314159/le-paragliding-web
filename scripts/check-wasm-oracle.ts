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
 * The only accepted differences are the files listed in
 * oracle/wasm-known-diffs.tsv (content only: the file must exist on both
 * sides). A listed file that became identical is reported, to drop the entry.
 *
 * Each design runs in its own process (scripts/run-wasm-node.ts): a fresh
 * WASM instance and memory per design.
 *
 * Usage: docker compose run --rm oracle node scripts/check-wasm-oracle.ts
 * Exit code 0 iff every output is identical or a listed known difference.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { designIds, knownDiffs, listTree, parseManifest, ROOT, sha256 } from './oracle-lib.ts';

execFileSync(join(ROOT, 'scripts/assemble-engine.sh'), { stdio: 'inherit' });

// "<design>/<file>" -> reason
const known = new Map(
  knownDiffs(join(ROOT, 'oracle/wasm-known-diffs.tsv'), 3).map(([design, file, reason]) => [
    `${design}/${file}`,
    reason,
  ]),
);

let fail = false;
for (const design of designIds()) {
  const out = join(ROOT, 'build/wasm-runs', design);
  const manifest = parseManifest(
    readFileSync(join(ROOT, 'oracle/reference', design, 'MANIFEST.sha256'), 'utf8'),
  );
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
  for (const [name, expected] of manifest) {
    const reason = known.get(`${design}/${name}`);
    const file = join(out, name);
    if (!existsSync(file)) {
      console.log(`[${design}] ${name} MISSING from the WASM output`);
      fail = true;
    } else if (sha256(readFileSync(file)) === expected) {
      if (reason) {
        console.log(
          `[${design}] ${name} is now identical: remove it from oracle/wasm-known-diffs.tsv`,
        );
      }
    } else if (reason) {
      console.log(`[${design}] ${name} differs (known: ${reason})`);
    } else {
      console.log(`[${design}] ${name} DIFFERENT`);
      fail = true;
    }
  }
  // Files produced by the WASM build only.
  const extra = listTree(out)
    .map((name) => name.slice(2))
    .filter((name) => !manifest.has(name));
  if (extra.length) {
    console.log(`[${design}] EXTRA WASM OUTPUT: ${extra.join(' ')}`);
    fail = true;
  }
  console.log(`[${design}] ${manifest.size} reference files checked`);
}

console.log(fail ? 'WASM ORACLE: RED' : 'WASM ORACLE: GREEN');
process.exit(fail ? 1 : 0);
