// Entry point for browsers, Workers and bundlers (package.json "exports").
import createLepara from './lepara.js';
import { runInWorker, type WorkerEvent, type WorkerRequest } from './protocol.js';
import { run } from './run.js';
import type { EngineFile, RunOptions, RunResult, WorkerRunOptions } from './types.js';

export type { EngineFile, RunOptions, RunResult, WorkerRunOptions } from './types.js';

/**
 * Runs LEparagliding on `files`: `leparagliding.txt` plus the airfoil files it
 * names, without folders. Every call uses a fresh engine instance.
 *
 * The run blocks the calling thread until it finishes (a few seconds): call it
 * from a Worker, or use {@link runLeparaglidingInWorker}.
 *
 * Rejects if an input name is invalid, `leparagliding.txt` is missing, or the
 * engine fails to load or crashes.
 */
export function runLeparagliding(files: EngineFile[], options?: RunOptions): Promise<RunResult> {
  return run(createLepara, files, options);
}

/**
 * {@link runLeparagliding} in a new module Worker, terminated at the end: the
 * page stays responsive and the engine's memory is released. The inputs are
 * copied, not transferred. Abort `options.signal` to cancel the run.
 */
export function runLeparaglidingInWorker(
  files: EngineFile[],
  options: WorkerRunOptions = {},
): Promise<RunResult> {
  const { wasmUrl, wasmBinary } = options;
  const request: WorkerRequest = {
    files,
    wasmUrl: wasmUrl === undefined ? undefined : new URL(wasmUrl, globalThis.location?.href).href,
    wasmBinary,
  };
  return runInWorker(
    (events) => {
      // Written out in one expression so bundlers find and emit worker.js.
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }: MessageEvent<WorkerEvent>) => events.message(data);
      worker.onerror = (event) => {
        event.preventDefault();
        events.error(
          new Error(`Could not load the engine Worker${event.message ? `: ${event.message}` : ''}`),
        );
      };
      worker.onmessageerror = () =>
        events.error(new Error('Could not read a message of the engine Worker'));
      return worker;
    },
    request,
    options,
  );
}
