import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '@/domain/serialize';
import type { Project } from '@/domain/types';
import { cloneSetup, deleteSetup, moveSetup, uniqueSetupName } from '@/domain/variants';
import { checklistMarkdown, connectionKey, diffSetups, migrationChecklist, SECTION_TITLES } from '@/engine/variants';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};

describe('clone and derive', () => {
  it('clone deep-copies with new ids; units keep theirs; derive links back', () => {
    const p = sample();
    const cur = p.setups[0]!;
    const c = cloneSetup(cur, { name: 'Standing plan' });
    expect(c.id).not.toBe(cur.id);
    expect(c.derivedFromId).toBeUndefined();
    expect(c.status).toBe('planned');
    expect(c.connections.map((x) => x.id).some((id) => cur.connections.some((y) => y.id === id))).toBe(false);
    expect(c.connections.map(connectionKey)).toEqual(cur.connections.map(connectionKey));
    expect(c.placements.map((x) => x.unitId)).toEqual(cur.placements.map((x) => x.unitId));
    // Bundles stay paired under a new id.
    const bundled = cur.connections.filter((x) => x.bundleId);
    if (bundled.length) {
      const i = cur.connections.indexOf(bundled[0]!);
      expect(c.connections[i]!.bundleId).not.toBe(bundled[0]!.bundleId);
      const partners = c.connections.filter((x) => x.bundleId === c.connections[i]!.bundleId);
      expect(partners.length).toBe(cur.connections.filter((x) => x.bundleId === bundled[0]!.bundleId).length);
    }
    c.placements[0]!.mount = { type: 'floor', pos: { x: 1, y: 2 } };
    expect(cur.placements[0]!.mount.type).not.toBe('floor'); // deep copy
    expect(cloneSetup(cur, { name: 'D', derive: true }).derivedFromId).toBe(cur.id);
  });

  it('names, reorder, delete', () => {
    const p = sample();
    expect(uniqueSetupName(p, 'Current')).toBe('Current 2');
    const [a, b] = p.setups;
    moveSetup(p, b!.id, -1);
    expect(p.setups[0]!.id).toBe(b!.id);
    p.activeSetupId = a!.id;
    const d = cloneSetup(a!, { name: 'D', derive: true });
    d.migrationChecks = { [a!.id]: ['power-down'] };
    p.setups.push(d);
    expect(deleteSetup(p, a!.id)).toBe(true);
    expect(p.activeSetupId).not.toBe(a!.id);
    expect(d.derivedFromId).toBeUndefined();
    expect(d.migrationChecks).toEqual({});
    while (p.setups.length > 1) deleteSetup(p, p.setups[0]!.id);
    expect(deleteSetup(p, p.setups[0]!.id)).toBe(false);
  });
});

describe('scenario 5: variants (spec §11)', () => {
  const build = () => {
    const p = sample();
    const cur = p.setups[0]!;
    const plan = cloneSetup(cur, { name: 'Standing plan', derive: true });
    p.setups.push(plan);
    // Move gear: Digitone II to the top tier; tier height change; re-wire.
    const dt2 = plan.placements.find((x) => x.unitId === 'unit-dt2')!;
    dt2.mount = { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 200, y: 20 };
    plan.stands.find((s) => s.standUnitId === 'stand-unit-jaspers')!.surfaceStates['tier-middle'] = { z: 950 };
    const heatL = plan.connections.find((c) => c.a.unitId === 'unit-dt2' && c.a.connectorId === 'out-main-l')!;
    const removedKey = connectionKey(heatL);
    heatL.b = { unitId: 'unit-wz3', connectorId: 'ch3-line' };
    const changed = plan.connections.find((c) => c.a.unitId === 'unit-ot')!;
    changed.cable = { ...changed.cable, autoLength: false, lengthMm: 3000 };
    return { p, cur, plan, removedKey, changedKey: connectionKey(changed) };
  };

  it('compare shows layout and connection diffs and metrics', () => {
    const { p, cur, plan, removedKey, changedKey } = build();
    const d = diffSetups(p, cur, plan);
    const dt2 = d.units.find((u) => u.unitId === 'unit-dt2')!;
    expect(dt2).toMatchObject({ kind: 'moved' });
    expect(dt2.from).toContain('Middle tier');
    expect(dt2.to).toContain('Top tier');
    expect(dt2.distanceMm).toBeGreaterThan(100);
    expect(d.surfaces).toContainEqual(expect.objectContaining({ surfaceId: 'tier-middle', field: 'height', to: 950 }));
    expect(d.connections.removed.map((c) => c.key)).toEqual([removedKey]);
    expect(d.connections.added).toHaveLength(1);
    expect(d.connections.rerouted[0]?.shared).toBe('Digitone II · Main L');
    expect(d.connections.changed).toEqual([expect.objectContaining({ key: changedKey, changes: ['length'] })]);
    expect(d.metrics.a.rackU).toBe(d.metrics.b.rackU);
    expect(d.metrics.b.issues.error + d.metrics.b.issues.warning + d.metrics.b.issues.info).toBeGreaterThan(0);
    expect(d.metrics.a.ergonomicScore).toBeGreaterThan(0);
  });

  it('checklist lists disconnect, move, adjust, reconnect steps in order; Markdown export', () => {
    const { p, cur, plan, removedKey } = build();
    const items = migrationChecklist(p, cur, plan);
    const order = Object.keys(SECTION_TITLES);
    const idx = items.map((i) => order.indexOf(i.section));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(items[0]!.section).toBe('power-down');
    expect(items.find((i) => i.id === `disconnect:${removedKey}`)?.text).toBe(
      'Digitone II · Main L → Analog Heat MKII · In L',
    );
    expect(items.find((i) => i.id === 'move:unit-dt2')?.text).toMatch(
      /^Move Digitone II: .*Middle tier.* → .*Top tier/,
    );
    expect(items.find((i) => i.section === 'adjust')?.text).toBe(
      'Jaspers 3D-145B · Middle tier: height 900 mm → 950 mm',
    );
    const re = items.filter((i) => i.section === 'reconnect');
    expect(re.map((i) => i.text)).toContain('Digitone II · Main L → MixWizard WZ3 16:2 · CH 3 Line');
    expect(re.find((i) => i.text.startsWith('Digitone II'))!.detail).toMatch(/m|mm/);
    expect(items.some((i) => i.section === 'verify' && i.text.startsWith('Pyramid MK3: clock master'))).toBe(true);

    const md = checklistMarkdown({ from: cur.name, to: plan.name }, items, new Set(['power-down']));
    expect(md).toContain('# Migration: Current → Standing plan');
    expect(md).toContain('- [x] Power down all units');
    expect(md).toContain('## Disconnect cables');
    expect(md.indexOf('## Disconnect cables')).toBeLessThan(md.indexOf('## Move units'));
    expect(md.indexOf('## Adjust tiers')).toBeLessThan(md.indexOf('## Reconnect cables'));
  });

  it('identical setups need no migration', () => {
    const p = sample();
    const c = cloneSetup(p.setups[0]!, { name: 'copy' });
    expect(migrationChecklist(p, p.setups[0]!, c)).toEqual([]);
  });
});
