import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { PREPROCESSOR_EXAMPLE, writePreData } from '../packages/preprocessor/src/index.ts';
import { ok } from './format/helpers';
import { acknowledge, editText, openExample } from './helpers';

async function source(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Input source', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

async function importFiles(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import files', exact: true }).click();
  await (await chooser).setFiles(files);
}

async function downloadFile(page: Page, name: string): Promise<Buffer> {
  await page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(name);
  return readFile(await download.path());
}

async function apply(page: Page, text: string): Promise<void> {
  await editText(page, 'leparagliding.txt');
  await page.getByRole('textbox', { name: 'Content of leparagliding.txt', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
}

test('editing, cancelling, switching sources and restoring keep the correct file contents', async ({
  page,
}) => {
  const original = await readFile('oracle/designs/A8/leparagliding.txt');
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Input source', exact: true })).toHaveText(
    'A8 test · 33 cells',
  );
  await editText(page, 'leparagliding.txt');
  const area = page.getByRole('textbox', { name: 'Content of leparagliding.txt', exact: true });
  await area.fill('cancelled edit');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await downloadFile(page, 'leparagliding.txt')).toEqual(original);

  const edited = original.toString().replace('"A8 test"', '"My draft"');
  await apply(page, edited);
  await expect(page.getByText('Modified', { exact: true })).toBeVisible();
  await source(page, 'My files');
  await expect(page.getByTestId('input-file-row')).toHaveCount(0);
  await source(page, 'A8 test · 33 cells');
  expect(await downloadFile(page, 'leparagliding.txt')).toEqual(Buffer.from(edited));
  await page.getByRole('button', { name: 'Actions for leparagliding.txt', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Restore original', exact: true }).click();
  expect(await downloadFile(page, 'leparagliding.txt')).toEqual(original);
  await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
});

test('exported ZIP can be imported again with exact bytes, including untouched CRLF and BOM', async ({
  page,
}) => {
  const main = Buffer.from(
    (await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')).replace(/\r?\n/g, '\r\n'),
  );
  const foil = await readFile('oracle/designs/swoop2/gnuReflex.txt');
  const extra = Buffer.from('\uFEFFextra\r\n1.0 0.0\r\n');
  await page.goto('/');
  await source(page, 'My files');
  await importFiles(page, [
    { name: 'leparagliding.txt', mimeType: 'text/plain', buffer: main },
    { name: 'gnuReflex.txt', mimeType: 'text/plain', buffer: foil },
    { name: 'extra.dat', mimeType: 'text/plain', buffer: extra },
  ]);
  await expect(page.getByTestId('input-file-row')).toHaveCount(3);
  await editText(page, 'leparagliding.txt');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
  expect(await downloadFile(page, 'leparagliding.txt')).toEqual(main);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all (.zip)', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('lepara-inputs.zip');
  const bytes = await readFile(await download.path());
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files).sort()).toEqual([
    'extra.dat',
    'gnuReflex.txt',
    'leparagliding.txt',
  ]);
  expect(await zip.file('leparagliding.txt')!.async('nodebuffer')).toEqual(main);
  expect(await zip.file('extra.dat')!.async('nodebuffer')).toEqual(extra);
  await page.reload();
  await source(page, 'My files');
  await importFiles(page, [
    { name: 'lepara-inputs.zip', mimeType: 'application/zip', buffer: bytes },
  ]);
  await expect(page.getByTestId('input-file-row')).toHaveCount(3);
  expect(await downloadFile(page, 'extra.dat')).toEqual(extra);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('personal inputs use their own airfoil names and results are cleared when engine inputs change', async ({
  page,
}) => {
  const main = Buffer.from(
    (await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8'))
      .replaceAll('gnuReflex.txt', 'personal.txt')
      .replace('"Swoop2"', '"Personal wing"'),
  );
  const foil = await readFile('oracle/designs/swoop2/gnuReflex.txt');
  await page.goto('/');
  await source(page, 'My files');
  await importFiles(page, [{ name: 'leparagliding.txt', mimeType: 'text/plain', buffer: main }]);
  await expect(page.getByRole('alert')).toContainText('personal.txt');
  await page.getByRole('button', { name: 'Safety disclaimer', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Compute design' })).toBeDisabled();
  await importFiles(page, [{ name: 'personal.txt', mimeType: 'text/plain', buffer: foil }]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await acknowledge(page);
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'running');
  await page.getByText('Show log ·', { exact: false }).click();
  await expect(page.getByRole('log')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import files', exact: true })).toBeDisabled();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'done', {
    timeout: 150_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const text = await page
    .getByRole('link', { name: 'Download leparagliding.txt', exact: true })
    .evaluate(async (anchor) => {
      return (await fetch((anchor as HTMLAnchorElement).href)).text();
    });
  expect(text).toBe(main.toString());
  // The engine does not read pre-data.txt.
  const preData = Buffer.from(ok(writePreData(PREPROCESSOR_EXAMPLE)));
  await importFiles(page, [{ name: 'pre-data.txt', mimeType: 'text/plain', buffer: preData }]);
  await expect(page.getByRole('heading', { name: 'Generated files' })).toBeVisible();
  await apply(page, main.toString().replace('Personal wing', 'Next draft'));
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByRole('heading', { name: 'Generated files' })).toHaveCount(0);
});

test('replacing preserves the input name and a failed import keeps the current draft', async ({
  page,
}) => {
  await openExample(page, 'swoop2');
  await page.getByRole('button', { name: 'Actions for leparagliding.txt', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Replace…', exact: true }).click();
  const main = await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8');
  const replacement = Buffer.from(main.replace('"Swoop2"', '"Replaced wing"'));
  await (
    await chooser
  ).setFiles({ name: 'local-design.txt', mimeType: 'text/plain', buffer: replacement });
  expect(await downloadFile(page, 'leparagliding.txt')).toEqual(replacement);
  await importFiles(page, [
    { name: 'broken.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid archive') },
  ]);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  expect(await downloadFile(page, 'leparagliding.txt')).toEqual(replacement);
  await acknowledge(page);
});

test('the main wing preview follows inputs and expands directly into the 3D editor', async ({
  page,
}) => {
  await page.goto('/');
  const preview = page.locator('app-wing-preview');
  await expect(preview.getByRole('img', { name: 'Wing 3D model' })).toBeVisible();
  const inputBounds = await page.locator('app-design-input').boundingBox();
  const previewBounds = await preview.boundingBox();
  expect(previewBounds!.width / inputBounds!.width).toBeCloseTo(2, 1);
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByRole('log')).toBeHidden();

  await source(page, 'Swoop2 · 50 cells');
  await expect(preview.locator('figcaption')).toHaveText('Swoop2');
  await page.getByRole('button', { name: 'Expand 3D preview' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Wing overview' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Show editor', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Show editor', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '1 · Geometry', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  await source(page, 'My files');
  await expect(preview.getByText('Load a readable design to preview the wing.')).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Expand 3D preview' })).toBeDisabled();
});

for (const [width, height] of [
  [1366, 768],
  [1440, 900],
]) {
  test(`the initial workspace fits a ${width}×${height} desktop window`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('app-wing-preview canvas')).toBeVisible();
    await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'idle');
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(dimensions).toEqual({ width, height });
    await expect(page.getByRole('button', { name: 'Compute design' })).toBeVisible();
  });
}

test('returning to a cached wing restores its initial framing', async ({ page }) => {
  await page.goto('/');
  const preview = page.locator('app-wing-preview');
  const canvas = preview.locator('canvas');
  await expect(canvas).toBeVisible();
  const initial = await canvas.screenshot();

  await source(page, 'Swoop2 · 50 cells');
  await expect(preview.locator('figcaption')).toHaveText('Swoop2');
  await canvas.screenshot();
  await source(page, 'A8 test · 33 cells');
  await expect(preview.locator('figcaption')).toHaveText('A8 test');
  await expect.poll(async () => (await canvas.screenshot()).equals(initial)).toBe(true);
});
