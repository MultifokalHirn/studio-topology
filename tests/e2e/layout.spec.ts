import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
  await page.getByLabel('Active setup').selectOption({ label: 'Planned (standing)' });
});

test('scenario 2: tier planes, budgets, loads, pitch and occlusion; +20 mm on the top tier clears it', async ({
  page,
}) => {
  // Middle: Octatrack, Analog Four, KeyStep; top: Digitone II and iPad (the sample also has the Heat on top; remove it).
  await page.getByRole('button', { name: /^Analog Heat MKII Elektron/ }).click();
  await page
    .getByRole('complementary', { name: 'Inspector' })
    .getByRole('button', { name: 'Remove from setup' })
    .click();

  await page.getByRole('button', { name: /^Jaspers 3D-145B/ }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const set = async (label: string, value: string) => {
    const input = inspector.getByLabel(label);
    await input.fill(value);
    await input.press('Enter');
  };
  // Planes ≈ 800 / 1000 / 1190 mm → trays = plane − tallest unit height (RD-8 77, Analog Four 82, Digitone II 63),
  // snapped to the stand's 5 mm adjustment step: 725 / 920 / 1125.
  await set('Height of Bottom tier (reinforced)', '723');
  await set('Height of Middle tier', '918');
  await set('Height of Top tier', '1127');
  await expect(inspector.getByLabel('Height of Top tier')).toHaveValue('1125');

  const report = page.getByRole('region', { name: 'Layout report' });
  const surfaces = report.getByRole('table', { name: 'Surfaces' });
  await expect(surfaces.locator('tr[data-surface="tier-middle"]')).toContainText('9201002'); // tray, plane
  await expect(surfaces.locator('tr[data-surface="tier-middle"]')).toContainText('1225 / 1450 mm'); // width budget
  await expect(surfaces.locator('tr[data-surface="tier-middle"]')).toContainText('4.7+ / 15 kg'); // KeyStep weight unknown
  await expect(surfaces.locator('tr[data-surface="tier-top"]')).toContainText('11251188');
  await expect(report.getByRole('table', { name: 'Row pitch' })).toContainText('186 mm');
  const occ = report.getByTestId('occlusion-unit-dt2-unit-ot');
  await expect(occ).toHaveText(/^2\d\.\d%$/);
  const issues = report.getByRole('list', { name: 'Layout issues' });
  await expect(issues).toContainText(/Digitone II hides 2\d% of Octatrack MKII's controls/);

  await set('Height of Top tier', '1145');
  await expect(surfaces.locator('tr[data-surface="tier-top"]')).toContainText('11451208');
  await expect(occ).toHaveText(/^1[0-4]\.\d%$/);
  await expect(issues).not.toContainText('Digitone II hides');
});

test('drop a unit from the inventory onto a tier, then nudge and remove it', async ({ page }) => {
  await page.getByRole('tab', { name: 'Front elevation' }).click();
  const canvas = page.getByRole('img', { name: /front layout of Planned/ });
  // Free space at the right end of the bottom tier: aim at the RD-8's tier height, right of it.
  const rd8 = canvas.getByRole('button', { name: /^RD-8 MKII/ });
  const box = (await rd8.boundingBox())!;
  await page.getByRole('button', { name: /^Nord Drum 3P Clavia/ }).dragTo(canvas, {
    targetPosition: {
      x: box.x - (await canvas.boundingBox())!.x + box.width * 1.4,
      y: box.y - (await canvas.boundingBox())!.y + box.height / 2,
    },
  });
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('region', { name: 'Placement' })).toContainText(
    'Jaspers 3D-145B · Bottom tier (reinforced)',
  );
  const xy = inspector.getByTestId('placement-xy');
  const before = Number((await xy.textContent())!.split('/')[0]);
  await canvas.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(xy).toContainText(`${before + 10} /`);
  await page.keyboard.press('Control+z');
  await expect(xy).toContainText(`${before} /`);
  await page.keyboard.press('Delete');
  await expect(inspector.getByRole('region', { name: 'Placement' })).toContainText('Not placed');
});

test('stand editor and tier measure helper', async ({ page }) => {
  await page.getByRole('button', { name: /^Jaspers 3D-145B/ }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: 'Edit stand model…' }).click();
  const editor = page.getByRole('dialog', { name: /Edit stand: Jaspers 3D-145B/ });
  await expect(editor.getByRole('group', { name: /^Surface / })).toHaveCount(3);
  const top = editor.getByRole('group', { name: 'Surface Top tier' });
  await top.getByLabel('Holder length').fill('450');
  await top.getByLabel('Holder length').press('Enter');
  await editor.getByRole('button', { name: 'Save stand' }).click();
  await expect(editor).toBeHidden();
  await expect(inspector).toContainText('Top tier: 1450 × 400 mm');

  await page.getByRole('tab', { name: 'Layout' }).click();
  await expect(page.getByRole('status')).toContainText('Top tier');
  await inspector.getByRole('button', { name: 'Measure tier offsets…' }).click();
  const helper = page.getByRole('dialog', { name: 'Measure tier offsets' });
  await helper.getByLabel('Lower tier').selectOption({ label: 'Middle tier' });
  await helper.getByLabel('Upper tier').selectOption({ label: 'Top tier' });
  await helper.getByLabel(/Horizontal offset/).fill('120');
  await helper.getByLabel(/Vertical gap/).fill('205');
  await helper.getByLabel(/Vertical gap/).press('Tab');
  await helper.getByRole('button', { name: 'Apply' }).click();
  await expect(inspector.getByLabel('Depth offset of Top tier')).toHaveValue('120');
  await expect(inspector.getByLabel('Height of Top tier')).toHaveValue('1125');
  await expect(page.getByRole('status')).not.toContainText('Top tier');
});
