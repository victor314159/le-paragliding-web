// runLeparaglidingInWorker, both sides: the caller (index.ts with a Web
// Worker, node.ts with worker_threads) and the Worker (worker.ts,
// node-worker.ts).
import type { EngineFile, RunOptions, RunResult, WorkerRunOptions } from './types.js';

export interface WorkerRequest {
  files: EngineFile[];
  /** Absolute in browsers: a relative URL would resolve against the Worker script. */
  wasmUrl?: string;
  wasmBinary?: ArrayBuffer | Uint8Array;
}

export type WorkerEvent =
  | { type: 'stdout' | 'stderr'; line: string }
  | { type: 'run' }
  | { type: 'memory'; bytes: number }
  | { type: 'done'; result: RunResult }
  | { type: 'error'; message: string };

/** A Web Worker or a worker_threads Worker, its events passed to `events`. */
export interface EngineWorker {
  postMessage(request: WorkerRequest): void;
  terminate(): unknown;
}
export interface WorkerEvents {
  message(event: WorkerEvent): void;
  error(error: Error): void;
}

/** Starts a Worker, runs `request` in it and terminates it at the end. */
export function runInWorker(
  start: (events: WorkerEvents) => EngineWorker,
  request: WorkerRequest,
  { signal, onStdout, onStderr, onRun, onMemory }: WorkerRunOptions,
): Promise<RunResult> {
  if (signal?.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<RunResult>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      finish();
    };
    const fail = (error: Error) => settle(() => reject(error));
    // An AbortSignal rejects with its reason: an AbortError DOMException by default.
    const abort = () => fail(signal?.reason as Error);
    const worker = start({
      message(event) {
        switch (event.type) {
          case 'stdout':
            return onStdout?.(event.line);
          case 'stderr':
            return onStderr?.(event.line);
          case 'run':
            return onRun?.();
          case 'memory':
            return onMemory?.(event.bytes);
          case 'done':
            return settle(() => resolve(event.result));
          case 'error':
            return fail(new Error(event.message));
        }
      },
      error: fail,
    });
    signal?.addEventListener('abort', abort, { once: true });
    worker.postMessage(request);
  });
}

/** The Worker side: one run, its events sent to the caller. */
export async function serve(
  run: (files: EngineFile[], options: RunOptions) => Promise<RunResult>,
  { files, wasmUrl, wasmBinary }: WorkerRequest,
  send: (event: WorkerEvent, transfer?: ArrayBuffer[]) => void,
): Promise<void> {
  try {
    const result = await run(files, {
      wasmUrl,
      wasmBinary,
      onStdout: (line) => send({ type: 'stdout', line }),
      onStderr: (line) => send({ type: 'stderr', line }),
      onRun: () => send({ type: 'run' }),
      onMemory: (bytes) => send({ type: 'memory', bytes }),
    });
    // Outputs are fresh copies out of the virtual file system: transfer them.
    send(
      { type: 'done', result },
      result.files.map((file) => file.bytes.buffer as ArrayBuffer),
    );
  } catch (error: unknown) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
