// Fail before building a static site with missing engine or example assets.
import { accessSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = ['build/wasm/lepara.js', 'build/wasm/lepara.wasm', 'oracle/designs/index.json'];
try {
  const designs = JSON.parse(readFileSync(resolve(root, 'oracle/designs/index.json'), 'utf8')) as {
    id: string;
    airfoils: string[];
  }[];
  for (const { id, airfoils } of designs) {
    for (const name of ['leparagliding.txt', ...airfoils])
      required.push(`oracle/designs/${id}/${name}`);
  }
} catch {
  // Reported below as a missing index.
}
for (const name of required) {
  try {
    accessSync(resolve(root, name));
  } catch {
    console.error(`Missing ${name}. See the build steps in README.md.`);
    process.exit(1);
  }
}
