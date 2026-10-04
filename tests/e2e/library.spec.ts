import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Download/upload fallbacks so the test controls the files.
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

test('the sample studio from the gear reference loads on first launch', async ({ page }) => {
  await page.getByRole('tab', { name: 'Inventory' }).click();
  for (const name of [
    'Digitone II',
    'Octatrack MKII',
    'MixWizard WZ3 16:2',
    'Ultrapatch Pro PX3000',
    'iPad Pro M4 11-inch',
  ]) {
    await expect(
      page.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}\\b`) }).first(),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: /^RD-8 MKII Behringer/ }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText('external-dc 18 V');
  await page.getByRole('tab', { name: 'Issues' }).click();
  await expect(page.getByText(/Unverified fields \(\d+\)/)).toBeVisible();
});

async function saveDownload(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const path = await (await download).path();
  return readFileSync(path, 'utf8');
}

test('scenario 1 (without images): register gear from a template, save, reload, identical', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'New gear' }).click();
  const dialog = page.getByRole('dialog', { name: 'New gear' });
  await dialog.getByRole('option', { name: /Desktop effect \(stereo\)/ }).click();
  await dialog.getByLabel('Manufacturer').fill('Acme');
  await dialog.getByLabel('Name').fill('Test FX');
  await dialog.getByRole('button', { name: 'Create and edit' }).click();

  const editor = page.getByRole('dialog', { name: /Edit gear: Acme Test FX/ });
  await editor.getByRole('button', { name: 'Dimensions and mounting' }).click();
  for (const [label, value] of <[string, string][]>[
    ['Width (x)', '215'],
    ['Depth (y)', '184'],
    ['Height (z)', '63'],
    ['Weight (kg)', '1.5'],
  ]) {
    const input = editor.getByLabel(label);
    await input.fill(value);
    await input.press('Enter');
  }

  await editor.getByRole('button', { name: 'Connectors', exact: true }).click();
  const template = editor.getByLabel('Connector template');
  await template.selectOption({ label: 'MIDI DIN In/Out/Thru' });
  await editor.getByRole('button', { name: 'Add group' }).click();
  await template.selectOption({ label: 'USB-B device (MIDI)' });
  await editor.getByRole('button', { name: 'Add group' }).click();

  // The USB row is selected after adding; give it audio 2 in / 2 out via the advanced editor.
  const json = editor.getByLabel(/Advanced: usb/);
  const usb = JSON.parse(await json.inputValue());
  usb.usb.carries = ['midi', 'audio'];
  usb.usb.audio = { inChannels: 2, outChannels: 2, compliance: 'class-compliant' };
  await json.fill(JSON.stringify(usb, null, 2));
  await editor.getByRole('button', { name: 'Apply JSON' }).click();
  await editor.getByRole('button', { name: 'Save model' }).click();
  await expect(editor).toBeHidden();

  const first = await saveDownload(page);
  const model = JSON.parse(first).library.gearModels.find((m: { name: string }) => m.name === 'Test FX');
  expect(model.dimensions).toMatchObject({ w: 215, d: 184, h: 63, weightKg: 1.5 });
  expect(model.provenance['dimensions.w'].kind).toBe('user');
  expect(model.connectors.map((c: { id: string }) => c.id)).toEqual([
    'in-l',
    'in-r',
    'out-l',
    'out-r',
    'dc-in',
    'midi-in',
    'midi-out',
    'midi-thru',
    'usb',
  ]);
  expect(model.connectors.find((c: { id: string }) => c.id === 'in-l').channel).toMatchObject({
    role: 'L',
    group: 'in',
  });
  expect(model.connectors.at(-1).usb.audio).toEqual({ inChannels: 2, outChannels: 2, compliance: 'class-compliant' });

  // Reload, reopen the saved file, save again: identical apart from the save timestamp.
  await page.reload();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  await (await chooser).setFiles({ name: 'studio.json', mimeType: 'application/json', buffer: Buffer.from(first) });
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
  const second = await saveDownload(page);
  const strip = (s: string) => s.replace(/"updatedAt": "[^"]+"/, '');
  expect(strip(second)).toBe(strip(first));
});

test('every gear editor section renders for a complex model', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'Edit Allen & Heath MixWizard WZ3 16:2' }).click();
  const editor = page.getByRole('dialog', { name: /Edit gear/ });
  for (const section of [
    'Identity',
    'Dimensions and mounting',
    'Connectors',
    'Internal routing',
    'Power',
    'USB / MIDI / Clock',
    'Ergonomics',
    'Images',
    'Provenance',
  ]) {
    await editor.getByRole('button', { name: section, exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await expect(editor.getByRole('heading', { level: 3 }).first()).toBeVisible();
  }
});
