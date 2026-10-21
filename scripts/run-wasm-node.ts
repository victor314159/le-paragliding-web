#!/usr/bin/env node
/*
 * run-wasm-node.ts — Runs build/wasm/lepara.js (flang -> wasm32-emscripten)
 * in Node on one design, with the same contract as the native run
 * (scripts/run-oracle.sh):
 *   - every file of the design directory (oracle/designs/<id>/:
 *     leparagliding.txt + its airfoils) is copied into the cwd; the source
 *     does open(unit=22,file='leparagliding.txt') and reads the airfoils
 *     named in section 2 by name from the cwd;
 *   - outputs are written to the cwd; the program also writes to ../stl and
 *     ../xflr5, created by `call system('mkdir ...')`. There is no shell under
 *     emscripten, so system() does nothing: these directories are pre-created.
 *     Their files are exported to <output-dir>/stl/ and <output-dir>/xflr5/
 *     (only when not empty), the layout of oracle/reference/<id>/.
 *
 * Usage: node scripts/run-wasm-node.ts <design-dir> <output-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The part of the emscripten module (MODULARIZE factory) this runner uses.
interface LeparaModule {
  ENV: Record<string, string>;
  FS: {
    mkdir(path: string): void;
    chdir(path: string): void;
    readdir(path: string): string[];
    readFile(path: string): Uint8Array;
    writeFile(path: string, data: Uint8Array): void;
  };
  callMain(args: string[]): number | undefined;
}
type CreateLepara = (options: {
  print: (text: string) => void;
  printErr: (text: string) => void;
  preRun: ((module: LeparaModule) => void)[];
}) => Promise<LeparaModule>;

const ROOT = path.resolve(import.meta.dirname, '..');
const [designDir, outDir] = process.argv.slice(2);
if (!designDir || !outDir) {
  console.error('usage: run-wasm-node.ts <design-dir> <output-dir>');
  process.exit(2);
}

const INPUTS = fs.readdirSync(designDir).sort();
const CWD = '/run';

async function main(designDir: string, outDir: string) {
  const { default: createLepara } = (await import(
    pathToFileURL(path.join(ROOT, 'build/wasm/lepara.js')).href
  )) as { default: CreateLepara };
  if (typeof createLepara !== 'function') {
    throw new Error('build/wasm/lepara.js is not CommonJS: rerun scripts/build-flang-wasm.sh');
  }
  const stdout: string[] = [];
  const stderr: string[] = [];
  const M = await createLepara({
    print: (t) => stdout.push(t),
    printErr: (t) => stderr.push(t),
    // The flang runtime wraps list-directed records at 80 columns; gfortran
    // does not wrap. Raise the record length to 100 000.
    preRun: [
      (m) => {
        m.ENV['FORT_FMT_RECL'] = '100000';
      },
    ],
  });

  const F = M.FS;
  for (const d of [CWD, '/stl', '/xflr5']) F.mkdir(d);
  F.chdir(CWD);
  for (const name of INPUTS) {
    F.writeFile(name, fs.readFileSync(path.join(designDir, name)));
  }

  const t0 = Date.now();
  const code = M.callMain(['leparagliding.txt']);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  fs.mkdirSync(outDir, { recursive: true });
  for (const name of F.readdir(CWD)) {
    if (name === '.' || name === '..') continue;
    fs.writeFileSync(path.join(outDir, name), F.readFile(name));
  }
  for (const dir of ['stl', 'xflr5']) {
    const names = F.readdir(`/${dir}`).filter((name) => name !== '.' && name !== '..');
    if (names.length) fs.mkdirSync(path.join(outDir, dir));
    for (const name of names) {
      fs.writeFileSync(path.join(outDir, dir, name), F.readFile(`/${dir}/${name}`));
    }
  }
  const lines = (a: string[]) => (a.length ? a.join('\n') + '\n' : '');
  fs.writeFileSync(path.join(outDir, 'stdout.log'), lines(stdout));
  fs.writeFileSync(path.join(outDir, 'stderr.log'), lines(stderr));

  console.log(`exit=${code ?? 0} time=${secs}s -> ${outDir}`);
  process.exit(code ?? 0);
}

main(designDir, outDir).catch((e: unknown) => {
  console.error(e instanceof Error && e.stack ? e.stack : String(e));
  process.exit(3);
});
