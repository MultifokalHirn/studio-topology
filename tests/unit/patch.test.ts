import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '@/domain/serialize';
import type { Project } from '@/domain/types';
import { buildPatchGraph, layeredLayout, makeConnection, pairPartner, patchUnitIds, portSide } from '@/engine/patch';
import { resolveLayout } from '@/engine/placement';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const p = sample();
const model = (id: string) => p.library.gearModels.find((m) => m.id === id)!;
const c = (m: string, id: string) => model(m).connectors.find((x) => x.id === id)!;
const DT2 = 'gear-elektron-digitone-ii';
const WZ3 = 'gear-allen-heath-mixwizard-wz3-16-2';

describe('patch graph', () => {
  it('nodes for placed or wired units; only connected ports unless asked', () => {
    const s = p.setups[0]!;
    const g = buildPatchGraph(p, s, { allPorts: false });
    expect(g.nodes.length).toBe(patchUnitIds(p, s).length);
    const dt = g.nodes.find((n) => n.unitId === 'unit-dt2')!;
    expect(dt.ports.every((x) => x.connected)).toBe(true);
    const all = buildPatchGraph(p, s, { allPorts: true }).nodes.find((n) => n.unitId === 'unit-dt2')!;
    expect(all.ports).toHaveLength(10);
    expect(all.ports.find((x) => x.connector.id === 'in-l')?.side).toBe('west');
    expect(all.ports.find((x) => x.connector.id === 'out-main-l')?.side).toBe('east');
  });

  it('edges run from source to destination whatever order the ends were stored in', () => {
    const s = structuredClone(p.setups[0]!);
    const first = s.connections[0]!;
    [first.a, first.b] = [first.b, first.a];
    const e = buildPatchGraph(p, s, { allPorts: false }).edges.find((x) => x.connection.id === first.id)!;
    expect(e.from.unitId).toBe('unit-dt2');
    expect(e.to.unitId).toBe('unit-heat');
  });

  it('USB devices face west, hosts east', () => {
    expect(portSide(c('gear-ssl-12', 'usb'))).toBe('west');
    expect(portSide(c('gear-apple-ipad-pro-m4-11', 'usb-c'))).toBe('east');
  });

  it('layered layout: sources left of processors left of mixers left of the interface', () => {
    const s = p.setups[0]!;
    const pos = layeredLayout(buildPatchGraph(p, s, { allPorts: false }), {});
    const x = (id: string) => pos.get(id)!.x;
    expect(x('unit-dt2')).toBeLessThan(x('unit-heat'));
    expect(x('unit-heat')).toBeLessThan(x('unit-wz3'));
    expect(x('unit-wz3')).toBeLessThan(x('unit-ssl12'));
    // Supplies and strips sit in their own last column.
    expect(x('unit-psu-dt2')).toBeGreaterThan(x('unit-ssl12'));
    expect(x('unit-strip-desk')).toBe(x('unit-psu-dt2'));
    const pinned = layeredLayout(buildPatchGraph(p, s, { allPorts: false }), {
      'unit-dt2': { x: 999, y: 7, pinned: true },
    });
    expect(pinned.get('unit-dt2')).toEqual({ x: 999, y: 7 });
    // Two pinned nodes on top of each other are separated vertically.
    const stacked = layeredLayout(buildPatchGraph(p, s, { allPorts: true }), {
      'unit-ot': { x: 0, y: 0, pinned: true },
      'unit-a4': { x: 50, y: 20, pinned: true },
    });
    const ot = buildPatchGraph(p, s, { allPorts: true }).nodes.find((n) => n.unitId === 'unit-ot')!;
    expect(stacked.get('unit-a4')!.y).toBeGreaterThanOrEqual(ot.height);
  });
});

describe('creating connections', () => {
  it('Shift-connect partners: L↔R and the next numbered channel', () => {
    expect(pairPartner(model(DT2), c(DT2, 'out-main-l'))?.id).toBe('out-main-r');
    expect(pairPartner(model(DT2), c(DT2, 'out-main-r'))?.id).toBe('out-main-l');
    expect(pairPartner(model(WZ3), c(WZ3, 'ch5-line'))?.id).toBe('ch6-line');
    expect(pairPartner(model(WZ3), c(WZ3, 'aux-1'))?.id).toBe('aux-2');
    expect(pairPartner(model(DT2), c(DT2, 'midi-in'))).toBeUndefined();
  });

  it('makeConnection suggests the cable, computes the length and fills MIDI/USB defaults', () => {
    const units = resolveLayout(p, p.setups[0]!).units;
    const audio = makeConnection(p, units, {
      a: { unitId: 'unit-dt2', connector: c(DT2, 'out-main-l') },
      b: { unitId: 'unit-wz3', connector: c(WZ3, 'ch1-line') },
    });
    expect(audio.cable).toMatchObject({ modelId: 'cable-trs-6.35', autoLength: true });
    expect(audio.cable.lengthMm).toBeGreaterThan(1000); // stand to desk
    const midi = makeConnection(p, units, {
      a: { unitId: 'unit-a4', connector: c('gear-elektron-analog-four-mkii', 'midi-in') },
      b: { unitId: 'unit-ot', connector: c('gear-elektron-octatrack-mkii', 'midi-out') },
      midiChannels: [3],
    });
    expect(midi.midi).toEqual({ channels: [3], purposes: ['notes', 'cc', 'pc', 'clock', 'transport', 'sysex'] });
    const usb = makeConnection(p, units, {
      a: { unitId: 'unit-ssl12', connector: c('gear-ssl-12', 'usb') },
      b: { unitId: 'unit-ipad', connector: c('gear-apple-ipad-pro-m4-11', 'usb-c') },
    });
    expect(usb.usb).toEqual({ hostUnitId: 'unit-ipad' });
    expect(usb.cable.modelId).toBe('cable-usb-c-c');
  });
});
