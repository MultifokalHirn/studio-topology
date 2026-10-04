// Pure geometry (spec §3.2, §7.2). World: x right, y away from the player (depth), z up. mm and degrees.
import { degToRad } from './units';
import type { FaceId, GearModel, Point, Rotation, StandState, SurfaceDef } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Size3 {
  w: number;
  d: number;
  h: number;
}

// ---------- faces ----------

/** Width and height of a face as seen from outside, derived from body dimensions. */
export function faceSizeFromBody(face: FaceId, s: Size3): { widthMm: number; heightMm: number } {
  switch (face) {
    case 'front':
    case 'back':
      return { widthMm: s.w, heightMm: s.h };
    case 'left':
    case 'right':
      return { widthMm: s.d, heightMm: s.h };
    case 'top':
    case 'bottom':
      return { widthMm: s.w, heightMm: s.d };
  }
}

/** Face size from the model's explicit `faces` entry, else derived; `null` when the dimensions are unknown. */
export function faceSize(model: GearModel, face: FaceId): { widthMm: number; heightMm: number } | null {
  const explicit = model.faces[face];
  if (explicit) return explicit;
  const s = bodySize(model);
  return s ? faceSizeFromBody(face, s) : null;
}

export function bodySize(model: Pick<GearModel, 'dimensions'>): Size3 | null {
  const { w, d, h } = model.dimensions;
  return w === null || d === null || h === null ? null : { w, d, h };
}

/**
 * Face-local → body coordinates. Face-local origin is the top-left of the face *as seen from outside looking at it*,
 * x to the right, y down (spec §3.2). Body origin is the front-left-bottom corner; x right, y back, z up.
 *
 * Viewer orientation per face (right-hand vector = facing × up):
 * front: facing +y, right +x · back: facing −y, right −x (mirrored) · left: facing +x, right −y ·
 * right: facing −x, right +y · top: looking down with the back edge at the image top, right +x ·
 * bottom: looking up with the back edge at the image top, right −x.
 */
export function faceLocalToBody(face: FaceId, pos: Point, s: Size3): Vec3 {
  switch (face) {
    case 'front':
      return { x: pos.x, y: 0, z: s.h - pos.y };
    case 'back':
      return { x: s.w - pos.x, y: s.d, z: s.h - pos.y };
    case 'left':
      return { x: 0, y: s.d - pos.x, z: s.h - pos.y };
    case 'right':
      return { x: s.w, y: pos.x, z: s.h - pos.y };
    case 'top':
      return { x: pos.x, y: s.d - pos.y, z: s.h };
    case 'bottom':
      return { x: s.w - pos.x, y: s.d - pos.y, z: 0 };
  }
}

/** Horizontal screen position (mm from the left of the drawn unit) of a body point in a front or rear elevation. */
export function elevationX(body: Vec3, view: 'front' | 'rear', s: Size3): number {
  return view === 'front' ? body.x : s.w - body.x;
}

// ---------- 2D helpers ----------

export function rotatePoint(p: Point, deg: number, about: Point = { x: 0, y: 0 }): Point {
  const r = degToRad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
}

/** Footprint size (along x, along y) after a 90°-step rotation in plan. */
export function rotatedFootprint(w: number, d: number, rotationDeg: Rotation): { w: number; d: number } {
  return rotationDeg === 90 || rotationDeg === 270 ? { w: d, d: w } : { w, d };
}

export interface Aabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function aabbOf(points: Point[]): Aabb {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Strict overlap: touching edges do not count (units placed flush are fine). */
export function aabbOverlap(a: Aabb, b: Aabb, eps = 1e-6): boolean {
  return a.minX < b.maxX - eps && b.minX < a.maxX - eps && a.minY < b.maxY - eps && b.minY < a.maxY - eps;
}

/** Length of the overlap of [a0,a1] and [b0,b1]; 0 when disjoint. */
export function intervalOverlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1)));
}

/** Separating-axis test for two convex polygons (vertices in order). Touching does not count as overlap. */
export function convexOverlap(a: Point[], b: Point[], eps = 1e-6): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i]!;
      const p2 = poly[(i + 1) % poly.length]!;
      const axis = { x: p1.y - p2.y, y: p2.x - p1.x };
      const [aMin, aMax] = project(a, axis);
      const [bMin, bMax] = project(b, axis);
      const len = Math.hypot(axis.x, axis.y) || 1;
      if (aMax <= bMin + eps * len || bMax <= aMin + eps * len) return false;
    }
  }
  return true;
}

function project(poly: Point[], axis: Point): [number, number] {
  let min = Infinity,
    max = -Infinity;
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return [min, max];
}

export function rectCorners(x: number, y: number, w: number, d: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
}

// ---------- surfaces ----------

/** Resolved pose of a stand surface in world space. */
export interface SurfaceFrame {
  /** World position of the surface's front-left corner (before stand rotation is applied to it). */
  origin: Vec3;
  /** Tilt about the x-axis through the front edge; positive raises the back edge. */
  tiltDeg: number;
  /** Stand rotation in plan and the pivot it rotates about. */
  standRotationDeg: number;
  standPos: Point;
  usable: { w: number; d: number };
}

/**
 * Surface frame from the stand state (spec §7.2). Surface z/tilt/y come from the setup's `surfaceStates`,
 * falling back to the model's anchor and zero tilt.
 */
export function surfaceFrame(surface: SurfaceDef, stand: StandState): SurfaceFrame {
  const st = stand.surfaceStates[surface.id] ?? {};
  return {
    origin: {
      x: stand.pos.x + surface.anchor.x,
      y: stand.pos.y + surface.anchor.y + (st.y ?? 0),
      z: st.z ?? surface.anchor.z,
    },
    tiltDeg: st.tiltDeg ?? 0,
    standRotationDeg: stand.rotationDeg,
    standPos: stand.pos,
    usable: surface.usable,
  };
}

/** Surface-local point (x along the surface, y along its depth, z above the surface plane) → world. */
export function surfaceToWorld(frame: SurfaceFrame, p: Vec3): Vec3 {
  const t = degToRad(frame.tiltDeg);
  const local = {
    x: frame.origin.x + p.x,
    y: frame.origin.y + p.y * Math.cos(t) - p.z * Math.sin(t),
    z: frame.origin.z + p.y * Math.sin(t) + p.z * Math.cos(t),
  };
  if (frame.standRotationDeg === 0) return local;
  const r = rotatePoint({ x: local.x, y: local.y }, frame.standRotationDeg, frame.standPos);
  return { x: r.x, y: r.y, z: local.z };
}

/** Tray z under a unit whose control plane should sit at `planeZ` (Appendix C, untilted). */
export const trayZForPlane = (planeZ: number, unitHeight: number) => planeZ - unitHeight;

/** Control plane height at mid-depth of a tilted unit (Appendix C). */
export function controlPlaneZ(trayZ: number, s: Pick<Size3, 'd' | 'h'>, tiltDeg: number): number {
  const t = degToRad(tiltDeg);
  return trayZ + s.h * Math.cos(t) + (s.d / 2) * Math.sin(t);
}
