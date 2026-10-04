// Library and inventory operations (spec §5.2). Pure functions over a project (or an Immer draft of one).
import { newId } from './ids';
import { provenanceFor } from './integrity';
import type { CableModel, GearModel, GearUnit, Project, Provenance, StandModel, Template } from './types';

const today = () => new Date().toISOString().slice(0, 10);

export function modelLabel(m: Pick<GearModel, 'manufacturer' | 'name' | 'variant'>): string {
  return [m.manufacturer, m.name, m.variant].filter(Boolean).join(' ');
}

/** Add an owned unit for a model. The nickname gets "#n" when the model already has units. */
export function addGearUnit(p: Project, modelId: string, id = newId()): GearUnit {
  const m = p.library.gearModels.find((x) => x.id === modelId);
  if (!m) throw new Error(`Unknown model ${modelId}`);
  const n = p.inventory.gearUnits.filter((u) => u.modelId === modelId).length;
  const base = [m.name, m.variant].filter(Boolean).join(' ');
  const unit: GearUnit = { id, modelId, nickname: n ? `${base} #${n + 1}` : base };
  p.inventory.gearUnits.push(unit);
  return unit;
}

export function addStandUnit(p: Project, modelId: string, id = newId()) {
  const m = p.library.standModels.find((x) => x.id === modelId);
  if (!m) throw new Error(`Unknown stand model ${modelId}`);
  const unit = { id, modelId, nickname: m.name };
  p.inventory.standUnits.push(unit);
  return unit;
}

export interface Usage {
  units: string[];
  placements: { setupId: string; unitId: string }[];
  connections: { setupId: string; connectionId: string }[];
}

/** Where a gear unit is used across setups. */
export function gearUnitUsage(p: Project, unitId: string): Usage {
  const usage: Usage = { units: [unitId], placements: [], connections: [] };
  for (const s of p.setups) {
    for (const pl of s.placements)
      if (pl.unitId === unitId || (pl.mount.type === 'stacked' && pl.mount.parentUnitId === unitId))
        usage.placements.push({ setupId: s.id, unitId: pl.unitId });
    for (const c of s.connections)
      if (c.a.unitId === unitId || c.b.unitId === unitId) usage.connections.push({ setupId: s.id, connectionId: c.id });
  }
  return usage;
}

export function gearModelUsage(p: Project, modelId: string): Usage {
  const units = p.inventory.gearUnits.filter((u) => u.modelId === modelId).map((u) => u.id);
  const merged: Usage = { units, placements: [], connections: [] };
  for (const id of units) {
    const u = gearUnitUsage(p, id);
    merged.placements.push(...u.placements);
    merged.connections.push(...u.connections);
  }
  return merged;
}

/** Remove a gear unit and everything in setups that refers to it (stacked children fall to the floor). */
export function deleteGearUnit(p: Project, unitId: string): void {
  p.inventory.gearUnits = p.inventory.gearUnits.filter((u) => u.id !== unitId);
  for (const s of p.setups) {
    const parent = s.placements.find((x) => x.unitId === unitId);
    s.placements = s.placements.filter((x) => x.unitId !== unitId);
    for (const pl of s.placements) {
      if (pl.mount.type === 'stacked' && pl.mount.parentUnitId === unitId) {
        pl.mount = { type: 'floor', pos: parent?.mount.type === 'floor' ? parent.mount.pos : { x: 0, y: 0 } };
      }
    }
    s.connections = s.connections.filter((c) => c.a.unitId !== unitId && c.b.unitId !== unitId);
    delete s.unitConfigs[unitId];
    for (const c of Object.values(s.unitConfigs))
      c.powerAssignments = c.powerAssignments.filter((a) => a.supplyUnitId !== unitId);
  }
}

export function deleteGearModel(p: Project, modelId: string): void {
  for (const u of p.inventory.gearUnits.filter((x) => x.modelId === modelId)) deleteGearUnit(p, u.id);
  p.library.gearModels = p.library.gearModels.filter((m) => m.id !== modelId);
  for (const m of p.library.gearModels)
    for (const s of m.power.sources) if (s.suppliedModelId === modelId) delete s.suppliedModelId;
}

export function deleteStandUnit(p: Project, unitId: string): void {
  p.inventory.standUnits = p.inventory.standUnits.filter((u) => u.id !== unitId);
  for (const s of p.setups) {
    s.stands = s.stands.filter((x) => x.standUnitId !== unitId);
    for (const pl of s.placements) {
      if ((pl.mount.type === 'surface' || pl.mount.type === 'rack') && pl.mount.standUnitId === unitId)
        pl.mount = { type: 'floor', pos: { x: 0, y: 0 } };
    }
  }
}

export function duplicateGearModel(p: Project, modelId: string, id = newId()): GearModel {
  const m = p.library.gearModels.find((x) => x.id === modelId);
  if (!m) throw new Error(`Unknown model ${modelId}`);
  const copy: GearModel = { ...structuredClone(m), id, name: `${m.name} (copy)` };
  p.library.gearModels.push(copy);
  return copy;
}

export function duplicateGearUnit(p: Project, unitId: string, id = newId()): GearUnit {
  const u = p.inventory.gearUnits.find((x) => x.id === unitId);
  if (!u) throw new Error(`Unknown unit ${unitId}`);
  const copy = {
    ...addGearUnit(p, u.modelId, id),
    ...(u.overrides ? { overrides: structuredClone(u.overrides) } : {}),
  };
  p.inventory.gearUnits[p.inventory.gearUnits.length - 1] = copy;
  return copy;
}

/** Merge duplicate models: units of `dropId` move to `keepId`, then `dropId` is removed. */
export function mergeGearModels(p: Project, keepId: string, dropId: string): void {
  if (keepId === dropId) return;
  const keep = p.library.gearModels.find((m) => m.id === keepId);
  const drop = p.library.gearModels.find((m) => m.id === dropId);
  if (!keep || !drop) throw new Error('Unknown model');
  for (const u of p.inventory.gearUnits) if (u.modelId === dropId) u.modelId = keepId;
  for (const a of [drop.name, ...drop.aliases]) if (a !== keep.name && !keep.aliases.includes(a)) keep.aliases.push(a);
  for (const m of p.library.gearModels)
    for (const s of m.power.sources) if (s.suppliedModelId === dropId) s.suppliedModelId = keepId;
  p.library.gearModels = p.library.gearModels.filter((m) => m.id !== dropId);
}

// ---------- verification ----------

export interface UnverifiedField {
  path: string;
  kind: 'unknown' | 'estimated';
  note?: string;
}

const KEY_FIELDS = ['dimensions.w', 'dimensions.d', 'dimensions.h', 'dimensions.weightKg'];

/** Fields that are null, `unknown` or `estimated` (spec §5.2 verification workflow). */
export function unverifiedFields(m: GearModel): UnverifiedField[] {
  const out = new Map<string, UnverifiedField>();
  for (const k of KEY_FIELDS) {
    const [, field] = k.split('.') as [string, keyof GearModel['dimensions']];
    const value = m.dimensions[field];
    const prov = provenanceFor(m.provenance, k);
    if (value === null) out.set(k, { path: k, kind: 'unknown', note: prov?.note });
    else if (prov?.kind === 'unknown' || prov?.kind === 'estimated')
      out.set(k, { path: k, kind: prov.kind, note: prov.note });
  }
  for (const [k, v] of Object.entries(m.provenance)) {
    if ((v.kind === 'unknown' || v.kind === 'estimated') && !out.has(k))
      out.set(k, { path: k, kind: v.kind, note: v.note });
  }
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export const isUnverified = (m: GearModel) => unverifiedFields(m).length > 0;

/** Bulk "mark verified": estimated entries with a value become `user`. Unknown (null) values stay unknown. */
export function markVerified(m: GearModel, kind: Provenance['kind'] = 'user'): void {
  for (const [k, v] of Object.entries(m.provenance)) {
    if (v.kind === 'estimated' && !k.includes('*'))
      m.provenance[k] = { kind, note: `Verified ${today()}; was estimated${v.note ? `: ${v.note}` : ''}` };
  }
}

/** Measure mode: stamp measured values, keeping the previous value in a history note. */
export function applyMeasurement(m: GearModel, values: Partial<Record<'w' | 'd' | 'h' | 'weightKg', number>>): void {
  for (const [k, v] of Object.entries(values) as ['w' | 'd' | 'h' | 'weightKg', number][]) {
    if (!Number.isFinite(v)) continue;
    const before = m.dimensions[k];
    m.dimensions[k] = v;
    m.provenance[`dimensions.${k}`] = {
      kind: 'measured',
      retrieved: today(),
      note: `Measured ${today()}; previous value ${before === null ? 'unknown' : before}.`,
    };
  }
}

// ---------- bundles ----------

export interface LibraryBundle {
  kind: 'studio-planner-library-bundle';
  version: 1;
  gearModels: GearModel[];
  standModels: StandModel[];
  cableModels: CableModel[];
  templates: Template[];
}

export function exportBundle(p: Project, ids: Set<string>): LibraryBundle {
  const pick = <T extends { id: string }>(xs: T[]) => xs.filter((x) => ids.has(x.id));
  return {
    kind: 'studio-planner-library-bundle',
    version: 1,
    gearModels: pick(p.library.gearModels),
    standModels: pick(p.library.standModels),
    cableModels: pick(p.library.cableModels),
    templates: pick(p.library.templates),
  };
}

export type ConflictMode = 'skip' | 'replace' | 'keep-both';

export interface ImportReport {
  added: number;
  replaced: number;
  skipped: number;
  renamed: number;
}

/** Import a bundle. On id conflicts: skip, replace in place, or keep both (the incoming copy gets a new id). */
export function importBundle(p: Project, b: LibraryBundle, mode: ConflictMode): ImportReport {
  const report: ImportReport = { added: 0, replaced: 0, skipped: 0, renamed: 0 };
  const merge = <T extends { id: string }>(target: T[], incoming: T[]) => {
    for (const item of incoming) {
      const i = target.findIndex((x) => x.id === item.id);
      if (i < 0) {
        target.push(structuredClone(item));
        report.added++;
      } else if (mode === 'skip') report.skipped++;
      else if (mode === 'replace') {
        target[i] = structuredClone(item);
        report.replaced++;
      } else {
        target.push({ ...structuredClone(item), id: newId() });
        report.renamed++;
      }
    }
  };
  merge(p.library.gearModels, b.gearModels);
  merge(p.library.standModels, b.standModels);
  merge(p.library.cableModels, b.cableModels);
  merge(p.library.templates, b.templates);
  return report;
}

export function isLibraryBundle(x: unknown): x is LibraryBundle {
  return !!x && typeof x === 'object' && (x as LibraryBundle).kind === 'studio-planner-library-bundle';
}

/** Human-readable field path: `connectors.12.jack` → `connectors[Headphones].jack`. */
export function describePath(m: GearModel, path: string): string {
  return path.replace(/^connectors\.(\d+)/, (all, i: string) => {
    const c = m.connectors[Number(i)];
    return c ? `connectors[${c.label}]` : all;
  });
}
