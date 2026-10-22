// Properties over many generated inputs (seeded, so reproducible):
// - any text, however broken, gives a Result: parseLep never throws;
// - a design with any number changed either is refused by writeLep or
//   reads back identical, its numbers included (-0, tiny and huge values).
import { expect, test } from '@playwright/test';
import { parseLep, writeLep, type LepDesign } from '../../packages/format/src/index.ts';
import { DESIGNS, designFiles, ok } from './helpers.ts';

/** mulberry32: a small seeded generator. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const texts = DESIGNS.map((id) => designFiles(`oracle/designs/${id}`).get('leparagliding.txt')!);

test('broken texts give a Result, never an exception', () => {
  const next = random(1);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)];
  const pieces = [
    ' ',
    ',',
    '/',
    '*',
    "'",
    '"',
    '\t',
    '\r',
    '\n',
    '-',
    '.',
    'd',
    'q',
    '3*',
    '1e',
    'x',
  ];
  for (let run = 0; run < 400; run++) {
    let text = pick(texts);
    for (let edit = 0; edit < 1 + Math.floor(next() * 4); edit++) {
      const at = Math.floor(next() * text.length);
      const kind = next();
      if (kind < 0.4) text = text.slice(0, at) + pick(pieces) + text.slice(at);
      else if (kind < 0.7) text = text.slice(0, at) + text.slice(at + 1 + Math.floor(next() * 20));
      else text = text.slice(0, at);
    }
    const result = parseLep(text);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(typeof result.errors[0].line).toBe('number');
      continue;
    }
    const written = writeLep(result.value);
    if (written.ok) expect(ok(parseLep(written.value))).toEqual(result.value);
  }
});

/** The paths of the numbers of an object: ['geometry', 'cells'], … */
function numberPaths(value: unknown, path: (string | number)[] = []): (string | number)[][] {
  if (typeof value === 'number') return [path];
  if (Array.isArray(value)) return value.flatMap((item, k) => numberPaths(item, [...path, k]));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => numberPaths(item, [...path, key]));
  }
  return [];
}

function setPath(object: unknown, path: (string | number)[], value: number): void {
  let target = object as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
  target[path.at(-1)!] = value;
}

test('changed numbers are refused or read back identical', () => {
  const next = random(2);
  const values = [
    0,
    -0,
    1,
    -1,
    2,
    7,
    100,
    0.1,
    -2.5,
    1e-7,
    1e-300,
    5e-324,
    1.5e21,
    1e300,
    1 / 3,
    33.33,
    499,
    501,
  ];
  let written = 0;
  for (const text of texts) {
    const design = ok(parseLep(text));
    const paths = numberPaths(design);
    for (let run = 0; run < 60; run++) {
      const changed = structuredClone<LepDesign>(design);
      for (let edit = 0; edit < 1 + Math.floor(next() * 3); edit++) {
        const value = values[Math.floor(next() * values.length)];
        setPath(changed, paths[Math.floor(next() * paths.length)], value);
      }
      const result = writeLep(changed);
      if (!result.ok) continue;
      written++;
      const back = ok(parseLep(result.value));
      expect(back).toEqual(changed);
      // Every number, -0 included (Object.is).
      const get = (o: unknown, path: (string | number)[]) =>
        path.reduce<unknown>((t, k) => (t as Record<string | number, unknown>)[k], o);
      const differing = numberPaths(changed).filter(
        (path) => !Object.is(get(back, path), get(changed, path)),
      );
      expect(differing).toEqual([]);
    }
  }
  // Enough of them are valid for the property to mean something.
  expect(written).toBeGreaterThan(100);
});
