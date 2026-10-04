import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkGearModel, checkProject } from '@/domain/integrity';
import {
  addGearUnit, applyMeasurement, deleteGearModel, deleteGearUnit, duplicateGearModel, exportBundle, gearModelUsage,
  gearUnitUsage, importBundle, markVerified, mergeGearModels, unverifiedFields,
} from '@/domain/libraryOps'; // prettier-ignore
import { GearModel as GearSchema, Template as TemplateSchema } from '@/domain/schemas';
import { loadProject } from '@/domain/serialize';
import {
  defaultParams, instantiateConnectorTemplate, instantiateGearTemplate, instantiateStandTemplate, keyboardWidthMm,
} from '@/domain/templates'; // prettier-ignore
import type { Project } from '@/domain/types';

const sampleText = readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8');
const sample = (): Project => {
  const r = loadProject(sampleText);
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const tdir = new URL('../../seed/templates/', import.meta.url);
const templates = readdirSync(tdir).map((f) =>
  TemplateSchema.parse(JSON.parse(readFileSync(new URL(f, tdir), 'utf8'))),
);
const tpl = (id: string) => templates.find((t) => t.id === id)!;

describe('units and usage', () => {
  it('adds numbered units for models that already have one', () => {
    const p = sample();
    const u = addGearUnit(p, 'gear-behringer-pro-800');
    expect(u.nickname).toBe('Pro-800 #2');
  });

  it('reports usage and cascades deletes without breaking references', () => {
    const p = sample();
    const usage = gearUnitUsage(p, 'unit-ep40');
    expect(usage.placements.map((x) => x.unitId)).toContain('unit-sidekick'); // stacked child counts
    expect(usage.connections.length).toBeGreaterThan(0);
    deleteGearUnit(p, 'unit-ep40');
    expect(checkProject(p).filter((i) => i.level === 'error')).toEqual([]);
    expect(p.setups[0]!.placements.find((x) => x.unitId === 'unit-sidekick')?.mount.type).toBe('floor');
  });

  it('deleting a model removes its units', () => {
    const p = sample();
    expect(gearModelUsage(p, 'gear-elektron-psu-3c').units).toHaveLength(4);
    deleteGearModel(p, 'gear-elektron-psu-3c');
    expect(p.inventory.gearUnits.some((u) => u.modelId === 'gear-elektron-psu-3c')).toBe(false);
    expect(checkProject(p).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('merges duplicate models', () => {
    const p = sample();
    const dup = duplicateGearModel(p, 'gear-elektron-digitone-ii');
    addGearUnit(p, dup.id, 'unit-dup');
    mergeGearModels(p, 'gear-elektron-digitone-ii', dup.id);
    expect(p.inventory.gearUnits.find((u) => u.id === 'unit-dup')?.modelId).toBe('gear-elektron-digitone-ii');
    expect(p.library.gearModels.some((m) => m.id === dup.id)).toBe(false);
  });
});

describe('verification', () => {
  it('lists unknown and estimated fields', () => {
    const p = sample();
    const ep40 = p.library.gearModels.find((m) => m.id === 'gear-te-ep-40-riddim')!;
    expect(unverifiedFields(ep40).map((f) => f.path)).toEqual(
      expect.arrayContaining(['dimensions.w', 'dimensions.weightKg']),
    );
  });

  it('measure mode stamps measured provenance with history', () => {
    const p = sample();
    const ep40 = p.library.gearModels.find((m) => m.id === 'gear-te-ep-40-riddim')!;
    applyMeasurement(ep40, { w: 120, d: 75 });
    expect(ep40.dimensions.w).toBe(120);
    expect(ep40.provenance['dimensions.w']).toMatchObject({ kind: 'measured' });
    expect(ep40.provenance['dimensions.w']!.note).toContain('previous value unknown');
    expect(unverifiedFields(ep40).map((f) => f.path)).not.toContain('dimensions.w');
  });

  it('mark verified converts estimated values but leaves unknowns', () => {
    const p = sample();
    const ipad = p.library.gearModels.find((m) => m.id === 'gear-apple-ipad-pro-m4-11')!;
    markVerified(ipad);
    expect(ipad.provenance['dimensions.w']?.kind).toBe('user');
  });
});

describe('bundles', () => {
  it('exports and re-imports with each conflict mode', () => {
    const p = sample();
    const b = exportBundle(p, new Set(['gear-elektron-digitone-ii', 'cable-midi-din']));
    expect(b.gearModels).toHaveLength(1);
    expect(b.cableModels).toHaveLength(1);
    const n = p.library.gearModels.length;
    expect(importBundle(p, b, 'skip')).toMatchObject({ skipped: 2 });
    expect(importBundle(p, b, 'replace')).toMatchObject({ replaced: 2 });
    expect(importBundle(p, b, 'keep-both')).toMatchObject({ renamed: 2 });
    expect(p.library.gearModels).toHaveLength(n + 1);
  });
});

describe('templates (spec §5.2)', () => {
  it('ships every built-in template group', () => {
    const groups = new Set(templates.map((t) => t.group));
    expect([...groups].sort()).toEqual([
      'Audio infrastructure',
      'Computers',
      'Connector groups',
      'Custom',
      'Desktop gear',
      'Effects',
      'MIDI/CV',
      'Monitoring',
      'Power',
      'Rack',
      'Stands',
    ]);
    expect(templates.filter((t) => t.target === 'connectors')).toHaveLength(11);
  });

  it('every gear and stand template instantiates to a valid model', () => {
    for (const t of templates) {
      if (t.target === 'gear') {
        const m = instantiateGearTemplate(t);
        expect(GearSchema.safeParse(m).success, t.id).toBe(true);
        expect(
          checkGearModel(m).filter((i) => i.level === 'error'),
          t.id,
        ).toEqual([]);
      }
      if (t.target === 'stand') expect(instantiateStandTemplate(t).surfaces.length, t.id).toBeGreaterThan(0);
    }
  });

  it('repeats connector groups by parameter', () => {
    const mixer = instantiateGearTemplate(tpl('tpl-mixer'), { channels: 4 });
    expect(mixer.connectors.filter((c) => c.id.endsWith('-mic')).map((c) => c.label)).toEqual([
      'CH 1 Mic',
      'CH 2 Mic',
      'CH 3 Mic',
      'CH 4 Mic',
    ]);
    expect(mixer.connectors.find((c) => c.id === 'ch3-line')?.channel?.index).toBe(3);
    const iface = instantiateGearTemplate(tpl('tpl-usb-interface'), { inputs: 4, outputs: 6 });
    expect(iface.connectors.filter((c) => c.id.startsWith('out-'))).toHaveLength(6);
    expect(iface.createdFromTemplateId).toBe('tpl-usb-interface');
  });

  it('computes keyboard width from key count, flagged as estimated', () => {
    const kb = instantiateGearTemplate(tpl('tpl-controller-keyboard'), { keys: 61 });
    expect(kb.dimensions.w).toBe(keyboardWidthMm(61, 'full'));
    expect(kb.provenance['dimensions.w']?.kind).toBe('estimated');
  });

  it('unknown template dimensions stay null with unknown provenance', () => {
    const fx = instantiateGearTemplate(tpl('tpl-desktop-effect'));
    expect(fx.dimensions.w).toBeNull();
    expect(fx.provenance['dimensions.w']?.kind).toBe('unknown');
  });

  it('connector templates get unique ids against existing connectors', () => {
    const add = instantiateConnectorTemplate(tpl('tpl-conn-midi-din-io'), ['midi-in']);
    expect(add.map((c) => c.id)).toEqual(['midi-in-2', 'midi-out']);
  });

  it('stand generators honour parameters', () => {
    const rack = instantiateStandTemplate(tpl('tpl-stand-rack'), { ...defaultParams(tpl('tpl-stand-rack')), u: 6 });
    expect(rack.surfaces[0]!.rack?.u).toBe(6);
    const frame = instantiateStandTemplate(tpl('tpl-stand-a-frame'), {
      ...defaultParams(tpl('tpl-stand-a-frame')),
      tiers: 2,
    });
    expect(frame.surfaces).toHaveLength(2);
  });
});
