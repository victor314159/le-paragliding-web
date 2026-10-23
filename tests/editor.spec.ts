import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import designIndex from '../oracle/designs/index.json' with { type: 'json' };
import { parseLep, writeLep } from '../packages/format/src/index.ts';
import { ok } from './format/helpers';
import { acknowledge } from './helpers';

// Fetching a full generated DXF into a trace would make it unnecessarily large.
test.use({ trace: 'off' });
const opener = (page: Page) =>
  page.getByRole('button', { name: 'Edit parameters of leparagliding.txt', exact: true });
const textOpener = (page: Page) =>
  page.getByRole('button', { name: 'Edit text of leparagliding.txt', exact: true });

async function source(page: Page, name: string): Promise<void> {
  await page.getByRole('combobox', { name: 'Input source', exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}

/** Picks the option of a mat-select by its value, the start of its label. */
async function choose(page: Page, name: string, value: string): Promise<void> {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: new RegExp(`^${value} ·`) }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Selects an item of the navigation by its label, with or without its note. */
async function section(page: Page, name: string | RegExp): Promise<void> {
  const menu = page.getByRole('button', { name: 'Sections and airfoils', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole('navigation', { name: 'Sections and airfoils' })
    .getByRole('button', { name })
    .click();
}

async function downloadFile(page: Page, name = 'leparagliding.txt'): Promise<Buffer> {
  await page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  return readFile(await (await downloading).path());
}

async function replaceMain(page: Page, text: string): Promise<void> {
  await textOpener(page).click();
  await page.getByRole('textbox', { name: 'Content of leparagliding.txt', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
}

test('eight examples open with their values and a no-op Save preserves their bytes', async ({
  page,
}) => {
  const loaded = (id: string) =>
    page.waitForResponse((response) =>
      response.url().endsWith(`/examples/${id}/leparagliding.txt`),
    );
  // The first example loads with the page; the others when selected.
  let loading = loaded(designIndex[0].id);
  await page.goto('/');
  for (const [index, entry] of designIndex.entries()) {
    if (index) {
      loading = loaded(entry.id);
      await source(page, `${entry.wing} — LEparagliding ${entry.program} · ${entry.cells} cells`);
    }
    const bytes = await readFile(`oracle/designs/${entry.id}/leparagliding.txt`);
    const design = ok(parseLep(bytes.toString()));
    // The opener stays disabled while the example loads.
    await loading;
    await expect(opener(page)).toBeEnabled();
    await opener(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Upper panels · Sides (mm)', exact: true }),
    ).toHaveValue(String(design.sewingAllowances.upper.sides));
    await expect(
      page.getByRole('textbox', { name: 'Lower panels · Leading edge (mm)', exact: true }),
    ).toHaveValue(String(design.sewingAllowances.lower.leadingEdge));
    await expect(page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true })).toHaveValue(
      String(design.sewingAllowances.ribs),
    );
    await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(
      37 + entry.airfoils.length,
    );
    await section(page, '24 · 2D DXF options');
    await expect(page.getByRole('combobox', { name: '2D DXF mode', exact: true })).toContainText(
      `${design.dxf2d.mode} ·`,
    );
    if (design.dxf2d.mode === 1)
      await expect(page.getByRole('textbox', { name: 'A lines color', exact: true })).toHaveValue(
        String(design.dxf2d.lineColors[0]),
      );
    await section(page, '25 · 3D DXF options');
    await expect(page.getByRole('combobox', { name: '3D DXF mode', exact: true })).toContainText(
      `${design.dxf3d.mode} ·`,
    );
    if (design.dxf3d.mode === 1)
      await expect(page.getByRole('textbox', { name: 'Extrados color', exact: true })).toHaveValue(
        String(design.dxf3d.surfaces[0].color),
      );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(opener(page)).toBeFocused();
    expect(await downloadFile(page)).toEqual(bytes);
    await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
  }
});

test('Cancel, close and Escape confirm dirty drafts and preserve original bytes', async ({
  page,
}) => {
  await page.goto('/');
  const original = await downloadFile(page);
  await opener(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
  for (const action of ['Cancel', 'Close parameter editor', 'Escape']) {
    await opener(page).click();
    await page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true }).fill('');
    if (action === 'Escape') await page.keyboard.press('Escape');
    else await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Discard changes?', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true })).toHaveValue(
      '',
    );
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
    expect(await downloadFile(page)).toEqual(original);
  }
});

test('text that is not a number keeps the section, and empty and hidden fields survive navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await opener(page).click();
  const rib = page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true });
  await rib.fill('-');
  await page.getByRole('textbox', { name: 'V-rib edges (mm)', exact: true }).focus();
  await expect(rib).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a number.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
    /1 error · Fix before saving/,
  );
  // Leaving would discard the text: the editor stays on its field.
  await section(page, '24 · 2D DXF options');
  await expect(page.getByRole('heading', { name: '6 · Sewing allowances' })).toBeVisible();
  await expect(rib).toBeFocused();
  await expect(rib).toHaveValue('-');
  await rib.fill('');
  await expect(rib).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Must be a number', { exact: true })).toBeVisible();
  await section(page, '24 · 2D DXF options');
  await choose(page, '2D DXF mode', '1');
  await page.getByRole('textbox', { name: 'A lines color', exact: true }).fill('');
  await choose(page, '2D DXF mode', '0');
  await choose(page, '2D DXF mode', '1');
  await expect(page.getByRole('textbox', { name: 'A lines color', exact: true })).toHaveValue('');
  await section(page, '6 · Sewing allowances');
  await expect(rib).toHaveValue('');
  await expect(rib).toHaveAttribute('aria-invalid', 'true');
  await rib.fill('11.5');
  await expect(rib).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  // The footer says why Save is disabled and leads to the remaining error.
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText(
    /1 error · Fix before saving/,
  );
  await page
    .getByRole('dialog')
    .getByRole('status')
    .getByRole('button', { name: 'Show', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'A lines color', exact: true })).toBeFocused();
  await choose(page, '2D DXF mode', '0');
  await expect(page.getByRole('dialog').getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(ok(parseLep((await downloadFile(page)).toString())).dxf2d).toEqual({ mode: 0 });
});

test('unsupported sections and airfoils link to text editing, and an unreadable airfoil does not block Save', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '1 · Geometry Text only');
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Content of leparagliding.txt', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await opener(page).click();
  await section(page, 'gnuReflex.txt Text only');
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Content of gnuReflex.txt', exact: true })
    .fill('broken airfoil');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('gnuReflex.txt');
  await opener(page).click();
  await section(page, /^gnuReflex\.txt Text only · \d+ errors?$/);
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Error · gnuReflex.txt' }),
  ).not.toHaveCount(0);
  await section(page, '6 · Sewing allowances');
  await page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true }).fill('11');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(ok(parseLep((await downloadFile(page)).toString())).sewingAllowances.ribs).toBe(11);
});

test('input errors block compute and parameter editing while warnings allow compute', async ({
  page,
}) => {
  const original = await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8');
  const design = ok(parseLep(original));
  await page.goto('/');
  await acknowledge(page);
  await replaceMain(page, 'unreadable design');
  await expect(opener(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Compute design', exact: true })).toBeDisabled();
  await expect(page.getByTestId('compute-status')).toContainText('Fix input errors');
  await expect(page.getByRole('alert')).toContainText('leparagliding.txt');
  // An undocumented geometry parameter is a format warning, not a blocking input error.
  const warning = { ...design, geometry: { ...design.geometry, paragliderParameter: 2 } };
  await replaceMain(page, ok(writeLep(warning)));
  await page.getByText(/^Warnings · \d+$/).click();
  await expect(page.getByText(/geometry\.paragliderParameter/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compute design', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Save survives ZIP export and import, colors reach DXF, results invalidate and Restore is exact', async ({
  page,
}) => {
  const original = await readFile('oracle/designs/swoop2/leparagliding.txt');
  const foil = await readFile('oracle/designs/swoop2/gnuReflex.txt');
  await page.goto('/');
  // This example overrides plan colors via Section 37. Exercise Section 24's
  // actual engine behavior with colors by plan (1341 = 0).
  await replaceMain(page, original.toString().replace(/^1341\s+1\b/m, '1341    0'));
  await opener(page).click();
  await page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true }).fill('12.75');
  await section(page, '24 · 2D DXF options');
  await choose(page, '2D DXF mode', '1');
  // Swoop2 has A, B, C and F lines; D/E remain recorded in the input.
  for (const [index, line] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) {
    await page
      .getByRole('textbox', { name: `${line} lines color`, exact: true })
      .fill(String(101 + index));
  }
  await section(page, '25 · 3D DXF options');
  await choose(page, '3D DXF mode', '1');
  await choose(page, 'Extrados surface', '1');
  await page.getByRole('textbox', { name: 'Extrados color', exact: true }).fill('42');
  await expect(
    page.getByText('Saving rewrites leparagliding.txt.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await opener(page).click();
  await expect(page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true })).toHaveValue(
    '12.75',
  );
  await section(page, '24 · 2D DXF options');
  await expect(page.getByRole('textbox', { name: 'A lines color', exact: true })).toHaveValue(
    '101',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all (.zip)', exact: true }).click();
  const zipBytes = await readFile(await (await downloading).path());
  const zip = await JSZip.loadAsync(zipBytes);
  expect(await zip.file('gnuReflex.txt')!.async('nodebuffer')).toEqual(foil);
  const main = ok(parseLep(await zip.file('leparagliding.txt')!.async('string')));
  expect(main.sewingAllowances.ribs).toBe(12.75);
  expect(main.dxf2d).toEqual({ mode: 1, lineColors: [101, 102, 103, 104, 105, 106] });
  expect(main.dxf3d).toEqual(
    expect.objectContaining({
      mode: 1,
      surfaces: expect.arrayContaining([{ drawn: 1, color: 42 }]),
    }),
  );
  await source(page, 'My files');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import files', exact: true }).click();
  await (
    await choosing
  ).setFiles({ name: 'inputs.zip', mimeType: 'application/zip', buffer: zipBytes });
  await opener(page).click();
  await expect(page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true })).toHaveValue(
    '12.75',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await acknowledge(page);
  await page.getByRole('button', { name: 'Compute design', exact: true }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'done', {
    timeout: 150_000,
  });
  const colors = await page
    .getByRole('link', { name: 'Download leparagliding.dxf', exact: true })
    .evaluate(async (anchor) => {
      const text = await (await fetch((anchor as HTMLAnchorElement).href)).text();
      const rows = text.split(/\r?\n/).map((line) => line.trim());
      const values = new Set<number>();
      for (let i = 0; i + 1 < rows.length; i += 2)
        if (rows[i] === '62') values.add(Number(rows[i + 1]));
      return [...values];
    });
  expect(colors).toEqual(expect.arrayContaining([101, 102, 103, 106]));
  await opener(page).click();
  await page.getByRole('textbox', { name: 'V-rib edges (mm)', exact: true }).fill('11');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'idle');
  await expect(page.getByRole('heading', { name: 'Generated files' })).toHaveCount(0);
  await source(page, 'Swoop2 — LEparagliding 3.29 · 50 cells');
  await page.getByRole('button', { name: 'Actions for leparagliding.txt', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Restore original', exact: true }).click();
  expect(await downloadFile(page)).toEqual(original);
  expect(await downloadFile(page, 'gnuReflex.txt')).toEqual(foil);
});
