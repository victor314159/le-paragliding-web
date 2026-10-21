// The two ways a page uses the package: the built-in Worker, and its own
// Worker calling runLeparagliding.
import { runLeparaglidingInWorker, type EngineFile } from '@victor314159/leparagliding-wasm';

// Kept by the bundler: a global, not an export.
(globalThis as { run?: unknown }).run = (files: EngineFile[]) => runLeparaglidingInWorker(files);
new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
