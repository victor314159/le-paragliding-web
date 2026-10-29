import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, type Page } from '@playwright/test';
import designIndex from '../oracle/designs/index.json' with { type: 'json' };

/** Open a specific example, independently of the application's default wing. */
export async function openExample(page: Page, id: string): Promise<void> {
  const design = designIndex.find((entry) => entry.id === id);
  if (!design) throw new Error(`Unknown example: ${id}`);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Input source', exact: true }).click();
  await page
    .getByRole('option', {
      name: `${design.wing} — LEparagliding ${design.program} · ${design.cells} cells`,
      exact: true,
    })
    .click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Input source', exact: true })).toHaveText(
    `${design.wing} — LEparagliding ${design.program} · ${design.cells} cells`,
  );
  await expect(page.getByRole('combobox', { name: 'Input source', exact: true })).toBeEnabled();
}

/** Assembles packages/<name>/ and its dependencies into build/ (scripts/assemble-package.sh). */
export function assemblePackage(name: string): void {
  execFileSync('scripts/assemble-package.sh', [name], { stdio: 'inherit' });
}

/** The assembled build/<name>/, as Node imports it. */
export async function importAssembled<T>(name: string): Promise<T> {
  return (await import(pathToFileURL(resolve('build', name, 'index.js')).href)) as T;
}

export async function expectReady(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Compute design' })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Input source', exact: true })).toBeEnabled();
}

// The safety disclaimer gates the Compute design button.
export async function acknowledge(page: Page): Promise<void> {
  const disclaimer = page.getByRole('button', { name: 'Safety disclaimer', exact: true });
  if ((await disclaimer.getAttribute('aria-expanded')) !== 'true') await disclaimer.click();
  await page
    .getByLabel(
      'I have read and understood this warning and the limitations of the results provided.',
    )
    .check();
  await expect(page.getByRole('button', { name: 'Compute design' })).toBeEnabled();
}

/** Opens the text editor of an input file, from its menu. */
export async function editText(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit text', exact: true }).click();
}
