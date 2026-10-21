import {
  computed,
  effect,
  inject,
  Injectable,
  type OnDestroy,
  signal,
  untracked,
} from '@angular/core';
import { DesignFilesService } from '../inputs/design-files.service';
import { saveZip } from '../shared/download';
import type { NamedFile } from '../shared/named-file';
import type { EngineFile, RunResult, WorkerRunOptions } from '../../../packages/engine/src/types';
import type { ComputeStatus, LogEntry } from './compute.protocol';

// The engine is the npm package (packages/engine/), served as built under
// engine/ (angular.json) and imported at run time: the app runs exactly the
// published files. Each calculation runs in its own Worker.
const ENGINE = 'engine/index.js';
// Its API from index.ts, which Angular must not compile: it would bundle the
// package's Worker (even a type-only import of index.ts makes it compile it).
interface Engine {
  runLeparaglidingInWorker(files: EngineFile[], options?: WorkerRunOptions): Promise<RunResult>;
}
const DESIGN = 'leparagliding.txt';

/** A generated file, served to the page through an object URL. */
export interface ResultFile {
  name: string;
  size: number;
  url: string;
}

/** Runs LEparagliding on the current input files, one engine Worker per calculation. */
@Injectable({ providedIn: 'root' })
export class ComputeService implements OnDestroy {
  private readonly inputs = inject(DesignFilesService);
  readonly status = signal<ComputeStatus>('idle');
  readonly logs = signal<LogEntry[]>([]);
  readonly files = signal<ResultFile[]>([]);
  readonly error = signal('');
  readonly elapsedMs = signal(0);
  readonly computeMs = signal(0);
  readonly wasmMemoryBytes = signal<number | null>(null);
  readonly busy = computed(() => this.status() === 'loading' || this.status() === 'running');
  private run?: AbortController;
  private timer?: ReturnType<typeof setInterval>;
  private rawFiles: NamedFile[] = [];

  constructor() {
    // Results and logs belong to the inputs used for their calculation.
    effect(() => {
      this.inputs.sourceId();
      this.inputs.files();
      untracked(() => this.clear());
    });
  }

  /** Runs an independent snapshot of the current input files. */
  start(): void {
    if (this.busy() || !this.inputs.ready()) return;
    const files = this.inputs.files().map(({ name, bytes }) => ({ name, bytes }));
    this.releaseFiles();
    this.logs.set([]);
    this.error.set('');
    this.elapsedMs.set(0);
    this.computeMs.set(0);
    this.wasmMemoryBytes.set(null);
    this.status.set('loading');

    const run = new AbortController();
    this.run = run;
    const started = performance.now();
    this.timer = setInterval(() => this.elapsedMs.set(performance.now() - started), 100);
    void this.compute(files, run, started);
  }

  private async compute(files: NamedFile[], run: AbortController, started: number): Promise<void> {
    const current = () => this.run === run;
    try {
      if (typeof Worker === 'undefined')
        throw new Error('This browser does not support Web Workers.');
      const engineUrl = new URL(ENGINE, document.baseURI).href;
      let engine: Engine;
      try {
        engine = (await import(/* @vite-ignore */ engineUrl)) as Engine;
      } catch (error: unknown) {
        throw new Error(`Could not load the engine (${engineUrl}): ${String(error)}`, {
          cause: error,
        });
      }
      const inputs = files.map(({ name, bytes }) => ({ name, bytes: new Uint8Array(bytes) }));
      const log = (stream: LogEntry['stream']) => (text: string) => {
        if (current()) this.logs.update((logs) => [...logs, { stream, text }]);
      };
      let runStarted = 0;
      const result = await engine.runLeparaglidingInWorker(inputs, {
        signal: run.signal,
        onStdout: log('stdout'),
        onStderr: log('stderr'),
        onMemory: (bytes) => {
          if (current()) this.wasmMemoryBytes.set(bytes);
        },
        onRun: () => {
          if (!current()) return;
          this.status.set('running');
          runStarted = performance.now();
        },
      });
      if (!current()) return;
      const computeMs = performance.now() - runStarted;
      if (result.code !== 0) throw new Error(`LEparagliding exited with code ${result.code}.`);

      // The results start with the design they were computed from (the engine
      // returns it only if the run changed it).
      const outputs = result.files.some((file) => file.name === DESIGN)
        ? result.files
        : [...inputs.filter((file) => file.name === DESIGN), ...result.files];
      const encoder = new TextEncoder();
      this.rawFiles = [
        ...outputs,
        { name: 'stdout.log', bytes: encoder.encode(result.stdout) },
        { name: 'stderr.log', bytes: encoder.encode(result.stderr) },
      ].map(({ name, bytes }) => ({ name, bytes: bytes.slice().buffer }));
      this.files.set(
        this.rawFiles.map((file) => ({
          name: file.name,
          size: file.bytes.byteLength,
          url: URL.createObjectURL(new Blob([file.bytes], { type: 'application/octet-stream' })),
        })),
      );
      this.computeMs.set(computeMs);
      this.elapsedMs.set(performance.now() - started);
      this.status.set('done');
      this.stop();
    } catch (error: unknown) {
      if (current()) this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  cancel(): void {
    if (!this.busy()) return;
    this.stop();
    this.status.set('cancelled');
  }

  /** Bundles every generated file (folders included) into a single .zip download. */
  downloadZip(): Promise<void> {
    return saveZip('lepara-results.zip', this.rawFiles);
  }

  ngOnDestroy(): void {
    this.stop();
    this.releaseFiles();
  }

  private clear(): void {
    if (this.busy()) return;
    this.releaseFiles();
    this.logs.set([]);
    this.error.set('');
    this.elapsedMs.set(0);
    this.computeMs.set(0);
    this.status.set('idle');
  }

  private fail(message: string): void {
    this.stop();
    this.error.set(message);
    this.status.set('error');
  }

  /** Terminates the engine Worker, if one is running. */
  private stop(): void {
    this.run?.abort();
    this.run = undefined;
    this.wasmMemoryBytes.set(null);
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private releaseFiles(): void {
    for (const file of this.files()) URL.revokeObjectURL(file.url);
    this.files.set([]);
    this.rawFiles = [];
  }
}
