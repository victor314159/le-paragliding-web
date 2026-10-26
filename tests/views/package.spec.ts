import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type * as Format from '../../packages/format/src/index.ts';
import type * as Views from '../../packages/views/src/index.ts';
import { lep } from '../format/helpers';
import { assemblePackage, importAssembled } from '../helpers';

const BUILD = resolve('build');
test.beforeAll(() => assemblePackage('views'));

test('compiled package draws in Node, typed by @lepara/format', async () => {
  const views = await importAssembled<typeof Views>('views');
  const format = await importAssembled<typeof Format>('format');
  // Only types come from @lepara/format: its declarations import it, not the modules.
  expect(readFileSync(`${BUILD}/views/profile.d.ts`, 'utf8')).toContain("'@lepara/format'");
  expect(readFileSync(`${BUILD}/views/profile.js`, 'utf8')).not.toContain('@lepara/format');
  expect(readFileSync(`${BUILD}/views/wing.js`, 'utf8')).toMatch(/from ["']@lepara\/design["']/);

  const parsed = format.parseLep(lep());
  if (!parsed.ok) throw new Error('The design does not parse');
  const scene = views.SECTION_SCENES.get(11)!.draw({
    design: parsed.value,
    airfoils: new Map(),
    view: 'lines3',
    rib: 0,
    selected: 0,
    active: 0,
    secondary: 0,
    surface: 'upper',
  });
  expect(views.toSvg(scene)).toContain('<title>Suspension lines · 3 levels</title>');
});
