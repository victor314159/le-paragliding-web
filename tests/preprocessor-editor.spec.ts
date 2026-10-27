import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import {
  GENERATED_COLUMNS,
  SHAPE_DEFAULTS,
  applyGeometry,
  fitShape,
  fromShape,
  newPreData,
  shapeOf,
} from '../packages/design/src/index.ts';
import { parseLep, validateDesign, writeLep } from '../packages/format/src/index.ts';
import {
  ARC_VAULT_DEFAULTS,
  ELLIPSE_VAULT_DEFAULTS,
  PREPROCESSOR_EXAMPLE,
  generateGeometry,
  parsePreData,
  writePreData,
  type PreprocessorInput,
} from '../packages/preprocessor/src/index.ts';
import { toDesign, toForm } from '../src/app/editor/editor-draft.ts';
import {
  applyGeneratedGeometry,
  toExplicitWidths,
  toPreprocessorForm,
  toPreprocessorInput,
} from '../src/app/editor/preprocessor-draft.ts';
import { lep, ok } from './format/helpers';
import { editText } from './helpers';
import { withCells } from './preprocessor/cases.ts';

test('the form keeps the inactive modes and leaves out the zero of a central rib', () => {
  const form = toPreprocessorForm(PREPROCESSOR_EXAMPLE);
  expect(toPreprocessorInput(form)).toEqual(PREPROCESSOR_EXAMPLE);
  const ellipse = {
    ...form,
    vault: { ...form.vault, mode: 1, a: 450 },
    distribution: { ...form.distribution, mode: 2, coefficient: 0.35 },
  };
  expect(toPreprocessorInput(ellipse).vault).toEqual({ ...ELLIPSE_VAULT_DEFAULTS, a: 450 });
  expect(toPreprocessorInput(ellipse).distribution).toEqual({
    mode: 2,
    cells: 50,
    coefficient: 0.35,
  });
  expect(toPreprocessorInput({ ...ellipse, vault: { ...ellipse.vault, mode: 2 } }).vault).toEqual(
    ARC_VAULT_DEFAULTS,
  );
  for (const widths of [
    [0, 30, 25, 20],
    [35, 30, 25, 20],
  ]) {
    const input: PreprocessorInput = { ...PREPROCESSOR_EXAMPLE, distribution: { mode: 4, widths } };
    const explicit = toPreprocessorForm(input);
    expect(explicit.distribution.widths).not.toContain(0);
    expect(toPreprocessorInput(explicit)).toEqual(input);
    expect(ok(parsePreData(ok(writePreData(toPreprocessorInput(explicit)))))).toEqual(input);
  }
});

test('explicit widths start from the cell count of the previous mode', () => {
  const form = toPreprocessorForm(withCells(50));
  expect(toExplicitWidths(form)).toBe(form);
  for (const cells of [44, 45]) {
    const { distribution, ...rest } = toExplicitWidths({
      ...form,
      distribution: { ...form.distribution, cells },
    });
    const input = toPreprocessorInput({ ...rest, distribution: { ...distribution, mode: 4 } });
    expect(ok(generateGeometry(input)).cells).toBe(cells);
  }
  const unparsed = { ...form, distribution: { ...form.distribution, cells: null } };
  expect(toExplicitWidths(unparsed)).toBe(unparsed);
});

test('applying in the form keeps the other sections and the columns the table does not use', () => {
  const design = toForm(ok(parseLep(lep())));
  const original = structuredClone(design);
  const result = ok(generateGeometry(withCells(design.geometry.cells!)));
  const applied = applyGeneratedGeometry(design, result);
  expect(design).toEqual(original);
  expect(applied.lines).toBe(design.lines);
  expect(toDesign(applied).geometry).toEqual(applyGeometry(toDesign(design), result));
  // A nine-column table keeps the rotations the form holds, and new rows get none.
  const nine = {
    ...design,
    geometry: {
      ...design.geometry,
      ribColumns: 9,
      ribs: design.geometry.ribs.map((rib) => ({ ...rib, rotZ: 5 })),
    },
  };
  const larger = applyGeneratedGeometry(nine, ok(generateGeometry(withCells(52))));
  expect(larger.geometry.ribs[0].rotZ).toBe(5);
  expect(larger.geometry.ribs.at(-1)).toMatchObject({ rotZ: 0, rotZPosition: 0 });
  const errors = validateDesign(toDesign(larger)).filter(
    (d) => d.section === 1 && d.severity === 'error',
  );
  expect(errors).toEqual([]);
});

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const HALF_SPAN = 'Flat half span · xm (cm)';
const mode = (page: Page, name: 'Auto' | 'Manual') =>
  page.getByRole('radio', { name, exact: true });

async function navigate(page: Page, name: string | RegExp, blocked = false): Promise<void> {
  const menu = button(page, 'Sections and airfoils');
  if (await menu.isVisible()) await menu.click();
  const target = page
    .getByRole('navigation')
    .getByRole('button', { name, exact: typeof name === 'string' });
  await target.click();
  if (!blocked) await expect(target).toHaveAttribute('aria-current', 'true');
}

/** Opens the editor on the page of pre-data.txt. */
async function open(page: Page): Promise<void> {
  await button(page, 'Edit parameters of leparagliding.txt').click();
  await navigate(page, /^pre-data\.txt/);
}

const SYNCED = 'Geometry in sync with section 1';
const DIFFERS = 'Geometry differs from section 1';
/** The value shown for an Auto setting. */
const setting = (page: Page, key: string) => page.locator(`#shape-${key} + output`);

/** Clicks `action`, then `confirm` in the dialog comparing section 1 with what it becomes. */
async function confirmed(
  page: Page,
  action: 'Apply to section 1' | 'Fit to section 1',
  confirm: 'Apply' | 'Fit',
) {
  await button(page, action).click();
  const dialog = page.getByRole('dialog', { name: `${action}?` });
  await dialog.getByRole('button', { name: confirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Applies the parameters to section 1: its rib table becomes the one they generate. */
async function apply(page: Page): Promise<void> {
  await confirmed(page, 'Apply to section 1', 'Apply');
  await expect(page.getByText(SYNCED)).toBeVisible();
}

const note = (page: Page, note: string) =>
  page.getByRole('navigation').getByRole('button', { name: new RegExp(`^pre-data\\.txt ${note}`) });

async function values(page: Page, name: string): Promise<string[]> {
  await field(page, name).first().waitFor({ state: 'attached' });
  return field(page, name).evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value),
  );
}

async function download(page: Page, name: string): Promise<string> {
  await button(page, `Actions for ${name}`).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  // pre-data.txt is downloaded after a warning.
  if (name === 'pre-data.txt')
    await page.getByRole('dialog').getByRole('button', { name: 'Download' }).click();
  return readFile(await (await downloading).path(), 'utf8');
}

async function importFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  const importing = page.waitForEvent('filechooser');
  await button(page, 'Import files').click();
  await (await importing).setFiles({ name, mimeType: 'application/octet-stream', buffer });
  await expect(button(page, 'Import files')).toBeEnabled();
}

async function importPreData(page: Page, input: PreprocessorInput): Promise<string> {
  const text = ok(writePreData(input));
  await importFile(page, 'pre-data.txt', Buffer.from(text));
  await expect(button(page, 'Actions for pre-data.txt')).toBeVisible();
  return text;
}

async function choose(page: Page, name: string, value: string): Promise<void> {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: new RegExp(`^${value} ·`) }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function exportZip(page: Page): Promise<JSZip> {
  const zipping = page.waitForEvent('download');
  await button(page, 'Export all (.zip)').click();
  // With pre-data.txt, the export asks first.
  await page.getByRole('dialog').getByRole('button', { name: 'Export' }).click();
  return JSZip.loadAsync(await readFile(await (await zipping).path()));
}

test('without pre-data.txt, it is created in Auto with the default shape without changing the table', async ({
  page,
}) => {
  await page.goto('/');
  const original = await download(page, 'leparagliding.txt');
  const { geometry } = ok(parseLep(original));
  const created = newPreData({ geometry });
  expect(created).toEqual({
    ...fromShape(SHAPE_DEFAULTS, PREPROCESSOR_EXAMPLE),
    name: geometry.wingName.trim() || PREPROCESSOR_EXAMPLE.name,
  });
  await open(page);
  await expect(note(page, 'Not created')).toBeVisible();
  await expect(mode(page, 'Auto')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^Generated / })).toHaveCount(0);
  await button(page, 'Create pre-data.txt').click();
  await expect(mode(page, 'Auto')).toBeChecked();
  await expect(page.getByText('it replaces')).toHaveCount(0);
  await expect(page.getByRole('img', { name: /^Generated / })).toBeVisible();
  await expect(note(page, 'Out of sync · Created')).toBeVisible();
  await mode(page, 'Manual').click();
  await expect(field(page, HALF_SPAN)).toHaveValue(String(created.halfSpan));
  await field(page, HALF_SPAN).fill('550');
  await button(page, 'Discard pre-data.txt').click();
  await expect(note(page, 'Not created')).toBeVisible();
  await expect(page.getByText('· Modified')).toHaveCount(0);
  await button(page, 'Create pre-data.txt').click();
  await expect(mode(page, 'Auto')).toBeChecked();
  await mode(page, 'Manual').click();
  await expect(field(page, HALF_SPAN)).toHaveValue(String(created.halfSpan));
  await button(page, 'Cancel').click();
  await button(page, 'Discard changes').click();
  await expect(button(page, 'Actions for pre-data.txt')).toHaveCount(0);

  await open(page);
  await button(page, 'Create pre-data.txt').click();
  await button(page, 'Save').click();
  expect(await download(page, 'leparagliding.txt')).toBe(original);
  expect(ok(parsePreData(await download(page, 'pre-data.txt')))).toEqual(created);
  // Created by the editor: removed from the list, not restored.
  const files = page.getByRole('list', { name: 'Input files' });
  await expect(files.getByText('Created', { exact: true })).toBeVisible();
  await button(page, 'Edit parameters of pre-data.txt').click();
  await expect(note(page, 'Out of sync$')).toBeVisible();
  await expect(page.getByText('· Modified')).toHaveCount(0);
  await button(page, 'Cancel').click();
  await button(page, 'Actions for pre-data.txt').click();
  await expect(page.getByRole('menuitem', { name: 'Restore original' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Remove file' }).click();
  await expect(button(page, 'Actions for pre-data.txt')).toHaveCount(0);
});

test('applying the parameters replaces the table, which stays editable and is recognized', async ({
  page,
}) => {
  await page.goto('/');
  const original = await download(page, 'leparagliding.txt');
  const preData = await importPreData(page, PREPROCESSOR_EXAMPLE);
  await open(page);
  await expect(note(page, 'Out of sync$')).toBeVisible();
  await expect(page.getByRole('img', { name: /^Generated / })).toBeVisible();
  await apply(page);
  await expect(note(page, 'In sync$')).toBeVisible();
  await navigate(page, '1 · Geometry');
  await expect(
    page.getByText(
      'The cells and rib positions are those the parameters of pre-data.txt generate.',
    ),
  ).toBeVisible();
  await expect(field(page, 'Cells')).toHaveJSProperty('readOnly', false);
  await expect(button(page, 'Add rib')).toBeVisible();
  await button(page, 'Save').click();
  expect(await download(page, 'leparagliding.txt')).not.toBe(original);
  expect(await download(page, 'pre-data.txt')).toBe(preData);

  await open(page);
  await expect(note(page, 'In sync$')).toBeVisible();
  await expect(page.getByText('· Modified')).toHaveCount(0);
  await field(page, HALF_SPAN).fill('550');
  await expect(note(page, 'Out of sync · Modified')).toBeVisible();
  await navigate(page, '1 · Geometry');
  await expect(field(page, 'Planform X (cm)').last()).not.toHaveValue('550');
  await button(page, 'Edit pre-data.txt').click();
  await apply(page);
  await navigate(page, '1 · Geometry');
  await expect(field(page, 'Planform X (cm)').last()).toHaveValue('550');
  await field(page, 'Planform X (cm)').last().fill('551');
  await expect(
    page.getByText('The cells and rib positions differ from', { exact: false }),
  ).toBeVisible();
  await button(page, 'Save').click();
  expect(ok(parseLep(await download(page, 'leparagliding.txt'))).geometry.ribs.at(-1)!.x).toBe(551);
  expect(ok(parsePreData(await download(page, 'pre-data.txt'))).halfSpan).toBe(550);
  await open(page);
  await expect(note(page, 'Out of sync$')).toBeVisible();
});

test('applying keeps the other columns; invalid parameters cannot be applied and block Save', async ({
  page,
}) => {
  await page.goto('/');
  const source = ok(parseLep(await download(page, 'leparagliding.txt')));
  const design = {
    ...source,
    geometry: {
      ...source.geometry,
      ribColumns: 11 as const,
      ribs: source.geometry.ribs.map((r, i) => ({
        ...r,
        rotationPoint: 27 + i / 10,
        washin: i / 10,
        rotZ: i / 20,
        rotZPosition: 31,
      })),
    },
  };
  await editText(page, 'leparagliding.txt');
  await field(page, 'Content of leparagliding.txt').fill(ok(writeLep(design)));
  await button(page, 'Apply changes').click();
  await importPreData(page, withCells(design.geometry.cells));
  await open(page);
  await apply(page);
  await navigate(page, '1 · Geometry');
  const generated = await values(page, 'Planform X (cm)');
  await navigate(page, /^pre-data\.txt/);
  await field(page, HALF_SPAN).fill('');
  await expect(button(page, 'Apply to section 1')).toBeDisabled();
  await expect(button(page, 'Save')).toBeDisabled();
  await navigate(page, '1 · Geometry');
  expect(await values(page, 'Planform X (cm)')).toEqual(generated);
  await button(page, 'Show').click();
  await expect(field(page, HALF_SPAN)).toBeFocused();
  await field(page, HALF_SPAN).fill('abc');
  await navigate(page, '1 · Geometry', true);
  await expect(field(page, HALF_SPAN)).toBeFocused();
  await field(page, HALF_SPAN).fill('535');
  await apply(page);
  await button(page, 'Save').click();

  const input = { ...withCells(design.geometry.cells), halfSpan: 535 };
  expect(ok(parsePreData(await download(page, 'pre-data.txt')))).toEqual(input);
  const saved = ok(parseLep(await download(page, 'leparagliding.txt')));
  const result = ok(generateGeometry(input));
  for (const [i, rib] of saved.geometry.ribs.entries()) {
    for (const key of GENERATED_COLUMNS)
      expect(Math.abs(rib[key] - result.ribs[i][key])).toBeLessThanOrEqual(0.005 + 1e-9);
    const { rotationPoint, washin, rotZ, rotZPosition } = design.geometry.ribs[i];
    expect(rib).toMatchObject({ rotationPoint, washin, rotZ, rotZPosition });
  }
  expect({ ...saved, geometry: { ...saved.geometry, ribs: design.geometry.ribs } }).toEqual(design);
});

test('an unreadable pre-data.txt is edited as text and never replaced', async ({ page }) => {
  await page.goto('/');
  await importFile(page, 'pre-data.txt', Buffer.from('broken parameters'));
  await expect(button(page, 'Edit parameters of pre-data.txt')).toBeDisabled();
  await open(page);
  await expect(note(page, 'Not read')).toBeVisible();
  await expect(
    page.getByText('pre-data.txt could not be read: correct it as text, or import it again.'),
  ).toBeVisible();
  await expect(button(page, 'Create pre-data.txt')).toHaveCount(0);
  await button(page, 'Save').click();
  expect(await download(page, 'pre-data.txt')).toBe('broken parameters');
  await open(page);
  await button(page, 'Edit text').click();
  await expect(field(page, 'Content of pre-data.txt')).toHaveValue('broken parameters');
});

test('invalid parameters are read and corrected in the form', async ({ page }) => {
  await page.goto('/');
  const text = ok(writePreData(PREPROCESSOR_EXAMPLE)).replace('ex1= 2', 'ex1= 0');
  await importFile(page, 'pre-data.txt', Buffer.from(text));
  await expect(button(page, 'Edit parameters of pre-data.txt')).toBeEnabled();
  await open(page);
  await expect(note(page, 'Invalid parameters · 1 error')).toBeVisible();
  await expect(field(page, 'First correction exponent · ex1')).toHaveValue('0');
  await field(page, 'First correction exponent · ex1').fill('2');
  await expect(note(page, '(In|Out of) sync · Modified$')).toBeVisible();
  await button(page, 'Save').click();
  expect(ok(parsePreData(await download(page, 'pre-data.txt')))).toEqual(PREPROCESSOR_EXAMPLE);
});

test('an exported ZIP opens with the table in sync', async ({ page }) => {
  await page.goto('/');
  await importPreData(page, PREPROCESSOR_EXAMPLE);
  await open(page);
  await apply(page);
  await button(page, 'Save').click();
  const zip = await exportZip(page);
  await page.reload();
  await importFile(page, 'project.zip', await zip.generateAsync({ type: 'nodebuffer' }));
  await open(page);
  await expect(note(page, 'In sync$')).toBeVisible();
  await expect(page.getByText('· Modified')).toHaveCount(0);
});

test('vault modes and explicit widths keep their values; Show reaches their errors', async ({
  page,
}) => {
  await page.goto('/');
  await importPreData(page, PREPROCESSOR_EXAMPLE);
  await open(page);
  await choose(page, 'Vault shape', '1');
  await field(page, 'Vault horizontal radius · a1 (cm)').fill('420');
  await choose(page, 'Vault shape', '2');
  await field(page, 'Arc 1 radius (cm)').fill('750');
  await choose(page, 'Vault shape', '1');
  await expect(field(page, 'Vault horizontal radius · a1 (cm)')).toHaveValue('420');
  await choose(page, 'Vault shape', '2');
  await expect(field(page, 'Arc 1 radius (cm)')).toHaveValue('750');
  await button(page, 'Front').click();
  // 26 ribs and the 3 junctions of the arcs.
  await expect(page.locator('app-editor-preview circle')).toHaveCount(29);
  await choose(page, 'Cell distribution', '4');
  await choose(page, 'Wing center', 'cell');
  await field(page, 'Central cell width (cm)').fill('-1');
  await expect(button(page, 'Save')).toBeDisabled();
  await navigate(page, '1 · Geometry');
  await button(page, 'Show').click();
  await expect(field(page, 'Central cell width (cm)')).toBeFocused();
  await field(page, 'Central cell width (cm)').fill('25');
  await choose(page, 'Wing center', 'rib');
  await expect(button(page, 'Save')).toBeEnabled();
});

test('changing the cell count resizes the table; other sections are corrected before saving', async ({
  page,
}) => {
  await page.goto('/');
  await editText(page, 'leparagliding.txt');
  await field(page, 'Content of leparagliding.txt').fill(lep());
  await button(page, 'Apply changes').click();
  await importPreData(page, withCells(2));
  await open(page);
  await field(page, 'Cells').fill('4');
  await apply(page);
  await navigate(page, '1 · Geometry');
  await expect(field(page, 'Cells')).toHaveValue('4');
  await expect(field(page, 'Rib count')).toHaveValue('5');
  await expect(field(page, 'Planform X (cm)')).toHaveCount(3);
  await expect(button(page, 'Save')).toBeDisabled();
  await navigate(page, /^2 ·/);
  await button(page, 'Add airfoil row').click();
  await navigate(page, /^3 ·/);
  await button(page, 'Add anchor row').click();
  await expect(button(page, 'Save')).toBeEnabled();
  await button(page, 'Save').click();
  const saved = ok(parseLep(await download(page, 'leparagliding.txt')));
  expect(saved.geometry.cells).toBe(4);
  expect(saved.geometry.ribs).toHaveLength(3);
  expect(ok(parsePreData(await download(page, 'pre-data.txt'))).distribution).toEqual({
    mode: 3,
    coefficient: 0.7,
    cells: 4,
  });
});

test('focusing parameters highlights their geometry without changing the view or the draft', async ({
  page,
}) => {
  await page.goto('/');
  await importPreData(page, PREPROCESSOR_EXAMPLE);
  await open(page);
  const preview = page.locator('app-editor-preview');
  await field(page, 'First correction start · x1 (cm)').focus();
  await expect(preview.locator('figcaption')).toContainText('Leading edge correction 1');
  await expect(preview.locator('circle.selected')).toHaveCount(1);
  const highlights = preview.locator('path.highlight');
  await expect(highlights).toHaveCount(2);
  // Each correction stays on its half wing, without a line crossing the center.
  const halves = await highlights.evaluateAll((paths) =>
    paths.map((path) => {
      const box = (path as SVGPathElement).getBBox();
      return { left: box.x, right: box.x + box.width };
    }),
  );
  expect(halves[0].right).toBeLessThan(0);
  expect(halves[1].left).toBeGreaterThan(0);

  // The vault is drawn in Front only: focusing it keeps Planform.
  await field(page, 'Arc 2 radius (cm)').focus();
  await expect(button(page, 'Planform')).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Front').click();
  await field(page, 'Arc 2 radius (cm)').focus();
  await expect(preview.locator('figcaption')).toContainText('Arc 2');
  await expect(highlights).toHaveCount(2);
  await expect(preview.locator('circle.selected')).toHaveCount(2);
  await field(page, 'Arc 1 radius (cm)').focus();
  await expect(preview.locator('figcaption')).toContainText('Arc 1');
  await expect(preview.locator('circle.selected')).toHaveCount(1);
  await field(page, 'Second correction start · x2 (cm)').focus();
  await expect(button(page, 'Front')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('· Modified', { exact: true })).toHaveCount(0);
});

for (const center of ['rib', 'cell'] as const) {
  test(`explicit widths select the same cell in both views, with a central ${center}`, async ({
    page,
  }) => {
    await page.goto('/');
    await importPreData(page, {
      ...PREPROCESSOR_EXAMPLE,
      distribution: { mode: 4, widths: center === 'rib' ? [0, 20, 30, 40] : [20, 30, 40] },
    });
    await open(page);
    const preview = page.locator('app-editor-preview');
    const central = center === 'cell';
    const first = field(page, central ? 'Central cell width (cm)' : 'Cell 1 width (cm)');
    await first.focus();
    await expect(preview.locator('path.cell-selection')).toHaveCount(central ? 1 : 2);
    const label = central ? 'Central cell' : 'Cell 1';
    await expect(preview.locator('figcaption')).toContainText(label);
    await button(page, 'Cells').click();
    await expect(preview.locator('path.highlight')).toHaveCount(1);
    const result = ok(
      generateGeometry({
        ...PREPROCESSOR_EXAMPLE,
        distribution: { mode: 4, widths: central ? [20, 30, 40] : [0, 20, 30, 40] },
      }),
    );
    const width = central ? result.ribs[0].x * 2 : result.ribs[1].x;
    await expect(preview.locator('path.highlight title')).toHaveText(
      `${label} · ${width.toFixed(2)} cm`,
    );
    await field(page, 'Cell 2 width (cm)').focus();
    await expect(preview.locator('figcaption')).toContainText('Cell 2');
    await expect(preview.locator('path.curve title')).toHaveCount(3);
    await button(page, 'Planform').click();
    await expect(preview.locator('path.cell-selection')).toHaveCount(2);
    await expect(preview.locator('figcaption')).toContainText('Cell 2');
    await expect(page.getByText('· Modified', { exact: true })).toHaveCount(0);
  });
}

test('status separates invalid parameters from differences and warns only when applying changes the cell count', async ({
  page,
}) => {
  await page.goto('/');
  const source = ok(parseLep(await download(page, 'leparagliding.txt')));
  await importPreData(page, withCells(source.geometry.cells));
  await open(page);
  const warning = page.getByText(/Applying changes the cell count/);
  await expect(warning).toHaveCount(0);
  await apply(page);
  await field(page, HALF_SPAN).fill('abc');
  await expect(page.getByRole('status').filter({ hasText: 'Invalid parameters' })).toBeVisible();
  await expect(note(page, 'Invalid parameters')).toBeVisible();
  await expect(button(page, 'Apply to section 1')).toBeDisabled();
  await expect(page.getByRole('img', { name: /^Generated / })).toHaveCount(0);
  await field(page, HALF_SPAN).fill('575.5');
  await expect(page.getByText(SYNCED, { exact: true })).toBeVisible();
  await field(page, 'Cells').fill(String(source.geometry.cells + 2));
  const change = `from ${source.geometry.cells} to ${source.geometry.cells + 2}`;
  await expect(warning).toContainText(change);
  await button(page, 'Apply to section 1').click();
  const dialog = page.getByRole('dialog', { name: 'Apply to section 1?' });
  await expect(dialog).toContainText(`The cell count changes ${change}`);
  await expect(
    dialog.getByRole('img', { name: 'Wing planform · section 1 and applied' }),
  ).toBeVisible();
  await expect(dialog.getByRole('row', { name: /^Cells/ })).toHaveText(
    `Cells${source.geometry.cells}${source.geometry.cells + 2}`,
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(warning).toContainText(change);
  await apply(page);
  await expect(warning).toHaveCount(0);
});

test('Auto lists what its shape replaces before tuning, and keeps the inactive modes', async ({
  page,
}) => {
  await page.goto('/');
  await importPreData(page, PREPROCESSOR_EXAMPLE);
  await open(page);
  await expect(mode(page, 'Manual')).toBeChecked();
  await choose(page, 'Vault shape', '1');
  await field(page, 'Vault horizontal radius · a1 (cm)').fill('450');
  await choose(page, 'Vault shape', '2');
  await mode(page, 'Auto').click();
  await expect(
    page.getByText(
      'it replaces the leading edge corrections, the trailing edge correction, and the vault arcs.',
    ),
  ).toBeVisible();
  const taper = page.getByRole('slider', { name: 'Tip chord' });
  await expect(taper).toBeDisabled();
  const dialog = page.getByRole('dialog', { name: 'Replace the parameters?' });
  await button(page, 'Replace with the Auto shape').click();
  await dialog.getByRole('button', { name: 'Keep the parameters' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(taper).toBeDisabled();
  await button(page, 'Replace with the Auto shape').click();
  await dialog.getByRole('button', { name: 'Replace with the Auto shape' }).click();
  await expect(taper).toBeEnabled();
  await taper.press('ArrowRight');
  await expect(page.getByText('it replaces')).toHaveCount(0);
  await mode(page, 'Manual').click();
  await expect(field(page, 'First tip correction · c01 (cm)')).toHaveValue('0');
  await choose(page, 'Vault shape', '1');
  await expect(field(page, 'Vault horizontal radius · a1 (cm)')).toHaveValue('450');
});

test('Fit sets the settings of section 1, and the others to follow its table, in Auto', async ({
  page,
}) => {
  await page.goto('/');
  const { geometry } = ok(parseLep(await download(page, 'leparagliding.txt')));
  const input = newPreData({ geometry });
  const fitted = fitShape(shapeOf(input, ok(generateGeometry(input))), { geometry });
  await open(page);
  await button(page, 'Create pre-data.txt').click();
  await expect(page.getByText(DIFFERS, { exact: true })).toBeVisible();
  await mode(page, 'Manual').click();
  await confirmed(page, 'Fit to section 1', 'Fit');
  await expect(mode(page, 'Auto')).toBeChecked();
  await expect(setting(page, 'cells')).toHaveText(String(fitted.cells));
  await expect(setting(page, 'area')).toHaveText(`${fitted.area.toFixed(1)} m²`);
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  for (const key of [
    'taper',
    'tipCurl',
    'leadingEdgeRoundness',
    'trailingEdgeRoundness',
    'cellUniformity',
  ] as const)
    await expect(setting(page, key)).toHaveText(percent(fitted[key]));
});

test('Fit compares section 1 with the fitted shape, and asks before replacing parameters', async ({
  page,
}) => {
  await page.goto('/');
  await importPreData(page, PREPROCESSOR_EXAMPLE);
  await open(page);
  await expect(mode(page, 'Manual')).toBeChecked();
  await button(page, 'Fit to section 1').click();
  const dialog = page.getByRole('dialog', { name: 'Fit to section 1?' });
  await expect(dialog).toContainText('it replaces the leading edge corrections');
  await dialog.getByRole('radio', { name: 'Front' }).click();
  await expect(
    dialog.getByRole('img', { name: 'Wing front view · section 1 and fitted' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(mode(page, 'Manual')).toBeChecked();
  await expect(field(page, 'First tip correction · c01 (cm)')).not.toHaveValue('0');
  await confirmed(page, 'Fit to section 1', 'Fit');
  await expect(mode(page, 'Auto')).toBeChecked();
  await expect(page.getByText('it replaces')).toHaveCount(0);
  await mode(page, 'Manual').click();
  await expect(field(page, 'First tip correction · c01 (cm)')).toHaveValue('0');
});
