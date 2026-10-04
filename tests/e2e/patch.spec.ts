import { expect, type Locator, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

async function center(l: Locator) {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Drag from one port to another with the mouse (optionally holding Shift). */
async function connect(page: Page, from: Locator, to: Locator, shift = false) {
  const a = await center(from);
  const b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

test('scenario 3: stereo pair with Shift-drag, MIDI with channel and Thru; badges, arrows, flow', async ({ page }) => {
  await page.getByRole('tab', { name: 'Setups' }).click();
  await page.getByRole('button', { name: 'New blank setup' }).click();
  await page.getByLabel('Setup name').fill('Scenario 3');
  await page.getByRole('tab', { name: 'Patch' }).click();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  const canvas = page.getByRole('img', { name: 'Patch of Scenario 3' });
  const cb = (await canvas.boundingBox())!;
  const drops: [RegExp, number, number][] = [
    [/^Digitone II Elektron/, 0.1, 0.15],
    [/^Octatrack MKII Elektron/, 0.1, 0.55],
    [/^Analog Four MKII Elektron/, 0.35, 0.75],
    [/^MixWizard WZ3 16:2 Allen/, 0.75, 0.02],
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
      .first(); // hit circle, not the label
  // While dragging, an output-to-output target is blocked.
  await connect(page, port('Digitone II', 'Main L'), port('MixWizard WZ3 16:2', 'CH 1 Line'), true);
  const audio = canvas.locator('[data-connection-id][data-domain^="audio-"]');
  await expect(audio).toHaveCount(2);
  await expect(canvas.locator('[data-domain="audio-L"]')).toContainText('L');
  await expect(canvas.locator('[data-domain="audio-R"]')).toContainText('R');
  await expect(canvas.locator('[data-domain="audio-L"] path[marker-end]')).toHaveCount(1);
  await expect(canvas.locator('[data-domain="audio-L"] [data-animated="true"]')).toHaveCount(1);

  await connect(page, port('Octatrack MKII', 'MIDI Out'), port('Analog Four MKII', 'MIDI In'));
  const midiDialog = page.getByRole('dialog', { name: 'MIDI channels and purposes' });
  await midiDialog.getByLabel('MIDI channels').fill('3');
  await midiDialog.getByRole('button', { name: 'Apply' }).click();
  await connect(page, port('Analog Four MKII', 'MIDI Thru'), port('Digitone II', 'MIDI In'));
  await page.getByRole('dialog', { name: 'MIDI channels and purposes' }).getByRole('button', { name: 'Apply' }).click();
  const midi = canvas.locator('[data-domain="midi"]');
  await expect(midi).toHaveCount(2);
  await expect(midi.first()).toContainText('3');

  // The inspector shows the derived direction and the suggested cable.
  await midi.first().dispatchEvent('pointerdown'); // animated cables never settle for Playwright's click
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText('Octatrack MKII · MIDI Out → Analog Four MKII · MIDI In');
  await expect(inspector).toContainText('MIDI DIN 5');

  // Blocked: output to output never creates a cable.
  await connect(page, port('Digitone II', 'Main R'), port('Octatrack MKII', 'Main L'));
  await expect(canvas.locator('[data-connection-id]')).toHaveCount(4);

  // Right-click → disable greys the cable; legend filter dims a family.
  await canvas.locator('[data-domain="audio-L"]').dispatchEvent('contextmenu', { button: 2 });
  await page.getByRole('menuitem', { name: 'Disable' }).click();
  await expect(canvas.locator('[data-domain="audio-L"]')).toHaveAttribute('opacity', '0.3');
  await page.getByLabel('Show MIDI').uncheck();
  await expect(midi.first()).toHaveAttribute('opacity', '0.12');
});

test('ELK auto-layout, bulk connect, port inspector and cable BOM', async ({ page }) => {
  await page.getByRole('tab', { name: 'Patch' }).click();
  const canvas = page.getByRole('img', { name: 'Patch of Current' });
  const dt = canvas.locator('[data-unit-id="unit-dt2"]');
  const before = await dt.getAttribute('transform');
  await page.getByRole('button', { name: 'Auto-layout (ELK)' }).click();
  await expect(dt).not.toHaveAttribute('transform', before!);

  const count = await canvas.locator('[data-connection-id]').count();
  await page.getByRole('button', { name: 'Bulk connect…' }).click();
  const bulk = page.getByRole('dialog', { name: 'Bulk connect' });
  await bulk.getByLabel('From unit').selectOption({ label: 'RD-8 MKII' });
  await bulk.getByLabel('Outputs').selectOption(['out-voice-9', 'out-voice-10', 'out-voice-11']);
  await bulk.getByLabel('To unit').selectOption({ label: 'MixWizard WZ3 16:2' });
  await bulk.getByLabel('Inputs').selectOption(['ret2-l', 'ret2-r', 'ch16-mic']);
  await expect(bulk).toContainText('3 connections');
  await bulk.getByRole('button', { name: 'Connect sequentially' }).click();
  await expect(canvas.locator('[data-connection-id]')).toHaveCount(count + 3);

  // Clicking (press + release on the same port) inspects the port.
  const portCircle = canvas
    .getByRole('button', { name: 'Port Digitone II Main L', exact: true })
    .locator('circle')
    .first();
  const b = (await portCircle.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText('Digitone II · Main L');
  await expect(inspector).toContainText('imp-balanced · line');

  await page.getByRole('tab', { name: 'Tables' }).click();
  await page.getByRole('tab', { name: 'Cable BOM' }).click();
  const bom = page.getByRole('table', { name: 'Cable BOM' });
  await expect(bom).toContainText('MIDI DIN 5');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('Current-cable-bom.csv');
});
