/** A file as raw bytes. Output names may contain a folder: `stl/…`, `xflr5/…`. */
export interface EngineFile {
  name: string;
  bytes: Uint8Array;
}

export interface RunOptions {
  /**
   * Where to load `lepara.wasm` from: a URL in browsers, a path or `file:` URL
   * in Node. Defaults to the file shipped with the package.
   */
  wasmUrl?: string | URL;
  /** The bytes of `lepara.wasm`, to skip loading it. */
  wasmBinary?: ArrayBuffer | Uint8Array;
  /** Called for every line the program writes to stdout. */
  onStdout?: (line: string) => void;
  /** Called for every line the program writes to stderr. */
  onStderr?: (line: string) => void;
  /** Called once the engine is loaded, just before the program starts. */
  onRun?: () => void;
  /**
   * Called with the size of the WebAssembly memory, in bytes, whenever it
   * changes. Sampled when the engine starts, on every output line and at the
   * end: the run itself is synchronous.
   */
  onMemory?: (bytes: number) => void;
}

export interface WorkerRunOptions extends RunOptions {
  /** Aborting it terminates the Worker and rejects with `signal.reason`. */
  signal?: AbortSignal;
}

export interface RunResult {
  /** The program's exit code. 0 on success. */
  code: number;
  /** Every file the run created or changed, sorted by folder then name. */
  files: EngineFile[];
  /** Everything written to stdout, one `\n` after every line. */
  stdout: string;
  /** Everything written to stderr, one `\n` after every line. */
  stderr: string;
}
