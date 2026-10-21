// One LEparagliding run on in-memory files, in a fresh instance of the
// Emscripten module. Called by index.ts (browsers) and node.ts, directly or
// through their Workers (worker.ts, node-worker.ts).
import type { CreateLepara, LeparaModule } from './lepara.js';
import type { EngineFile, RunOptions, RunResult } from './types.js';

const INPUT = 'leparagliding.txt';
// The program reads its inputs from the working directory and writes to it,
// to ../stl and to ../xflr5. Its `call system('mkdir ...')` does nothing
// under Emscripten: the directories are created here.
const CWD = '/run';
const OUTPUT_DIRS = [
  [CWD, ''],
  ['/stl', 'stl/'],
  ['/xflr5', 'xflr5/'],
] as const;

export async function run(
  createLepara: CreateLepara,
  files: EngineFile[],
  options: RunOptions = {},
): Promise<RunResult> {
  const inputs = new Map<string, Uint8Array>();
  for (const { name, bytes } of files) {
    if (!name || /[\\/\0]/.test(name) || name === '.' || name === '..') {
      throw new Error(`Invalid input file name: ${name}`);
    }
    if (inputs.has(name)) throw new Error(`Duplicate input file: ${name}`);
    inputs.set(name, bytes);
  }
  if (!inputs.has(INPUT)) throw new Error(`Missing ${INPUT}.`);

  const { wasmUrl, wasmBinary, onStdout, onStderr, onRun, onMemory } = options;
  const stdout: string[] = [];
  const stderr: string[] = [];
  let module: LeparaModule | undefined;
  let memoryBytes = 0;
  // callMain blocks the thread: sample the memory on every output line.
  const reportMemory = () => {
    const bytes = module?.HEAPU8?.byteLength;
    if (onMemory && bytes && bytes !== memoryBytes) {
      memoryBytes = bytes;
      onMemory(bytes);
    }
  };
  const M = await createLepara({
    ...(wasmBinary && { wasmBinary }),
    ...(wasmUrl && { locateFile: () => String(wasmUrl) }),
    print: (line) => {
      stdout.push(line);
      onStdout?.(line);
      reportMemory();
    },
    printErr: (line) => {
      stderr.push(line);
      onStderr?.(line);
      reportMemory();
    },
    preRun: [
      (m) => {
        // The flang runtime wraps list-directed records at 80 columns;
        // gfortran does not wrap. Raise the record length to 100 000.
        m.ENV['FORT_FMT_RECL'] = '100000';
        module = m;
        reportMemory();
      },
    ],
  });

  const fs = M.FS;
  for (const [dir] of OUTPUT_DIRS) fs.mkdir(dir);
  fs.chdir(CWD);
  for (const [name, bytes] of inputs) fs.writeFile(name, bytes);

  onRun?.();
  const code = M.callMain([INPUT]) ?? 0;
  reportMemory();

  // Every file the run created or changed, inputs left as they were excluded.
  const outputs: EngineFile[] = [];
  const collect = (dir: string, prefix: string): void => {
    for (const name of fs.readdir(dir).sort()) {
      if (name === '.' || name === '..') continue;
      const path = `${dir}/${name}`;
      if (fs.isDir(fs.stat(path).mode)) {
        collect(path, `${prefix}${name}/`);
        continue;
      }
      const bytes = fs.readFile(path);
      const input = dir === CWD ? inputs.get(name) : undefined;
      if (!input || !sameBytes(input, bytes)) outputs.push({ name: `${prefix}${name}`, bytes });
    }
  };
  for (const [dir, prefix] of OUTPUT_DIRS) collect(dir, prefix);

  const text = (lines: string[]) => (lines.length ? `${lines.join('\n')}\n` : '');
  return { code, files: outputs, stdout: text(stdout), stderr: text(stderr) };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
