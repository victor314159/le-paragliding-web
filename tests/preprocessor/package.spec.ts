import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type * as Preprocessor from '../../packages/preprocessor/src/index.ts';
import { EXAMPLE } from './cases.ts';

const OUT = resolve('build/preprocessor');
test.beforeAll(() => execFileSync('scripts/assemble-preprocessor.sh', { stdio: 'inherit' }));

test('compiled package imports and computes in Node', async () => {
  const module = (await import(pathToFileURL(`${OUT}/index.js`).href)) as typeof Preprocessor;
  expect(module.generateGeometry(EXAMPLE).ok).toBe(true);
  expect(readFileSync(`${OUT}/index.d.ts`, 'utf8')).toContain('generateGeometry');
});

test('compiled package computes in Chromium without platform dependencies', async ({ page }) => {
  await page.route('http://preprocessor.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/')
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>preprocessor</title>',
      });
    else
      await route.fulfill({ contentType: 'text/javascript', body: readFileSync(`${OUT}${path}`) });
  });
  await page.goto('http://preprocessor.test/');
  const result = await page.evaluate(async (input) => {
    const module = (await import(`${location.origin}/index.js`)) as typeof Preprocessor;
    const text = module.writePreData(input);
    const parsed = text.ok && module.parsePreData(text.value);
    return parsed && parsed.ok && module.generateGeometry(parsed.value);
  }, EXAMPLE);
  expect(result && result.ok && result.value.ribs.length).toBe(26);
});
