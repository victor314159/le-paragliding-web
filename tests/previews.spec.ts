import { expect, test, type Page } from '@playwright/test';
import { acknowledge } from './helpers';

async function imageDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const images = await Promise.all(
        [first, second].map(async (source) => {
          const image = new Image();
          image.src = `data:image/png;base64,${source}`;
          await image.decode();
          return image;
        }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = images[0].width;
      canvas.height = images[0].height;
      const context = canvas.getContext('2d')!;
      const pixels = images.map((image) => {
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      });
      let changed = 0;
      for (let i = 0; i < pixels[0].length; i += 4) {
        if (
          [0, 1, 2].some(
            (channel) => Math.abs(pixels[0][i + channel] - pixels[1][i + channel]) > 16,
          )
        )
          changed++;
      }
      return changed / (canvas.width * canvas.height);
    },
    [before.toString('base64'), after.toString('base64')],
  );
}

test('generated files have text, airfoil, DXF and STL previews without changing downloads', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Input source', exact: true }).click();
  await page.getByRole('option', { name: 'A8 test · 33 cells', exact: true }).click();
  await acknowledge(page);
  await page.getByRole('button', { name: 'Compute design' }).click();
  await expect(page.getByTestId('compute-status')).toHaveAttribute('data-state', 'done', {
    timeout: 150_000,
  });

  const rows = page.getByRole('table', { name: 'Generated files' }).locator('tbody tr');
  expect(await rows.getByRole('button', { name: /^Preview / }).count()).toBe(await rows.count());
  const dialog = page.getByRole('dialog');
  const files = [
    'lep-out.txt',
    'stdout.log',
    'stderr.log',
    'xflr5/gnua-0900.dat',
    'xflr5/A8 tes.xwimp',
    'stl/lep-3d-surfaces.scad',
  ];
  for (const name of files) {
    const button = page.getByRole('button', { name: `Preview ${name}`, exact: true });
    const link = page
      .getByTestId('result-files')
      .getByRole('link', { name: `Download ${name}`, exact: true });
    const url = await link.getAttribute('href');
    const original = await page.evaluate(
      async (url) =>
        new TextDecoder().decode((await (await fetch(url!)).arrayBuffer()).slice(0, 200_000)),
      url,
    );
    await button.click();
    await expect(
      dialog.getByRole('heading', { name: `Preview ${name}`, exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    if (original) {
      expect(await dialog.getByLabel(`Content of ${name}`, { exact: true }).textContent()).toBe(
        original,
      );
    } else {
      await expect(dialog.getByText('This file is empty.')).toBeVisible();
    }
    if (name.endsWith('.dat'))
      await expect(dialog.getByRole('img', { name: 'Airfoil profile' })).toBeVisible();
    if (name.endsWith('.scad'))
      await expect(dialog.getByText(/Showing the first 200 KB/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(link).toHaveAttribute('href', url!);
  }

  for (const name of [
    'leparagliding.dxf',
    'lep-3d.dxf',
    'lep-3d-surfaces.dxf',
    'stl/lep-3d-surfaces.stl',
  ]) {
    await page.getByRole('button', { name: `Preview ${name}`, exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveCount(0, { timeout: 30_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const canvas = dialog.getByRole('img', { name: 'File preview', exact: true });
    await expect(canvas).toBeVisible();
    expect(
      await canvas.evaluate((element) => (element as HTMLCanvasElement).width),
    ).toBeGreaterThan(200);
    await expect(dialog.getByRole('button', { name: 'Source', exact: true })).toHaveCount(0);
    if (name !== 'leparagliding.dxf') {
      // Orbit in both directions, then verify Reset view restores the actual
      // rendered orientation as well as the zoom and framing.
      const originalView = await canvas.screenshot();
      const box = (await canvas.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 80, y - 40, { steps: 8 });
      await page.mouse.up();
      expect(await imageDifference(page, originalView, await canvas.screenshot())).toBeGreaterThan(
        0.005,
      );
      await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
      // Allow minor GPU antialiasing differences when the view is restored.
      expect(await imageDifference(page, originalView, await canvas.screenshot())).toBeLessThan(
        0.005,
      );
    }
    await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Preview leparagliding.dxf', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveCount(0, { timeout: 30_000 });
  await expect(dialog.getByRole('img', { name: 'File preview', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  expect(errors).toEqual([]);
});
