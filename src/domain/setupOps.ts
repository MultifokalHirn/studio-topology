// Setup mutations used by the layout canvas and inspector (spec §5.6). Pure; operate on Immer drafts.
import type { Placement, Rotation, Setup, StandModel, SurfaceDef } from './types';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function findPlacement(s: Setup, unitId: string): Placement | undefined {
  return s.placements.find((p) => p.unitId === unitId);
}

function upsert(s: Setup, p: Placement) {
  const i = s.placements.findIndex((x) => x.unitId === p.unitId);
  if (i >= 0) s.placements[i] = { ...s.placements[i]!, mount: p.mount };
  else s.placements.push(p);
}

export function placeOnSurface(
  s: Setup,
  unitId: string,
  standUnitId: string,
  surfaceId: string,
  x: number,
  y: number,
): void {
  upsert(s, {
    unitId,
    mount: { type: 'surface', standUnitId, surfaceId, x, y },
    rotationDeg: 0,
    locked: false,
    zIndex: 0,
  });
}

export function placeInRack(s: Setup, unitId: string, standUnitId: string, surfaceId: string, uStart: number): void {
  upsert(s, {
    unitId,
    mount: { type: 'rack', standUnitId, surfaceId, uStart },
    rotationDeg: 0,
    locked: false,
    zIndex: 0,
  });
}

export function placeOnFloor(s: Setup, unitId: string, x: number, y: number): void {
  upsert(s, { unitId, mount: { type: 'floor', pos: { x, y } }, rotationDeg: 0, locked: false, zIndex: 0 });
}

/** Remove a unit from the setup (it stays in the inventory). Units stacked on it fall to the floor; its cables go. */
export function removeFromSetup(s: Setup, unitId: string): void {
  s.placements = s.placements.filter((p) => p.unitId !== unitId);
  for (const p of s.placements)
    if (p.mount.type === 'stacked' && p.mount.parentUnitId === unitId) p.mount = { type: 'floor', pos: { x: 0, y: 0 } };
}

export function rotatePlacement(s: Setup, unitId: string, dir: 1 | -1 = 1): void {
  const p = findPlacement(s, unitId);
  if (!p || p.locked || p.mount.type === 'rack') return;
  p.rotationDeg = ROTATIONS[(ROTATIONS.indexOf(p.rotationDeg) + (dir === 1 ? 1 : 3)) % 4]!;
}

/** Move a surface/stacked/floor mount by a delta in its own frame. Locked placements do not move. */
export function nudgePlacement(s: Setup, unitId: string, dx: number, dy: number): void {
  const p = findPlacement(s, unitId);
  if (!p || p.locked) return;
  const m = p.mount;
  if (m.type === 'surface' || m.type === 'stacked') {
    m.x = round(m.x + dx);
    m.y = round(m.y + dy);
  } else if (m.type === 'floor') m.pos = { x: round(m.pos.x + dx), y: round(m.pos.y + dy) };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Clamp to an adjustable range and its step (if any). */
export function clampToRange(v: number, r?: { min: number; max: number; step: number }): number {
  if (!r) return v;
  const stepped = r.step > 0 ? r.min + Math.round((v - r.min) / r.step) * r.step : v;
  return Math.min(r.max, Math.max(r.min, round(stepped)));
}

/** Set a surface's height, tilt or depth offset for this setup, clamped to the stand's adjustment ranges. */
export function setSurfaceState(
  s: Setup,
  standUnitId: string,
  surface: SurfaceDef,
  patch: Partial<Record<'z' | 'tiltDeg' | 'y', number | null>>,
): void {
  const st = s.stands.find((x) => x.standUnitId === standUnitId);
  if (!st) return;
  const cur = { ...(st.surfaceStates[surface.id] ?? {}) };
  for (const k of ['z', 'tiltDeg', 'y'] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === undefined) delete cur[k];
    else cur[k] = clampToRange(v, surface.adjustable[k]);
  }
  st.surfaceStates[surface.id] = cur;
}

export function addStandToSetup(s: Setup, standUnitId: string, x = 0, y = 0): void {
  if (s.stands.some((x) => x.standUnitId === standUnitId)) return;
  s.stands.push({ standUnitId, pos: { x, y }, rotationDeg: 0, surfaceStates: {} });
}

/** Remove a stand; units on it move to the floor in front of where the stand stood. */
export function removeStandFromSetup(s: Setup, standUnitId: string): void {
  const st = s.stands.find((x) => x.standUnitId === standUnitId);
  s.stands = s.stands.filter((x) => x.standUnitId !== standUnitId);
  for (const x of s.stands) if (x.onSurface?.standUnitId === standUnitId) delete x.onSurface;
  for (const p of s.placements)
    if ((p.mount.type === 'surface' || p.mount.type === 'rack') && p.mount.standUnitId === standUnitId)
      p.mount = { type: 'floor', pos: { x: st?.pos.x ?? 0, y: (st?.pos.y ?? 0) - 300 } };
}

/** Next free x on a single-row surface: right of the rightmost unit plus a gap, or null when it would not fit. */
export function nextFreeX(
  occupied: { x: number; w: number }[],
  width: number,
  usableW: number,
  gap = 10,
): number | null {
  const right = occupied.reduce((m, o) => Math.max(m, o.x + o.w), 0);
  const x = occupied.length ? right + gap : gap;
  return x + width <= usableW ? x : null;
}

export function standSurface(model: StandModel | undefined, surfaceId: string): SurfaceDef | undefined {
  return model?.surfaces.find((s) => s.id === surfaceId);
}
