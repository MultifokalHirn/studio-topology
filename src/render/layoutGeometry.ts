// Layout view projections shared by the interactive canvas and the scaled drawing export (spec §5.6, §5.15).
import { surfaceToWorld, type Vec3 } from '@/domain/geometry';
import type { Point } from '@/domain/types';
import type { LayoutReport } from '@/engine/layout';
import type { ResolvedSurface, ResolvedUnit } from '@/engine/placement';

export type LayoutViewKind = 'front' | 'side' | 'plan';

/** Map world → view coordinates (SVG y grows downward). */
export function toView(view: LayoutViewKind, p: Vec3): Point {
  if (view === 'front') return { x: p.x, y: -p.z };
  if (view === 'side') return { x: p.y, y: -p.z };
  return { x: p.x, y: -p.y };
}

export function surfaceCorners(s: ResolvedSurface): Vec3[] {
  const { w, d } = s.surface.usable;
  return [
    { x: 0, y: 0, z: 0 },
    { x: w, y: 0, z: 0 },
    { x: w, y: d, z: 0 },
    { x: 0, y: d, z: 0 },
  ].map((p) => surfaceToWorld(s.frame, p));
}

/** Content box of a view: units, surfaces, the datum and the eye, plus a margin. */
export function layoutBounds(view: LayoutViewKind, report: LayoutReport, margin = { x: 200, y: 150 }) {
  const pts: Point[] = [];
  for (const u of report.layout.units.values()) for (const c of u.corners) pts.push(toView(view, c));
  for (const s of report.layout.surfaces) for (const c of surfaceCorners(s)) pts.push(toView(view, c));
  pts.push(toView(view, { x: 0, y: 0, z: 0 }), toView(view, report.eye));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - margin.x;
  const minY = Math.min(...ys) - margin.y;
  return { x: minX, y: minY, w: Math.max(...xs) + margin.x - minX, h: Math.max(...ys) + margin.y - minY };
}

export function sideHull(u: ResolvedUnit): Point[] {
  const pts = u.corners.map((c) => ({ x: c.y, y: -c.z }));
  // Convex hull in view space (y down), small n.
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A unit's outline in view coordinates: front face, side hull or plan footprint. */
export function unitOutline(view: LayoutViewKind, u: ResolvedUnit): Point[] {
  const c = u.corners;
  if (view === 'front') return [c[0]!, c[1]!, c[5]!, c[4]!].map((p) => toView(view, p));
  if (view === 'side') return sideHull(u);
  return u.plan.map((p) => ({ x: p.x, y: -p.y }));
}

/** Draw order: far units first so nearer ones cover them. */
export function drawOrder(view: LayoutViewKind) {
  return (a: ResolvedUnit, b: ResolvedUnit) =>
    view === 'front' ? b.min.y - a.min.y : view === 'side' ? a.min.x - b.min.x : a.max.z - b.max.z;
}
