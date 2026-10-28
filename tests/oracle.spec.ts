import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { acknowledge, expectReady } from './helpers';
import designIndex from '../oracle/designs/index.json' with { type: 'json' };
import {
  compareOutputs,
  PATCH_EFFECTS,
  pinnedDiffs,
  referenceManifest,
  sha256,
  WASM_DIFFS,
} from '../scripts/oracle-lib.ts';

// scripts/check-wasm-oracle.ts checks every design in Node with the same
// lepara.wasm; here one design covers the browser path (worker, UI, links,
// download). ORACLE_ALL=1 (CI) runs every design.
const designs =
  process.env['ORACLE_ALL'] === '1' ? designIndex.map((design) => design.id) : ['gnuA7-26'];

const tables = [pinnedDiffs(PATCH_EFFECTS), pinnedDiffs(WASM_DIFFS)];

// sha256 of the Blob behind every result link, computed in the page: no
// bytes cross to Node (nor into the trace). crypto.subtle needs a secure
// context: the tests run against http://localhost (tests/playwright.config.ts).
async function linkHashes(page: Page): Promise<Map<string, string>> {
  const entries = await page
    .getByTestId('result-files')
    .getByRole('link')
    .evaluateAll((anchors) =>
      Promise.all(
        anchors.map(async (anchor) => {
          const bytes = await (await fetch((anchor as HTMLAnchorElement).href)).arrayBuffer();
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
          const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
          return [anchor.getAttribute('download') ?? '', hex] as const;
        }),
      ),
    );
  return new Map(entries);
}

// No trace in this file: it would record every result Blob fetched for
// hashing (~250 MB per run) and Playwright fails to write it. Screenshots
// on failure remain.
test.use({ trace: 'off' });

// The design selector is a Material (M3) combobox, not a native <select>, so
// Playwright's selectOption cannot drive it: open the listbox and pick the
// option line for the design.
async function pickDesign(page: Page, id: string): Promise<void> {
  const design = designIndex.find((entry) => entry.id === id);
  if (!design) throw new Error(`Unknown design ${id}`);
  const line = `${design.wing} — LEparagliding ${design.program} · ${design.cells} cells`;
  await page.getByRole('combobox', { name: 'Input source', exact: true }).click();
  await page.getByRole('option', { name: line, exact: true }).click();
}

test('Chromium Worker matches the references up to pinned differences', async ({ page }) => {
  test.setTimeout(designs.length * 150_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await acknowledge(page);

  for (const design of designs) {
    await test.step(design, async () => {
      await pickDesign(page, design);
      await page.getByRole('button', { name: 'Compute design' }).click();
      await expect(
        page.getByRole('combobox', { name: 'Input source', exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Computing…' })).toBeDisabled();
      await expect(page.getByRole('heading', { name: 'Generated files' })).toHaveCount(0);
      await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'running');

      // The first real Fortran output reaches the page before main returns.
      await expect(page.getByTestId('log-line').first()).toBeVisible();
      await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'running');
      const elapsed = await page.getByTestId('elapsed').innerText();
      await expect(page.getByTestId('elapsed')).not.toHaveText(elapsed);
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();

      await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'done', {
        timeout: 150_000,
      });
      await expectReady(page);
      await expect(page.getByRole('alert')).toHaveCount(0);
      // Every native output except the input airfoils, and nothing else.
      const airfoils = designIndex.find((entry) => entry.id === design)?.airfoils ?? [];
      const reference = referenceManifest(design);
      for (const airfoil of airfoils) reference.delete(airfoil);
      const links = await page
        .getByTestId('result-files')
        .getByRole('link')
        .evaluateAll((anchors) =>
          anchors.map((anchor) => anchor.getAttribute('aria-label')?.replace(/^Download /, '')),
        );
      expect(links.sort(), `${design} output files`).toEqual([...reference.keys()].sort());
      // One real download per design (a subdirectory file when there is one).
      // Downloading every file stalls: in headless Chromium the ~11th download
      // of a page never starts (cause not established). The Blob hashes below
      // check every file; this download checks the download path itself.
      const sample = [...reference.keys()].find((name) => name.includes('/')) ?? 'lep-out.txt';
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('link', { name: `Download ${sample}`, exact: true }).click();
      const download = await downloadPromise;
      // Chromium turns the "/" of stl/ and xflr5/ names into "_".
      expect(download.suggestedFilename()).toBe(sample.replaceAll('/', '_'));
      const downloaded = await download.path();
      if (!downloaded) throw new Error(`No browser download for ${sample}`);
      const downloadedHash = sha256(await readFile(downloaded));

      // Every file: the exact bytes behind its download link (Blob URL).
      const hashes = await linkHashes(page);
      expect(downloadedHash, `${design}/${sample} download`).toBe(hashes.get(sample));
      const { problems, pinned } = compareOutputs(design, reference, hashes, tables);
      expect(problems, `${design} outputs`).toEqual([]);
      console.log(
        `[${design}] ${reference.size} outputs checked, ${pinned.length} pinned differences; ` +
          (await page.getByTestId('result-meta').innerText()),
      );
    });
  }
  expect(pageErrors).toEqual([]);
});
