import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type * as Design from '../../packages/design/src/index.ts';
import type * as Format from '../../packages/format/src/index.ts';
import type * as Preprocessor from '../../packages/preprocessor/src/index.ts';
import { lep } from '../format/helpers';

const BUILD = resolve('build');
test.beforeAll(() => execFileSync('scripts/assemble-design.sh', { stdio: 'inherit' }));

test('compiled package imports its dependencies by name and computes in Node', async () => {
  const load = async <T>(name: string) =>
    (await import(pathToFileURL(`${BUILD}/${name}/index.js`).href)) as T;
  const design = await load<typeof Design>('design');
  const format = await load<typeof Format>('format');
  const preprocessor = await load<typeof Preprocessor>('preprocessor');
  const compiled = readFileSync(`${BUILD}/design/pre-data.js`, 'utf8');
  expect(compiled).toMatch(/from ["']@lepara\/preprocessor["']/);
  expect(readFileSync(`${BUILD}/design/index.d.ts`, 'utf8')).toContain('applyGeometry');

  const parsed = format.parseLep(lep());
  if (!parsed.ok) throw new Error('The design does not parse');
  const result = preprocessor.generateGeometry(design.newPreData(parsed.value));
  if (!result.ok) throw new Error('The new pre-data.txt does not generate');
  const geometry = design.applyGeometry(parsed.value, result.value);
  expect(design.isGeneratedGeometry({ geometry }, result.value)).toBe(true);
});
