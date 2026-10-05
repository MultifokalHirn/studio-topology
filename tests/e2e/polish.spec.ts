import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

test('command palette lists and runs actions', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search commands' });
  await expect(search).toBeFocused();
  await search.fill('show patch');
  await expect(page.getByRole('option').first()).toContainText('Show Patch');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: 'Patch', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Search commands' })).toHaveCount(0);
});

test('number keys switch views, ? shows the shortcut sheet, L toggles the legend', async ({ page }) => {
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('4');
  await expect(page.getByRole('tab', { name: 'Tables', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('2');
  await expect(page.getByRole('tab', { name: 'Patch', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Legend', { exact: true })).toBeVisible();
  await page.keyboard.press('l');
  await expect(page.getByLabel('Legend', { exact: true })).toHaveCount(0);
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet.getByRole('table', { name: 'Global shortcuts' })).toContainText('Command palette');
  await expect(sheet.getByRole('table', { name: 'Canvas shortcuts' })).toContainText('Fit all');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('settings change units, snap and the palette, and are undoable', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Length unit').selectOption('cm');
  await dialog.getByLabel('Snap to grid').uncheck();
  await dialog.getByLabel('Colour for MIDI', { exact: true }).fill('#ff00ff');
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('cm');
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('Snap off');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText('Snap 5 mm');
});

test('keyboard-only: browse the library with arrows, select, reach the inspector', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library' }).focus();
  await page.keyboard.press('Enter');
  const models = page.getByRole('list', { name: 'Gear models' });
  const first = models.locator('li > button:first-of-type').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  const second = models.locator('li > button:first-of-type').nth(1);
  await expect(second).toBeFocused();
  await page.keyboard.press('Enter');
  const name = (await second.getAttribute('title'))!;
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText(name.split(' ').slice(1).join(' '));
  await expect(page.getByTestId('status-selection')).toBeVisible();
  // Tab moves on until focus lands inside the inspector.
  let inside = false;
  for (let i = 0; i < 400 && !inside; i++) {
    await page.keyboard.press('Tab');
    inside = await page.evaluate(() => !!document.activeElement?.closest('aside[aria-label="Inspector"]'));
  }
  expect(inside).toBe(true);
  // Focus is visible (outline from :focus-visible).
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});
