import { expect, type Page } from '@playwright/test';

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
