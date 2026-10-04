// Pure RGBA pixel operations on ImageData-shaped buffers (no DOM), used by image calibration (spec §5.5).
import { applyHomography, invertMat3, type Mat3 } from './homography';
import type { Point, Rect } from './types';

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export const MAX_IMAGE_PIXELS = 100_000_000;
export const MAX_STORED_EDGE_PX = 2048;

export function createPixels(width: number, height: number): Pixels {
  if (width * height > MAX_IMAGE_PIXELS) throw new Error(`Image too large (${width}×${height})`);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function sampleBilinear(src: Pixels, x: number, y: number, out: Uint8ClampedArray, o: number) {
  if (x < -0.5 || y < -0.5 || x > src.width - 0.5 || y > src.height - 0.5) {
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    return;
  }
  const fx = Math.min(Math.max(x, 0), src.width - 1);
  const fy = Math.min(Math.max(y, 0), src.height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, src.width - 1);
  const y1 = Math.min(y0 + 1, src.height - 1);
  const ax = fx - x0;
  const ay = fy - y0;
  const d = src.data;
  const i00 = (y0 * src.width + x0) * 4;
  const i10 = (y0 * src.width + x1) * 4;
  const i01 = (y1 * src.width + x0) * 4;
  const i11 = (y1 * src.width + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const top = d[i00 + c]! * (1 - ax) + d[i10 + c]! * ax;
    const bot = d[i01 + c]! * (1 - ax) + d[i11 + c]! * ax;
    out[o + c] = top * (1 - ay) + bot * ay;
  }
}

/** Warp so that `H` (source → destination) maps the source into a `width × height` output. Bilinear sampling. */
export function warpPerspective(src: Pixels, H: Mat3, width: number, height: number): Pixels {
  const inv = invertMat3(H);
  if (!inv) throw new Error('Homography is not invertible');
  const out = createPixels(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sample at pixel centres.
      const p = applyHomography(inv, { x: x + 0.5, y: y + 0.5 });
      sampleBilinear(src, p.x - 0.5, p.y - 0.5, out.data, (y * width + x) * 4);
    }
  }
  return out;
}

export function crop(src: Pixels, r: Rect): Pixels {
  const x0 = Math.max(0, Math.round(r.x));
  const y0 = Math.max(0, Math.round(r.y));
  const w = Math.max(1, Math.min(src.width - x0, Math.round(r.w)));
  const h = Math.max(1, Math.min(src.height - y0, Math.round(r.h)));
  const out = createPixels(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * src.width + x0) * 4;
    out.data.set(src.data.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

/** Rotate clockwise by a multiple of 90°. */
export function rotate90(src: Pixels, quarterTurns: number): Pixels {
  const q = ((quarterTurns % 4) + 4) % 4;
  if (q === 0) return { ...src, data: src.data.slice() };
  const w = q % 2 ? src.height : src.width;
  const h = q % 2 ? src.width : src.height;
  const out = createPixels(w, h);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [nx, ny] =
        q === 1 ? [src.height - 1 - y, x] : q === 2 ? [src.width - 1 - x, src.height - 1 - y] : [y, src.width - 1 - x];
      const si = (y * src.width + x) * 4;
      out.data.set(src.data.subarray(si, si + 4), (ny * w + nx) * 4);
    }
  }
  return out;
}

/** Free rotation about the centre; the canvas grows to keep every pixel (corners become transparent). */
export function rotateFree(src: Pixels, degrees: number): Pixels {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const w = Math.ceil(Math.abs(src.width * c) + Math.abs(src.height * s));
  const h = Math.ceil(Math.abs(src.width * s) + Math.abs(src.height * c));
  const out = createPixels(w, h);
  const cx = src.width / 2;
  const cy = src.height / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      // Inverse rotation back into the source.
      const sx = dx * c + dy * s + cx;
      const sy = -dx * s + dy * c + cy;
      sampleBilinear(src, sx - 0.5, sy - 0.5, out.data, (y * w + x) * 4);
    }
  }
  return out;
}

/** Downscale so the longest edge is at most `maxEdge` (box-averaged for quality). Returns the input when small enough. */
export function fitWithin(src: Pixels, maxEdge = MAX_STORED_EDGE_PX): Pixels {
  const scale = maxEdge / Math.max(src.width, src.height);
  if (scale >= 1) return src;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = createPixels(w, h);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y / scale);
    const sy1 = Math.min(src.height, Math.max(sy0 + 1, Math.floor((y + 1) / scale)));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x / scale);
      const sx1 = Math.min(src.width, Math.max(sx0 + 1, Math.floor((x + 1) / scale)));
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          for (let c = 0; c < 4; c++) acc[c]! += src.data[i + c]!;
          n++;
        }
      out.data.set(
        acc.map((v) => v / n),
        (y * w + x) * 4,
      );
    }
  }
  return out;
}

/** Click-to-transparent: flood fill from a seed over pixels within `tolerance` (0–255, max channel distance). */
export function floodTransparent(src: Pixels, seed: Point, tolerance: number): Pixels {
  const out = { ...src, data: src.data.slice() };
  const sx = Math.floor(seed.x);
  const sy = Math.floor(seed.y);
  if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) return out;
  const si = (sy * src.width + sx) * 4;
  const ref = [src.data[si]!, src.data[si + 1]!, src.data[si + 2]!];
  const seen = new Uint8Array(src.width * src.height);
  const stack = [sy * src.width + sx];
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (
      Math.max(
        Math.abs(src.data[i]! - ref[0]!),
        Math.abs(src.data[i + 1]! - ref[1]!),
        Math.abs(src.data[i + 2]! - ref[2]!),
      ) > tolerance
    )
      continue;
    out.data[i + 3] = 0;
    const x = p % src.width;
    const y = (p - x) / src.width;
    if (x > 0) stack.push(p - 1);
    if (x < src.width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - src.width);
    if (y < src.height - 1) stack.push(p + src.width);
  }
  return out;
}

/** Scale check (spec §5.5 step 3): px/mm from two points a known distance apart. */
export function pxPerMmFromPoints(a: Point, b: Point, knownMm: number): number | null {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return knownMm > 0 && d > 0 ? d / knownMm : null;
}
