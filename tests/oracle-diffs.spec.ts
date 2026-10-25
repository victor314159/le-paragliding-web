import { expect, test } from '@playwright/test';
import { compareOutputs, sha256, type PinnedDiff } from '../scripts/oracle-lib.ts';

const hash = (text: string) => sha256(Buffer.from(text));
const official = hash('official');
const patched = hash('patched');
const wasm = hash('wasm');
const pin = (from: string, to: string, table: string): PinnedDiff => ({
  from,
  to,
  reason: 'test',
  table,
});
const effects = new Map([['example/lep-out.txt', pin(official, patched, 'effects.tsv')]]);
const wasmDiffs = new Map([['example/lep-out.txt', pin(patched, wasm, 'wasm.tsv')]]);
const reference = new Map([['lep-out.txt', official]]);
const compare = (design: string, actual: string, tables = [effects]) =>
  compareOutputs(design, reference, new Map([['lep-out.txt', actual]]), tables).problems;

test('pinned differences apply in order', () => {
  expect(compare('example', patched)).toEqual([]);
  expect(compare('example', wasm, [effects, wasmDiffs])).toEqual([]);
  expect(compare('example', hash('other'))).toEqual([
    `lep-out.txt: UNEXPECTED CONTENT ${hash('other')}, expected ${patched}`,
  ]);
});

test('a pinned difference to review, or no longer needed, is reported', () => {
  const changed = compareOutputs('example', new Map([['lep-out.txt', hash('new')]]), new Map(), [
    effects,
  ]);
  expect(changed.problems).toEqual([
    'lep-out.txt: its pinned difference no longer applies, review effects.tsv',
  ]);
  expect(compare('example', patched, [effects, wasmDiffs])).toEqual([
    'lep-out.txt: identical again, remove its line from wasm.tsv',
  ]);
  expect(compare('example', official, [effects, wasmDiffs])).toEqual([
    'lep-out.txt: identical again, remove its line from effects.tsv and wasm.tsv',
  ]);
});

test('a pinned difference applies only to its design and file', () => {
  expect(compare('other', official)).toEqual([]);
  const actual = new Map([
    ['lep-out.txt', patched],
    ['lines.txt', official],
  ]);
  const both = new Map([...reference, ['lines.txt', official]]);
  expect(compareOutputs('example', both, actual, [effects]).problems).toEqual([]);
});
