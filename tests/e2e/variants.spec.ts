import { expect, type Locator, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

const hit = (l: Locator) => l.locator('circle').first();
async function connect(page: Page, from: Locator, to: Locator) {
  const a = (await hit(from).boundingBox())!;
  const b = (await hit(to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
}

test('scenario 5: clone, move, adjust, re-wire; compare; migration checklist; A/B toggle', async ({ page }) => {
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  // Clone "Current" to "Standing plan".
  await page.getByRole('tab', { name: 'Setups' }).click();
  await page.getByRole('button', { name: 'Clone', exact: true }).click();
  await page.getByLabel('Setup name').fill('Standing plan');
  await expect(page.getByLabel('Active setup').locator('option:checked')).toHaveText('Standing plan');

  // Move gear: Digitone II 30 mm to the right.
  await page.getByRole('tab', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: /^Digitone II Elektron/ }).click();
  const layout = page.getByRole('img', { name: /layout of Standing plan/ });
  await layout.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');

  // Change a tier height.
  await page.getByRole('button', { name: /^Jaspers 3D-145B/ }).click();
  await inspector.getByLabel('Height of Middle tier').fill('950');
  await inspector.getByLabel('Height of Middle tier').press('Enter');

  // Re-wire: drop Digitone II Main L → Heat, add Octatrack Cue L → SSL 12 Input 3.
  await page.getByRole('tab', { name: 'Patch' }).click();
  await page.getByLabel('Animate flow').uncheck();
  await page.getByLabel('All ports').check();
  await page.getByRole('button', { name: 'Auto-layout (ELK)' }).click();
  const patch = page.getByRole('img', { name: 'Patch of Standing plan' });
  await patch.focus();
  await page.keyboard.press('f');
  const port = (unit: string, label: string) =>
    patch.getByRole('button', { name: `Port ${unit} ${label}`, exact: true });
  const dt = (await hit(port('Digitone II', 'Main L')).boundingBox())!;
  await page.mouse.click(dt.x + dt.width / 2, dt.y + dt.height / 2);
  await inspector.getByRole('button', { name: /^Analog Heat MKII · in-l/ }).click();
  await inspector.getByRole('button', { name: 'Delete', exact: true }).click();
  await connect(page, port('Octatrack MKII', 'Cue L'), port('SSL 12', 'Input 3'));

  // Compare.
  await page.getByRole('tab', { name: 'Compare' }).click();
  await expect(page.getByLabel('From setup').locator('option:checked')).toHaveText('Current');
  await expect(page.getByLabel('To setup').locator('option:checked')).toHaveText('Standing plan');
  const layoutDiff = page.getByRole('region', { name: 'Layout diff' });
  await expect(layoutDiff.locator('[data-unit-change="unit-dt2"]')).toContainText('Digitone II');
  await expect(layoutDiff.locator('[data-unit-change="unit-dt2"]')).toContainText('30 mm');
  await expect(layoutDiff).toContainText('Middle tier: height 900 mm → 950 mm');
  const connDiff = page.getByRole('region', { name: 'Connection diff' });
  await expect(connDiff).toContainText('Digitone II · Main L → Analog Heat MKII · In L');
  await expect(connDiff).toContainText('Octatrack MKII · Cue L → SSL 12 · Input 3');
  await expect(page.getByRole('table', { name: 'Metrics' })).toContainText('Rack U used');

  // Checklist in order; ticking persists (undoable project state).
  const checklist = page.getByRole('region', { name: 'Migration checklist' });
  await expect(checklist.locator('h4')).toHaveText([
    'Power down',
    'Disconnect cables',
    'Move units',
    'Adjust tiers',
    'Reconnect cables',
    'Power up',
    'Verify settings',
  ]);
  await checklist.getByLabel(/Power down all units/).check();
  await expect(checklist).toContainText('1 of');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Markdown' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('migration-Current-to-Standing-plan.md');
  const md = await (await file.createReadStream()).toArray();
  const text = Buffer.concat(md).toString('utf8');
  expect(text).toContain('# Migration: Current → Standing plan');
  expect(text).toContain('- [x] Power down all units');
  expect(text.indexOf('## Disconnect cables')).toBeLessThan(text.indexOf('## Reconnect cables'));

  // Ghost overlay on the layout.
  await page.getByLabel('Show A as ghosts on the layout').check();
  await page.getByRole('tab', { name: 'Layout' }).click();
  await expect(page.locator('[data-ghost="unit-dt2"]')).toHaveCount(1);

  // A/B toggle with "\".
  await page.locator('body').press('\\');
  await expect(page.getByLabel('Active setup').locator('option:checked')).toHaveText('Current');
  await page.locator('body').press('\\');
  await expect(page.getByLabel('Active setup').locator('option:checked')).toHaveText('Standing plan');
});
