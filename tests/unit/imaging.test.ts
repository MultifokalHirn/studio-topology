import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { faceLocalToBody } from '@/domain/geometry';
import { isConnectorPlaced, mirrorToOppositeFace, snapPoint } from '@/domain/faces';
import { applyHomography, homographyFrom4, invertMat3, orderCorners, rectifiedSize } from '@/domain/homography';
import {
  createPixels,
  crop,
  fitWithin,
  floodTransparent,
  pxPerMmFromPoints,
  rotate90,
  warpPerspective,
  type Pixels,
} from '@/domain/imaging';
import type { Connector, GearModel } from '@/domain/types';

const near = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) =>
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(eps);

describe('homography', () => {
  it('maps four corners exactly and inverts', () => {
    const src = [
      { x: 10, y: 20 },
      { x: 300, y: 5 },
      { x: 320, y: 210 },
      { x: 0, y: 190 },
    ];
    const dst = [
      { x: 0, y: 0 },
      { x: 215, y: 0 },
      { x: 215, y: 63 },
      { x: 0, y: 63 },
    ];
    const H = homographyFrom4(src, dst)!;
    src.forEach((p, i) => near(applyHomography(H, p), dst[i]!));
    const inv = invertMat3(H)!;
    dst.forEach((p, i) => near(applyHomography(inv, p), src[i]!));
  });

  it('round-trips random interior points (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (u, v) => {
        const src = [
          { x: 3, y: 7 },
          { x: 410, y: 30 },
          { x: 390, y: 260 },
          { x: 15, y: 240 },
        ];
        const dst = [
          { x: 0, y: 0 },
          { x: 400, y: 0 },
          { x: 400, y: 250 },
          { x: 0, y: 250 },
        ];
        const H = homographyFrom4(src, dst)!;
        const p = { x: u * 400, y: v * 250 };
        const q = applyHomography(invertMat3(H)!, p);
        const back = applyHomography(H, q);
        expect(Number.isNaN(back.x)).toBe(false);
        near(back, p, 1e-6);
      }),
    );
  });

  it('rejects degenerate corners', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(
      homographyFrom4(
        line,
        line.map((p) => ({ x: p.x, y: 0 })),
      ),
    ).toBeNull();
  });

  it('orders clicked corners TL, TR, BR, BL whatever the click order', () => {
    const tl = { x: 5, y: 8 }, tr = { x: 300, y: 2 }, br = { x: 310, y: 200 }, bl = { x: 0, y: 190 }; // prettier-ignore
    expect(orderCorners([br, tl, bl, tr])).toEqual([tl, tr, br, bl]);
  });

  it('rectified size keeps the face aspect ratio', () => {
    expect(rectifiedSize(215, 63, 2048)).toEqual({ width: 2048, height: 600, pxPerMm: 2048 / 215 });
  });
});

/** Synthetic image: white panel with a black square marker at panel coordinates (0.25, 0.25)…(0.5, 0.5), drawn skewed. */
function skewedPanel(): { img: Pixels; corners: { x: number; y: number }[] } {
  const corners = [
    { x: 20, y: 30 },
    { x: 180, y: 10 },
    { x: 190, y: 120 },
    { x: 10, y: 110 },
  ];
  const H = homographyFrom4(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    corners,
  )!;
  const inv = invertMat3(H)!;
  const img = createPixels(200, 140);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const p = applyHomography(inv, { x: x + 0.5, y: y + 0.5 });
      const inside = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
      const marker = p.x >= 0.25 && p.x <= 0.5 && p.y >= 0.25 && p.y <= 0.5;
      const i = (y * img.width + x) * 4;
      const v = marker ? 0 : 255;
      img.data.set(inside ? [v, v, v, 255] : [128, 0, 0, 255], i);
    }
  return { img, corners };
}

describe('warpPerspective', () => {
  it('rectifies a skewed panel so the marker lands where it belongs', () => {
    const { img, corners } = skewedPanel();
    const out = { width: 160, height: 80 };
    const H = homographyFrom4(corners, [
      { x: 0, y: 0 },
      { x: out.width, y: 0 },
      { x: out.width, y: out.height },
      { x: 0, y: out.height },
    ])!;
    const r = warpPerspective(img, H, out.width, out.height);
    const px = (x: number, y: number) => r.data[(y * r.width + x) * 4]!;
    expect(px(Math.round(0.375 * 160), Math.round(0.375 * 80))).toBeLessThan(40); // inside marker: black
    expect(px(Math.round(0.75 * 160), Math.round(0.75 * 80))).toBeGreaterThan(215); // panel: white
    expect(px(2, 2)).toBeGreaterThan(200); // corner is panel, not the red background
    expect(r.data[(2 * r.width + 2) * 4 + 1]).toBeGreaterThan(200);
  });
});

describe('pixel ops', () => {
  const grad = (): Pixels => {
    const p = createPixels(4, 2);
    for (let i = 0; i < 8; i++) p.data.set([i * 10, 0, 0, 255], i * 4);
    return p;
  };

  it('rotates by quarter turns and back', () => {
    const r = rotate90(grad(), 1);
    expect([r.width, r.height]).toEqual([2, 4]);
    // Clockwise: the bottom-left source pixel (index 4) becomes the top-left.
    expect(r.data[0]).toBe(40);
    expect(Array.from(rotate90(r, 3).data)).toEqual(Array.from(grad().data));
  });

  it('crops and clamps to the image', () => {
    const c = crop(grad(), { x: 1, y: 1, w: 10, h: 10 });
    expect([c.width, c.height]).toEqual([3, 1]);
    expect(c.data[0]).toBe(50);
  });

  it('downscales only above the limit', () => {
    const big = createPixels(4096, 1024);
    expect([fitWithin(big).width, fitWithin(big).height]).toEqual([2048, 512]);
    const small = grad();
    expect(fitWithin(small)).toBe(small);
  });

  it('click-to-transparent fills only the connected similar region', () => {
    const p = createPixels(5, 1);
    [
      [255, 255, 255],
      [250, 250, 250],
      [0, 0, 0],
      [255, 255, 255],
      [255, 255, 255],
    ].forEach((c, i) => p.data.set([...c, 255], i * 4));
    const out = floodTransparent(p, { x: 0, y: 0 }, 10);
    expect([0, 1, 2, 3, 4].map((i) => out.data[i * 4 + 3])).toEqual([0, 0, 255, 255, 255]);
  });

  it('scale check', () => {
    expect(pxPerMmFromPoints({ x: 0, y: 0 }, { x: 300, y: 400 }, 100)).toBe(5);
    expect(pxPerMmFromPoints({ x: 0, y: 0 }, { x: 0, y: 0 }, 100)).toBeNull();
  });
});

describe('face helpers', () => {
  it('snaps to the grid', () => {
    expect(snapPoint({ x: 12.4, y: 7.6 }, 5)).toEqual({ x: 10, y: 10 });
    expect(snapPoint({ x: 12.4, y: 7.6 }, 0)).toEqual({ x: 12.4, y: 7.6 });
  });

  it('moving a connector to the opposite face keeps its physical position (spec §3.2)', () => {
    const m = {
      dimensions: { w: 200, d: 150, h: 60, weightKg: null, heightIncludesKnobsFeet: true },
      faces: {},
      provenance: {},
    } as unknown as GearModel;
    const c: Connector = {
      id: 'x',
      label: 'X',
      face: 'front',
      pos: { x: 30, y: 10 },
      domain: 'audio.analog',
      direction: 'out',
      jack: 'jack-6.35-TS',
    };
    const moved = mirrorToOppositeFace(c, m);
    expect(moved).toMatchObject({ face: 'back', pos: { x: 170, y: 10 } });
    const size = { w: 200, d: 150, h: 60 };
    const a = faceLocalToBody('front', c.pos, size);
    const b = faceLocalToBody('back', moved.pos, size);
    expect([a.x, a.z]).toEqual([b.x, b.z]);
  });

  it('placement state: provenance wins; without it, (0,0) means "not placed yet"', () => {
    const c = (x: number): Connector => ({
      id: `c${x}`,
      label: 'c',
      face: 'back',
      pos: { x, y: 0 },
      domain: 'audio.analog',
      direction: 'out',
      jack: 'jack-6.35-TS',
    });
    const m = {
      connectors: [c(0), c(12), c(0)],
      provenance: { 'connectors.2.pos': { kind: 'measured' } },
    } as unknown as GearModel;
    expect([0, 1, 2].map((i) => isConnectorPlaced(m, i))).toEqual([false, true, true]);
  });
});
