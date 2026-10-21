// The worker_threads Worker of runLeparaglidingInWorker (node.ts): one run,
// then node.ts terminates it, which releases the whole WebAssembly memory.
import { parentPort } from 'node:worker_threads';
import { runLeparagliding } from './node.js';
import { serve, type WorkerRequest } from './protocol.js';

parentPort?.once('message', (request: WorkerRequest) => {
  void serve(runLeparagliding, request, (event, transfer) =>
    parentPort?.postMessage(event, transfer),
  );
});
