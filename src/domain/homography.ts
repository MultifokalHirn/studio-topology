// Planar homography from four point pairs (spec §5.5 perspective rectification). In-repo, no OpenCV.
import type { Point } from './types';

/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solve A·x = b (n×n) by Gaussian elimination with partial pivoting. Returns null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/**
 * Homography H with H·src[i] ≅ dst[i] for four correspondences (h33 = 1).
 * Returns null for degenerate input (three collinear points, duplicates).
 */
export function homographyFrom4(src: Point[], dst: Point[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Need exactly four point pairs');
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

export function applyHomography(H: Mat3, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invertMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  const inv = [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ];
  return inv.map((v) => v / det) as Mat3;
}

/**
 * Rectification target for a face of `widthMm × heightMm`: the output size in px (longest edge `maxPx`) and pxPerMm.
 */
export function rectifiedSize(
  widthMm: number,
  heightMm: number,
  maxPx = 2048,
): { width: number; height: number; pxPerMm: number } {
  const pxPerMm = maxPx / Math.max(widthMm, heightMm);
  return {
    width: Math.max(1, Math.round(widthMm * pxPerMm)),
    height: Math.max(1, Math.round(heightMm * pxPerMm)),
    pxPerMm,
  };
}

/** Clicked corners (any order) sorted to top-left, top-right, bottom-right, bottom-left. */
export function orderCorners(pts: Point[]): Point[] {
  const c = pts.reduce((s, p) => ({ x: s.x + p.x / pts.length, y: s.y + p.y / pts.length }), { x: 0, y: 0 });
  const byAngle = [...pts].sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x));
  // Angles from atan2 (y down) go TL(-135°) → TR(-45°) → BR(45°) → BL(135°) when sorted ascending.
  const tl = byAngle.reduce((best, p, i) => (p.x + p.y < byAngle[best]!.x + byAngle[best]!.y ? i : best), 0);
  return [...byAngle.slice(tl), ...byAngle.slice(0, tl)];
}
