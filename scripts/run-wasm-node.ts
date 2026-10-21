#!/usr/bin/env node
/*
 * run-wasm-node.ts — Runs the assembled npm package build/engine/
 * (scripts/assemble-engine.sh: runLeparagliding from its Node entry node.js,
 * lepara.js + lepara.wasm, flang -> wasm32-emscripten) in Node on one
 * design, with the same contract as the native run (scripts/run-oracle.sh):
 *   - every file of the design directory (oracle/designs/<id>/:
 *     leparagliding.txt + its airfoils) is an input;
 *   - <output-dir> receives the inputs, then every output: run directory,
 *     stl/ and xflr5/ (the program's ../stl and ../xflr5), stdout.log and
 *     stderr.log. The layout of oracle/reference/<id>/.
 *
 * Usage: node scripts/run-wasm-node.ts <design-dir> <output-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Engine from '../packages/engine/src/node.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const [designDir, outDir] = process.argv.slice(2);
if (!designDir || !outDir) {
  console.error('usage: run-wasm-node.ts <design-dir> <output-dir>');
  process.exit(2);
}

async function main(designDir: string, outDir: string) {
  const { runLeparagliding } = (await import(
    pathToFileURL(path.join(ROOT, 'build/engine/node.js')).href
  )) as typeof Engine;
  const inputs = fs.readdirSync(designDir).sort();
  const files = inputs.map((name) => ({
    name,
    bytes: fs.readFileSync(path.join(designDir, name)),
  }));

  let t0 = Date.now();
  const result = await runLeparagliding(files, { onRun: () => (t0 = Date.now()) });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  fs.mkdirSync(outDir, { recursive: true });
  for (const { name, bytes } of [
    ...files,
    ...result.files,
    { name: 'stdout.log', bytes: result.stdout },
    { name: 'stderr.log', bytes: result.stderr },
  ]) {
    fs.mkdirSync(path.dirname(path.join(outDir, name)), { recursive: true });
    fs.writeFileSync(path.join(outDir, name), bytes);
  }

  console.log(`exit=${result.code} time=${secs}s -> ${outDir}`);
  process.exit(result.code);
}

main(designDir, outDir).catch((e: unknown) => {
  console.error(e instanceof Error && e.stack ? e.stack : String(e));
  process.exit(3);
});
