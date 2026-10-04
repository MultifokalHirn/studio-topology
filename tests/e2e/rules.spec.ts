import { expect, type Locator, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

async function connect(page: Page, from: Locator, to: Locator) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
}

test('scenario 4: DIR-001, PWR-001/002, PWR-005 and USB-004 are detected', async ({ page }) => {
  // A 115 V-only unit: set the Composer's mains region in the gear editor.
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Edit Behringer Composer MDX2100', exact: true }).click();
  const editor = page.getByRole('dialog', { name: /Edit gear/ });
  await editor.getByRole('button', { name: 'Power', exact: true }).click();
  await editor.getByLabel('Mains region').selectOption('115-only');
  await editor.getByRole('button', { name: 'Save model' }).click();

  await page.getByRole('tab', { name: 'Setups' }).click();
  await page.getByRole('button', { name: 'New blank setup' }).click();
  await page.getByLabel('Setup name').fill('Scenario 4');
  await page.getByRole('tab', { name: 'Patch' }).click();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  const canvas = page.getByRole('img', { name: 'Patch of Scenario 4' });
  const cb = (await canvas.boundingBox())!;
  const drops: [RegExp, number, number][] = [
    [/^Digitone II Elektron/, 0.5, 0.05],
    [/^Octatrack MKII Elektron/, 0.05, 0.05],
    [/^NightSky power supply \(nightsky\)/, 0.05, 0.55],
    [/^iPad Pro M4 11-inch/, 0.3, 0.75],
    [/^SSL 12 Solid/, 0.62, 0.55],
    [/^EP-136 K\.O\. Sidekick/, 0.62, 0.85],
    [/^Composer MDX2100 Behringer/, 0.3, 0.45],
  ];
  for (const [name, fx, fy] of drops)
    await page
      .getByRole('button', { name })
      .dragTo(canvas, { targetPosition: { x: cb.width * fx, y: cb.height * fy } });
  await page.getByLabel('All ports').check();
  await canvas.focus();
  await page.keyboard.press('f');
  const port = (unit: string, label: string) =>
    canvas
      .getByRole('button', { name: `Port ${unit} ${label}`, exact: true })
      .locator('circle')
      .first();

  await connect(page, port('Octatrack MKII', 'Main L'), port('Digitone II', 'Main L')); // output → output
  await connect(page, port('NightSky power supply (nightsky)', 'DC Out'), port('Digitone II', 'DC In'));
  await connect(page, port('iPad Pro M4 11-inch', 'USB-C (Thunderbolt / USB 4)'), port('SSL 12', 'USB'));
  await connect(page, port('iPad Pro M4 11-inch', 'USB-C (Thunderbolt / USB 4)'), port('EP-136 K.O. Sidekick', 'USB'));

  await page.getByRole('tab', { name: 'Issues' }).click();
  const errors = page.getByRole('region', { name: 'error issues' });
  await expect(errors.locator('[data-rule="DIR-001"]')).toBeVisible();
  await expect(errors.locator('[data-rule="PWR-001"]')).toContainText('9 V');
  await expect(errors.locator('[data-rule="PWR-002"]')).toContainText('center-negative');
  await expect(errors.locator('[data-rule="PWR-005"]')).toContainText('115 V only');
  await expect(page.getByRole('region', { name: 'info issues' }).locator('[data-rule="USB-004"]')).toContainText(
    '2 USB audio devices',
  );
  await expect(page.getByRole('button', { name: /^Validation: [4-9] errors/ })).toBeVisible();

  // Suppress the deliberate output-to-output patch with a reason; it moves to "suppressed".
  await errors.locator('[data-rule="DIR-001"]').getByRole('button', { name: 'Suppress…' }).click();
  await page.getByLabel('Reason').fill('Deliberate test patch');
  await page.getByRole('button', { name: 'Suppress', exact: true }).click();
  await expect(page.locator('[data-rule="DIR-001"]')).toHaveCount(0);
  await page.getByLabel(/Show suppressed/).check();
  await expect(page.getByRole('region', { name: 'Suppressed issues' })).toContainText('Deliberate test patch');
});
