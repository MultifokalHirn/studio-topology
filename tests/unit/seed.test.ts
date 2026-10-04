// The seed must represent the gear reference (docs/studio-gear-reference.md v2) faithfully.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkGearModel, checkProject, provenanceFor } from '@/domain/integrity';
import { GearModel as GearSchema } from '@/domain/schemas';
import { loadProject } from '@/domain/serialize';
import type { Connector, GearModel } from '@/domain/types';

const dir = new URL('../../seed/gear/', import.meta.url);
const models = new Map<string, GearModel>(
  readdirSync(dir).map((f) => {
    const m = GearSchema.parse(JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    return [m.id, m];
  }),
);
const g = (id: string) => {
  const m = models.get(id);
  if (!m) throw new Error(`missing seed model ${id}`);
  return m;
};
const conn = (m: GearModel, id: string): Connector => {
  const c = m.connectors.find((x) => x.id === id);
  if (!c) throw new Error(`${m.id} has no ${id}`);
  return c;
};
const count = (m: GearModel, pred: (c: Connector) => boolean) => m.connectors.filter(pred).length;
const isUnknown = (m: GearModel, path: string) => provenanceFor(m.provenance, path)?.kind === 'unknown';

/** Reference §1 device list (29 devices). */
const REFERENCE_DEVICES = [
  'gear-elektron-analog-heat-mkii', 'gear-elektron-analog-four-mkii', 'gear-elektron-digitone-ii', 'gear-elektron-octatrack-mkii',
  'gear-behringer-neutron', 'gear-behringer-pro-800', 'gear-behringer-2-xm', 'gear-clavia-nord-wave-2', 'gear-arturia-matrixbrute',
  'gear-behringer-rd-8-mkii', 'gear-clavia-nord-drum-3p', 'gear-te-ep-40-riddim', 'gear-strymon-nightsky', 'gear-eventide-h90',
  'gear-dbx-166xl', 'gear-behringer-composer-mdx2100', 'gear-spl-vitalizer-sx2', 'gear-behringer-ultrafex-ii-ex3100', 'gear-ssl-12',
  'gear-te-ep-136-ko-sidekick', 'gear-allen-heath-mixwizard-wz3-16-2', 'gear-spl-grapevine-keymix-6', 'gear-behringer-ada8200',
  'gear-behringer-ultrapatch-pro-px3000', 'gear-arturia-keystep', 'gear-squarp-pyramid-mk3', 'gear-iconnectivity-mioxl',
  'gear-cre8audio-niftycase', 'gear-apple-ipad-pro-m4-11',
]; // prettier-ignore

describe('seed catalogue covers the gear reference', () => {
  it('has all 29 devices, each passing integrity checks', () => {
    expect(REFERENCE_DEVICES).toHaveLength(29);
    const ids = new Set(models.keys());
    for (const id of REFERENCE_DEVICES) {
      expect(ids.has(id), id).toBe(true);
      expect(
        checkGearModel(g(id), ids).filter((i) => i.level === 'error'),
        id,
      ).toEqual([]);
    }
  });

  it('§1.1 Elektron connectivity', () => {
    const heat = g('gear-elektron-analog-heat-mkii');
    expect(conn(heat, 'out-main-l')).toMatchObject({
      signal: { balance: 'imp-balanced' },
      channel: { role: 'L', group: 'out-main' },
    });
    expect(conn(heat, 'midi-thru').clock?.format).toBe('dinsync24');
    expect(conn(heat, 'usb').usb?.audio).toMatchObject({
      inChannels: 2,
      outChannels: 2,
      compliance: 'class-compliant',
    });
    const a4 = g('gear-elektron-analog-four-mkii');
    expect(count(a4, (c) => c.id.startsWith('out-voice-'))).toBe(4);
    expect(count(a4, (c) => c.id.startsWith('cv-gate-'))).toBe(4);
    expect(conn(a4, 'in-ext-l').signal?.balance).toBe('unbalanced');
    const ot = g('gear-elektron-octatrack-mkii');
    expect(count(ot, (c) => c.direction === 'in' && c.domain === 'audio.analog')).toBe(4);
    expect(ot.midi?.tracks).toHaveLength(8);
    expect(conn(ot, 'usb').usb?.audio).toBeUndefined();
    expect(isUnknown(ot, `connectors.${ot.connectors.findIndex((c) => c.id === 'phones')}.jack`)).toBe(true);
  });

  it('§1.2 synths, including patch fields and switchable MIDI ports', () => {
    const neutron = g('gear-behringer-neutron');
    expect(count(neutron, (c) => c.id.startsWith('patch-out-'))).toBe(24);
    expect(count(neutron, (c) => c.id.startsWith('patch-in-'))).toBe(32);
    expect(conn(neutron, 'midi-thru').midi?.thruMode).toBe('soft');
    expect(neutron.connectors.some((c) => c.id === 'midi-out')).toBe(false);
    const pro = g('gear-behringer-pro-800');
    expect(conn(pro, 'out').signal?.maxDbu).toBe(5);
    expect(conn(pro, 'out-audio').signal?.maxDbu).toBe(20);
    expect(conn(pro, 'midi-out-thru').alternates?.map((a) => a.id)).toEqual(['thru']);
    const xm = g('gear-behringer-2-xm');
    expect(count(xm, (c) => c.face === 'top' && c.direction === 'in')).toBe(16);
    expect(count(xm, (c) => c.face === 'top' && c.direction === 'out' && c.id.startsWith('patch-out'))).toBe(16);
    expect(conn(xm, 'usb').usb?.audio?.compliance).toBe('unknown');
    expect(xm.dimensions.weightKg).toBeNull();
    const mb = g('gear-arturia-matrixbrute');
    expect(count(mb, (c) => c.id.startsWith('cv-out-'))).toBe(12);
    expect(count(mb, (c) => c.id.startsWith('cv-in-'))).toBe(12);
    expect(provenanceFor(mb.provenance, 'dimensions.weightKg')?.kind).toBe('retailer');
  });

  it('§1.3–1.4 drums and effects', () => {
    const rd8 = g('gear-behringer-rd-8-mkii');
    expect(count(rd8, (c) => c.id.startsWith('out-voice-'))).toBe(11);
    expect(count(rd8, (c) => c.id.startsWith('trig-out-'))).toBe(3);
    const ep40 = g('gear-te-ep-40-riddim');
    expect(conn(ep40, 'midi-in')).toMatchObject({ domain: 'midi.trs-a', jack: 'jack-3.5-TRS' });
    expect(conn(ep40, 'sync-in').clock?.format).toBe('po-sync');
    expect([ep40.dimensions.w, ep40.dimensions.d, ep40.dimensions.h]).toEqual([null, null, null]);
    expect(isUnknown(ep40, 'dimensions.w')).toBe(true);
    const h90 = g('gear-eventide-h90');
    expect(count(h90, (c) => c.domain === 'audio.analog' && c.direction === 'out')).toBe(4);
    expect(conn(h90, 'midi-out-thru').alternates?.[0]?.direction).toBe('thru');
    const dbx = g('gear-dbx-166xl');
    expect(conn(dbx, 'sidechain-1').insert).toEqual({ tip: 'return', ring: 'send' });
    expect(conn(dbx, 'in-1-xlr').exclusiveWith).toEqual(['in-1-trs']);
    expect(dbx.dimensions).toMatchObject({ d: 172, weightKg: 2.29, rack: { u: 1 } });
    for (const id of [
      'gear-behringer-composer-mdx2100',
      'gear-behringer-ultrafex-ii-ex3100',
      'gear-spl-grapevine-keymix-6',
      'gear-behringer-ada8200',
    ])
      expect(g(id).dimensions.d, id).toBeNull();
  });

  it('§1.5 mixers, interfaces and routing', () => {
    const ssl = g('gear-ssl-12');
    expect(conn(ssl, 'usb').usb).toMatchObject({
      busPowered: true,
      audio: { inChannels: 12, outChannels: 8, maxRateHz: 192000 },
    });
    expect(count(ssl, (c) => c.jack === 'combo-xlr-trs')).toBe(4);
    expect(conn(ssl, 'phones-1').alternates?.[0]?.domain).toBe('audio.analog');
    expect(ssl.connectors.some((c) => c.id === 'adat-out')).toBe(false);
    const wz = g('gear-allen-heath-mixwizard-wz3-16-2');
    for (const suffix of ['mic', 'line', 'insert', 'direct'])
      expect(count(wz, (c) => /^ch\d+-/.test(c.id) && c.id.endsWith(suffix))).toBe(16);
    expect(count(wz, (c) => c.id.startsWith('aux-'))).toBe(6);
    expect(count(wz, (c) => c.jack === 'xlr-m')).toBe(3);
    const px = g('gear-behringer-ultrapatch-pro-px3000');
    expect(px.connectors).toHaveLength(96);
    expect(new Set(px.internalPaths.filter((p) => p.group).map((p) => p.presetId))).toEqual(
      new Set(['normal', 'half-normal']),
    );
    const ada = g('gear-behringer-ada8200');
    expect(conn(ada, 'wordclock-in').jack).toBe('bnc-f');
    expect(count(ada, (c) => c.face === 'front')).toBe(8);
    const sidekick = g('gear-te-ep-136-ko-sidekick');
    expect(conn(sidekick, 'usb').usb?.audio).toMatchObject({ inChannels: 8, outChannels: 4 });
    expect(conn(sidekick, 'out-main').channel?.role).toBe('stereo');
  });

  it('§1.6 controllers and hubs', () => {
    const mio = g('gear-iconnectivity-mioxl');
    expect(count(mio, (c) => c.id.startsWith('din-in-'))).toBe(8);
    expect(count(mio, (c) => c.id.startsWith('din-out-'))).toBe(12);
    expect(count(mio, (c) => c.usb?.role === 'host')).toBe(10);
    expect(conn(mio, 'ethernet').jack).toBe('rj45');
    const pyr = g('gear-squarp-pyramid-mk3');
    expect(conn(pyr, 'midi-out-b').alternates?.map((a) => a.id)).toEqual(['dinsync24', 'dinsync48']);
    expect(pyr.clock?.canBeMaster).toBe(true);
    const ks = g('gear-arturia-keystep');
    expect(ks.clock?.formats).toEqual(
      expect.arrayContaining(['pulse-step', 'pulse-2ppqn', 'pulse-24ppqn', 'pulse-48ppqn']),
    );
    expect(conn(ks, 'usb').jack).toBe('usb-micro-b-f');
    const ipad = g('gear-apple-ipad-pro-m4-11');
    expect(conn(ipad, 'usb-c').usb).toMatchObject({ role: 'host', version: '4' });
    expect(conn(ipad, 'ble-midi').jack).toBe('wireless');
    expect(provenanceFor(ipad.provenance, 'dimensions.w')?.kind).toBe('estimated');
    expect(g('gear-cre8audio-niftycase').power.busRails).toEqual({ plus12Ma: 1500, minus12Ma: 500, plus5Ma: 500 });
  });

  it('§3 power: voltages, polarity, plugs, and the adapter hazard is representable', () => {
    for (const id of [
      'gear-elektron-analog-heat-mkii',
      'gear-elektron-analog-four-mkii',
      'gear-elektron-digitone-ii',
      'gear-elektron-octatrack-mkii',
      'gear-eventide-h90',
    ]) {
      expect(g(id).power.sources[0]).toMatchObject({
        nominalV: 12,
        plug: { odMm: 5.5, idMm: 2.5, polarity: 'center-positive' },
      });
    }
    expect(g('gear-strymon-nightsky').power.sources[0]).toMatchObject({
      nominalV: 9,
      voltageMaxV: 9,
      plug: { odMm: 5.5, idMm: 2.1, polarity: 'center-negative' },
    });
    expect(g('gear-behringer-rd-8-mkii').power.sources[0]?.nominalV).toBe(18);
    expect(g('gear-eventide-h90').power.sources[0]).toMatchObject({ voltageMinV: 9, voltageMaxV: 12 });
    expect(g('gear-allen-heath-mixwizard-wz3-16-2').power.mainsRegion).toBe('auto-100-240');
    expect(g('gear-elektron-psu-3c').connectors.find((c) => c.id === 'dc-out')?.psu).toMatchObject({
      voltage: 12,
      currentMaMax: 2000,
    });
    expect(g('gear-strymon-nightsky-psu').connectors.find((c) => c.id === 'dc-out')?.psu?.polarity).toBe(
      'center-negative',
    );
    expect(g('gear-behringer-ultrapatch-pro-px3000').power.sources).toEqual([]);
  });
});

describe('sample project', () => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  const p = r.project;

  it('is schema-valid and referentially intact', () => {
    expect(checkProject(p).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('owns every reference device and its included supplies', () => {
    const owned = new Set(p.inventory.gearUnits.map((u) => u.modelId));
    for (const id of REFERENCE_DEVICES) expect(owned.has(id), id).toBe(true);
    expect(p.inventory.gearUnits.filter((u) => u.modelId === 'gear-elektron-psu-3c')).toHaveLength(4);
  });

  it('Planned (standing) uses the spec §8.1 tier assignment', () => {
    const planned = p.setups.find((s) => s.name === 'Planned (standing)')!;
    const unitModel = new Map(p.inventory.gearUnits.map((u) => [u.id, u.modelId]));
    const onTier = (tier: string) =>
      planned.placements
        .filter((x) => x.mount.type === 'surface' && x.mount.surfaceId === tier)
        .map((x) => unitModel.get(x.unitId))
        .sort();
    expect(onTier('tier-middle')).toEqual([
      'gear-arturia-keystep',
      'gear-elektron-analog-four-mkii',
      'gear-elektron-octatrack-mkii',
    ]);
    expect(onTier('tier-top')).toEqual([
      'gear-apple-ipad-pro-m4-11',
      'gear-elektron-analog-heat-mkii',
      'gear-elektron-digitone-ii',
    ]);
    expect(onTier('tier-bottom')).toEqual(['gear-behringer-rd-8-mkii']);
    expect(planned.derivedFromId).toBe('setup-current');
  });

  it('every unit is placed in both setups (PSUs excepted)', () => {
    const psu = new Set(
      p.inventory.gearUnits.filter((u) => u.modelId.endsWith('-psu') || u.modelId.endsWith('psu-3c')).map((u) => u.id),
    );
    for (const s of p.setups) {
      const placed = new Set(s.placements.map((x) => x.unitId));
      const missing = p.inventory.gearUnits.filter((u) => !psu.has(u.id) && !placed.has(u.id)).map((u) => u.id);
      expect(missing, s.name).toEqual([]);
    }
  });
});

describe('integrity checker catches broken references', () => {
  it('flags unknown connectors, unknown surfaces and nulls without provenance', () => {
    const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
    if (!r.ok) throw new Error(r.message);
    const p = structuredClone(r.project);
    p.setups[0]!.connections[0]!.b.connectorId = 'nope';
    const pl = p.setups[0]!.placements.find((x) => x.mount.type === 'surface')!;
    if (pl.mount.type === 'surface') pl.mount.surfaceId = 'tier-nowhere';
    p.library.gearModels[0]!.provenance = {};
    p.library.gearModels[0]!.dimensions.weightKg = null;
    const msgs = checkProject(p).map((i) => i.message);
    expect(msgs).toContain('Analog Heat has no connector "nope"');
    expect(msgs).toContain('Unknown surface "tier-nowhere"');
    expect(msgs).toContain('Null value without provenance (expected `unknown`)');
  });
});
