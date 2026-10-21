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
import type { ComputeEvent, ComputeRequest, ComputeStatus, LogEntry } from './compute.protocol';

/** A generated file, served to the page through an object URL. */
export interface ResultFile {
  name: string;
  size: number;
  url: string;
}

/** Runs LEparagliding on the current input files, one Worker per calculation. */
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
  private worker?: Worker;
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

    try {
      if (typeof Worker === 'undefined')
        throw new Error('This browser does not support Web Workers.');
      const worker = new Worker(new URL('./compute.worker', import.meta.url), { type: 'classic' });
      this.worker = worker;
      const started = performance.now();
      this.timer = setInterval(() => this.elapsedMs.set(performance.now() - started), 100);
      worker.onmessage = ({ data }: MessageEvent<ComputeEvent>) => {
        if (this.worker !== worker) return;
        switch (data.type) {
          case 'phase':
            this.status.set(data.phase);
            break;
          case 'memory':
            this.wasmMemoryBytes.set(data.wasmBytes);
            break;
          case 'log':
            this.logs.update((logs) => [...logs, data.entry]);
            break;
          case 'done':
            this.rawFiles = data.files;
            this.files.set(
              data.files.map((file) => ({
                name: file.name,
                size: file.bytes.byteLength,
                url: URL.createObjectURL(
                  new Blob([file.bytes], { type: 'application/octet-stream' }),
                ),
              })),
            );
            this.computeMs.set(data.computeMs);
            this.elapsedMs.set(performance.now() - started);
            this.status.set('done');
            this.stopWorker();
            break;
          case 'error':
            this.fail(data.message);
            break;
        }
      };
      worker.onerror = (event) => {
        if (this.worker !== worker) return;
        event.preventDefault();
        this.fail(event.message || 'The computation Worker could not start.');
      };
      worker.onmessageerror = () => {
        if (this.worker === worker) this.fail('Could not read the computation result.');
      };
      const request: ComputeRequest = { type: 'compute', files, assetsUrl: document.baseURI };
      worker.postMessage(request);
    } catch (error: unknown) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  cancel(): void {
    if (!this.busy()) return;
    this.stopWorker();
    this.status.set('cancelled');
  }

  /** Bundles every generated file (folders included) into a single .zip download. */
  downloadZip(): Promise<void> {
    return saveZip('lepara-results.zip', this.rawFiles);
  }

  ngOnDestroy(): void {
    this.stopWorker();
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
    this.stopWorker();
    this.error.set(message);
    this.status.set('error');
  }

  private stopWorker(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
    }
    this.worker = undefined;
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
