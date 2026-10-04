// Face (panel) helpers for the face canvas (spec §5.5): connector placement state, snapping, mirroring.
import { provenanceFor } from './integrity';
import { bodySize, faceSize } from './geometry';
import type { Connector, FaceId, GearModel, Point } from './types';

export const OPPOSITE_FACE: Record<FaceId, FaceId> = {
  front: 'back',
  back: 'front',
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
};

/** Face size in mm, falling back to template-ish defaults (flagged by the caller as estimated). */
export function faceSizeOrDefault(
  m: GearModel,
  face: FaceId,
): { widthMm: number; heightMm: number; estimated: boolean } {
  const s = faceSize(m, face);
  if (s)
    return {
      ...s,
      estimated:
        !bodySize(m) || ['unknown', 'estimated'].includes(provenanceFor(m.provenance, `dimensions.w`)?.kind ?? ''),
    };
  const fallback = { w: m.dimensions.w ?? 200, d: m.dimensions.d ?? 150, h: m.dimensions.h ?? 60 };
  const size =
    face === 'front' || face === 'back'
      ? [fallback.w, fallback.h]
      : face === 'left' || face === 'right'
        ? [fallback.d, fallback.h]
        : [fallback.w, fallback.d];
  return { widthMm: size[0]!, heightMm: size[1]!, estimated: true };
}

/**
 * A connector counts as placed when its position has a provenance other than `unknown`, or — without any
 * provenance — when it is not at the (0,0) placeholder.
 */
export function isConnectorPlaced(m: GearModel, index: number): boolean {
  const prov = provenanceFor(m.provenance, `connectors.${index}.pos`);
  if (prov) return prov.kind !== 'unknown';
  const c = m.connectors[index];
  return !!c && (c.pos.x !== 0 || c.pos.y !== 0);
}

/** Snap to the grid (mm). `step <= 0` disables snapping. */
export function snapPoint(p: Point, step: number): Point {
  if (step <= 0) return p;
  const r = (v: number) => Math.round(v / step) * step;
  return { x: r(p.x), y: r(p.y) };
}

export function clampToFace(p: Point, widthMm: number, heightMm: number): Point {
  return { x: Math.min(Math.max(p.x, 0), widthMm), y: Math.min(Math.max(p.y, 0), heightMm) };
}

/**
 * Move a connector to the opposite face keeping its physical location (spec §3.2 mirror rule): the opposite face
 * is seen from the other side, so x mirrors and y stays. Used when a panel was measured from the wrong side.
 */
export function mirrorToOppositeFace(c: Connector, m: GearModel): Connector {
  const target = OPPOSITE_FACE[c.face];
  // Opposite faces have equal widths and are viewed from opposite sides, so x mirrors (geometry.faceLocalToBody).
  const w = faceSizeOrDefault(m, c.face).widthMm;
  return { ...c, face: target, pos: { x: w - c.pos.x, y: c.pos.y } };
}

/** Same face, positions re-read from the other side: x → width − x (helper for panels measured from behind). */
export function mirrorInPlace(c: Connector, m: GearModel): Connector {
  const w = faceSizeOrDefault(m, c.face).widthMm;
  return { ...c, pos: { x: w - c.pos.x, y: c.pos.y } };
}

/** Deterministic colour for a free-text category (fallback rendering), from a small neutral-friendly palette. */
const CATEGORY_TINTS = [
  '#dbeafe',
  '#dcfce7',
  '#fef3c7',
  '#fce7f3',
  '#e0e7ff',
  '#ccfbf1',
  '#fee2e2',
  '#ede9fe',
  '#f5f5f4',
  '#ffedd5',
];
export function categoryTint(category: string): string {
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_TINTS[h % CATEGORY_TINTS.length]!;
}
