import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import designIndex from '../oracle/designs/index.json' with { type: 'json' };
import { parseLep, SECTIONS, writeLep } from '../packages/format/src/index.ts';
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
async function choose(
  page: Page,
  name: string,
  value: string,
  scope: Page | Locator = page,
): Promise<void> {
  await scope.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: new RegExp(`^${value} ·`) }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** Selects an item of the navigation by its label, with or without its note. */
async function section(page: Page, name: string | RegExp, blocked = false): Promise<void> {
  await page.locator('#editor-section-title').waitFor({ state: 'visible' });
  const menu = page.getByRole('button', { name: 'Sections and airfoils', exact: true });
  if (await menu.isVisible()) await menu.click();
  const target = page
    .getByRole('navigation', { name: 'Sections and airfoils', includeHidden: true })
    .getByRole('button', { name, includeHidden: true });
  await target.click();
  // Navigation may be deliberately refused while a number holds unparsed text.
  if (!blocked) await expect(target).toHaveAttribute('aria-current', 'true');
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
    await expect(page.getByRole('heading', { name: '1 · Geometry', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Wing name', exact: true })).toHaveValue(
      design.geometry.wingName,
    );
    await section(page, '6 · Sewing allowances');
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
    await section(page, '6 · Sewing allowances');
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
  await section(page, '6 · Sewing allowances');
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
  await section(page, '24 · 2D DXF options', true);
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

test('airfoils link to text editing, and an unreadable airfoil does not block Save', async ({
  page,
}) => {
  await page.goto('/');
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
  await section(page, '6 · Sewing allowances');
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
  await section(page, '6 · Sewing allowances');
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
  await section(page, '6 · Sewing allowances');
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
  await section(page, '6 · Sewing allowances');
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

test('all 37 sections have forms and navigation preserves the original file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const original = await downloadFile(page);
  await opener(page).click();
  for (const { number, title } of SECTIONS) {
    await section(
      page,
      new RegExp(`^${number} · ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$| )`),
    );
    await expect(
      page.getByRole('heading', { name: `${number} · ${title}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit text', exact: true })).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: `${number} · ${title}`, exact: true })
        .locator('input, mat-select, button')
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(await downloadFile(page)).toEqual(original);
  expect(errors).toEqual([]);
});

test('nested lists, text and mode changes save through the new section forms', async ({ page }) => {
  const initial = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.goto('/');
  await replaceMain(page, ok(writeLep({ ...initial, holes: [] })));
  await opener(page).click();
  await section(page, '1 · Geometry');
  await page.getByRole('textbox', { name: 'Wing name', exact: true }).fill('Editor test wing');
  await section(page, '7 · Sewing marks');
  await page.getByRole('textbox', { name: 'Sewing mark spacing (cm)', exact: true }).fill('25.5');
  await section(page, '4 · Lightening holes');
  await page.getByRole('button', { name: 'Add hole group', exact: true }).click();
  await page.getByRole('button', { name: 'Add hole', exact: true }).click();
  await choose(page, 'Hole type', '4');
  await page.getByRole('textbox', { name: 'Width / base (% chord)', exact: true }).fill('8.75');
  await page.getByRole('button', { name: 'Add hole', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Hole type', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove hole', exact: true }).last().click();
  await section(page, '27 · Special wing tip');
  await choose(page, 'Wing tip mode', '2');
  await page
    .getByRole('textbox', { name: 'Parabola distance (% chord)', exact: true })
    .fill('12.5');
  await page.getByRole('textbox', { name: 'Parabola angle (deg)', exact: true }).fill('');
  await choose(page, 'Wing tip mode', '4');
  await page.getByRole('textbox', { name: 'Last rib displacement (cm)', exact: true }).fill('3.5');
  await section(page, '17 · Additional rib points');
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  await page.getByRole('textbox', { name: 'X (% chord)', exact: true }).last().fill('42');
  await section(page, '27 · Special wing tip');
  await choose(page, 'Wing tip mode', '2');
  await expect(
    page.getByRole('textbox', { name: 'Parabola distance (% chord)', exact: true }),
  ).toHaveValue('12.5');
  await expect(
    page.getByRole('textbox', { name: 'Parabola angle (deg)', exact: true }),
  ).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await choose(page, 'Wing tip mode', '4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const design = ok(parseLep((await downloadFile(page)).toString()));
  expect(design.geometry.wingName).toBe('Editor test wing');
  expect(design.marks.spacing).toBe(25.5);
  expect(design.holes).toEqual([
    { firstRib: 1, lastRib: 1, holes: [{ type: 4, parameters: [0, 0, 8.75, 0, 0, 0, 0] }] },
  ]);
  expect(design.wingTip).toEqual({ mode: 4, displacement: 3.5, rotation: 0 });
  expect(design.ribPoints.at(-1)).toEqual([42, 0]);
});

test('special parameter codes preserve numeric, text and transition values across navigation', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '37 · Special parameters');
  await choose(page, 'Special parameters mode', '1');
  await page.getByRole('button', { name: 'Add special parameter', exact: true }).click();
  const entry = page.getByRole('group', { name: /^Special parameter \d+$/ }).last();
  await entry.getByRole('textbox', { name: 'Parameter value', exact: true }).fill('1');
  await choose(page, 'Parameter code', '2000', entry);
  await entry.getByRole('textbox', { name: 'Edition date', exact: true }).fill('2026-10-23');
  await section(page, '6 · Sewing allowances');
  await section(page, '37 · Special parameters');
  await expect(entry.getByRole('textbox', { name: 'Edition date', exact: true })).toHaveValue(
    '2026-10-23',
  );
  await choose(page, 'Parameter code', '1341', entry);
  await expect(entry.getByRole('textbox', { name: 'Parameter value', exact: true })).toHaveValue(
    '1',
  );
  await choose(page, 'Parameter code', '3001', entry);
  await entry
    .getByRole('textbox', { name: 'Transition length (% chord)', exact: true })
    .fill('15.5');
  await entry.getByRole('textbox', { name: 'Transition parameter 2', exact: true }).fill('2.25');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const design = ok(parseLep((await downloadFile(page)).toString()));
  expect(design.specialParameters).toMatchObject({
    mode: 1,
    entries: expect.arrayContaining([{ code: 3001, transition: 1, values: [15.5, 2.25] }]),
  });
});

test('collection errors stay visible and structural edits cannot discard unparsed text', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await opener(page).click();
  await section(page, '17 · Additional rib points');
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  const x = page.getByRole('textbox', { name: 'X (% chord)', exact: true }).last();
  await x.fill('-');
  await page.getByRole('button', { name: 'Remove point', exact: true }).last().click();
  await expect(x).toBeFocused();
  await expect(x).toHaveValue('-');
  await x.fill('0');
  await page.getByRole('button', { name: 'Remove point', exact: true }).last().click();
  await section(page, '1 · Geometry');
  await page.getByRole('button', { name: 'Remove rib', exact: true }).last().click();
  const rowCount = page.getByRole('listitem').filter({ hasText: /geometry.ribs.*rows expected/ });
  await expect(rowCount).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  // Show leads to the list under the title, the place of an error without an input.
  await section(page, '7 · Sewing marks');
  await page.getByRole('status').getByRole('button', { name: 'Show', exact: true }).click();
  const list = page.getByRole('list').filter({ has: rowCount });
  await expect(list).toBeFocused();
  await expect(list).toBeInViewport();
  await page.getByRole('button', { name: 'Add rib', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('rod variants, panel cuts and HVR dependent fields keep edits when their modes change', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '21 · Nylon rods');
  await choose(page, 'Nylon rods mode', '2');
  const blocs = page.getByRole('combobox', { name: 'Select rod bloc', exact: true });
  await blocs.click();
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  const blocCount = await page.getByRole('listbox').getByRole('option').count();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add rod bloc', exact: true }).click();
  await expect(blocs).toContainText(`${blocCount + 1} ·`);
  const bloc = page.getByRole('group', { name: /^Rod bloc \d+$/ }).last();
  await bloc.getByRole('button', { name: 'Add rod group', exact: true }).click();
  await choose(page, 'Rod type', '2', bloc);
  await bloc.getByRole('textbox', { name: 'Start X (% chord)', exact: true }).fill('12.5');
  await choose(page, 'Rod type', '3', bloc);
  await bloc
    .getByRole('textbox', { name: 'Upper rod bottom curve start (% chord)', exact: true })
    .fill('5');
  await choose(page, 'Rod type', '4', bloc);
  await bloc
    .getByRole('textbox', { name: 'Initial curve start (% chord)', exact: true })
    .fill('24');
  await choose(page, 'Rod type', '2', bloc);
  await expect(bloc.getByRole('textbox', { name: 'Start X (% chord)', exact: true })).toHaveValue(
    '12.5',
  );
  await section(page, '15 · Extrados colors');
  await choose(page, 'Color layout', 'panels');
  await page.getByRole('button', { name: 'Add color panel', exact: true }).click();
  const panel = page.getByRole('group', { name: /^Color panel \d+$/ }).last();
  await panel.getByRole('button', { name: 'Add panel cut', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Cut seam width (mm)', exact: true }).fill('12.5');
  await choose(page, 'Color layout', 'ribs');
  await choose(page, 'Color layout', 'panels');
  await expect(
    panel.getByRole('textbox', { name: 'Cut seam width (mm)', exact: true }),
  ).toHaveValue('12.5');
  await section(page, '26 · Glue vents');
  await choose(page, 'Glue vents mode', '1');
  const vent = page.getByRole('table', { name: 'Vent ribs', exact: true }).getByRole('row').nth(1);
  await choose(page, 'Vent type', '5', vent);
  await vent.getByRole('textbox', { name: 'Arch depth (%)', exact: true }).fill('7');
  await choose(page, 'Vent type', '4', vent);
  await choose(page, 'Vent type', '5', vent);
  await expect(vent.getByRole('textbox', { name: 'Arch depth (%)', exact: true })).toHaveValue('7');
  await section(page, '38 · HVR holes');
  await choose(page, 'HVR holes mode', '1');
  await section(page, '39 · HVR positions');
  await page.getByRole('textbox', { name: 'Horizontal factor', exact: true }).first().fill('1.5');
  await section(page, '38 · HVR holes');
  await choose(page, 'HVR holes mode', '0');
  await section(page, '39 · HVR positions');
  await expect(page.getByRole('textbox', { name: 'Horizontal factor', exact: true })).toHaveCount(
    0,
  );
  await section(page, '38 · HVR holes');
  await choose(page, 'HVR holes mode', '1');
  await section(page, '39 · HVR positions');
  await expect(
    page.getByRole('textbox', { name: 'Horizontal factor', exact: true }).first(),
  ).toHaveValue('1.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const design = ok(parseLep((await downloadFile(page)).toString()));
  if (design.joncs.mode === 2) {
    const rod = design.joncs.blocs.at(-1)!;
    expect(rod.type).toBe(2);
    expect(rod.groups[0]).toHaveProperty('x1', 12.5);
    expect(rod.groups[0]).not.toHaveProperty('upperRod');
  } else throw new Error('Expected rod blocs');
  if (design.extradosColors.mode === 'panels')
    expect(design.extradosColors.panels.at(-1)!.cuts[0].seamWidth).toBe(12.5);
  else throw new Error('Expected panel cuts');
  expect(design.hvrPositions.coefficients?.[0].horizontal).toBe(1.5);
});

test('enabling an unused section parses its initially empty numbers and saves them', async ({
  page,
}) => {
  const original = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.goto('/');
  await replaceMain(page, ok(writeLep({ ...original, xflr5: { mode: 0 } })));
  await opener(page).click();
  await section(page, '36 · XFLR5 analysis');
  await choose(page, 'XFLR5 export mode', '1');
  for (const label of [
    'Panels along chord',
    'Panels per cell',
    'Chord distribution',
    'Span distribution',
  ]) {
    await page.getByRole('textbox', { name: label, exact: true }).fill('2');
  }
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(ok(parseLep((await downloadFile(page)).toString())).xflr5).toEqual({
    mode: 1,
    panels: { chord: 2, span: 2, chordDistribution: 2, spanDistribution: 2 },
    billowed: 0,
  });
});

test('a constraint from another section leads to the section containing its field', async ({
  page,
}) => {
  const original = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.goto('/');
  await replaceMain(
    page,
    ok(
      writeLep({
        ...original,
        xflr5: {
          mode: 1,
          panels: { chord: 2, span: 2, chordDistribution: 2, spanDistribution: 2 },
          billowed: 0,
        },
      }),
    ),
  );
  await opener(page).click();
  await section(page, '1 · Geometry');
  await page.getByRole('textbox', { name: 'Wing name', exact: true }).fill('');
  await section(page, '36 · XFLR5 analysis');
  await page.getByRole('status').getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 · Geometry', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Wing name', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Wing name', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});

test('rib tables compare many rows at once and the active row drives the live preview', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '3 · Anchor points');
  const table = page.getByRole('table', { name: 'Anchor positions', exact: true });
  await expect(table.getByRole('row')).toHaveCount(27);
  const region = page.getByRole('region', { name: 'Anchor positions', exact: true });
  const visibleRows = await region.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('tbody tr')].filter((row) => {
      const box = row.getBoundingClientRect();
      return box.top >= bounds.top && box.bottom <= bounds.bottom;
    }).length;
  });
  expect(visibleRows).toBeGreaterThanOrEqual(7);
  const row = table.getByRole('row').nth(20);
  await row.getByRole('textbox', { name: 'A position (% chord)', exact: true }).fill('23');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const preview = page.getByRole('img', {
    name: 'Airfoil of rib 20 and anchor positions on the chord',
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect(preview.locator('circle').first()).toHaveAttribute('cx', '0.23');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect(ok(parseLep((await downloadFile(page)).toString())).anchors[19].positions[0]).toBe(23);
});

test('only one nested path is expanded and Show reopens the path containing an error', async ({
  page,
}) => {
  const original = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.goto('/');
  await opener(page).click();
  await section(page, '9 · Suspension lines');
  await expect(page.getByRole('textbox', { name: 'Branching levels', exact: true })).toHaveCount(1);
  await choose(page, 'Select path', '2');
  const rib = page.getByRole('textbox', { name: 'Anchor rib', exact: true });
  await expect(rib).toHaveValue(String(original.lines.plans[0].paths[1].anchorRib));
  await rib.fill('-');
  await expect(page.getByRole('combobox', { name: 'Select path', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove path', exact: true }).click();
  await expect(rib).toBeFocused();
  await expect(rib).toHaveValue('-');
  await expect(page.getByRole('combobox', { name: 'Select path', exact: true })).toContainText(
    '2 ·',
  );
  await rib.fill('');
  await choose(page, 'Select path', '1');
  await page.getByRole('combobox', { name: 'Select path', exact: true }).click();
  await expect(page.getByRole('option', { name: /^2 ·/ })).toContainText('error');
  await page.keyboard.press('Escape');
  await section(page, '6 · Sewing allowances');
  await page.getByRole('status').getByRole('button', { name: 'Show', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '9 · Suspension lines', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Select path', exact: true })).toContainText(
    '2 ·',
  );
  await expect(rib).toBeFocused();
  await rib.fill(String(original.lines.plans[0].paths[1].anchorRib));
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('Mylar and line type tables preserve mode-dependent values, reveal errors and save on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await opener(page).click();
  await section(page, '22 · Nose mylars');
  await choose(page, 'Nose mylars mode', '1');
  await page.getByRole('button', { name: 'Add mylar group', exact: true }).click();
  const mylars = page.getByRole('table', { name: 'Mylar groups', exact: true });
  const value = mylars
    .getByRole('row')
    .last()
    .getByRole('textbox', { name: 'Mylar parameter 6', exact: true });
  await value.fill('2.25');
  await choose(page, 'Nose mylars mode', '0');
  await expect(mylars).toHaveCount(0);
  await choose(page, 'Nose mylars mode', '1');
  await expect(value).toHaveValue('2.25');
  const region = page.getByRole('region', { name: 'Mylar groups', exact: true });
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await value.fill('');
  await section(page, '7 · Sewing marks');
  await page.getByRole('status').getByRole('button', { name: 'Show', exact: true }).click();
  await expect(value).toBeFocused();
  await expect(value).toBeInViewport();
  await value.fill('2.25');
  await section(page, '34 · Line types');
  await choose(page, 'Line types mode', '1');
  const table = page.getByRole('table', { name: 'Line types', exact: true });
  const line = table.getByRole('row').nth(1);
  await choose(page, 'Cross section', 'c', line);
  await line.getByRole('textbox', { name: 'Diameter (mm)', exact: true }).fill('1.8');
  await choose(page, 'Cross section', 'r', line);
  await line.getByRole('textbox', { name: 'Width (mm)', exact: true }).fill('12.5');
  await line.getByRole('textbox', { name: 'Thickness (mm)', exact: true }).fill('0.9');
  await choose(page, 'Cross section', 'c', line);
  await expect(line.getByRole('textbox', { name: 'Diameter (mm)', exact: true })).toHaveValue(
    '1.8',
  );
  await choose(page, 'Cross section', 'r', line);
  await choose(page, 'Line types mode', '0');
  await expect(table).toHaveCount(0);
  await choose(page, 'Line types mode', '1');
  await expect(line.getByRole('textbox', { name: 'Width (mm)', exact: true })).toHaveValue('12.5');
  await expect(line.getByRole('textbox', { name: 'Thickness (mm)', exact: true })).toHaveValue(
    '0.9',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const design = ok(parseLep((await downloadFile(page)).toString()));
  expect(design.noseMylars.mode).toBe(1);
  if (design.noseMylars.mode === 1) expect(design.noseMylars.groups.at(-1)!.values[5]).toBe(2.25);
  expect(design.lineTypes.mode).toBe(1);
  if (design.lineTypes.mode === 1)
    expect(design.lineTypes.types[0]).toMatchObject({ kind: 'r', width: 12.5, thickness: 0.9 });
});

test('wide tables scroll inside the editor on mobile and cells retain numeric parse errors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await opener(page).click();
  await section(page, '1 · Geometry');
  const region = page.getByRole('region', { name: 'Rib geometry', exact: true });
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  const cell = page.getByRole('textbox', { name: 'Planform X (cm)', exact: true }).first();
  await cell.fill('-');
  await section(page, '6 · Sewing allowances', true);
  await expect(cell).toBeFocused();
  await expect(cell).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Enter a number.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('geometry previews follow edited coordinates and focus in both views', async ({ page }) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '1 · Geometry');
  const row = page
    .getByRole('table', { name: 'Rib geometry', exact: true })
    .getByRole('row')
    .nth(3);
  const plan = page.getByRole('img', { name: 'Wing planform', exact: true });
  const front = page.getByRole('img', { name: 'Wing front view', exact: true });
  await row.getByRole('textbox', { name: 'Planform X (cm)', exact: true }).fill('60');
  await expect(plan.locator('line.selected')).toHaveCount(2);
  await expect(plan.locator('line.selected').last()).toHaveAttribute('x1', '60');
  await expect(plan.locator('line.selected').first()).toHaveAttribute('x1', '-60');
  await row.getByRole('textbox', { name: 'Leading edge Y (cm)', exact: true }).fill('3');
  await expect(plan.locator('line.selected').last()).toHaveAttribute('y1', '3');
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(plan).toHaveCount(0);
  await row.getByRole('textbox', { name: 'Final X′ (cm)', exact: true }).fill('58');
  await row.getByRole('textbox', { name: 'Final Z (cm)', exact: true }).fill('4');
  await expect(front.locator('circle.selected').last()).toHaveAttribute('cx', '58');
  await expect(front.locator('circle.selected').last()).toHaveAttribute('cy', '4');
  await page.getByRole('button', { name: 'Planform', exact: true }).click();
  await row.getByRole('textbox', { name: 'Planform X (cm)', exact: true }).fill('');
  await expect(plan.locator('line.selected')).toHaveCount(0);
  await expect(plan.locator('path.outline')).not.toHaveAttribute('d', /NaN|Infinity|null/);
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(front.locator('circle.selected')).toHaveCount(2);
  await row.getByRole('textbox', { name: 'Planform X (cm)', exact: true }).fill('60');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const design = ok(parseLep((await downloadFile(page)).toString()));
  expect(design.geometry.ribs[2]).toMatchObject({ x: 60, yLE: 3, xp: 58, z: 4 });
});

test('hole previews follow the group, rib, active hole and live dimensions on mobile', async ({
  page,
}) => {
  const initial = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await replaceMain(
    page,
    ok(
      writeLep({
        ...initial,
        holes: [
          {
            firstRib: 1,
            lastRib: 2,
            holes: [
              { type: 1, parameters: [30, 2, 8, 3, 0, 0, 0] },
              { type: 3, parameters: [50, -2, 12, 6, 0, 1, 0] },
              { type: 4, parameters: [65, -2, 15, 6, 0, 1, 0] },
            ],
          },
          { firstRib: 3, lastRib: 3, holes: [{ type: 1, parameters: [40, 0, 5, 2, 0, 0, 0] }] },
        ],
      }),
    ),
  );
  await opener(page).click();
  await section(page, '4 · Lightening holes');
  const preview = page.getByRole('img', { name: 'Lightening holes on rib 1', exact: true });
  await expect(preview.locator('path.hole')).toHaveCount(3);
  await expect(preview.locator('path.profile')).toHaveAttribute('d', /^M/);
  const rows = page.getByRole('table', { name: 'Holes', exact: true }).getByRole('row');
  await rows.nth(1).getByRole('textbox', { name: 'X position (% chord)', exact: true }).fill('35');
  await expect(preview.locator('path.hole').first()).toHaveAttribute('d', /^M0\.43,/);
  await rows
    .nth(3)
    .getByRole('textbox', { name: 'Width / base (% chord)', exact: true })
    .fill('-15');
  await expect(preview.locator('path.hole.selected')).toHaveCount(1);
  await expect(preview.locator('path.hole.selected title')).toHaveText('Hole 3');
  await expect(preview.locator('path.hole.selected')).toHaveAttribute('d', / A/);
  await page.getByRole('combobox', { name: 'Preview rib', exact: true }).selectOption('1');
  await expect(
    page.getByRole('img', { name: 'Lightening holes on rib 2', exact: true }),
  ).toBeVisible();
  await rows.nth(1).getByRole('textbox', { name: 'Width / base (% chord)', exact: true }).fill('');
  await expect(page.getByText(/Not drawn: holes 1 /)).toBeVisible();
  await rows.nth(1).getByRole('textbox', { name: 'Width / base (% chord)', exact: true }).fill('8');
  await choose(page, 'Select hole group', '2');
  const other = page.getByRole('img', { name: 'Lightening holes on rib 3', exact: true });
  await expect(other.locator('path.hole')).toHaveCount(1);
  await expect(
    page.getByRole('combobox', { name: 'Preview rib', exact: true }).locator('option'),
  ).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Remove hole group', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Lightening holes on rib 2', exact: true }).locator('path.hole'),
  ).toHaveCount(3);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saved = ok(parseLep((await downloadFile(page)).toString()));
  expect(saved.holes).toHaveLength(1);
  expect(saved.holes[0].holes[0].parameters[0]).toBe(35);
  expect(saved.holes[0].holes[2].parameters[2]).toBe(-15);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`previews stay docked while fields scroll at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await opener(page).click();
    for (const name of [
      '1 · Geometry',
      '2 · Airfoils',
      '3 · Anchor points',
      '4 · Lightening holes',
      '5 · Skin tension',
      '15 · Extrados colors',
      '16 · Intrados colors',
      '30 · Airfoil thickness modification',
      '31 · Skin tension groups',
      ...SECTIONS.filter(({ number }) =>
        [6, 7, 9, 10, 11, 12, 17, 20, 21, 26, 27, 29, 38].includes(number),
      ).map(({ number, title }) => `${number} · ${title}`),
    ]) {
      await section(page, name);
      if (name === '4 · Lightening holes' && viewport.width === 1440) {
        const widths = await page
          .getByRole('region', { name: 'Holes', exact: true })
          .evaluate((element) => ({
            visible: element.clientWidth,
            content: element.scrollWidth,
          }));
        expect(widths.visible).toBe(widths.content);
      }
      const panel = page.locator('app-editor-preview');
      const fields = page.locator('section[aria-labelledby="editor-section-title"]');
      const before = (await panel.boundingBox())!;
      expect(before.height).toBeCloseTo(viewport.height * 0.33, 0);
      await fields.evaluate((element) => (element.scrollTop = element.scrollHeight));
      const after = (await panel.boundingBox())!;
      expect(after.y).toBeCloseTo(before.y, 0);
      expect(after.height).toBeCloseTo(before.height, 0);
      const content = (await fields.boundingBox())!;
      expect(content.y + content.height).toBeLessThanOrEqual(after.y + 1);
      const footer = (await page.locator('app-design-editor footer').boundingBox())!;
      expect(after.y + after.height).toBeLessThanOrEqual(footer.y + 1);
      await expect(panel.getByRole('img')).toBeInViewport();
      expect(after.y).toBeGreaterThan(0);
      expect(after.height).toBeLessThan(viewport.height * 0.4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    }
    await section(page, '8 · Global angle of attack estimation');
    await expect(page.locator('app-editor-preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
  });
}

test('view and collapse controls preserve unparsed fields and their state across sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await opener(page).click();
  await section(page, '1 · Geometry');
  const row = page
    .getByRole('table', { name: 'Rib geometry', exact: true })
    .getByRole('row')
    .nth(3);
  const x = row.getByRole('textbox', { name: 'Planform X (cm)', exact: true });
  await x.fill('-');
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(x).toHaveValue('-');
  await expect(page.getByRole('img', { name: 'Wing front view', exact: true })).toBeInViewport();
  const panel = page.locator('app-editor-preview');
  const fields = page.locator('section[aria-labelledby="editor-section-title"]');
  const originalHeight = (await fields.boundingBox())!.height;
  await panel.getByRole('button', { name: 'Collapse preview', exact: true }).click();
  await expect(panel.getByRole('region', { name: 'Preview', exact: true })).toBeHidden();
  await expect(x).toHaveValue('-');
  expect((await fields.boundingBox())!.height).toBeGreaterThan(originalHeight + 80);
  await panel.getByRole('button', { name: 'Expand preview', exact: true }).click();
  await expect(panel.getByRole('img', { name: 'Wing front view', exact: true })).toBeInViewport();
  await expect(x).toHaveValue('-');
  await x.fill('60');
  await panel.getByRole('button', { name: 'Collapse preview', exact: true }).click();
  await section(page, '6 · Sewing allowances');
  await section(page, '1 · Geometry');
  await expect(panel.getByRole('button', { name: 'Expand preview', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await panel.getByRole('button', { name: 'Expand preview', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Front', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    panel.getByRole('img', { name: 'Wing front view', exact: true }).locator('circle.selected'),
  ).toHaveCount(2);
  await expect(x).toHaveValue('60');
});

test('the docked preview follows the hole group opened by Show on an error', async ({ page }) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '4 · Lightening holes');
  await page.getByRole('combobox', { name: 'Select hole group', exact: true }).click();
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  const groupNumber = (await page.getByRole('listbox').getByRole('option').count()) + 1;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add hole group', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Select hole group', exact: true }),
  ).toContainText(`${groupNumber} ·`);
  await page.getByRole('textbox', { name: 'First rib', exact: true }).fill('');
  await section(page, '6 · Sewing allowances');
  await page.getByRole('status').getByRole('button', { name: 'Show', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Select hole group', exact: true }),
  ).toContainText(`${groupNumber} ·`);
  await expect(page.locator('app-editor-preview figcaption')).toHaveText(
    `Rib holes · group ${groupNumber}`,
  );
  await expect(page.getByRole('textbox', { name: 'First rib', exact: true })).toBeFocused();
});

test('anchor and hole previews share whole-wing views and detailed profile context', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '3 · Anchor points');
  const plan = page.getByRole('img', { name: 'Wing planform with anchor positions', exact: true });
  await expect(plan.locator('path.anchor-track')).toHaveCount(6);
  const row = page
    .getByRole('table', { name: 'Anchor positions', exact: true })
    .getByRole('row')
    .nth(20);
  await row.getByRole('textbox', { name: 'A position (% chord)', exact: true }).focus();
  await expect(plan.locator('circle.anchor-dot.selected').first()).toHaveAttribute('cx', '-509.26');
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(
    page
      .getByRole('img', { name: 'Wing front view with anchor positions', exact: true })
      .locator('circle.anchor-dot'),
  ).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  const profile = page.getByRole('img', {
    name: 'Airfoil of rib 20 and anchor positions on the chord',
    exact: true,
  });
  await expect(profile.locator('circle').first()).not.toHaveAttribute('cy', '0');
  await section(page, '4 · Lightening holes');
  const holes = page.getByRole('img', { name: 'Lightening holes on rib 1', exact: true });
  await expect(holes.locator('path.allowance')).toHaveAttribute('d', /^M/);
  await expect(holes.locator('text').last()).toContainText('cm · chord');
  await expect(holes.locator('circle.anchor-dot')).not.toHaveCount(0);
  const before = await holes.locator('path.allowance').getAttribute('d');
  await section(page, '6 · Sewing allowances');
  await page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true }).fill('12');
  await section(page, '4 · Lightening holes');
  await expect(holes.locator('path.allowance')).not.toHaveAttribute('d', before!);
  await page.getByRole('button', { name: 'Planform', exact: true }).click();
  await expect(
    page
      .getByRole('img', { name: 'Wing planform with anchor positions', exact: true })
      .locator('circle.hole-center'),
  ).not.toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`Fit fills the SVG viewport without clipping geometry or labels at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await opener(page).click();
    const svg = page.locator('#section-preview svg');
    const expectFitted = async () => {
      await expect
        .poll(async () => {
          const margins = await svg.evaluate((element: SVGSVGElement) => {
            const box = element.getBBox();
            const matrix = element.getScreenCTM()!;
            const start = new DOMPoint(box.x, box.y).matrixTransform(matrix);
            const end = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
            const viewport = element.getBoundingClientRect();
            return [
              start.x - viewport.left,
              viewport.right - end.x,
              start.y - viewport.top,
              viewport.bottom - end.y,
            ];
          });
          return {
            enclosed: margins.every((value) => Number.isFinite(value) && value >= 5),
            fills: Math.min(margins[0] + margins[1], margins[2] + margins[3]) <= 14,
          };
        })
        .toEqual({ enclosed: true, fills: true });
    };
    for (const name of [
      '1 · Geometry',
      '2 · Airfoils',
      '4 · Lightening holes',
      '6 · Sewing allowances',
      '9 · Suspension lines',
      '27 · Special wing tip',
    ]) {
      await section(page, name);
      await page.getByRole('button', { name: 'Fit view', exact: true }).click();
      await expectFitted();
      if (name === '1 · Geometry') {
        await page.getByRole('separator', { name: 'Resize preview', exact: true }).press('ArrowUp');
        await expectFitted();
      }
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
  });
}

test('preview wheel zoom, pan and fit do not change the design', async ({ page }) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '3 · Anchor points');
  const svg = page.getByRole('img', { name: 'Wing planform with anchor positions', exact: true });
  const width = () => svg.getAttribute('viewBox').then((value) => Number(value!.split(' ')[2]));
  const initialWidth = await width();
  await expect(page.getByRole('button', { name: /^Zoom (in|out)$/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Grid', exact: true })).toHaveCount(0);
  const bounds = (await svg.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, -200);
  await expect.poll(width).toBeLessThan(initialWidth * 0.8);
  const zoomed = await svg.getAttribute('viewBox');
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(svg).not.toHaveAttribute('viewBox', zoomed!);
  const panned = await svg.getAttribute('viewBox');
  await page.getByRole('separator', { name: 'Resize preview', exact: true }).press('ArrowUp');
  await expect(svg).toHaveAttribute('viewBox', panned!);
  await page.getByRole('button', { name: 'Fit view', exact: true }).click();
  await expect.poll(width).toBeGreaterThan(initialWidth * 0.95);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
});

for (const touch of [false, true]) {
  test(`preview height resizes with ${touch ? 'touch' : 'mouse'} and keyboard and survives navigation`, async ({
    page,
  }) => {
    await page.setViewportSize(touch ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.goto('/');
    await opener(page).click();
    await section(page, '3 · Anchor points');
    const panel = page.locator('app-editor-preview');
    const separator = page.getByRole('separator', { name: 'Resize preview', exact: true });
    await expect(separator).toBeVisible();
    const initial = (await panel.boundingBox())!.height;
    const grip = (await separator.boundingBox())!;
    const x = grip.x + grip.width / 2,
      y = grip.y + grip.height / 2;
    if (touch) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y - 80, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 80, { steps: 8 });
      await page.mouse.up();
    }
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(initial + 80, 0);
    await separator.focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(initial + 60, 0);
    await page.getByRole('button', { name: 'Collapse preview', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Expand preview', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Expand preview', exact: true }).click();
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(initial + 60, 0);
    await section(page, '2 · Airfoils');
    await expect.poll(async () => (await panel.boundingBox())!.height).toBeCloseTo(initial + 60, 0);
    await separator.focus();
    await page.keyboard.press('End');
    const fields = page.locator('section[aria-labelledby="editor-section-title"]');
    await expect.poll(async () => (await fields.boundingBox())!.height).toBeGreaterThanOrEqual(119);
    await page.setViewportSize({ width: 390, height: 600 });
    await expect.poll(async () => (await fields.boundingBox())!.height).toBeGreaterThanOrEqual(119);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
  });
}

test('thickness previews compare original and modified profiles, including zero thickness and disabled mode', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '30 · Airfoil thickness modification');
  await choose(page, 'Thickness mode', '1');
  const coefficients = page.getByRole('textbox', { name: 'Thickness coefficient', exact: true });
  await coefficients.nth(1).fill('0.5');
  const svg = page.getByRole('img', {
    name: 'Original and modified airfoil of rib 2',
    exact: true,
  });
  await expect(svg).toBeVisible();
  const original = await svg.locator('path.original').getAttribute('d');
  await expect(svg.locator('path.modified')).not.toHaveAttribute('d', original!);
  await coefficients.nth(1).fill('0');
  await expect
    .poll(async () =>
      (await svg.locator('path.modified').getAttribute('d'))!
        .match(/,[^ L]+/g)!
        .every((y) => Number(y.slice(1)) === 0),
    )
    .toBe(true);
  await page.getByRole('combobox', { name: 'Preview rib', exact: true }).selectOption('0');
  await expect(
    page.getByRole('img', { name: 'Original and modified airfoil of rib 1', exact: true }),
  ).toBeVisible();
  await choose(page, 'Thickness mode', '0');
  await expect(page.locator('app-thickness-preview p')).toContainText('disabled');
  expect(await page.locator('app-thickness-preview path.modified').getAttribute('d')).toBe(
    await page.locator('app-thickness-preview path.original').getAttribute('d'),
  );
  await choose(page, 'Thickness mode', '1');
  await expect(coefficients.nth(1)).toHaveValue('0');
});

test('color previews follow panel cuts, active rows and rib mark modes on both surfaces', async ({
  page,
}) => {
  const initial = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.goto('/');
  await replaceMain(
    page,
    ok(
      writeLep({
        ...initial,
        extradosColors: {
          mode: 'panels',
          panels: [
            {
              panel: 2,
              cuts: [
                { number: 1, left: 25, right: 70, seamWidth: 10, unused: 0 },
                { number: 2, left: 75, right: 80, seamWidth: 10, unused: 0 },
              ],
            },
          ],
        },
        intradosColors: {
          mode: 'ribs',
          ribs: [
            {
              rib: 2,
              marks: [
                { number: 1, positions: [20, 0] },
                { number: 2, positions: [80, 0] },
              ],
            },
          ],
        },
      }),
    ),
  );
  await opener(page).click();
  await section(page, '15 · Extrados colors');
  const upper = page.getByRole('img', { name: 'Extrados color cuts and rib marks', exact: true });
  await expect(upper.locator('line.color-cut')).toHaveCount(4);
  await expect(upper.locator('path.active-panel')).toHaveCount(2);
  const firstY = await upper.locator('line.color-cut').first().getAttribute('y1');
  const left = page.getByRole('textbox', { name: 'Left end (% chord)', exact: true });
  await left.nth(0).fill('35');
  await expect(upper.locator('line.color-cut').first()).not.toHaveAttribute('y1', firstY!);
  await left.nth(1).focus();
  await expect(upper.locator('line.active-cut title').first()).toContainText('Cut 2');
  await left.nth(0).fill('');
  await expect(upper.locator('line.color-cut')).toHaveCount(2);
  expect(
    await upper
      .locator('path')
      .evaluateAll((paths) => paths.every((p) => !/NaN|Infinity/.test(p.getAttribute('d') ?? ''))),
  ).toBe(true);
  await left.nth(0).fill('25');
  await section(page, '16 · Intrados colors');
  const lower = page.getByRole('img', { name: 'Intrados color cuts and rib marks', exact: true });
  await expect(lower.locator('circle.color-mark')).toHaveCount(4);
  const positions = page.getByRole('textbox', { name: 'First position (% chord)', exact: true });
  await positions.nth(1).focus();
  await expect(lower.locator('circle.selected title').first()).toContainText('Mark 2');
  const oldY = await lower.locator('circle.color-mark').last().getAttribute('cy');
  await positions.nth(1).fill('60');
  await expect(lower.locator('circle.color-mark').last()).not.toHaveAttribute('cy', oldY!);
  await choose(page, 'Color layout', 'panels');
  await expect(lower.locator('circle.color-mark')).toHaveCount(0);
  await choose(page, 'Color layout', 'ribs');
  await expect(positions.nth(1)).toHaveValue('60');
});

test('skin tension previews follow live points and selected groups while keeping view controls out of the design', async ({
  page,
}) => {
  const initialDesign = ok(
    parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')),
  );
  if (initialDesign.skinTensionGroups.mode !== 1) throw new Error('Expected active tension groups');
  const first = initialDesign.skinTensionGroups.groups[0];
  await page.goto('/');
  await replaceMain(
    page,
    ok(
      writeLep({
        ...initialDesign,
        skinTensionGroups: {
          mode: 1,
          groups: [
            { ...first, lastRib: 10 },
            {
              ...first,
              group: 2,
              firstRib: 11,
              points: first.points.map((point, index) => ({
                ...point,
                extradosOverwidth: point.extradosOverwidth * (index === 1 ? 0.5 : 1),
              })),
            },
          ],
        },
      }),
    ),
  );
  const before = await downloadFile(page);
  await opener(page).click();
  await section(page, '5 · Skin tension');
  const svg = page.getByRole('img', { name: 'Skin tension overwidth curves', exact: true });
  await expect(svg.locator('path.curve')).toHaveCount(2);
  const upper = svg.locator('g.extrados path.curve');
  const lower = svg.locator('g.intrados path.curve');
  const previous = await upper.getAttribute('d');
  const values = page.getByRole('textbox', { name: 'Extrados overwidth (% chord)', exact: true });
  const initial = await values.nth(1).inputValue();
  await values.nth(1).fill('-1');
  await expect(upper).not.toHaveAttribute('d', previous!);
  await expect(svg.locator('g.extrados circle.active-point title')).toContainText('Point 2');
  await page.getByRole('button', { name: 'Intrados', exact: true }).click();
  await expect(upper).toHaveCount(0);
  await expect(lower).toHaveCount(1);
  await values.nth(1).fill(initial);
  await section(page, '31 · Skin tension groups');
  await expect(page.getByRole('button', { name: 'Intrados', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Both', exact: true }).click();
  const previousGroup = await upper.getAttribute('d');
  await choose(page, 'Select skin tension group', '2');
  await expect(page.locator('app-skin-tension-preview figcaption')).toContainText('group 2');
  await expect(upper).not.toHaveAttribute('d', previousGroup!);
  const groups = page.getByRole('textbox', { name: 'Extrados overwidth (% chord)', exact: true });
  await groups.nth(1).focus();
  await expect(svg.locator('g.extrados circle.active-point title')).toContainText('Point 2');
  await choose(page, 'Skin tension groups mode', '0');
  await expect(page.locator('app-skin-tension-preview')).toContainText('groups are disabled');
  await choose(page, 'Skin tension groups mode', '1');
  await expect(svg).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await downloadFile(page)).equals(before)).toBe(true);
});

test('seam and mark previews follow dimensions, selected rows and print or laser forms', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '6 · Sewing allowances');
  const svg = page.locator('app-detail-preview svg');
  await expect(svg).toHaveAttribute('aria-label', 'Sewing allowances');
  const before = await svg.locator('path.allowance').first().getAttribute('d');
  await page.getByRole('textbox', { name: 'Upper panels · Sides (mm)', exact: true }).fill('15');
  await expect(svg.locator('path.allowance').first()).not.toHaveAttribute('d', before!);
  await page.getByRole('textbox', { name: 'Rib edges (mm)', exact: true }).fill('12');
  await expect(page.getByRole('button', { name: 'Rib', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(svg.locator('path.profile')).toHaveCount(1);
  await section(page, '7 · Sewing marks');
  await page.getByRole('textbox', { name: 'Sewing mark spacing (cm)', exact: true }).fill('10');
  await expect(svg.locator('circle.mark')).toHaveCount(11);
  await section(page, '20 · Mark types');
  const row = page
    .getByRole('table', { name: 'Print and laser marks', exact: true })
    .getByRole('row')
    .nth(5);
  await row.getByRole('textbox', { name: 'Laser form', exact: true }).fill('3');
  await expect(svg).toHaveAttribute('aria-label', 'Tab · Laser');
  await expect(svg.locator('path.detail')).toHaveCount(1);
  await row.getByRole('textbox', { name: 'Laser size (mm)', exact: true }).fill('4');
  await expect(svg.locator('path.detail')).toHaveAttribute('d', /-4/);
  await row.getByRole('textbox', { name: 'Print form', exact: true }).focus();
  await expect(svg).toHaveAttribute('aria-label', 'Tab · Print');
});

test('connection, distribution and ramification previews track plans, paths and distances', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '9 · Suspension lines');
  const svg = page.locator('app-detail-preview svg');
  await expect(svg).toHaveAttribute('aria-label', 'Suspension connections · plan 1');
  await expect(svg.locator('path.connection.selected')).not.toHaveCount(0);
  await choose(page, 'Select line plan', '2');
  await expect(svg).toHaveAttribute('aria-label', 'Suspension connections · plan 2');
  await choose(page, 'Select path', '2');
  await expect(svg).toContainText('Path 2');
  await section(page, '10 · Brakes');
  await page.getByRole('button', { name: 'Distribution', exact: true }).click();
  await page.getByRole('textbox', { name: 'Length increment 1 (cm)', exact: true }).fill('12');
  await expect(svg).toHaveAttribute('aria-label', 'Brake distribution');
  await expect(svg).toContainText('12 cm');
  await expect(svg.locator('circle')).toHaveCount(5);
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(svg).toHaveAttribute('aria-label', 'Brake connections');
  await section(page, '11 · Ramification lengths');
  await page
    .getByRole('textbox', { name: 'Level 3 distance (cm)', exact: true })
    .first()
    .fill('93');
  await expect(page.getByRole('combobox', { name: 'Preview view', exact: true })).toHaveValue(
    'lines4',
  );
  await expect(svg).toContainText('l3 93 cm');
  await page.getByRole('combobox', { name: 'Preview view', exact: true }).selectOption('brakes3');
  await expect(svg).toHaveAttribute('aria-label', 'Brakes · 3 levels');
});

test('reinforcements and additional points follow selected records and incomplete edits', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  await section(page, '12 · H, V and VH ribs');
  const svg = page.locator('app-detail-preview svg');
  await expect(svg.locator('path.reinforcement.selected')).toHaveCount(2);
  const row = page
    .getByRole('table', { name: 'H, V and VH ribs', exact: true })
    .getByRole('row')
    .nth(2);
  await row.getByRole('textbox', { name: 'Row number', exact: true }).focus();
  await expect(svg.locator('path.reinforcement.selected title').first()).toContainText('HVR row 2');
  const path = svg.locator('path.reinforcement.selected').first();
  const before = await path.getAttribute('d');
  await row.getByRole('textbox', { name: 'Column 7', exact: true }).fill('6');
  await expect(path).not.toHaveAttribute('d', before!);
  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await expect(svg).toHaveAttribute('aria-label', /front projection/);
  await section(page, '17 · Additional rib points');
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  await page.getByRole('textbox', { name: 'X (% chord)', exact: true }).last().fill('42');
  await page.getByRole('textbox', { name: 'Y (% chord)', exact: true }).last().fill('-2');
  await expect(svg.locator('circle.selected').last()).toHaveAttribute('cx', '0.42');
  await expect(svg.locator('circle.selected').last()).toHaveAttribute('cy', '0.02');
  await page.getByRole('textbox', { name: 'X (% chord)', exact: true }).last().fill('');
  expect(await svg.evaluate((element) => !/NaN|Infinity/.test(element.innerHTML))).toBe(true);
});

test('HVR table scrolls on mobile and preserves diagonal parameters through type changes and Save', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await opener(page).click();
  await section(page, '12 · H, V and VH ribs');
  const table = page.getByRole('table', { name: 'H, V and VH ribs', exact: true });
  const region = page.getByRole('region', { name: 'H, V and VH ribs', exact: true });
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const row = table.getByRole('row').nth(2);
  await choose(page, 'Rib type', '6', row);
  const extra = row.getByRole('textbox', { name: 'Column 12', exact: true });
  await extra.fill('1.5');
  await choose(page, 'Rib type', '1', row);
  await expect(extra).toHaveCount(0);
  await choose(page, 'Rib type', '16', row);
  await expect(extra).toHaveValue('1.5');
  await extra.fill('-');
  const count = await table.getByRole('row').count();
  await row.getByRole('button', { name: 'Remove hvr row', exact: true }).click();
  await expect(extra).toBeFocused();
  await expect(table.getByRole('row')).toHaveCount(count);
  await extra.fill('1.5');
  await row.getByRole('textbox', { name: 'Column 8', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const design = ok(parseLep((await downloadFile(page)).toString()));
  expect(design.hvRibs.ribs[1].type).toBe(16);
  expect(design.hvRibs.ribs[1].parameters).toHaveLength(10);
  expect(design.hvRibs.ribs[1].parameters[9]).toBe(1.5);
});

test('rods and shaping previews follow groups, rib choice, pockets and influence zones', async ({
  page,
}) => {
  const initial = ok(parseLep(await readFile('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  await page.goto('/');
  await replaceMain(
    page,
    ok(
      writeLep({
        ...initial,
        joncs: {
          mode: 1,
          groups: [
            {
              group: 1,
              firstRib: 1,
              lastRib: 3,
              extrados: { from: 8, to: 40, deflection: 0.2, exponent: 1 },
              intrados: { from: 10, to: 20, deflection: 0.1, exponent: 1 },
              pocket: { offset: 1, outerWidth: 2, rodWidth: 1, innerWidth: 2 },
            },
          ],
        },
        shaping: {
          ...initial.shaping,
          mode: 1,
          model: 1,
          groups: [
            {
              group: 1,
              firstRib: 1,
              lastRib: initial.airfoils.length,
              upper: { type: 1, cuts: [{ number: 1, start: 10, end: 20, depth: 1 }] },
              lower: { type: 1, cuts: [] },
            },
          ],
          print:
            initial.shaping.mode !== 0
              ? initial.shaping.print
              : {
                  interpolation: { draw: 0, first: 1, last: 1, oneSide: 0 },
                  ovalization: { draw: 0, first: 1, last: 1, oneSide: 0 },
                  tessellation: { draw: 0, first: 1, last: 1, oneSide: 0 },
                  dxf: { draw: 0, first: 1, last: 1, oneSide: 0 },
                  stl: { draw: 0, first: 1, last: 1, oneSide: 0 },
                },
        },
      }),
    ),
  );
  await opener(page).click();
  await section(page, '21 · Nylon rods');
  const svg = page.locator('app-detail-preview svg');
  await expect(svg.locator('path.rod')).toHaveCount(1);
  await expect(svg.locator('path.allowance')).toHaveCount(2);
  const before = await svg.locator('path.rod').getAttribute('d');
  await page.getByRole('textbox', { name: 'Extrados curve deflection (%)', exact: true }).fill('1');
  await expect(svg.locator('path.rod')).not.toHaveAttribute('d', before!);
  await page.getByRole('combobox', { name: 'Preview rib', exact: true }).selectOption('1');
  await expect(svg).toHaveAttribute('aria-label', 'Nylon rods · rib 2');
  await section(page, '29 · 3D shaping');
  await expect(svg.locator('path.influence-upper')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Depth coefficient', exact: true }).fill('2');
  await expect(svg).toContainText('k=2');
  await expect(svg.locator('path.influence-upper.selected')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Start airfoil point', exact: true }).fill('');
  await expect(svg.locator('path.influence-upper')).toHaveCount(0);
  expect(await svg.evaluate((element) => !/NaN|Infinity/.test(element.innerHTML))).toBe(true);
});

test('inlet, wingtip and HVR hole previews follow each mode and the engine column meanings', async ({
  page,
}) => {
  await page.goto('/');
  await opener(page).click();
  const svg = page.locator('app-detail-preview svg');
  await section(page, '26 · Glue vents');
  await choose(page, 'Glue vents mode', '1');
  await choose(
    page,
    'Vent type',
    '6',
    page.getByRole('table', { name: 'Vent ribs', exact: true }).getByRole('row').nth(1),
  );
  await page.getByRole('textbox', { name: 'Left / X width (%)', exact: true }).first().fill('80');
  await page.getByRole('textbox', { name: 'Right / Y width (%)', exact: true }).first().fill('60');
  await expect(svg.locator('path.vent').last()).toHaveAttribute('d', /^M90,50/);
  await section(page, '27 · Special wing tip');
  await choose(page, 'Wing tip mode', '1');
  await page.getByRole('textbox', { name: 'Leading edge angle (deg)', exact: true }).fill('30');
  const tip = await svg.locator('path.detail').getAttribute('d');
  await choose(page, 'Wing tip mode', '2');
  await page.getByRole('textbox', { name: 'Parabola distance (% chord)', exact: true }).fill('60');
  await expect(svg.locator('path.detail')).not.toHaveAttribute('d', tip!);
  await choose(page, 'Wing tip mode', '4');
  await expect(page.locator('app-detail-preview p')).toContainText('does not apply');
  await section(page, '38 · HVR holes');
  await choose(page, 'HVR holes mode', '1');
  const table = page.getByRole('table', { name: 'HVR holes', exact: true });
  await expect(table).toBeVisible();
  const rows = table.getByRole('row');
  const count = await rows.count();
  await page.getByRole('button', { name: 'Add hvr holes row', exact: true }).click();
  await expect(rows).toHaveCount(count + 1);
  const last = rows.last();
  await choose(page, 'V-rib type', '9', last);
  await last.getByRole('textbox', { name: 'Hole count', exact: true }).fill('3');
  await last.getByRole('textbox', { name: 'Hole height (% local height)', exact: true }).fill('60');
  await last.getByRole('textbox', { name: 'Ellipse eccentricity a/b', exact: true }).fill('0.6');
  await last.getByRole('textbox', { name: 'Chord displacement factor', exact: true }).fill('-0.15');
  await last.getByRole('textbox', { name: 'Ellipse rotation (deg)', exact: true }).fill('20');
  await expect(svg.locator('path.hole')).toHaveCount(3);
  await choose(page, 'Holes output', '0', last);
  await expect(svg.locator('path.hole')).toHaveCount(0);
});
