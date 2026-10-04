import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
});

/** A 400×300 photo of a panel shot at an angle: grey background, white quadrilateral, dark marker. */
const CORNERS = [
  { x: 40, y: 50 },
  { x: 360, y: 30 },
  { x: 370, y: 250 },
  { x: 30, y: 270 },
];
async function panelPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate((corners) => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(120, 140, 12, 0, Math.PI * 2);
    ctx.fill();
    return c.toDataURL('image/png');
  }, CORNERS);
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

/** Click image pixel (x, y) on the calibration overlay. */
async function clickImagePixel(page: Page, x: number, y: number) {
  const client = await page.evaluate(
    ({ x, y }) => {
      const svg = document.querySelector('svg[aria-label="Calibration canvas"]') as SVGSVGElement;
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const p = pt.matrixTransform(svg.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    { x, y },
  );
  await page.mouse.click(client.x, client.y);
}

async function saveDownload(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  return readFileSync(await (await download).path(), 'utf8');
}

test('scenario 1: template gear, rectified panel image, connectors placed on it, save/reload identical', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('button', { name: 'New gear' }).click();
  const dialog = page.getByRole('dialog', { name: 'New gear' });
  await dialog.getByRole('option', { name: /Desktop effect \(stereo\)/ }).click();
  await dialog.getByLabel('Name').fill('Photo FX');
  await dialog.getByRole('button', { name: 'Create and edit' }).click();
  const editor = page.getByRole('dialog', { name: /Edit gear: Photo FX/ });

  await editor.getByRole('button', { name: 'Dimensions and mounting' }).click();
  for (const [label, value] of [
    ['Width (x)', '215'],
    ['Depth (y)', '184'],
    ['Height (z)', '63'],
    ['Weight (kg)', '1.5'],
  ] as [string, string][]) {
    await editor.getByLabel(label).fill(value);
    await editor.getByLabel(label).press('Enter');
  }
  await editor.getByRole('button', { name: 'Connectors', exact: true }).click();
  await editor.getByLabel('Connector template').selectOption({ label: 'MIDI DIN In/Out/Thru' });
  await editor.getByRole('button', { name: 'Add group' }).click();

  // Import the rear-panel photo (the template's connectors are on the back) and straighten it.
  await editor.getByRole('button', { name: 'Images', exact: true }).click();
  await editor
    .getByLabel('Import back image')
    .setInputFiles({ name: 'rear.png', mimeType: 'image/png', buffer: await panelPhoto(page) });
  const backSlot = editor.getByRole('group', { name: 'back image' });
  await expect(backSlot).toContainText('400 × 300 px');
  await backSlot.getByRole('button', { name: 'Calibrate…' }).click();
  const cal = page.getByRole('dialog', { name: /Calibrate image/ });
  await expect(page.locator('svg[aria-label="Calibration canvas"]')).toBeVisible();
  await expect(cal.getByLabel('Face width (mm)')).toHaveValue('215');
  await expect(cal.getByLabel('Face height (mm)')).toHaveValue('63');
  for (const p of [CORNERS[2]!, CORNERS[0]!, CORNERS[3]!, CORNERS[1]!]) await clickImagePixel(page, p.x, p.y);
  await cal.getByRole('button', { name: 'Rectify' }).click();
  await expect(cal.getByTestId('calibration-status')).toContainText('400 × 117 px');
  await expect(cal.getByTestId('calibration-status')).toContainText('rectified');
  await cal.getByRole('button', { name: 'Apply' }).click();
  await expect(cal).toBeHidden();
  await expect(backSlot).toContainText('rectified');

  // Place connectors on the panel: click-to-place for three, drag-and-drop for one.
  await editor.getByRole('button', { name: 'Panel layout' }).click();
  const canvas = editor.getByRole('img', { name: /back panel of Photo FX/ });
  const box = (await canvas.boundingBox())!;
  const unplaced = editor.getByRole('list', { name: 'Unplaced connectors' });
  await expect(unplaced.getByRole('listitem')).toHaveCount(8);
  const targets: [string, number, number][] = [
    ['In L', 0.2, 0.45],
    ['In R', 0.3, 0.45],
    ['MIDI In', 0.6, 0.45],
  ];
  for (const [label, fx, fy] of targets) {
    await unplaced.getByRole('button', { name: `Place ${label}` }).click();
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
  await unplaced
    .getByRole('listitem')
    .filter({ hasText: 'Out L' })
    .dragTo(canvas, { targetPosition: { x: box.width * 0.45, y: box.height * 0.45 } });
  await expect(unplaced.getByRole('listitem')).toHaveCount(4);
  await expect(editor.getByRole('button', { name: 'In L (jack-6.35-TRS)' })).toBeVisible();
  await editor.getByRole('button', { name: 'Save model' }).click();
  await expect(editor).toBeHidden();

  const first = await saveDownload(page);
  const doc = JSON.parse(first);
  const model = doc.library.gearModels.find((m: { name: string }) => m.name === 'Photo FX');
  expect(model.imageCalibration.back.rectified).toBe(true);
  expect(model.imageCalibration.back.pxPerMm).toBeCloseTo(400 / 215, 3);
  const asset = doc.assets.items[model.images.back.id];
  expect(asset).toMatchObject({ widthPx: 400, heightPx: 117 });
  expect(asset.dataUri).toMatch(/^data:image\/(webp|png);base64,/);
  // The raw import was replaced by the rectified image and pruned.
  expect(
    Object.keys(doc.assets.items).filter(
      (id) =>
        !doc.library.gearModels.some((m: { images: Record<string, { id: string }> }) =>
          Object.values(m.images).some((r) => r.id === id),
        ),
    ),
  ).toEqual([]);
  const placed = model.connectors.filter(
    (_: unknown, i: number) => model.provenance[`connectors.${i}.pos`]?.kind === 'user',
  );
  expect(placed.map((c: { id: string }) => c.id).sort()).toEqual(['in-l', 'in-r', 'midi-in', 'out-l']);
  for (const c of placed) {
    expect(c.pos.x % 5).toBe(0); // snapped to the 5 mm grid
    expect(c.pos.y % 5).toBe(0);
    expect(c.pos.x).toBeGreaterThan(0);
    expect(c.pos.x).toBeLessThanOrEqual(215);
    expect(c.pos.y).toBeLessThanOrEqual(63);
  }

  await page.reload();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  await (await chooser).setFiles({ name: 'studio.json', mimeType: 'application/json', buffer: Buffer.from(first) });
  await expect(page.getByTestId('project-name')).toHaveText('My studio (sample)');
  const second = await saveDownload(page);
  const strip = (s: string) => s.replace(/"updatedAt": "[^"]+"/, '');
  expect(strip(second)).toBe(strip(first));
});

test('Face tab shows a unit panel; a missing image falls back to a placeholder (scenario 10)', async ({ page }) => {
  const golden = JSON.parse(readFileSync(new URL('../fixtures/golden-project.json', import.meta.url), 'utf8'));
  delete golden.assets.items['asset-dt2-back'];
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open…' }).click();
  await (
    await chooser
  ).setFiles({ name: 'missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(golden)) });
  await expect(page.getByTestId('project-name')).toHaveText('Golden fixture');
  await page
    .getByRole('button', { name: /^Digitone II Elektron/ })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Face' }).click();
  await expect(page.getByRole('img', { name: /back panel of Digitone II/ })).toContainText('Image missing');
  await expect(page.getByRole('list', { name: 'Unplaced connectors' }).getByRole('listitem')).toHaveCount(10);
});
