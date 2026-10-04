import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

/** Select the option whose text contains `text`. */
async function selectByText(select: import('@playwright/test').Locator, text: string) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

async function newGear(page: Page, template: RegExp, name: string, units = 1, params: Record<string, string> = {}) {
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'New gear' }).click();
  const dialog = page.getByRole('dialog', { name: 'New gear' });
  await dialog.getByRole('option', { name: template }).click();
  await dialog.getByLabel('Name').fill(name);
  for (const [label, value] of Object.entries(params)) {
    await dialog.getByLabel(label).fill(value);
    await dialog.getByLabel(label).press('Tab');
  }
  const count = dialog.getByLabel(/Units to add/);
  await count.fill(String(units));
  await count.press('Tab');
  await dialog.getByRole('button', { name: 'Create and edit' }).click();
  return page.getByRole('dialog', { name: new RegExp(`Edit gear: .*${name}`) });
}

test('custom monitors with a free-text category, added as an L/R pair', async ({ page }) => {
  const editor = await newGear(page, /Monitor speaker \(active, single\)/, 'Nearfield 8030', 2);
  const category = editor.getByLabel('Category (free text)');
  await category.fill('my nearfields');
  await editor.getByRole('button', { name: 'Save model' }).click();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  await expect(page.getByRole('heading', { name: 'my nearfields (2)' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Nearfield 8030 #2/ })).toBeVisible();
  // The custom category is offered as a library filter.
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByLabel('Category', { exact: true }).selectOption('my nearfields');
  await expect(page.getByRole('list', { name: 'Gear models' }).getByRole('listitem')).toHaveCount(1);
});

test('monitor controller and headphones from templates', async ({ page }) => {
  const editor = await newGear(page, /^Monitor controller/, 'MC', 1, {
    'Speaker outputs (stereo sets)': '3',
    'Headphone outputs': '2',
  });
  await editor.getByRole('button', { name: 'Connectors', exact: true }).click();
  // 5 inputs + DC in + 3 stereo speaker outputs + 2 headphone outputs
  await expect(editor.getByRole('heading', { name: 'Connectors (14)' })).toBeVisible();
  await editor.getByRole('button', { name: 'Cancel' }).click(); // created already; nothing edited
  const headphones = await newGear(page, /^Headphones/, 'My cans');
  await headphones.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('tab', { name: 'Inventory' }).click();
  await expect(page.getByRole('button', { name: /^My cans/ })).toBeVisible();
});

test('power strip with outlets and a shared rating', async ({ page }) => {
  const editor = await newGear(page, /^Power strip \(N outlets\)/, 'Strip 4', 1, { Outlets: '4' });
  await editor.getByRole('button', { name: 'Power', exact: true }).click();
  await expect(editor.getByLabel('This unit distributes mains (strip, PDU)')).toBeChecked();
  await expect(editor.getByText('4 outlets.')).toBeVisible();
  await editor.getByRole('button', { name: 'Add outlet' }).click();
  await expect(editor.getByText('5 outlets.')).toBeVisible();
  await editor.getByRole('button', { name: 'Save model' }).click();
});

test('rack case: put rack gear into a 10" case and see fit problems', async ({ page }) => {
  // A new 1U 19" effect, not yet in any rack.
  const editor = await newGear(page, /^Rack effect 1U/, 'Spare FX');
  await editor.getByRole('button', { name: 'Cancel' }).click(); // created already; nothing edited

  await page.getByRole('button', { name: 'New stand' }).click();
  const dialog = page.getByRole('dialog', { name: 'New stand' });
  await dialog.getByLabel('Template').selectOption({ label: 'Rack case' });
  await dialog.getByLabel('Name').fill('Half case');
  await dialog.getByLabel(/Units/).fill('4');
  await dialog.getByLabel(/Width standard/).fill('10');
  await dialog.getByLabel(/Width standard/).press('Tab');
  await dialog.getByRole('button', { name: 'Create' }).click();

  await page.getByRole('tab', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: /^Half case/ }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await selectByText(inspector.getByLabel('Add rack gear'), 'Spare FX');
  await inspector.getByRole('button', { name: 'Place' }).click();
  await expect(inspector.getByText('1/4 U used')).toBeVisible();
  await expect(inspector.getByText(/is 19" gear; this is a 10" rack/)).toBeVisible();
  // It can sit on the desk.
  await inspector.getByLabel(/Sits on/).selectOption({ label: 'Desk · Desktop' });
  await expect(inspector.getByLabel(/Sits on/)).toHaveValue('stand-unit-desk|top');
});

test('cables: define a type, own a labelled cable, assign it, auto-label the rest', async ({ page }) => {
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'New cable type' }).click();
  const typeDialog = page.getByRole('dialog', { name: 'New cable type' });
  await typeDialog.getByLabel('Name').fill('Red TRS patch');
  await typeDialog.getByLabel('Default colour').fill('#cc0000');
  await typeDialog.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('tab', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: 'Add owned cables' }).click();
  const own = page.getByRole('dialog', { name: 'Add owned cables' });
  await own.getByLabel('Cable type').selectOption({ label: 'Red TRS patch' });
  await own.getByLabel('Label', { exact: true }).fill('A99');
  await own.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Owned cables' })).toContainText('A99');

  await page.getByRole('tab', { name: 'Tables' }).click();
  const table = page.getByRole('table', { name: 'Connections' });
  const row = (n: number) =>
    table
      .getByRole('row')
      .nth(n)
      .getByLabel(/^Label for/);
  const first = table.getByRole('row').nth(1);
  await selectByText(first.getByLabel('Owned cable'), 'A99');
  await expect(row(1)).toHaveValue('A99');
  await page.getByRole('button', { name: 'Auto-label unlabelled' }).click();
  // Row 2 is the R side of the same stereo bundle: it shares the number.
  await expect(row(2)).toHaveValue('A99 R');
  await expect(row(3)).toHaveValue(/^A\d{2,}/);
});
