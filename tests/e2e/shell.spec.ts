import { expect, test } from '@playwright/test';

test('app shell renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Studio Planner' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Layout' })).toBeVisible();
});
