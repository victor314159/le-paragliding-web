import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type * as Format from '../../packages/format/src/index.ts';
import type * as Geometry from '../../packages/geometry/src/index.ts';
import { lep } from '../format/helpers';
import { assemblePackage, importAssembled } from '../helpers';

const BUILD = resolve('build');
test.beforeAll(() => assemblePackage('geometry'));

test('compiled package places a design in Node, typed by @lepara/format', async () => {
  const geometry = await importAssembled<typeof Geometry>('geometry');
  const format = await importAssembled<typeof Format>('format');
  expect(readFileSync(`${BUILD}/geometry/fortran/ribs.d.ts`, 'utf8')).toContain("'@lepara/format'");
  expect(readFileSync(`${BUILD}/geometry/fortran/ribs.js`, 'utf8')).not.toContain('@lepara/format');

  const parsed = format.parseLep(lep());
  if (!parsed.ok) throw new Error('The design does not parse');
  expect(geometry.karabiner(parsed.value)?.every(Number.isFinite)).toBe(true);
  expect(geometry.ribPoint(parsed.value, 0, [0, 0])?.every(Number.isFinite)).toBe(true);
});

test('published subpaths resolve named functions and package every nested module', () => {
  const script = `
 import assert from 'node:assert/strict';
 import {balloonedSkin as root} from '@lepara/geometry';
 import {balloonedSkin as legacy,ribPoint as legacyRib} from '@lepara/geometry/fortran-3.29';
 import {balloonedSkin as enhanced,ribPoint as enhancedRib} from '@lepara/geometry/enhanced-v1';
 assert.equal(root,legacy);
 assert.notEqual(enhanced,legacy);
 assert.equal(enhancedRib,legacyRib);
 `;
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: BUILD });
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: `${BUILD}/geometry`,
      encoding: 'utf8',
    }),
  ) as { files: { path: string }[] }[];
  const files = packed[0].files.map((file) => file.path);
  for (const path of [
    'fortran-3.29.js',
    'fortran-3.29.d.ts',
    'enhanced-v1.js',
    'enhanced-v1.d.ts',
    'fortran/ribs.js',
    'enhanced/skin.js',
    'shared/skin-mesh.js',
  ])
    expect(files).toContain(path);
  expect(files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))).toBe(false);
});
