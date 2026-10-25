// oracle-lib.ts — Shared by the oracle scripts and tests/oracle.spec.ts.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');

// The design ids of oracle/designs/index.json, in order.
export function designIds(): string[] {
  const index = readFileSync(join(ROOT, 'oracle/designs/index.json'), 'utf8');
  return (JSON.parse(index) as { id: string }[]).map((design) => design.id);
}

// cp -R <src>/. <dest>. Not fs.cpSync: its native copy fails (EACCES) on the
// Docker Desktop bind mount of the checkout.
export function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(join(src, entry.name), join(dest, entry.name));
    else copyFileSync(join(src, entry.name), join(dest, entry.name));
  }
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

// oracle/reference/<design>/MANIFEST.sha256, parsed.
export function referenceManifest(design: string): Map<string, string> {
  return parseManifest(
    readFileSync(join(ROOT, 'oracle/reference', design, 'MANIFEST.sha256'), 'utf8'),
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

// One table of pinned differences: design<TAB>file<TAB>from-sha256<TAB>to-sha256<TAB>reason.
// oracle/patch-effects.tsv goes from the official reference to the patched
// native build, oracle/wasm-known-diffs.tsv from the patched native build to
// the WASM one, and fortran/engine/original/designs/<id>/
// official-outputs.known-diffs.tsv from the outputs published with the official
// binary to the reference. Each line pins both contents: any other fails.
export const PATCH_EFFECTS = join(ROOT, 'oracle/patch-effects.tsv');
export const WASM_DIFFS = join(ROOT, 'oracle/wasm-known-diffs.tsv');

export interface PinnedDiff {
  from: string;
  to: string;
  reason: string;
  table: string; // the .tsv file, relative to ROOT
}

// "<design>/<file>" -> pinned difference.
export function pinnedDiffs(file: string): ReadonlyMap<string, PinnedDiff> {
  const result = new Map<string, PinnedDiff>();
  for (const [design, name, from, to, reason] of knownDiffs(file, 5)) {
    const key = `${design}/${name}`;
    if (
      result.has(key) ||
      !reason.trim() ||
      !/^[a-f0-9]{64}$/.test(from) ||
      !/^[a-f0-9]{64}$/.test(to) ||
      from === to
    )
      throw new Error(`${file}: invalid or duplicate line for ${key}`);
    result.set(key, { from, to, reason, table: relative(ROOT, file) });
  }
  return result;
}

// Compares <actual>, the sha256 of a design's outputs, with <before> changed
// by <tables> in order (a difference starts from the result of the previous
// tables). Returns one message per problem, and the differences that applied.
// A file of <actual> absent from <before> is a problem unless <allowExtra>.
export function compareOutputs(
  design: string,
  before: ReadonlyMap<string, string>,
  actual: ReadonlyMap<string, string>,
  tables: readonly ReadonlyMap<string, PinnedDiff>[],
  allowExtra = false,
): { problems: string[]; pinned: PinnedDiff[] } {
  const problems: string[] = [];
  const pinned: PinnedDiff[] = [];
  for (const [name, hash] of before) {
    let expected = hash;
    let review: PinnedDiff | undefined;
    const applied: PinnedDiff[] = [];
    for (const table of tables) {
      const diff = table.get(`${design}/${name}`);
      if (!diff) continue;
      if (diff.from !== expected) {
        review = diff;
        break;
      }
      applied.push(diff);
      expected = diff.to;
    }
    const got = actual.get(name);
    // The content before one of the applied differences: from the last one,
    // that line is no longer needed; from an earlier one, the later lines too.
    const undone = applied.findIndex((diff) => diff.from === got);
    if (review) {
      problems.push(`${name}: its pinned difference no longer applies, review ${review.table}`);
    } else if (got === undefined) {
      problems.push(`${name}: MISSING`);
    } else if (got === expected) {
      pinned.push(...applied);
    } else if (undone >= 0) {
      const tables = applied.slice(undone).map((diff) => diff.table);
      problems.push(`${name}: identical again, remove its line from ${tables.join(' and ')}`);
    } else {
      problems.push(`${name}: UNEXPECTED CONTENT ${got}, expected ${expected}`);
    }
  }
  if (!allowExtra) {
    for (const name of actual.keys()) {
      if (!before.has(name)) problems.push(`${name}: NOT IN THE REFERENCE`);
    }
  }
  return { problems, pinned };
}

// The lines of <diffs> whose file is not in <manifest>(design) (by default the
// reference of a design of oracle/designs/): they must be removed.
export function stalePinned(
  diffs: ReadonlyMap<string, PinnedDiff>,
  manifest = (design: string) =>
    designIds().includes(design) ? referenceManifest(design) : undefined,
): string[] {
  return [...diffs.keys()].filter((key) => {
    const [design, ...rest] = key.split('/');
    return !manifest(design)?.has(rest.join('/'));
  });
}
