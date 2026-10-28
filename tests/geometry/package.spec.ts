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
  expect(readFileSync(`${BUILD}/geometry/ribs.d.ts`, 'utf8')).toContain("'@lepara/format'");
  expect(readFileSync(`${BUILD}/geometry/ribs.js`, 'utf8')).not.toContain('@lepara/format');

  const parsed = format.parseLep(lep());
  if (!parsed.ok) throw new Error('The design does not parse');
  expect(geometry.karabiner(parsed.value)?.every(Number.isFinite)).toBe(true);
  expect(geometry.ribPoint(parsed.value, 0, [0, 0])?.every(Number.isFinite)).toBe(true);
});
