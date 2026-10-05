import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const golden = readFileSync(new URL('../fixtures/golden-project.json', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  // Force the upload fallback so the test can supply files without the native picker.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
  await page.goto('/');
  // The sample studio loads on first launch; wait for it so it cannot race with the file we open.
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

async function openText(page: import('@playwright/test').Page, name: string, text: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
}

test('opens a valid project file', async ({ page }) => {
  await openText(page, 'golden.json', golden);
  await expect(page.getByTestId('project-name')).toHaveText('Golden fixture');
});

test('a malformed connector shows a clear error with its path and can be opened read-only', async ({ page }) => {
  const doc = JSON.parse(golden);
  doc.library.gearModels[0].connectors[2].direction = 'sideways';
  await openText(page, 'broken.json', JSON.stringify(doc));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('library.gearModels[0].connectors[2].direction');
  await expect(dialog).toContainText('"sideways"');
  await dialog.getByRole('button', { name: 'Load anyway (read-only)' }).click();
  await expect(page.getByText('Read-only')).toBeVisible();
});

test('a future schemaVersion is offered read-only', async ({ page }) => {
  const doc = JSON.parse(golden);
  doc.schemaVersion = 999;
  await openText(page, 'future.json', JSON.stringify(doc));
  await expect(page.getByRole('dialog')).toContainText('schemaVersion 999');
});

test('a missing image asset shows a placeholder and a project warning (scenario 10)', async ({ page }) => {
  const doc = JSON.parse(golden);
  doc.library.gearModels[0].images = { front: { id: 'asset-gone' } };
  await openText(page, 'missing-asset.json', JSON.stringify(doc));
  await expect(page.getByTestId('project-name')).toHaveText('Golden fixture');
  await page.getByRole('tab', { name: 'Issues' }).click();
  await page.getByRole('tab', { name: 'Project' }).click();
  await expect(page.getByRole('region', { name: 'Project integrity' })).toContainText(
    'Image asset "asset-gone" is missing; a placeholder is shown',
  );
});
