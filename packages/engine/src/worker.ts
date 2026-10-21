// The module Worker of runLeparaglidingInWorker (index.ts): one run, then
// index.ts terminates it, which releases the whole WebAssembly memory.
import createLepara from './lepara.js';
import { serve, type WorkerEvent, type WorkerRequest } from './protocol.js';
import { run } from './run.js';

// The Worker global scope, without the WebWorker lib (it conflicts with DOM).
const scope = globalThis as unknown as {
  postMessage(event: WorkerEvent, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void,
    options: { once: true },
  ): void;
};

scope.addEventListener(
  'message',
  ({ data }) => {
    void serve(
      (files, options) => run(createLepara, files, options),
      data,
      (event, transfer = []) => scope.postMessage(event, transfer),
    );
  },
  { once: true },
);
