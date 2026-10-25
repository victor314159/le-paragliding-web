// native-engine.ts — The engine built natively, and runs of it. Shared by
// run-oracle.ts and check-patched-native.ts (the author's toolchain: the
// oracle image, pinned by oracle/toolchain.json) and check-format-native.ts
// (any gfortran: the native image).
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import toolchain from '../oracle/toolchain.json' with { type: 'json' };
import { listTree, ROOT, sha256 } from './oracle-lib.ts';

const OUTPUTS = ['lines.txt', 'run-log.txt', 'lep-3d.dxf', 'leparagliding.dxf'];

// glibc picks its libm routines (sin, cos, pow...) from the CPU at run time,
// and their last bits differ: the outputs depend on it. The references use the
// FMA routines, the ones of any x86-64 since Haswell/Zen (glibc 2.37 has no
// AVX-512 variant of them): glibc selects them on an x86-64-v3 CPU
// (toolchain.json cpuLevel), as it reports it.
function checkCpu(): void {
  const help = execFileSync('/lib64/ld-linux-x86-64.so.2', ['--help'], { encoding: 'utf8' });
  if (!help.includes(`${toolchain.cpuLevel} (supported`))
    throw new Error(`The references need an ${toolchain.cpuLevel} CPU: see oracle/README.md`);
}

// The official source (patched: false) or the one the WASM build compiles
// (patched: true), compiled with the author's toolchain (official: true, the
// default, in the oracle image) or with the image's gfortran (official: false),
// into build/native-engine/<official-toolchain|gfortran>/<source>/a.out.
export function buildNativeEngine({
  patched,
  official = true,
}: {
  patched: boolean;
  official?: boolean;
}): string {
  if (official) {
    const image = '/opt/lepara-toolchain.json';
    if (
      !existsSync(image) ||
      sha256(readFileSync(image)) !== sha256(readFileSync(join(ROOT, 'oracle/toolchain.json')))
    )
      throw new Error('Run in an up-to-date oracle image: docker compose build oracle');
    checkCpu();
  }

  const compiler = official ? toolchain.compiler : 'gfortran';
  const kind = patched ? 'patched' : 'official';
  const out = join(ROOT, 'build/native-engine', official ? 'official-toolchain' : compiler, kind);
  const binary = join(out, 'a.out');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let source = join(ROOT, 'build/fortran/leparagliding.f');
  if (patched) {
    execFileSync(join(ROOT, 'scripts/make-patched.sh'), { stdio: 'inherit' });
  } else {
    source = join(out, 'leparagliding.f');
    execFileSync(join(ROOT, 'scripts/extract-engine.sh'), [source], { stdio: 'inherit' });
  }
  const flags = official ? toolchain.flags : [];
  const compile = spawnSync(compiler, [...flags, '-o', binary, source], { encoding: 'utf8' });
  writeFileSync(join(out, 'compile.log'), compile.stderr ?? '');
  if (compile.status !== 0) throw new Error(`Native build failed: ${out}/compile.log`);
  console.log(`native build: ${compiler}, ${kind} source`);
  return binary;
}

// Runs the engine on <inputs> (file name -> content) in <tree>/run, with the
// ../stl and ../xflr5 it writes to. stdout and stderr are kept in run/.
export function runEngine(
  binary: string,
  tree: string,
  inputs: ReadonlyMap<string, string | Uint8Array>,
): SpawnSyncReturns<Buffer> {
  const run = join(tree, 'run');
  rmSync(tree, { recursive: true, force: true });
  for (const dir of [run, join(tree, 'stl'), join(tree, 'xflr5')]) {
    mkdirSync(dir, { recursive: true });
  }
  for (const [name, content] of inputs) {
    mkdirSync(dirname(join(run, name)), { recursive: true });
    writeFileSync(join(run, name), content);
  }
  const result = spawnSync(binary, ['leparagliding.txt'], { cwd: run });
  writeFileSync(join(run, 'stdout.log'), result.stdout ?? '');
  writeFileSync(join(run, 'stderr.log'), result.stderr ?? '');
  return result;
}

// Runs <design>; false if the run fails or an output is missing. <label>
// names the run in the log.
export function runDesign(binary: string, design: string, tree: string, label = design): boolean {
  const dir = join(ROOT, 'oracle/designs', design);
  const inputs = new Map(
    listTree(dir).map((name) => [name.slice(2), readFileSync(join(dir, name))] as const),
  );
  const result = runEngine(binary, tree, inputs);
  console.log(`[${label}] exit=${result.error?.message ?? result.status ?? result.signal}`);
  let ok = result.status === 0;
  for (const name of OUTPUTS) {
    const file = join(tree, 'run', name);
    if (!existsSync(file) || statSync(file).size === 0) {
      console.log(`[${label}] MISSING OR EMPTY OUTPUT: ${name}`);
      ok = false;
    }
  }
  return ok;
}

// The files of a run in the layout of oracle/reference/<design> (run/ at the
// top, stl/ and xflr5/ as subdirectories): "./<path>" -> file, sorted by bytes.
export function runOutputs(tree: string): Map<string, string> {
  const files: [string, string][] = [];
  for (const [sub, prefix] of [
    ['run', './'],
    ['stl', './stl/'],
    ['xflr5', './xflr5/'],
  ]) {
    for (const name of listTree(join(tree, sub))) {
      files.push([prefix + name.slice(2), join(tree, sub, name)]);
    }
  }
  return new Map(files.sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}

// The MANIFEST.sha256 of <files> (runOutputs), as written by sha256sum.
export const outputManifest = (files: ReadonlyMap<string, string>) =>
  [...files].map(([name, file]) => `${sha256(readFileSync(file))}  ${name}\n`).join('');
