#!/usr/bin/env node
/*
 * run-oracle.ts — Runs the designs of oracle/designs/index.json natively
 * (gfortran binary) and stores the verified outputs in oracle/reference/.
 *
 * Execution contract (source line 776):
 *   open(unit=22,file='leparagliding.txt')  ->  the design MUST be named
 *   leparagliding.txt in the cwd; the airfoils named in section 2 are read
 *   from the cwd; outputs (DXF, lines.txt, logs) are written to the cwd.
 *   oracle/designs/<id>/ holds exactly these inputs (scripts/build-designs.ts).
 *
 * Compiled source: the unmodified official archive (CRLF -> LF only), in
 * build/native-engine/official-toolchain/official/. No web/WASM patch is
 * applied. The oracle container reproduces the author's Ubuntu 23.04 /
 * gfortran 12.3 x86-64 toolchain; oracle/toolchain.json pins the environment
 * and compilation flags.
 *
 * The program also writes to ../stl and ../xflr5. Each design runs twice (a
 * and b), each run in its own tree build/oracle-runs/<design>-<a|b>/{run,stl,
 * xflr5}; if both are bit-identical (determinism), run/ and the stl/ and
 * xflr5/ outputs are copied to oracle/reference/<design>/ (stl/ and xflr5/ as
 * subdirectories) with a sha256 manifest of every file, except the large
 * outputs (DXF, STL, SCAD): only their sha256 is versioned, the files stay in
 * build/oracle-runs/<design>-a/.
 *
 * When the official archive ships its own outputs
 * (fortran/engine/original/designs/<id>/official-outputs.sha256), the reference is
 * also compared with them, through the pinned differences of
 * official-outputs.known-diffs.tsv (scripts/oracle-lib.ts).
 * All designs must pass before any committed reference is replaced.
 *
 * Usage: docker compose run --rm oracle node scripts/run-oracle.ts
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  compareOutputs,
  copyTree,
  designIds,
  parseManifest,
  pinnedDiffs,
  ROOT,
  stalePinned,
} from './oracle-lib.ts';
import { buildNativeEngine, outputManifest, runDesign, runOutputs } from './native-engine.ts';

const BIN = buildNativeEngine({ patched: false });
const STAGED = join(ROOT, 'build/oracle-reference');
const LARGE = /\.(dxf|stl|scad)$/;
const DESTINATION = join(ROOT, 'oracle/reference');

rmSync(STAGED, { recursive: true, force: true });
mkdirSync(STAGED, { recursive: true });

let fail = false;
for (const design of designIds()) {
  console.log(`=== ${design} ===`);
  const a = join(ROOT, 'build/oracle-runs', `${design}-a`);
  const b = join(ROOT, 'build/oracle-runs', `${design}-b`);
  const okA = runDesign(BIN, design, a, `${design}/a`);
  const okB = runDesign(BIN, design, b, `${design}/b`);
  if (!okA || !okB) {
    fail = true;
    continue;
  }

  const files = runOutputs(a);
  const hashA = outputManifest(files);
  const hashB = outputManifest(runOutputs(b));
  if (hashA !== hashB) {
    console.log(`[${design}] NOT DETERMINISTIC, run-a / run-b diff:`);
    const linesA = hashA.split('\n');
    const linesB = hashB.split('\n');
    const diff = [
      ...linesA.filter((line) => !linesB.includes(line)).map((line) => `< ${line}`),
      ...linesB.filter((line) => !linesA.includes(line)).map((line) => `> ${line}`),
    ];
    console.log(diff.slice(0, 20).join('\n'));
    fail = true;
    continue;
  }
  console.log(`[${design}] deterministic: run-a == run-b`);

  // Only the sha256 of the large outputs is versioned.
  const ref = join(STAGED, design);
  for (const [name, file] of files) {
    if (LARGE.test(name)) continue;
    mkdirSync(dirname(join(ref, name)), { recursive: true });
    copyFileSync(file, join(ref, name));
  }
  writeFileSync(join(ref, 'MANIFEST.sha256'), hashA);
  console.log(`[${design}] reference staged`);
  const manifest = parseManifest(hashA);

  const official = join(ROOT, 'fortran/engine/original/designs', design, 'official-outputs.sha256');
  if (existsSync(official)) {
    const known = pinnedDiffs(official.replace(/\.sha256$/, '.known-diffs.tsv'));
    const published = parseManifest(readFileSync(official, 'utf8'));
    const { problems, pinned } = compareOutputs(design, published, manifest, [known], true);
    const stale = stalePinned(known, (id) => (id === design ? published : undefined));
    for (const diff of pinned)
      console.log(`[${design}] differs from the official output: ${diff.reason}`);
    const all = [...problems, ...stale.map((key) => `${key}: STALE LINE`)];
    for (const problem of all) console.log(`[${design}] official output ${problem}`);
    if (all.length) fail = true;
    else console.log(`[${design}] official outputs checked`);
  }
}

if (fail) {
  console.log('NATIVE ORACLE: FAILED; committed references unchanged');
  process.exit(1);
}
// The committed references are in git: an interrupted copy is undone by
// `git restore oracle/reference`.
rmSync(DESTINATION, { recursive: true, force: true });
copyTree(STAGED, DESTINATION);
console.log('NATIVE ORACLE: OK; official references updated');
