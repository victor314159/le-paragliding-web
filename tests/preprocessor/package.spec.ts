import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type * as Preprocessor from '../../packages/preprocessor/src/index.ts';
import { assemblePackage, importAssembled } from '../helpers';
import { EXAMPLE } from './cases.ts';

const OUT = resolve('build/preprocessor');
test.beforeAll(() => assemblePackage('preprocessor'));

test('compiled package imports and computes in Node', async () => {
  const module = await importAssembled<typeof Preprocessor>('preprocessor');
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
