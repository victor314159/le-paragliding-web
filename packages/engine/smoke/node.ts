// Runs one design through the installed package, on the calling thread and in
// a Worker, and checks the main outputs. pack-engine.sh also type-checks it.
// Usage: node node.ts <design-dir>
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runLeparagliding,
  runLeparaglidingInWorker,
  type EngineFile,
} from '@victor314159/leparagliding-wasm';

const dir = process.argv[2] ?? '';
const files: EngineFile[] = readdirSync(dir).map((name) => ({
  name,
  bytes: readFileSync(join(dir, name)),
}));
const lines: string[] = [];
const result = await runLeparagliding(files, { onStdout: (line) => lines.push(line) });

assert.equal(result.code, 0, result.stderr);
const names = result.files.map((file) => file.name);
for (const name of ['leparagliding.dxf', 'lep-out.txt']) assert.ok(names.includes(name), name);
assert.ok(
  names.some((name) => name.startsWith('stl/')),
  'stl/ outputs',
);
assert.ok(lines.length > 0 && result.stdout === `${lines.join('\n')}\n`, 'stdout');
// No input comes back unchanged.
for (const { name } of files) assert.ok(!names.includes(name) || name === 'leparagliding.txt');

// The Worker returns the same result, and cancels.
assert.deepEqual(await runLeparaglidingInWorker(files), result);
const controller = new AbortController();
const cancelled = runLeparaglidingInWorker(files, { signal: controller.signal });
controller.abort();
await assert.rejects(cancelled, { name: 'AbortError' });

console.log(`NODE SMOKE OK: ${names.length} files`);
