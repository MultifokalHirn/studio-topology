import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '@/domain/serialize';
import type { Project } from '@/domain/types';
import { bomCsv, cableBom } from '@/engine/bom';
import { elkGraph, elkPositions } from '@/engine/elkLayout';
import { buildPatchGraph } from '@/engine/patch';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};

describe('cable BOM', () => {
  it('groups by model and length, skips captive leads, counts owned stock', () => {
    const p = sample();
    const s = p.setups[0]!;
    s.connections[0]!.cable.lengthMm = 1000;
    s.connections[1]!.cable.lengthMm = 1000;
    p.inventory.cables.push({ id: 'own-1', modelId: 'cable-trs-6.35', lengthMm: 1000, inStock: true });
    const rows = cableBom(s.connections, p.library.cableModels, p.inventory.cables);
    const trs1m = rows.find((r) => r.cableModelId === 'cable-trs-6.35' && r.lengthMm === 1000)!;
    expect(trs1m).toMatchObject({ needed: 2, owned: 1, missing: 1 });
    expect(rows.some((r) => r.name.includes('no cable'))).toBe(false); // PSU leads are captive
    expect(rows.find((r) => r.cableModelId === 'cable-midi-din')!.lengthMm).toBeNull(); // sample lengths not computed
    expect(bomCsv(rows).split('\n')[0]).toBe('cable,length_mm,needed,owned_in_stock,missing');
    expect(bomCsv([{ ...trs1m, name: 'a, "b"' }])).toContain('"a, ""b"""');
  });

  it('disabled connections are not counted', () => {
    const p = sample();
    const s = p.setups[0]!;
    const before = cableBom(s.connections, p.library.cableModels, []).reduce((n, r) => n + r.needed, 0);
    s.connections[0]!.enabled = false;
    expect(cableBom(s.connections, p.library.cableModels, []).reduce((n, r) => n + r.needed, 0)).toBe(before - 1);
  });
});

describe('ELK patch layout', () => {
  it('builds fixed-side ports and lays out sources left of the mixer', async () => {
    const p = sample();
    const g = buildPatchGraph(p, p.setups[0]!, { allPorts: false });
    const input = elkGraph(g);
    expect(input.children.find((c) => c.id === 'unit-dt2')!.ports.every((x) => x.layoutOptions['elk.port.side'])).toBe(
      true,
    );
    const pos = await elkPositions(g);
    expect(pos.size).toBe(g.nodes.length);
    expect(pos.get('unit-dt2')!.x).toBeLessThan(pos.get('unit-wz3')!.x);
    expect(pos.get('unit-wz3')!.x).toBeLessThan(pos.get('unit-ssl12')!.x);
  }, 20000);
});
