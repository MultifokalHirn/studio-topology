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

test('scenario 6: hover trace with breadcrumb, where it ends (monitors), follow signal, L→R swap', async ({ page }) => {
  // Monitors: two units from the single-speaker template.
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'New gear' }).click();
  const dialog = page.getByRole('dialog', { name: 'New gear' });
  await dialog.getByRole('option', { name: /Monitor speaker \(active, single\)/ }).click();
  await dialog.getByLabel('Name').fill('Nearfield');
  await dialog.getByLabel(/Units to add/).fill('2');
  await dialog.getByLabel(/Units to add/).press('Tab');
  await dialog.getByRole('button', { name: 'Create and edit' }).click();
  await page
    .getByRole('dialog', { name: /Edit gear/ })
    .getByRole('button', { name: 'Cancel' })
    .click();

  await page.getByRole('tab', { name: 'Patch' }).click();
  // A whole studio of animated cables never looks "stable" to Playwright's drag; pause the flow.
  await page.getByLabel('Animate flow').uncheck();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  const canvas = page.getByRole('img', { name: 'Patch of Current' });
  const cb = (await canvas.boundingBox())!;
  await page
    .getByRole('button', { name: 'Nearfield', exact: true })
    .filter({ visible: true })
    .dragTo(canvas, { targetPosition: { x: cb.width * 0.15, y: cb.height * 0.85 } });
  await page
    .getByRole('button', { name: /^Nearfield #2/ })
    .dragTo(canvas, { targetPosition: { x: cb.width * 0.35, y: cb.height * 0.85 } });
  await page.getByLabel('All ports').check();
  await page.getByRole('button', { name: 'Auto-layout (ELK)' }).click();
  await canvas.focus();
  await page.keyboard.press('f');
  const port = (unit: string, label: string) =>
    canvas.getByRole('button', { name: `Port ${unit} ${label}`, exact: true });
  await connect(page, port('SSL 12', 'Line Out 1'), port('Nearfield', 'Input'));
  await connect(page, port('SSL 12', 'Line Out 2'), port('Nearfield #2', 'Input'));

  // Hover: breadcrumb along the main path.
  await hit(port('Octatrack MKII', 'Main L')).hover();
  const crumb = page.getByRole('status', { name: 'Signal trace' });
  await expect(crumb).toContainText(
    'Octatrack MKII · Main L → MixWizard WZ3 16:2 · CH 1 Line → MixWizard WZ3 16:2 · Main Out L → SSL 12 · Input 1',
  );

  // Click: inspector lists where it ends.
  const b = (await hit(port('Octatrack MKII', 'Main L')).boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const destinations = page.getByRole('list', { name: 'Destinations' });
  await expect(destinations).toContainText('Nearfield · Input');
  await expect(destinations).toContainText('Nearfield #2 · Input');

  await page.getByRole('button', { name: 'Follow signal ▶' }).click();
  await expect(crumb).toContainText('SSL 12 · Input 1', { timeout: 6000 });

  // A deliberate L→R swap.
  await connect(page, port('Octatrack MKII', 'Cue L'), port('Analog Heat MKII', 'In R'));
  await page.getByRole('tab', { name: 'Issues' }).click();
  await expect(page.locator('[data-rule="SIG-006"]').first()).toContainText('L/R swap');
});

test('scenario 7: clock tree from the Pyramid, DIN sync to the RD-8, second master raises CLK-001', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Tables' }).click();
  await page.getByRole('tab', { name: 'MIDI/clock tree' }).click();
  const tree = page.getByLabel('Clock tree');
  await expect(tree).toContainText('Pyramid MK3');
  await expect(tree.locator('[data-clock-link="unit-mioxl>unit-dt2"]')).toContainText('MIDI');
  await expect(tree.locator('[data-clock-link="unit-mioxl>unit-a4"]')).toBeVisible();

  // Pyramid Out B → DIN sync 24 → RD-8 clock in.
  await page.getByRole('button', { name: /^Pyramid MK3 Squarp/ }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByLabel('Clock master')).toBeChecked();
  await inspector.getByLabel('MIDI Out B mode').selectOption('dinsync24');
  await page.getByRole('tab', { name: 'Patch' }).click();
  await page.getByLabel('Animate flow').uncheck();
  await page.getByLabel('All ports').check();
  await page.getByRole('button', { name: 'Auto-layout (ELK)' }).click();
  const canvas = page.getByRole('img', { name: 'Patch of Current' });
  await canvas.focus();
  await page.keyboard.press('f');
  await connect(
    page,
    canvas.getByRole('button', { name: 'Port Pyramid MK3 MIDI Out B (DIN sync 24)', exact: true }),
    canvas.getByRole('button', { name: 'Port RD-8 MKII Clock In', exact: true }),
  );
  await page.getByRole('tab', { name: 'Tables' }).click();
  await page.getByRole('tab', { name: 'MIDI/clock tree' }).click();
  await expect(page.getByLabel('Clock tree').locator('[data-clock-link="unit-pyramid>unit-rd8"]')).toContainText(
    'DINSYNC24',
  );

  // A second master in the same clock domain.
  await page.getByRole('button', { name: /^Analog Four MKII Elektron/ }).click();
  await inspector.getByLabel('Clock master').check();
  await page.getByRole('tab', { name: 'Issues' }).click();
  await expect(page.locator('[data-rule="CLK-001"]')).toContainText(
    'Pyramid MK3 sends clock to Analog Four MKII, which is also set as clock master',
  );
});
