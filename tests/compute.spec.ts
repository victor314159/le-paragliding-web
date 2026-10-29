import { expect, test } from '@playwright/test';
import designIndex from '../oracle/designs/index.json' with { type: 'json' };
import { acknowledge, expectReady } from './helpers';

test('worker memory updates during synchronous computation and clears on cancellation', async ({
  page,
}) => {
  // Exercise the real Worker while a small engine fixture grows its heap.
  // A worker timer cannot report the change while callMain blocks its loop.
  await page.route('**/engine/lepara.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export default async (options) => {
      const engine = {
        ENV: {},
        HEAPU8: new Uint8Array(64 * 1024 * 1024),
        FS: { mkdir() {}, chdir() {}, writeFile() {} },
        callMain() {
          engine.HEAPU8 = new Uint8Array(128 * 1024 * 1024);
          options.print('The heap has grown.');
          const end = performance.now() + 5000;
          while (performance.now() < end) { /* Synchronous engine work. */ }
          return 0;
        },
      };
      for (const beforeRun of options.preRun) beforeRun(engine);
      return engine;
    };`,
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await acknowledge(page);
  await expect(page.getByTestId('worker-memory')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'running');
  await expect(page.getByTestId('worker-memory')).toHaveText('WASM allocated: 0.13 GiB');
  await expect(page.getByTestId('worker-memory')).toHaveAttribute(
    'title',
    /not the worker's total RAM/,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('worker-memory')).toHaveCount(0);
});

test('a running calculation can be cancelled and restarted', async ({ page }) => {
  await page.goto('/');
  await acknowledge(page);
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'running');
  await expect(page.getByTestId('worker-memory')).toContainText(/WASM allocated: [1-9][\d.]* GiB/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'cancelled');
  await expect(page.getByTestId('worker-memory')).toHaveCount(0);
  await expectReady(page);
  await expect(page.getByRole('heading', { name: 'Generated files' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'done', {
    timeout: 150_000,
  });
  await expect(page.getByTestId('worker-memory')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Download leparagliding.dxf', exact: true }),
  ).toBeVisible();
});

test('missing engine and input files show recoverable errors', async ({ page }) => {
  await page.goto('/');
  await acknowledge(page);
  const missingEngine = '**/engine/lepara.js';
  await page.route(missingEngine, (route) =>
    route.fulfill({ status: 404, body: 'Missing engine' }),
  );
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('alert')).toContainText('Could not load the engine');
  await expectReady(page);
  await page.unroute(missingEngine);

  const missingWasm = '**/engine/lepara.wasm';
  await page.route(missingWasm, (route) => route.fulfill({ status: 404, body: 'Missing WASM' }));
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'error');
  // Wait for this attempt's error, rather than accepting the previous error
  // while Angular is still rendering the new loading state.
  await expect(page.getByRole('alert')).toContainText(/WebAssembly|wasm/i);
  await expectReady(page);
  await page.unroute(missingWasm);

  const design = designIndex.find(({ id }) => id === 'A8')!;
  const [airfoil] = design.airfoils;
  const missingInput = `**/examples/${design.id}/${airfoil}`;
  await page.route(missingInput, (route) => route.fulfill({ status: 404, body: 'Missing input' }));
  // Inputs now load into the editable workspace before the Worker starts.
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(`${airfoil} (HTTP 404)`);
  await expect(page.getByRole('button', { name: 'Compute design' })).toBeDisabled();
  await page.unroute(missingInput);
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await acknowledge(page);

  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'done', {
    timeout: 150_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the workspace fits a narrow screen and supports keyboard navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // The Compute design button stays disabled until the disclaimer is
  // acknowledged, so it is only part of the tab order once enabled.
  await acknowledge(page);
  await expect(page.getByRole('heading', { name: 'Input', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Log', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('combobox', { name: 'Input source', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Import files', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Edit parameters of leparagliding.txt', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Actions for leparagliding.txt', exact: true }),
  ).toBeFocused();
  // The menu opens on its first item, Edit text.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Edit text', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  const editor = page.getByRole('textbox', { name: 'Content of leparagliding.txt', exact: true });
  expect(
    await editor.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThan(200);
  expect(await editor.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
    'monospace',
  );
  expect(await editor.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Actions for leparagliding.txt', exact: true }),
  ).toBeFocused();
  await page
    .getByLabel(
      'I have read and understood this warning and the limitations of the results provided.',
    )
    .focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Compute design' })).toBeFocused();
});

test('the first checkbox click opens a collapsed disclaimer before accepting', async ({ page }) => {
  await page.goto('/');
  const disclaimer = page.getByRole('button', { name: 'Safety disclaimer', exact: true });
  const checkbox = page.getByRole('checkbox');
  const compute = page.getByRole('button', { name: 'Compute design', exact: true });
  await expect(disclaimer).toHaveAttribute('aria-expanded', 'false');
  await checkbox.click();
  await expect(disclaimer).toHaveAttribute('aria-expanded', 'true');
  await expect(checkbox).not.toBeChecked();
  await expect(compute).toBeDisabled();

  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(compute).toBeEnabled();

  await disclaimer.click();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expect(compute).toBeDisabled();

  await disclaimer.click();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(compute).toBeEnabled();
});
