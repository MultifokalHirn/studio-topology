// Layout analysis (spec §5.6, PLC rules in §5.12, row pitch from §5.13): loads, width budgets, pitch,
// occlusion and placement problems for one setup. Pure; the M6 rule engine wraps these as PLC-* rules.
import { clipPolygon, convexHull, convexOverlap, polygonArea, surfaceToWorld, type Vec3 } from '@/domain/geometry';
import { rackFit } from '@/domain/rack';
import type { Point, Project, Settings, Setup, SurfaceDef } from '@/domain/types';
import { landmarks } from './body';
import type { Issue } from './issues';
import { resolveLayout, type ResolvedLayout, type ResolvedUnit } from './placement';

export interface SurfaceReport {
  standUnitId: string;
  surfaceId: string;
  label: string;
  kind: SurfaceDef['kind'];
  trayZ: number;
  tiltDeg: number;
  yOffset: number;
  unitIds: string[];
  loadKg: number;
  /** False when at least one unit's weight is unknown (load is a lower bound). */
  loadComplete: boolean;
  capacityKg: number | null;
  widthUsedMm: number;
  widthAvailMm: number;
  /** Highest control plane among the units on this surface. */
  planeZ: number | null;
}

export interface PitchReport {
  lower: SurfaceReport;
  upper: SurfaceReport;
  pitchMm: number;
  minPitchMm: number;
  overhang: boolean;
}

export interface OcclusionReport {
  upperUnitId: string;
  lowerUnitId: string;
  /** Hidden share of the lower unit's controls region, 0–1. */
  hiddenFraction: number;
  /** Vertical gap between the upper unit's underside (incl. holder) and the lower unit's top; null when not above it. */
  gapMm: number | null;
}

export interface LayoutReport {
  layout: ResolvedLayout;
  eye: Vec3;
  surfaces: SurfaceReport[];
  pitches: PitchReport[];
  occlusions: OcclusionReport[];
  issues: Issue[];
}

const label = (u: ResolvedUnit) => u.unit.nickname;

/** Controls region on the top face in frame-local coordinates (default: top face minus a 10 mm margin). */
function controlsRect(u: ResolvedUnit): { x: number; y: number; w: number; d: number } {
  const r = u.model.controlsRegion;
  if (r && u.placement.rotationDeg === 0)
    return { x: u.local.x + r.x, y: u.local.y + (u.size.d - r.y - r.h), w: r.w, d: r.h };
  const m = Math.min(10, u.size.w / 4, u.size.d / 4);
  return { x: u.local.x + m, y: u.local.y + m, w: u.size.w - 2 * m, d: u.size.d - 2 * m };
}

/**
 * Hidden fraction of `lower`'s controls region behind `upper`, seen from `eye`: project upper's 8 corners from the
 * eye onto the horizontal plane at lower's control height, take the hull, clip with the region (spec §7.2).
 * The lower plane is treated as horizontal at mid-depth height (tilt changes the region's projected depth only
 * slightly at the angles used; documented in docs/decisions.md).
 */
export function occlusionFraction(upper: ResolvedUnit, lower: ResolvedUnit, eye: Vec3): number {
  const zL = lower.controlPlaneZ;
  if (upper.min.z <= zL) return 0;
  const proj = upper.corners.map((c) => {
    const cz = Math.min(c.z, eye.z - 1);
    const t = (eye.z - zL) / (eye.z - cz);
    return { x: eye.x + (c.x - eye.x) * t, y: eye.y + (c.y - eye.y) * t };
  });
  const shadow = convexHull(proj);
  const r = controlsRect(lower);
  const region: Point[] = [
    { x: r.x, y: r.y, z: lower.local.z + lower.size.h },
    { x: r.x + r.w, y: r.y, z: lower.local.z + lower.size.h },
    { x: r.x + r.w, y: r.y + r.d, z: lower.local.z + lower.size.h },
    { x: r.x, y: r.y + r.d, z: lower.local.z + lower.size.h },
  ].map((p) => {
    const w = surfaceToWorld(lower.frame, p);
    return { x: w.x, y: w.y };
  });
  const regionCcw = polygonArea(region) < 0 ? [...region].reverse() : region;
  const regionArea = Math.abs(polygonArea(regionCcw));
  if (regionArea <= 0 || shadow.length < 3) return 0;
  return Math.min(1, Math.abs(polygonArea(clipPolygon(shadow, regionCcw))) / regionArea);
}

/** Minimum row pitch (spec §5.13 / Appendix C). */
export function minRowPitch(
  hLowerTallest: number,
  hUpper: number,
  overhang: boolean,
  e: Settings['ergonomics'],
): number {
  if (!overhang) return hLowerTallest + 20;
  return hLowerTallest + e.handClearanceMm + e.holderThicknessMm + Math.max(0, hUpper - hLowerTallest);
}

export function analyzeLayout(project: Project, setup: Setup): LayoutReport {
  const layout = resolveLayout(project, setup);
  const ergo = project.settings.ergonomics;
  const body = project.bodyProfiles.find((b) => b.id === setup.bodyProfileId) ?? project.bodyProfiles[0];
  const eyeZ = body ? landmarks(body, setup.posture, setup.seatHeightMm).eyeMm : 1620;
  // The setup datum is the listening position (spec §3.2): the eye sits above it.
  const eye: Vec3 = { x: 0, y: 0, z: eyeZ };
  const issues: Issue[] = [];
  const all = [...layout.units.values()];

  // ---- surfaces: load, width budget, bounds, overlap, centre of mass ----
  const surfaces: SurfaceReport[] = layout.surfaces.map((s) => {
    const on = all.filter(
      (u) => u.standUnitId === s.standUnitId && u.surfaceId === s.surface.id && u.placement.mount.type !== 'stacked',
    );
    const stackedOn = (id: string): ResolvedUnit[] =>
      all
        .filter((u) => u.placement.mount.type === 'stacked' && u.placement.mount.parentUnitId === id)
        .flatMap((u) => [u, ...stackedOn(u.unitId)]);
    const carried = on.flatMap((u) => [u, ...stackedOn(u.unitId)]);
    const st = setup.stands.find((x) => x.standUnitId === s.standUnitId)?.surfaceStates[s.surface.id] ?? {};
    return {
      standUnitId: s.standUnitId,
      surfaceId: s.surface.id,
      label: s.surface.label,
      kind: s.surface.kind,
      trayZ: s.frame.origin.z,
      tiltDeg: s.frame.tiltDeg,
      yOffset: st.y ?? 0,
      unitIds: on.map((u) => u.unitId),
      loadKg: carried.reduce((sum, u) => sum + (u.weightKg ?? 0), 0),
      loadComplete: carried.every((u) => u.weightKg !== null),
      capacityKg: s.surface.loadKg,
      widthUsedMm: s.surface.kind === 'rack-bay' ? 0 : on.reduce((sum, u) => sum + u.size.w, 0),
      widthAvailMm: s.surface.usable.w,
      planeZ: on.length ? Math.max(...on.map((u) => u.controlPlaneZ)) : null,
    };
  });

  for (const r of surfaces) {
    const s = layout.surfaceOf(r.standUnitId, r.surfaceId)!;
    const on = all.filter((u) => r.unitIds.includes(u.unitId));
    if (r.capacityKg !== null && r.loadKg > r.capacityKg)
      issues.push({
        ruleId: 'PLC-003',
        severity: 'error',
        entityIds: [r.surfaceId, ...r.unitIds],
        message: `${r.label}: load ${r.loadKg.toFixed(1)} kg exceeds the ${r.capacityKg} kg limit.`,
        details: { loadKg: r.loadKg, capacityKg: r.capacityKg },
      });
    else if (r.capacityKg !== null && r.loadKg > 0.8 * r.capacityKg)
      issues.push({
        ruleId: 'PLC-003',
        severity: 'warning',
        entityIds: [r.surfaceId, ...r.unitIds],
        message: `${r.label}: load ${r.loadKg.toFixed(1)} kg is over 80% of the ${r.capacityKg} kg limit.`,
        details: { loadKg: r.loadKg, capacityKg: r.capacityKg },
      });
    // Width budget applies to single-row tiers; desks and shelves are 2-D and use per-unit bounds.
    if (s.surface.kind === 'tier' && r.widthUsedMm > r.widthAvailMm)
      issues.push({
        ruleId: 'PLC-002',
        severity: 'warning',
        entityIds: [r.surfaceId, ...r.unitIds],
        message: `${r.label}: units need ${Math.round(r.widthUsedMm)} mm of width; ${r.widthAvailMm} mm available.`,
        details: { widthUsedMm: r.widthUsedMm, widthAvailMm: r.widthAvailMm },
      });

    for (const u of on) {
      if (s.surface.kind === 'rack-bay') continue;
      const tier = s.surface.kind === 'tier';
      const outX = u.local.x < -0.5 || u.local.x + u.local.w > s.surface.usable.w + 0.5;
      const outY = !tier && (u.local.y < -0.5 || u.local.y + u.local.d > s.surface.usable.d + 0.5);
      if (outX || outY)
        issues.push({
          ruleId: 'PLC-002',
          severity: 'warning',
          entityIds: [u.unitId],
          message: `${label(u)} extends beyond ${r.label}.`,
        });
      const holder = s.surface.holders?.lengthMm;
      if (holder !== undefined) {
        const unsupported = Math.max(0, u.local.y + u.local.d - holder);
        if (unsupported > u.local.d / 3)
          issues.push({
            ruleId: 'PLC-004',
            severity: 'warning',
            entityIds: [u.unitId],
            message: `${label(u)}: ${Math.round(unsupported)} mm of its ${Math.round(u.local.d)} mm depth is beyond the ${holder} mm holders.`,
            details: { unsupportedMm: unsupported, depthMm: u.local.d },
          });
      }
      if (u.tiltDeg > 12 && !u.model.mounting.nonSlipFeet && !u.model.mounting.vesa)
        issues.push({
          ruleId: 'PLC-009',
          severity: 'warning',
          entityIds: [u.unitId],
          message: `${label(u)} sits at ${u.tiltDeg}° without non-slip feet or VESA/strap mounting.`,
          details: { tiltDeg: u.tiltDeg },
        });
    }
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i]!;
        const b = on[j]!;
        const rect = (u: ResolvedUnit) => [
          { x: u.local.x, y: u.local.y },
          { x: u.local.x + u.local.w, y: u.local.y },
          { x: u.local.x + u.local.w, y: u.local.y + u.local.d },
          { x: u.local.x, y: u.local.y + u.local.d },
        ];
        if (s.surface.kind !== 'rack-bay' && convexOverlap(rect(a), rect(b)))
          issues.push({
            ruleId: 'PLC-001',
            severity: 'error',
            entityIds: [a.unitId, b.unitId],
            message: `${label(a)} and ${label(b)} overlap on ${r.label}.`,
          });
      }
    if (s.surface.rack) {
      const items = on.flatMap((u) =>
        u.placement.mount.type === 'rack'
          ? [{ unitId: u.unitId, uStart: u.placement.mount.uStart, model: u.model }]
          : [],
      );
      for (const p of rackFit(s.surface, items).problems)
        if (p.severity !== 'info')
          issues.push({ ruleId: 'PLC-006', severity: p.severity, entityIds: [p.unitId], message: p.message });
    }
  }

  // ---- row pitch between adjacent tiers of the same stand ----
  const pitches: PitchReport[] = [];
  const byStand = new Map<string, SurfaceReport[]>();
  for (const r of surfaces)
    if (r.kind === 'tier' && r.planeZ !== null) byStand.set(r.standUnitId, [...(byStand.get(r.standUnitId) ?? []), r]);
  for (const rows of byStand.values()) {
    rows.sort((a, b) => a.trayZ - b.trayZ);
    for (let i = 0; i + 1 < rows.length; i++) {
      const lower = rows[i]!;
      const upper = rows[i + 1]!;
      const lowerUnits = all.filter((u) => lower.unitIds.includes(u.unitId));
      const upperUnits = all.filter((u) => upper.unitIds.includes(u.unitId));
      const hLower = Math.max(...lowerUnits.map((u) => u.size.h));
      const hUpper = Math.max(...upperUnits.map((u) => u.size.h));
      const overhang = upperUnits.some((uu) => lowerUnits.some((lu) => convexOverlap(uu.plan, lu.plan)));
      pitches.push({
        lower,
        upper,
        pitchMm: upper.planeZ! - lower.planeZ!,
        minPitchMm: minRowPitch(hLower, hUpper, overhang, ergo),
        overhang,
      });
    }
  }

  // ---- occlusion and hand clearance ----
  const occlusions: OcclusionReport[] = [];
  for (const lower of all)
    for (const upper of all) {
      if (upper === lower || upper.placement.mount.type === 'stacked') continue;
      // Only controls the player uses: not rack gear, floor items or set-and-forget units.
      if (lower.placement.mount.type === 'rack' || lower.placement.mount.type === 'floor') continue;
      if (upper.placement.mount.type === 'floor' || lower.model.ergonomics.interaction === 'set-and-forget') continue;
      if (upper.min.z <= lower.controlPlaneZ) continue;
      const xOverlap = Math.min(upper.max.x, lower.max.x) - Math.max(upper.min.x, lower.min.x);
      if (xOverlap <= 0) continue;
      const fraction = occlusionFraction(upper, lower, eye);
      const above = convexOverlap(upper.plan, lower.plan);
      const holder = upper.surfaceId
        ? (layout.surfaceOf(upper.standUnitId!, upper.surfaceId)?.surface.holders?.thicknessMm ?? 0)
        : 0;
      const gapMm = above ? upper.min.z - holder - lower.max.z : null;
      if (fraction <= 0 && gapMm === null) continue;
      occlusions.push({ upperUnitId: upper.unitId, lowerUnitId: lower.unitId, hiddenFraction: fraction, gapMm });
      if (fraction > 0.15)
        issues.push({
          ruleId: 'PLC-005',
          severity: 'warning',
          entityIds: [upper.unitId, lower.unitId],
          message: `${label(upper)} hides ${Math.round(fraction * 100)}% of ${label(lower)}'s controls from eye height.`,
          details: { hiddenPct: Math.round(fraction * 100) },
          fixes: [
            {
              label: 'Raise the upper tier or move it back',
              action: { kind: 'adjust-tier', surfaceId: upper.surfaceId ?? '' },
            },
          ],
        });
      if (gapMm !== null && gapMm < ergo.handClearanceMm)
        issues.push({
          ruleId: 'PLC-005',
          severity: 'warning',
          entityIds: [upper.unitId, lower.unitId],
          message: `Only ${Math.round(gapMm)} mm of hand room between ${label(lower)} and ${label(upper)} (needs ${ergo.handClearanceMm} mm).`,
          details: { gapMm: Math.round(gapMm), clearanceMm: ergo.handClearanceMm },
        });
    }

  // ---- data quality of placed units ----
  for (const u of all)
    if (u.size.estimated)
      issues.push({
        ruleId: 'DATA-001',
        severity: 'info',
        entityIds: [u.unitId],
        message: `${label(u)} is placed with estimated dimensions (${Math.round(u.size.w)} × ${Math.round(u.size.d)} × ${Math.round(u.size.h)} mm).`,
      });

  return { layout, eye, surfaces, pitches, occlusions, issues };
}
