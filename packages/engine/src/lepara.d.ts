// The Emscripten glue build/wasm/lepara.js (scripts/build-flang-wasm.sh): the
// part run.ts uses. Shipped with the package: run.d.ts refers to it.

/** The Emscripten module: names kept by scripts/closure-externs.js. */
export interface LeparaModule {
  ENV: Record<string, string>;
  FS: {
    mkdir(path: string): void;
    chdir(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array<ArrayBuffer>;
    readdir(path: string): string[];
    stat(path: string): { mode: number };
    isDir(mode: number): boolean;
  };
  HEAPU8?: Uint8Array;
  callMain(args: string[]): number | undefined;
}

export interface LeparaOptions {
  wasmBinary?: ArrayBuffer | Uint8Array;
  locateFile?: (name: string, scriptDirectory: string) => string;
  print: (text: string) => void;
  printErr: (text: string) => void;
  preRun: ((module: LeparaModule) => void)[];
}

export type CreateLepara = (options: LeparaOptions) => Promise<LeparaModule>;

declare const createLepara: CreateLepara;
export default createLepara;
