// Ergonomics module (spec §5.13): per-unit comfort, setup score, tier optimiser and assignment advisor.
import { controlPlaneZ } from '@/domain/geometry';
import { setSurfaceState } from '@/domain/setupOps';
import type { GearModel, Project, Setup, SurfaceDef, Usage } from '@/domain/types';
import { landmarks, type Landmarks } from './body';
import { analyzeLayout, type PitchReport } from './layout';
import { resolveLayout, type ResolvedLayout, type ResolvedUnit } from './placement';

export const USAGE_WEIGHT: Record<Usage, number> = { primary: 3, secondary: 2, rare: 1 };
/** Lateral reach from the body centre line (spec §5.13). */
export const REACH_COMFORT_MM = 450;
export const REACH_MAX_MM = 600;
/** Gap between units when the assignment advisor packs a row. */
export const ROW_GAP_MM = 10;

const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function unitUsage(setup: Setup, unitId: string, model: GearModel): Usage {
  return setup.unitConfigs[unitId]?.usage ?? model.ergonomics.defaultUsage;
}

/** Target control plane (spec §5.13): elbow for keys and faders, −50 for knobs/buttons, −100 for rare or set-and-forget. */
export function targetPlane(model: GearModel, usage: Usage, elbowMm: number): number {
  const i = model.ergonomics.interaction;
  if (usage === 'rare' || i === 'set-and-forget') return elbowMm - 100;
  if (i === 'keys' || i === 'fader') return elbowMm;
  return elbowMm - 50;
}

export const comfortScore = (plane: number, target: number) => 100 * Math.max(0, 1 - Math.abs(plane - target) / 250);

/** Controls that are touched a lot get their recommended tilt capped at 12° (spec §5.13). */
const controlHeavy = (m: GearModel) => ['keys', 'knobs-buttons', 'pads', 'fader'].includes(m.ergonomics.interaction);

export function recommendedTilt(losDeg: number, heavy: boolean): number {
  return Math.min(clamp(losDeg - 25, 0, 20), heavy ? 12 : 20);
}

/** Units the score applies to: hand-operated gear that is placed (not stored on the floor, not footswitches). */
export function isScored(u: ResolvedUnit): boolean {
  return !u.orphan && u.placement.mount.type !== 'floor' && u.model.ergonomics.interaction !== 'footswitch';
}

export interface UnitErgo {
  unitId: string;
  usage: Usage;
  weight: number;
  plane: number;
  target: number;
  score: number;
  /** Forearm angle (°, positive = hands above the elbow). */
  forearmDeg: number;
  /** Line-of-sight angle (°, positive = below horizontal). */
  losDeg: number;
  recommendedTiltDeg: number;
  tiltDeg: number;
  /** Signed distance of the unit centre from the body centre line (x = 0). */
  lateralMm: number;
}

export interface ErgoReport {
  lm: Landmarks;
  units: UnitErgo[];
  /** Usage-weighted mean comfort (0–100); null when no unit is scored. */
  score: number | null;
}

export function bodyFor(project: Project, setup: Setup) {
  return project.bodyProfiles.find((b) => b.id === setup.bodyProfileId) ?? project.bodyProfiles[0];
}

export function ergonomicsReport(project: Project, setup: Setup, layout?: ResolvedLayout): ErgoReport | null {
  const body = bodyFor(project, setup);
  if (!body) return null;
  const lm = landmarks(body, setup.posture, setup.seatHeightMm);
  const l = layout ?? resolveLayout(project, setup);
  const e = project.settings.ergonomics;
  const units: UnitErgo[] = [];
  for (const u of l.units.values()) {
    if (!isScored(u)) continue;
    const usage = unitUsage(setup, u.unitId, u.model);
    const target = targetPlane(u.model, usage, lm.elbowMm);
    const plane = u.controlPlaneZ;
    const losDeg = deg(Math.atan((lm.eyeMm - plane) / e.viewDistanceMm));
    units.push({
      unitId: u.unitId,
      usage,
      weight: USAGE_WEIGHT[usage],
      plane,
      target,
      score: comfortScore(plane, target),
      forearmDeg: deg(Math.asin(clamp((plane - lm.elbowMm) / lm.forearmHandMm, -1, 1))),
      losDeg,
      recommendedTiltDeg: recommendedTilt(losDeg, controlHeavy(u.model)),
      tiltDeg: u.tiltDeg,
      lateralMm: (u.min.x + u.max.x) / 2,
    });
  }
  const w = units.reduce((a, u) => a + u.weight, 0);
  return { lm, units, score: w ? units.reduce((a, u) => a + u.weight * u.score, 0) / w : null };
}

// ---------- optimiser ----------

export interface TierRecommendation {
  standUnitId: string;
  surfaceId: string;
  label: string;
  from: { z: number; tiltDeg: number; planeZ: number | null };
  to: { z: number; tiltDeg: number; planeZ: number | null };
}

export interface OptimizerResult {
  recommendations: TierRecommendation[];
  scoreBefore: number | null;
  scoreAfter: number | null;
  /** Pitch checks after applying (all should pass). */
  pitches: PitchReport[];
  notes: string[];
}

/** Lexicographic objective: comfort first, then the weighted squared distance to the targets (ties on the plateau). */
interface Value {
  score: number;
  sq: number;
}
const better = (a: Value, b: Value) => (Math.abs(a.score - b.score) > 1e-6 ? a.score > b.score : a.sq < b.sq - 1e-6);
const add = (a: Value, b: Value): Value => ({ score: a.score + b.score, sq: a.sq + b.sq });

interface Row {
  standUnitId: string;
  surface: SurfaceDef;
  label: string;
  z: number;
  tiltDeg: number;
  /** Units directly on the row (they set the row plane). */
  direct: ResolvedUnit[];
  /** Units whose height follows this row (direct and stacked on them). */
  carried: ResolvedUnit[];
}

const grid = (r: { min: number; max: number; step: number }, gridMm: number) => {
  const step = Math.max(gridMm, r.step);
  const out: number[] = [];
  const start = Math.ceil(r.min / step) * step;
  for (let v = start; v <= r.max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
};

/** Which row (stand/surface) a unit's height depends on, following stacked parents. */
function rowOf(u: ResolvedUnit, l: ResolvedLayout): { standUnitId: string; surfaceId: string } | null {
  let cur: ResolvedUnit | undefined = u;
  for (let i = 0; cur && i < 10; i++) {
    const m = cur.placement.mount;
    if (m.type === 'surface' || m.type === 'rack') return { standUnitId: m.standUnitId, surfaceId: m.surfaceId };
    if (m.type !== 'stacked') return null;
    cur = l.units.get(m.parentUnitId);
  }
  return null;
}

function withSurfaceStates(
  setup: Setup,
  states: { standUnitId: string; surface: SurfaceDef; z?: number; tiltDeg?: number }[],
) {
  const s = structuredClone(setup);
  for (const x of states) setSurfaceState(s, x.standUnitId, x.surface, { z: x.z, tiltDeg: x.tiltDeg });
  return s;
}

/**
 * Tier optimiser (spec §5.13): per stand, search tier heights on a 5 mm grid within each tier's range to maximise the
 * usage-weighted comfort, subject to the minimum row pitch. The tilt of each candidate is the recommended tilt for the
 * row's line of sight (2° grid, within the tier's tilt range); tilt is not searched freely because it only nudges the
 * plane and would otherwise be used to fine-tune the score. Dynamic programming over the rows (bottom → top).
 */
export function optimizeTiers(project: Project, setup: Setup, opts: { gridMm?: number } = {}): OptimizerResult {
  const gridMm = opts.gridMm ?? 5;
  const notes: string[] = [];
  const report = analyzeLayout(project, setup);
  const l = report.layout;
  const before = ergonomicsReport(project, setup, l);
  if (!before)
    return { recommendations: [], scoreBefore: null, scoreAfter: null, pitches: [], notes: ['No body profile.'] };
  const byUnit = new Map(before.units.map((u) => [u.unitId, u]));
  const e = project.settings.ergonomics;

  // Adjustable rows that carry units.
  const rows: Row[] = [];
  for (const sr of report.surfaces) {
    const rs = l.surfaceOf(sr.standUnitId, sr.surfaceId)!;
    if (!rs.surface.adjustable.z || sr.unitIds.length === 0 || rs.surface.kind === 'rack-bay') continue;
    const carried = [...l.units.values()].filter((u) => {
      const r = rowOf(u, l);
      return r?.standUnitId === sr.standUnitId && r.surfaceId === sr.surfaceId;
    });
    rows.push({
      standUnitId: sr.standUnitId,
      surface: rs.surface,
      label: sr.label,
      z: sr.trayZ,
      tiltDeg: sr.tiltDeg,
      direct: carried.filter((u) => sr.unitIds.includes(u.unitId)),
      carried,
    });
  }
  if (!rows.length) notes.push('No adjustable tier carries units.');
  const tight = report.pitches.filter((p) => p.pitchMm < p.minPitchMm - 0.5);
  if (tight.length)
    notes.push(
      `The current heights are below the minimum row pitch (${tight
        .map((p) => `${p.lower.label} → ${p.upper.label}: ${Math.round(p.pitchMm)} of ${Math.round(p.minPitchMm)} mm`)
        .join('; ')}); the recommendation restores it, which can cost comfort.`,
    );

  // Unit plane offsets above the tray, per tilt (one resolve per tilt value for all rows at once).
  const tiltsOf = (r: Row) => (r.surface.adjustable.tiltDeg ? grid(r.surface.adjustable.tiltDeg, 2) : [r.tiltDeg]);
  const allTilts = [...new Set(rows.flatMap(tiltsOf))];
  const offset = new Map<string, Map<number, number>>(); // unitId → tilt → plane − tray z
  for (const t of allTilts) {
    const s = withSurfaceStates(
      setup,
      rows
        .filter((r) => tiltsOf(r).includes(t))
        .map((r) => ({ standUnitId: r.standUnitId, surface: r.surface, tiltDeg: t })),
    );
    const lt = resolveLayout(project, s);
    for (const r of rows) {
      if (!tiltsOf(r).includes(t)) continue;
      const tray = lt.surfaceOf(r.standUnitId, r.surface.id)!.frame.origin.z;
      for (const u of r.carried) {
        const ru = lt.units.get(u.unitId);
        if (!ru) continue;
        const m = offset.get(u.unitId) ?? new Map<number, number>();
        m.set(t, ru.controlPlaneZ - tray);
        offset.set(u.unitId, m);
      }
    }
  }

  interface Cand {
    z: number;
    tiltDeg: number;
    rowPlane: number;
    value: Value;
  }
  const candidates = (r: Row): Cand[] => {
    const tilts = tiltsOf(r);
    const heavy = r.direct.some((u) => controlHeavy(u.model));
    return grid(r.surface.adjustable.z!, gridMm).map((z) => {
      // Tilt from the row's line of sight at tilt 0 (highest direct unit), snapped to the tilt grid.
      const flat = Math.max(...r.direct.map((u) => z + (offset.get(u.unitId)?.get(tilts[0]!) ?? u.size.h)));
      const los = deg(Math.atan((before.lm.eyeMm - flat) / e.viewDistanceMm));
      const want = recommendedTilt(los, heavy);
      const tiltDeg = tilts.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), tilts[0]!);
      let score = 0;
      let sq = 0;
      for (const u of r.carried) {
        const ue = byUnit.get(u.unitId);
        if (!ue) continue;
        const plane = z + (offset.get(u.unitId)?.get(tiltDeg) ?? ue.plane - r.z);
        score += ue.weight * comfortScore(plane, ue.target);
        sq += ue.weight * (plane - ue.target) ** 2;
      }
      const rowPlane = Math.max(...r.direct.map((u) => z + (offset.get(u.unitId)?.get(tiltDeg) ?? u.size.h)));
      return { z, tiltDeg, rowPlane, value: { score, sq } };
    });
  };

  const recommendations: TierRecommendation[] = [];
  const byStand = new Map<string, Row[]>();
  for (const r of rows) byStand.set(r.standUnitId, [...(byStand.get(r.standUnitId) ?? []), r]);
  for (const [standUnitId, standRows] of byStand) {
    standRows.sort((a, b) => a.z - b.z);
    const minPitch = (lower: Row, upper: Row) =>
      report.pitches.find(
        (p) =>
          p.lower.surfaceId === lower.surface.id &&
          p.upper.surfaceId === upper.surface.id &&
          p.lower.standUnitId === standUnitId,
      )?.minPitchMm ?? 0;
    const cands = standRows.map(candidates);
    // best[i][k]: best value of rows 0..i with row i at candidate k; prev[i][k]: chosen candidate of row i−1.
    const best: (Value | null)[][] = [cands[0]!.map((c) => c.value)];
    const prev: number[][] = [cands[0]!.map(() => -1)];
    for (let i = 1; i < standRows.length; i++) {
      const need = minPitch(standRows[i - 1]!, standRows[i]!);
      const row: (Value | null)[] = [];
      const back: number[] = [];
      for (const c of cands[i]!) {
        let bj = -1;
        let bv: Value | null = null;
        cands[i - 1]!.forEach((p, j) => {
          const v = best[i - 1]![j];
          if (!v || p.z >= c.z || c.rowPlane - p.rowPlane < need - 1e-6) return;
          if (!bv || better(v, bv)) {
            bv = v;
            bj = j;
          }
        });
        row.push(bv ? add(bv, c.value) : null);
        back.push(bj);
      }
      best.push(row);
      prev.push(back);
    }
    const last = best[best.length - 1]!;
    let k = -1;
    last.forEach((v, i) => {
      if (v && (k < 0 || better(v, last[k]!))) k = i;
    });
    if (k < 0) {
      notes.push(
        `No tier heights on ${standRows[0]!.label.split(' · ')[0]} satisfy the minimum row pitch within the tier ranges.`,
      );
      continue;
    }
    for (let i = standRows.length - 1; i >= 0; i--) {
      const r = standRows[i]!;
      const c = cands[i]![k]!;
      const cur = report.surfaces.find((s) => s.standUnitId === standUnitId && s.surfaceId === r.surface.id)!;
      recommendations.unshift({
        standUnitId,
        surfaceId: r.surface.id,
        label: r.label,
        from: { z: r.z, tiltDeg: r.tiltDeg, planeZ: cur.planeZ },
        to: { z: c.z, tiltDeg: c.tiltDeg, planeZ: c.rowPlane },
      });
      k = prev[i]![k]!;
    }
  }

  const applied = withSurfaceStates(
    setup,
    recommendations.map((r) => ({
      standUnitId: r.standUnitId,
      surface: rows.find((x) => x.standUnitId === r.standUnitId && x.surface.id === r.surfaceId)!.surface,
      z: r.to.z,
      tiltDeg: r.to.tiltDeg,
    })),
  );
  const after = analyzeLayout(project, applied);
  for (const r of recommendations)
    r.to.planeZ =
      after.surfaces.find((s) => s.standUnitId === r.standUnitId && s.surfaceId === r.surfaceId)?.planeZ ?? r.to.planeZ;
  return {
    recommendations,
    scoreBefore: before.score,
    scoreAfter: ergonomicsReport(project, applied, after.layout)?.score ?? null,
    pitches: after.pitches,
    notes,
  };
}

/** Apply optimiser output to a setup draft (one undoable step in the caller). */
export function applyTierRecommendations(project: Project, setup: Setup, recs: TierRecommendation[]): void {
  for (const r of recs) {
    const su = project.inventory.standUnits.find((x) => x.id === r.standUnitId);
    const surface = project.library.standModels
      .find((m) => m.id === su?.modelId)
      ?.surfaces.find((s) => s.id === r.surfaceId);
    if (surface) setSurfaceState(setup, r.standUnitId, surface, { z: r.to.z, tiltDeg: r.to.tiltDeg });
  }
}

// ---------- assignment advisor ----------

export interface AssignmentMove {
  unitId: string;
  fromSurfaceId: string;
  toSurfaceId: string;
  x: number;
  y: number;
}

export interface AssignmentResult {
  standUnitId: string;
  moves: AssignmentMove[];
  /** Weighted comfort of the units on these rows, before and after (0–100). */
  scoreBefore: number | null;
  scoreAfter: number | null;
  notes: string[];
}

/**
 * Assignment advisor (spec §5.13): which unit goes on which tier of one stand, at the current tier heights and tilts.
 * Greedy by usage weight, then pairwise swaps and single moves while they improve the weighted comfort; each row keeps
 * its width budget (sum of widths plus 10 mm gaps ≤ usable width). Units keep their left-to-right order within a row.
 */
export function adviseAssignment(project: Project, setup: Setup, standUnitId: string): AssignmentResult {
  const report = analyzeLayout(project, setup);
  const l = report.layout;
  const ergo = ergonomicsReport(project, setup, l);
  const notes: string[] = [];
  const rows = report.surfaces.filter((s) => s.standUnitId === standUnitId && s.kind === 'tier');
  if (!ergo || rows.length < 2)
    return {
      standUnitId,
      moves: [],
      scoreBefore: null,
      scoreAfter: null,
      notes: ['Needs a stand with at least two tiers.'],
    };
  const byUnit = new Map(ergo.units.map((u) => [u.unitId, u]));
  const units = rows.flatMap((r) => r.unitIds.map((id) => l.units.get(id)!)).filter((u) => byUnit.has(u.unitId));
  const width = (u: ResolvedUnit) => u.size.w;
  const avail = new Map(rows.map((r) => [r.surfaceId, r.widthAvailMm]));
  const scoreOn = (u: ResolvedUnit, rowId: string) => {
    const r = rows.find((x) => x.surfaceId === rowId)!;
    const ue = byUnit.get(u.unitId)!;
    return ue.weight * comfortScore(controlPlaneZ(r.trayZ, u.size, r.tiltDeg), ue.target);
  };
  const total = (a: Map<string, string>) => units.reduce((s, u) => s + scoreOn(u, a.get(u.unitId)!), 0);
  const fits = (a: Map<string, string>, rowId: string) =>
    units.filter((u) => a.get(u.unitId) === rowId).reduce((s, u, i) => s + width(u) + (i ? ROW_GAP_MM : 0), 0) <=
    avail.get(rowId)! + 0.5;

  const current = new Map(units.map((u) => [u.unitId, u.surfaceId!]));
  // Greedy: heaviest usage first, widest first among equals.
  const a = new Map<string, string>();
  for (const u of [...units].sort(
    (x, y) => byUnit.get(y.unitId)!.weight - byUnit.get(x.unitId)!.weight || width(y) - width(x),
  )) {
    const options = rows
      .map((r) => r.surfaceId)
      .filter((id) => {
        a.set(u.unitId, id);
        const ok = fits(a, id);
        a.delete(u.unitId);
        return ok;
      })
      .sort((x, y) => scoreOn(u, y) - scoreOn(u, x));
    a.set(u.unitId, options[0] ?? current.get(u.unitId)!);
    if (!options.length) notes.push(`${u.unit.nickname} does not fit on any tier; left where it is.`);
  }
  // Improvement: swaps and single moves.
  for (let round = 0, improved = true; improved && round < 50; round++) {
    improved = false;
    const base = total(a);
    for (const u of units)
      for (const r of rows) {
        const from = a.get(u.unitId)!;
        if (from === r.surfaceId) continue;
        a.set(u.unitId, r.surfaceId);
        if (fits(a, r.surfaceId) && total(a) > base + 1e-6) {
          improved = true;
          break;
        }
        a.set(u.unitId, from);
      }
    if (improved) continue;
    for (let i = 0; i < units.length && !improved; i++)
      for (let j = i + 1; j < units.length && !improved; j++) {
        const x = units[i]!;
        const y = units[j]!;
        const ax = a.get(x.unitId)!;
        const ay = a.get(y.unitId)!;
        if (ax === ay) continue;
        a.set(x.unitId, ay);
        a.set(y.unitId, ax);
        if (fits(a, ax) && fits(a, ay) && total(a) > base + 1e-6) improved = true;
        else {
          a.set(x.unitId, ax);
          a.set(y.unitId, ay);
        }
      }
  }

  // Pack rows left to right in the units' current world order; keep the depth position.
  const moves: AssignmentMove[] = [];
  for (const r of rows) {
    const on = units.filter((u) => a.get(u.unitId) === r.surfaceId).sort((x, y) => x.min.x - y.min.x);
    const changed = on.some((u) => current.get(u.unitId) !== r.surfaceId);
    if (!changed && on.length === r.unitIds.length) continue;
    let x = 0;
    for (const u of on) {
      const m = u.placement.mount;
      moves.push({
        unitId: u.unitId,
        fromSurfaceId: current.get(u.unitId)!,
        toSurfaceId: r.surfaceId,
        x,
        y: m.type === 'surface' ? m.y : 0,
      });
      x += width(u) + ROW_GAP_MM;
    }
  }
  const w = units.reduce((s, u) => s + byUnit.get(u.unitId)!.weight, 0);
  if (moves.some((m) => m.fromSurfaceId !== m.toSurfaceId))
    notes.push('Run the tier optimiser again after applying: row heights depend on the units.');
  return {
    standUnitId,
    moves,
    scoreBefore: w ? total(current) / w : null,
    scoreAfter: w ? total(a) / w : null,
    notes,
  };
}
