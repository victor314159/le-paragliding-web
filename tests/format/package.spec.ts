// Criterion 4: scripts/assemble-package.sh builds build/format/ (ES modules
// and declarations), which imports in Node and in Chromium.
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import type * as Format from '../../packages/format/src/index.ts';
import { assemblePackage } from '../helpers';

const OUT = resolve('build/format');
const design = readFileSync('oracle/designs/gnuA7-26/leparagliding.txt', 'utf8');

test.beforeAll(() => {
  assemblePackage('format');
});

test('the package holds ES modules, declarations and its documents', () => {
  for (const file of [
    'index.js',
    'index.d.ts',
    'model.d.ts',
    'package.json',
    'README.md',
    'SPEC.md',
    'LICENSE',
  ]) {
    expect(existsSync(join(OUT, file)), file).toBe(true);
  }
  const manifest = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8')) as {
    type: string;
    exports: Record<string, unknown>;
    dependencies?: unknown;
  };
  expect(manifest.type).toBe('module');
  expect(manifest.dependencies).toBeUndefined();
  // Compiled imports point at .js files.
  expect(readFileSync(join(OUT, 'index.js'), 'utf8')).toMatch(/from ["']\.\/read-design\.js["']/);
});

test('imports in Node', async () => {
  const format = (await import(pathToFileURL(join(OUT, 'index.js')).href)) as typeof Format;
  const parsed = format.parseLep(design);
  expect(parsed.ok && parsed.value.geometry.wingName).toBe('gnuA7-26-test3.23');
});

test('imports in Chromium', async ({ page }) => {
  // The package served from its own origin, as a static site would.
  const origin = 'http://format.test';
  await page.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    if (path === 'index.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>format</title>',
      });
      return;
    }
    const file = join(OUT, path);
    if (!existsSync(file)) {
      await route.fulfill({ status: 404 });
      return;
    }
    const types: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json' };
    await route.fulfill({
      contentType: types[extname(file)] ?? 'text/plain',
      body: readFileSync(file),
    });
  });
  await page.goto(`${origin}/`);
  const result = await page.evaluate(async (text) => {
    const format = (await import(`${location.origin}/index.js`)) as typeof Format;
    const parsed = format.parseLep(text);
    if (!parsed.ok) return parsed.errors.map((e) => e.message).join('\n');
    const written = format.writeLep(parsed.value);
    return written.ok && JSON.stringify(format.parseLep(written.value)) === JSON.stringify(parsed);
  }, design);
  expect(result).toBe(true);
});
