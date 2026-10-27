# @victor314159/leparagliding-wasm

[LEparagliding](https://www.laboratoridenvol.com/leparagliding/leparagliding.en.html)
3.29, the paraglider design program by Pere Casellas, compiled to WebAssembly.
It runs in Node and in browsers, with no native binary and no server.

This is an **unofficial port**, not affiliated with the author. The source is
the official Fortran release, with [a few fixes][patches], compiled with flang.
Its outputs are checked byte for byte against the program compiled natively
with gfortran, on 8 example designs. The only differences are 3 STL/SCAD files
of one design where a coordinate prints as `-0.000` instead of `0.000`.

It powers <https://victor314159.github.io/le-paragliding-web/>.

## Safety disclaimer

This package is an experimental port of LEparagliding. Errors may arise from
the original software, the port, or the input data.

The results do not constitute a safety assessment or airworthiness
certification. They must not be used as the sole basis for building or flying a
wing. Any real-world use requires independent verification and appropriate
testing by qualified individuals.

Paragliding is inherently dangerous. Designing, building, testing or flying a
wing, even one built from correct results, can cause property damage, serious
injury or death. You do so at your own risk.

The software is provided without warranty, to the extent permitted by
applicable law. See the GNU GPL v3 license.

## Install

```sh
npm install @victor314159/leparagliding-wasm
```

It's an ES module with TypeScript types. It needs Node 20 or later, or a
browser with WebAssembly and module Workers.

## Usage

In a browser, `runLeparaglidingInWorker` runs the engine in a new Worker, so
the page stays responsive:

```js
import { runLeparaglidingInWorker } from '@victor314159/leparagliding-wasm';

const result = await runLeparaglidingInWorker([
  { name: 'leparagliding.txt', bytes: designBytes },
  { name: 'gnua.txt', bytes: airfoilBytes },
]);

if (result.code !== 0) throw new Error(result.stderr);
for (const file of result.files) {
  console.log(file.name, file.bytes.byteLength); // 'leparagliding.dxf', 'stl/…', …
}
```

The inputs are `leparagliding.txt` and the airfoil files it names, as
`Uint8Array`s. The result holds every file the run created or changed (names
may start with `stl/` or `xflr5/`), the program's stdout and stderr, and its
exit code.

`runLeparagliding` takes the same arguments and runs the engine on the calling
thread. The run takes a few seconds and blocks that thread until it ends: use
it in scripts, or in a Worker of your own.

### Node

```js
import { readFile } from 'node:fs/promises';
import { runLeparagliding } from '@victor314159/leparagliding-wasm';

const bytes = await readFile('leparagliding.txt');
const result = await runLeparagliding([{ name: 'leparagliding.txt', bytes }, …]);
```

A Node `Buffer` is a `Uint8Array`, so it can be passed as is. In a server, use
`runLeparaglidingInWorker`: it runs the engine in a `worker_threads` Worker, so
the event loop stays free. Each run takes about 1.3 GiB: limit how many run at
once.

### Cancelling

```js
const controller = new AbortController();
const result = runLeparaglidingInWorker(files, { signal: controller.signal });
controller.abort(); // terminates the Worker; result rejects with an AbortError
```

### Bundlers

The package loads `worker.js` and `lepara.wasm` (about 1.2 MB) with
`new URL(…, import.meta.url)`. Vite, webpack 5 and Parcel follow it and copy
both files into the build. With other bundlers (esbuild, Rollup without a
plugin), call `runLeparagliding` from your own Worker and serve
`@victor314159/leparagliding-wasm/lepara.wasm` yourself:

```js
await runLeparagliding(files, { wasmUrl: '/assets/lepara.wasm' });
```

### Options

| Option            | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `onStdout(line)`  | Called for every line written to stdout.                                        |
| `onStderr(line)`  | Called for every line written to stderr.                                        |
| `onRun()`         | Called once the engine is loaded, just before the program starts.               |
| `onMemory(bytes)` | Size of the WebAssembly memory, when it changes (sampled on every output line). |
| `wasmUrl`         | Where to load `lepara.wasm` from: a URL, or in Node a path.                     |
| `wasmBinary`      | The bytes of `lepara.wasm`, to skip loading it.                                 |
| `signal`          | `runLeparaglidingInWorker` only: an `AbortSignal` that cancels the run.         |

## Limits

- **Memory.** Each run starts with about 1.3 GiB of WebAssembly memory, most
  of it static data and a 512 MiB stack. Node and desktop browsers handle
  it, but it can fail on mobile.
- **Blocking.** The program runs synchronously. `runLeparagliding` blocks the
  calling thread until it ends, and can't be cancelled.
- **One run per engine.** The program keeps state between runs, so every call
  creates a fresh engine. `runLeparaglidingInWorker` also terminates its
  Worker at the end, which releases the memory.

## License

GPL-3.0-only, like LEparagliding. If you bundle this package into an
application you distribute, the GPL applies to that application.

The corresponding source (the official release, the patches and the build
scripts) is at <https://github.com/victor314159/le-paragliding-web>.

LEparagliding is © Pere Casellas, [Laboratori d'envol](https://www.laboratoridenvol.com/).

[patches]: https://github.com/victor314159/le-paragliding-web/blob/main/fortran/engine/patches/README.md
