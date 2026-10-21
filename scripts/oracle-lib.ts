// oracle-lib.ts — Shared by run-oracle.ts, check-wasm-oracle.ts and
// tests/oracle.spec.ts.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

// The design ids of oracle/designs/index.json, in order.
export function designIds(): string[] {
  const index = readFileSync(join(ROOT, 'oracle/designs/index.json'), 'utf8');
  return (JSON.parse(index) as { id: string }[]).map((design) => design.id);
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// "./<path>" of every file of <dir> except MANIFEST.sha256, sorted by bytes
// (C locale).
export function listTree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'MANIFEST.sha256')
    .map((entry) => './' + relative(dir, join(entry.parentPath, entry.name)))
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

// "<sha256>  ./<path>\n" for every file of listTree(<dir>): the
// MANIFEST.sha256 format, as written by sha256sum.
export function hashTree(dir: string): string {
  return listTree(dir)
    .map((name) => `${sha256(readFileSync(join(dir, name)))}  ${name}\n`)
    .join('');
}

// A sha256sum listing (MANIFEST.sha256, official-outputs.sha256) as <path>
// (without "./") -> sha256, in order. Paths may contain spaces.
export function parseManifest(text: string): Map<string, string> {
  return new Map(
    text
      .split('\n')
      .filter((line) => line)
      .map((line) => [line.slice(66).replace(/^\.\//, ''), line.slice(0, 64)]),
  );
}

// The data lines of a known-differences table (tab-separated; blank lines and
// "#" comments skipped), split into fields. Throws, naming each line, if a
// line does not have exactly <fields> fields: tabs are invisible, an editor
// turning one into spaces must not go unnoticed.
export function knownDiffs(file: string, fields: number): string[][] {
  const errors: string[] = [];
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      if (!line || line.startsWith('#')) return [];
      const row = line.split('\t');
      if (row.length === fields) return [row];
      errors.push(`${file}:${index + 1}: ${row.length} tab-separated fields, expected ${fields}`);
      return [];
    });
  if (errors.length) throw new Error(errors.join('\n'));
  return rows;
}
