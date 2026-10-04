// Setup variants (spec §5.11): clone and derive with fresh ids, reorder, delete.
import { newId } from './ids';
import type { Project, Setup } from './types';

/**
 * Deep copy of a setup with new ids for the setup, connections, bundles, annotations and placement groups.
 * Gear and stand units are inventory items and keep their ids. `derive` links the copy via `derivedFromId`.
 */
export function cloneSetup(src: Setup, opts: { name: string; derive?: boolean; now?: string }): Setup {
  const now = opts.now ?? new Date().toISOString();
  const copy = structuredClone(src);
  const connIds = new Map(copy.connections.map((c) => [c.id, newId()]));
  const bundleIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  const remap = (m: Map<string, string>, id: string) => m.get(id) ?? (m.set(id, newId()), m.get(id)!);
  for (const c of copy.connections) {
    c.id = connIds.get(c.id)!;
    if (c.bundleId) c.bundleId = remap(bundleIds, c.bundleId);
  }
  for (const p of copy.placements) if (p.groupId) p.groupId = remap(groupIds, p.groupId);
  for (const a of copy.annotations) a.id = newId();
  for (const s of copy.suppressedIssues) s.entityIds = s.entityIds.map((id) => connIds.get(id) ?? id);
  const out: Setup = {
    ...copy,
    id: newId(),
    name: opts.name,
    status: src.status === 'current' ? 'planned' : src.status,
    createdAt: now,
    updatedAt: now,
  };
  delete out.migrationChecks;
  if (opts.derive) out.derivedFromId = src.id;
  else delete out.derivedFromId;
  return out;
}

/** Unique "Name (copy)" / "Name (copy 2)" style name. */
export function uniqueSetupName(project: Project, base: string): string {
  const names = new Set(project.setups.map((s) => s.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

export function moveSetup(project: Project, setupId: string, delta: -1 | 1): void {
  const i = project.setups.findIndex((s) => s.id === setupId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= project.setups.length) return;
  const [s] = project.setups.splice(i, 1);
  project.setups.splice(j, 0, s!);
}

/** Delete a setup; the last one cannot be deleted. Links from derived setups and checklist progress are dropped. */
export function deleteSetup(project: Project, setupId: string): boolean {
  if (project.setups.length <= 1) return false;
  const i = project.setups.findIndex((s) => s.id === setupId);
  if (i < 0) return false;
  project.setups.splice(i, 1);
  for (const s of project.setups) {
    if (s.derivedFromId === setupId) delete s.derivedFromId;
    if (s.migrationChecks) delete s.migrationChecks[setupId];
  }
  if (project.activeSetupId === setupId) project.activeSetupId = project.setups[Math.max(0, i - 1)]!.id;
  return true;
}
