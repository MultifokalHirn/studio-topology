import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  // Popups print on load; make print a no-op so headless runs never wait on a dialog.
  await context.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
  await page.getByLabel('Active setup').selectOption({ label: 'Planned (standing)' });
});

test('scenario 9: 1:10 PDF of the front elevation with connection table and BOM; 1:1 footprints; CSV', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByLabel('View').selectOption('front');
  await dialog.getByLabel('Scale').selectOption('10');
  await expect(dialog.getByLabel('Connection table')).toBeChecked();
  await expect(dialog.getByLabel('Cable BOM')).toBeChecked();
  await expect(dialog.getByTestId('drawing-pages')).toContainText('at 1:10');

  // Print / PDF: a print-ready document with physical page sizes and the scale in the title block.
  const [report] = await Promise.all([
    page.waitForEvent('popup'),
    dialog.getByRole('button', { name: 'Print / PDF…' }).click(),
  ]);
  await expect(report.locator('svg[data-scale="10"]').first()).toBeAttached();
  const sheet = report.locator('.sheet > svg').first();
  await expect(sheet).toHaveAttribute('width', '297mm');
  await expect(sheet).toHaveAttribute('height', '210mm');
  await expect(sheet).toContainText('Scale 1:10');
  await expect(sheet).toContainText('Front elevation');
  await expect(report.locator('[data-unit]').first()).toBeAttached();
  await expect(report.getByRole('table', { name: 'Connection table' })).toBeVisible();
  await expect(report.getByRole('table', { name: 'Cable BOM' })).toBeVisible();
  expect(await report.locator('style').first().textContent()).toContain('size:A4 landscape');
  await report.close();

  // 1:1 footprint templates over several pages.
  await expect(dialog.getByTestId('footprint-pages')).toContainText('page(s)');
  const [tiles] = await Promise.all([
    page.waitForEvent('popup'),
    dialog.getByRole('button', { name: 'Print templates…' }).click(),
  ]);
  await expect(tiles.locator('svg[data-scale="1"]').first()).toBeAttached();
  expect(await tiles.locator('.sheet').count()).toBeGreaterThan(1);
  await expect(tiles.locator('.sheet').first()).toContainText('Scale 1:1');
  await expect(tiles.locator('.sheet').first()).toContainText('FRONT');
  await tiles.close();

  // CSV exports.
  const [bom] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Cable BOM (CSV)' }).click(),
  ]);
  expect(bom.suggestedFilename()).toBe('Planned-standing-cable-bom.csv');
  expect(readFileSync(await bom.path(), 'utf8').split('\n')[0]).toBe('cable,length_mm,needed,owned_in_stock,missing');
  const [power] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Power sheet (CSV)' }).click(),
  ]);
  expect(readFileSync(await power.path(), 'utf8')).toMatch(/^unit,source,supply,voltage_v/);
  const [matrix] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Connection matrix (CSV)' }).click(),
  ]);
  expect(readFileSync(await matrix.path(), 'utf8')).toMatch(/^output \\ input,/);

  // Text exports and the static snapshot.
  const [mermaid] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Signal graph (Mermaid)' }).click(),
  ]);
  expect(readFileSync(await mermaid.path(), 'utf8')).toMatch(/^flowchart LR/);
  const [snapshot] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Static snapshot (HTML)' }).click(),
  ]);
  const html = readFileSync(await snapshot.path(), 'utf8');
  expect(html).toContain('id="studio-planner-data"');
  expect(html).not.toMatch(/<(script|link)[^>]+src=/);
});

test('SVG and PNG of the current view download at scale', async ({ page }) => {
  await page.getByRole('button', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByLabel('Scale').selectOption('20');
  const [svg] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'SVG', exact: true }).click(),
  ]);
  expect(svg.suggestedFilename()).toBe('Planned-standing-front-1-20.svg');
  expect(readFileSync(await svg.path(), 'utf8')).toMatch(/<svg[^>]+data-scale="20"/);
  const [png] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'PNG', exact: true }).click(),
  ]);
  const bytes = readFileSync(await png.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
});

test('Tables tab: matrix, MIDI map, power sheet, stands, gear sheets', async ({ page }) => {
  await page.getByRole('tab', { name: 'Tables' }).click();
  await page.getByRole('tab', { name: 'Matrix' }).click();
  await expect(page.getByRole('table', { name: 'Connection matrix' })).toBeVisible();
  await expect(page.locator('[data-cell="link"]').first()).toBeVisible();
  await page.getByRole('tab', { name: 'MIDI map' }).click();
  await expect(page.getByRole('table', { name: 'MIDI channel map' })).toBeVisible();
  await page.getByRole('tab', { name: 'Power sheet' }).click();
  await expect(page.getByRole('table', { name: 'Power sheet' })).toBeVisible();
  await expect(page.getByTestId('mains-total')).toContainText(/Mains total \d+ W at 230 V/);
  await expect(page.getByRole('list', { name: 'Adapter labels' }).getByRole('listitem').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Stands' }).click();
  await expect(page.getByRole('table', { name: 'Stand summary' })).toContainText('Jaspers');
  await page.getByRole('tab', { name: 'Gear sheets' }).click();
  await expect(
    page.frameLocator('iframe[title="Gear sheets preview"]').getByText('Connectors (').first(),
  ).toBeVisible();
});
