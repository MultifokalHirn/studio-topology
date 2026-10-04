// Resolve a setup's placements into world geometry (spec §7.2): surfaces, racks, stacking, floor.
import {
  offsetFrame,
  rotatedFootprint,
  standBase,
  surfaceFrame,
  surfaceToWorld,
  type SurfaceFrame,
  type Vec3,
} from '@/domain/geometry';
import type {
  FormFactor,
  GearModel,
  GearUnit,
  Placement,
  Point,
  Project,
  Setup,
  StandModel,
  SurfaceDef,
} from '@/domain/types';
import { keyboardWidthMm } from '@/domain/templates';
import { RACK_PANEL_WIDTH_MM, RACK10_PANEL_WIDTH_MM, RACK_UNIT_MM } from '@/domain/units';

/** Placeholder sizes for unknown dimensions (spec §6: dashed placeholders at template defaults, DATA-001). */
const DEFAULT_SIZE: Record<FormFactor, { w: number; d: number; h: number }> = {
  desktop: { w: 250, d: 200, h: 60 },
  keyboard: { w: 800, d: 300, h: 100 },
  rack: { w: RACK_PANEL_WIDTH_MM, d: 250, h: RACK_UNIT_MM },
  pedal: { w: 120, d: 70, h: 55 },
  eurorack: { w: 430, d: 140, h: 130 },
  handheld: { w: 120, d: 80, h: 30 },
  tablet: { w: 250, d: 180, h: 7 },
  speaker: { w: 200, d: 250, h: 300 },
  other: { w: 150, d: 100, h: 50 },
};

/** Model with a unit's dotted-path overrides applied (`dimensions.h` → 64). */
export function effectiveModel(model: GearModel, unit?: GearUnit): GearModel {
  if (!unit?.overrides || Object.keys(unit.overrides).length === 0) return model;
  const m = structuredClone(model) as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(unit.overrides)) {
    const segs = path.split('.');
    let cur = m;
    for (const s of segs.slice(0, -1)) {
      if (typeof cur[s] !== 'object' || cur[s] === null) cur[s] = {};
      cur = cur[s] as Record<string, unknown>;
    }
    cur[segs[segs.length - 1]!] = value;
  }
  return m as unknown as GearModel;
}

export interface UnitSize {
  w: number;
  d: number;
  h: number;
  /** True when any of w/d/h came from the placeholder table. */
  estimated: boolean;
}

export function unitSize(m: GearModel): UnitSize {
  const kb = m.dimensions.keyboard;
  const def =
    kb && m.formFactor === 'keyboard'
      ? // Keyboards: width from key count and pitch; slim/mini keybeds are shallower and lower.
        {
          w: keyboardWidthMm(kb.keys, kb.keyType),
          d: kb.keyType === 'slim' || kb.keyType === 'mini' ? 180 : DEFAULT_SIZE.keyboard.d,
          h: kb.keyType === 'slim' || kb.keyType === 'mini' ? 50 : DEFAULT_SIZE.keyboard.h,
        }
      : DEFAULT_SIZE[m.formFactor];
  const rackW = m.dimensions.rack?.standard === '10in' ? RACK10_PANEL_WIDTH_MM : RACK_PANEL_WIDTH_MM;
  const w = m.dimensions.w ?? (m.dimensions.rack ? rackW : def.w);
  const d = m.dimensions.d ?? m.dimensions.rack?.depthBehindEarsMm ?? def.d;
  const h = m.dimensions.h ?? (m.dimensions.rack ? m.dimensions.rack.u * RACK_UNIT_MM : def.h);
  return { w, d, h, estimated: m.dimensions.w === null || m.dimensions.d === null || m.dimensions.h === null };
}

export interface ResolvedUnit {
  unitId: string;
  unit: GearUnit;
  model: GearModel;
  placement: Placement;
  /** Footprint size along the frame axes (after the 90° rotation), plus height. */
  size: UnitSize;
  weightKg: number | null;
  standUnitId?: string;
  surfaceId?: string;
  /** Local frame of the surface (or parent top face) the unit sits on. */
  frame: SurfaceFrame;
  /** Footprint in frame-local coordinates. */
  local: { x: number; y: number; w: number; d: number; z: number };
  tiltDeg: number;
  /** Height of the bottom at the front edge. */
  trayZ: number;
  /** Top face height at mid-depth (spec Appendix C). */
  controlPlaneZ: number;
  /** 8 corners in world space. */
  corners: Vec3[];
  min: Vec3;
  max: Vec3;
  /** World footprint (plan view), 4 corners. */
  plan: Point[];
  /** Placed on an unknown stand, surface or parent: drawn on the floor and reported. */
  orphan: boolean;
}

export interface ResolvedSurface {
  standUnitId: string;
  standModel: StandModel;
  surface: SurfaceDef;
  frame: SurfaceFrame;
}

export interface ResolvedLayout {
  units: Map<string, ResolvedUnit>;
  surfaces: ResolvedSurface[];
  surfaceOf(standUnitId: string, surfaceId: string): ResolvedSurface | undefined;
}

function boxCorners(frame: SurfaceFrame, x: number, y: number, z: number, w: number, d: number, h: number): Vec3[] {
  const out: Vec3[] = [];
  for (const dz of [0, h])
    for (const dy of [0, d])
      for (const dx of [0, w]) out.push(surfaceToWorld(frame, { x: x + dx, y: y + dy, z: z + dz }));
  return out;
}

export function resolveLayout(project: Project, setup: Setup): ResolvedLayout {
  const models = new Map(project.library.gearModels.map((m) => [m.id, m]));
  const units = new Map(project.inventory.gearUnits.map((u) => [u.id, u]));
  const standModels = new Map(project.library.standModels.map((m) => [m.id, m]));
  const standUnitModel = new Map(project.inventory.standUnits.map((u) => [u.id, standModels.get(u.modelId)]));
  const surfaceDefOf = (standUnitId: string, surfaceId: string) =>
    standUnitModel.get(standUnitId)?.surfaces.find((s) => s.id === surfaceId);

  const surfaces: ResolvedSurface[] = [];
  for (const st of setup.stands) {
    const model = standUnitModel.get(st.standUnitId);
    if (!model) continue;
    const base = standBase(st.standUnitId, setup.stands, surfaceDefOf);
    for (const surface of model.surfaces)
      surfaces.push({
        standUnitId: st.standUnitId,
        standModel: model,
        surface,
        frame: surfaceFrame(surface, st, base),
      });
  }
  const surfaceOf = (standUnitId: string, surfaceId: string) =>
    surfaces.find((s) => s.standUnitId === standUnitId && s.surface.id === surfaceId);

  const resolved = new Map<string, ResolvedUnit>();
  const byUnit = new Map(setup.placements.map((p) => [p.unitId, p]));
  const floorFrame = (x: number, y: number, z = 0): SurfaceFrame => ({
    origin: { x, y, z },
    tiltDeg: 0,
    standRotationDeg: 0,
    standPos: { x, y },
    usable: { w: Infinity, d: Infinity },
  });

  const resolve = (unitId: string, seen: Set<string>): ResolvedUnit | undefined => {
    const done = resolved.get(unitId);
    if (done) return done;
    const placement = byUnit.get(unitId);
    const unit = units.get(unitId);
    const base = unit && models.get(unit.modelId);
    if (!placement || !unit || !base || seen.has(unitId)) return undefined;
    seen.add(unitId);
    const model = effectiveModel(base, unit);
    const raw = unitSize(model);
    const fp = rotatedFootprint(raw.w, raw.d, placement.rotationDeg);
    const size: UnitSize = { ...raw, w: fp.w, d: fp.d };
    const m = placement.mount;
    let frame: SurfaceFrame;
    let local: ResolvedUnit['local'];
    let orphan = false;
    let standUnitId: string | undefined;
    let surfaceId: string | undefined;

    if (m.type === 'surface' || m.type === 'rack') {
      const s = surfaceOf(m.standUnitId, m.surfaceId);
      standUnitId = m.standUnitId;
      surfaceId = m.surfaceId;
      if (!s) {
        orphan = true;
        frame = floorFrame(0, 0);
        local = { x: 0, y: 0, w: size.w, d: size.d, z: 0 };
      } else if (m.type === 'surface') {
        frame = s.frame;
        local = { x: m.x, y: m.y, w: size.w, d: size.d, z: 0 };
      } else {
        frame = s.frame;
        const bayU = s.surface.rack?.u ?? 0;
        const hU = Math.max(1, Math.ceil((model.dimensions.rack?.u ?? size.h / RACK_UNIT_MM) - 1e-9));
        const z = (bayU - (m.uStart - 1) - hU) * RACK_UNIT_MM;
        local = { x: (s.surface.usable.w - size.w) / 2, y: 0, w: size.w, d: size.d, z };
      }
    } else if (m.type === 'stacked') {
      const parent = resolve(m.parentUnitId, seen);
      if (!parent) {
        orphan = true;
        frame = floorFrame(0, 0);
      } else
        frame = offsetFrame(
          parent.frame,
          { x: parent.local.x, y: parent.local.y, z: parent.local.z + parent.size.h },
          { w: parent.size.w, d: parent.size.d },
        );
      local = { x: m.x, y: m.y, w: size.w, d: size.d, z: 0 };
    } else {
      frame = floorFrame(m.pos.x, m.pos.y, m.z ?? 0);
      local = { x: 0, y: 0, w: size.w, d: size.d, z: 0 };
    }

    const corners = boxCorners(frame, local.x, local.y, local.z, local.w, local.d, size.h);
    const min = {
      x: Math.min(...corners.map((c) => c.x)),
      y: Math.min(...corners.map((c) => c.y)),
      z: Math.min(...corners.map((c) => c.z)),
    };
    const max = {
      x: Math.max(...corners.map((c) => c.x)),
      y: Math.max(...corners.map((c) => c.y)),
      z: Math.max(...corners.map((c) => c.z)),
    };
    const r: ResolvedUnit = {
      unitId,
      unit,
      model,
      placement,
      size,
      weightKg: model.dimensions.weightKg,
      standUnitId,
      surfaceId,
      frame,
      local,
      tiltDeg: frame.tiltDeg,
      trayZ: surfaceToWorld(frame, { x: local.x, y: local.y, z: local.z }).z,
      controlPlaneZ: surfaceToWorld(frame, { x: local.x + local.w / 2, y: local.y + local.d / 2, z: local.z + size.h })
        .z,
      corners,
      min,
      max,
      plan: [corners[0]!, corners[1]!, corners[3]!, corners[2]!].map((c) => ({ x: c.x, y: c.y })),
      orphan,
    };
    resolved.set(unitId, r);
    return r;
  };

  for (const p of setup.placements) resolve(p.unitId, new Set());
  return { units: resolved, surfaces, surfaceOf };
}
