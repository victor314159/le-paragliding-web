/// <reference lib="webworker" />

import type { NamedFile } from '../shared/named-file';
import type { ComputeEvent, ComputeRequest } from './compute.protocol';

// The existing Emscripten build is UMD. Keep it intact and load it in a classic
// Worker; locateFile explicitly resolves the WASM next to the engine script.
interface VirtualFS {
  mkdir(path: string): void;
  chdir(path: string): void;
  writeFile(path: string, bytes: Uint8Array): void;
  readFile(path: string): Uint8Array;
  readdir(path: string): string[];
  stat(path: string): { mode: number };
  isDir(mode: number): boolean;
}

interface LeparaModule {
  FS: VirtualFS;
  ENV: Record<string, string>;
  HEAPU8?: Uint8Array;
  callMain(args: string[]): number | undefined;
}

declare function createLepara(options: {
  locateFile: (name: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
  preRun: ((module: LeparaModule) => void)[];
}): Promise<LeparaModule>;

function send(event: ComputeEvent, transfer: Transferable[] = []): void {
  postMessage(event, transfer);
}

// Each Worker runs once. Terminating it releases the full WASM heap, including
// after cancellation, runtime errors, and successful result transfer.
async function compute(data: ComputeRequest): Promise<void> {
  if (data.type !== 'compute') return;
  const stdout: string[] = [];
  const stderr: string[] = [];
  let engine: LeparaModule | undefined;
  let lastMemoryBytes = 0;
  const reportMemory = (): void => {
    const wasmBytes = engine?.HEAPU8?.byteLength;
    if (wasmBytes && wasmBytes !== lastMemoryBytes) {
      lastMemoryBytes = wasmBytes;
      send({ type: 'memory', wasmBytes });
    }
  };
  try {
    send({ type: 'phase', phase: 'loading' });
    const inputNames = new Set(data.files.map((file) => file.name));
    if (!inputNames.has('leparagliding.txt')) throw new Error('Missing leparagliding.txt.');
    for (const name of inputNames) {
      if (/[\\/\0]/.test(name) || name === '.' || name === '..')
        throw new Error(`Invalid input file name: ${name}`);
    }
    const engineUrl = new URL('engine/', data.assetsUrl);
    importScripts(new URL('lepara.js', engineUrl).href);
    const module = await createLepara({
      locateFile: (name) => new URL(name, engineUrl).href,
      print: (text) => {
        stdout.push(text);
        send({ type: 'log', entry: { stream: 'stdout', text } });
        reportMemory();
      },
      printErr: (text) => {
        stderr.push(text);
        send({ type: 'log', entry: { stream: 'stderr', text } });
        reportMemory();
      },
      preRun: [
        (m) => {
          m.ENV['FORT_FMT_RECL'] = '100000';
          engine = m;
          reportMemory();
        },
      ],
    });
    const fs = module.FS;
    for (const path of ['/run', '/stl', '/xflr5']) fs.mkdir(path);
    fs.chdir('/run');
    for (const file of data.files) fs.writeFile(file.name, new Uint8Array(file.bytes));

    send({ type: 'phase', phase: 'running' });
    const started = performance.now();
    // callMain blocks this worker's event loop. Sample through its log
    // callbacks instead of a timer, and report the final size on return.
    const code = module.callMain(['leparagliding.txt']) ?? 0;
    const computeMs = performance.now() - started;
    reportMemory();
    if (code !== 0) throw new Error(`LEparagliding exited with code ${code}.`);

    const files: NamedFile[] = [];
    function collect(directory: string, prefix: string): void {
      for (const name of fs.readdir(directory).sort()) {
        if (name === '.' || name === '..') continue;
        const path = `${directory}/${name}`;
        if (fs.isDir(fs.stat(path).mode)) {
          collect(path, `${prefix}${name}/`);
        } else if (directory !== '/run' || name === 'leparagliding.txt' || !inputNames.has(name)) {
          // Copy out of MEMFS before transferring ownership to the UI thread.
          files.push({ name: `${prefix}${name}`, bytes: new Uint8Array(fs.readFile(path)).buffer });
        }
      }
    }
    collect('/run', '');
    collect('/stl', 'stl/');
    collect('/xflr5', 'xflr5/');
    for (const [name, lines] of [
      ['stdout.log', stdout],
      ['stderr.log', stderr],
    ] as const) {
      const text = lines.length ? `${lines.join('\n')}\n` : '';
      files.push({ name, bytes: new TextEncoder().encode(text).buffer });
    }
    send(
      { type: 'done', files, computeMs },
      files.map((file) => file.bytes),
    );
  } catch (error: unknown) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}

addEventListener(
  'message',
  ({ data }: MessageEvent<ComputeRequest>) => {
    void compute(data);
  },
  { once: true },
);
