// Entry point for Node (package.json "exports"). It runs the browser glue
// (scripts/build-flang-wasm.sh), which cannot fetch a file: URL: lepara.wasm
// is read here.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import createLepara from './lepara.js';
import { runInWorker, type WorkerEvent } from './protocol.js';
import { run } from './run.js';
import type { EngineFile, RunOptions, RunResult, WorkerRunOptions } from './types.js';

export type { EngineFile, RunOptions, RunResult, WorkerRunOptions } from './types.js';

/**
 * Runs LEparagliding on `files`: `leparagliding.txt` plus the airfoil files it
 * names, without folders. Every call uses a fresh engine instance.
 *
 * The run blocks the event loop until it finishes (a few seconds): in a
 * server, use {@link runLeparaglidingInWorker}.
 *
 * Rejects if an input name is invalid, `leparagliding.txt` is missing, or the
 * engine fails to load or crashes.
 */
export async function runLeparagliding(
  files: EngineFile[],
  options: RunOptions = {},
): Promise<RunResult> {
  const { wasmUrl = new URL('lepara.wasm', import.meta.url), ...rest } = options;
  return run(createLepara, files, {
    ...rest,
    wasmBinary: rest.wasmBinary ?? (await readFile(wasmUrl)),
  });
}

/**
 * {@link runLeparagliding} in a new worker_threads Worker, terminated at the
 * end: the event loop stays free and the engine's memory is released. The
 * inputs are copied, not transferred. Abort `options.signal` to cancel the run.
 */
export function runLeparaglidingInWorker(
  files: EngineFile[],
  options: WorkerRunOptions = {},
): Promise<RunResult> {
  const { wasmUrl, wasmBinary } = options;
  // A path: a URL object cannot be posted to the Worker.
  const wasmPath = wasmUrl instanceof URL ? fileURLToPath(wasmUrl) : wasmUrl;
  return runInWorker(
    (events) => {
      const worker = new Worker(new URL('./node-worker.js', import.meta.url));
      worker.on('message', (event: WorkerEvent) => events.message(event));
      worker.on('error', (error: Error) => events.error(error));
      worker.on('messageerror', () =>
        events.error(new Error('Could not read a message of the engine Worker')),
      );
      // Ignored once the run settled: terminating the Worker also exits it.
      worker.on('exit', (code) =>
        events.error(new Error(`The engine Worker exited with code ${code}`)),
      );
      return worker;
    },
    { files, wasmUrl: wasmPath, wasmBinary },
    options,
  );
}
