import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/domain/defaults';
import { loadProject } from '@/domain/serialize';
import type { Connector, Project } from '@/domain/types';
import {
  cableLength, compatibility, connectionFlow, connectorWorld, effectiveConnector, mate, requiredLength, stockedLength,
  suggestCable,
} from '@/engine/connections'; // prettier-ignore
import { resolveLayout } from '@/engine/placement';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const p = sample();
const model = (id: string) => p.library.gearModels.find((m) => m.id === id)!;
const conn = (modelId: string, id: string): Connector => model(modelId).connectors.find((c) => c.id === id)!;
const cables = p.library.cableModels;
const DT2 = 'gear-elektron-digitone-ii';
const WZ3 = 'gear-allen-heath-mixwizard-wz3-16-2';

describe('direction (spec §4.10, Appendix B)', () => {
  it('derives direction and flags invalid pairs', () => {
    expect(connectionFlow(conn(DT2, 'out-main-l'), conn(WZ3, 'ch5-line'))).toMatchObject({
      kind: 'directed',
      from: 'a',
    });
    expect(connectionFlow(conn(WZ3, 'ch5-line'), conn(DT2, 'out-main-l'))).toMatchObject({
      kind: 'directed',
      from: 'b',
    });
    expect(connectionFlow(conn(DT2, 'midi-thru'), conn(DT2, 'midi-in'))).toMatchObject({ kind: 'directed', from: 'a' });
    expect(connectionFlow(conn(DT2, 'usb'), conn('gear-ssl-12', 'usb')).kind).toBe('bidir');
    expect(connectionFlow(conn(DT2, 'out-main-l'), conn(WZ3, 'aux-1'))).toMatchObject({
      kind: 'invalid',
      reason: 'Output to output',
    });
    // A patchbay point takes the direction of what it is connected to.
    expect(
      connectionFlow(conn('gear-behringer-ultrapatch-pro-px3000', 'rear-top-1'), conn(DT2, 'out-main-l')),
    ).toMatchObject({ kind: 'directed', from: 'b' });
  });

  it('compatibility blocks direction errors and power-to-signal, warns on cross-domain', () => {
    expect(compatibility(conn(DT2, 'out-main-l'), conn(WZ3, 'aux-1')).blocked).toBe(true);
    expect(compatibility(conn('gear-elektron-psu-3c', 'dc-out'), conn(DT2, 'midi-in')).blocked).toBe(true);
    const cv = compatibility(conn('gear-ssl-12', 'out-1'), conn('gear-behringer-neutron', 'patch-in-1'));
    expect(cv.blocked).toBe(false);
    expect(cv.reasons[0]).toContain('SIG-002');
  });

  it('active alternates switch a port (Pro-800 Out/Thru)', () => {
    const c = conn('gear-behringer-pro-800', 'midi-out-thru');
    expect(
      effectiveConnector(c, { activeAlternates: { 'midi-out-thru': 'thru' }, powerAssignments: [], usage: 'secondary' })
        .direction,
    ).toBe('thru');
  });
});

describe('plug mating (Appendix A)', () => {
  it('core table', () => {
    expect(mate('TRS-6.35', 'jack-6.35-TRS')).toBe('ok');
    expect(mate('TS-6.35', 'jack-6.35-TRS')).toBe('ok-info');
    expect(mate('XLR-M', 'combo-xlr-trs')).toBe('ok');
    expect(mate('XLR-M', 'xlr-m')).toBe('no');
    expect(mate('DC-barrel', 'dc-barrel-5.5x2.5')).toBe('ok');
    expect(mate('Y-insert', 'jack-6.35-TRS')).toBe('ok');
    expect(mate('DIN5-M', 'unknown')).toBe('unknown');
  });
});

describe('suggestCable (spec §5.8)', () => {
  it('direct cables', () => {
    expect(suggestCable(conn(DT2, 'out-main-l'), conn(WZ3, 'ch5-line'), 1200, cables)[0]).toMatchObject({
      cableModelId: 'cable-trs-6.35',
      lengthMm: 1500,
    });
    expect(suggestCable(conn(WZ3, 'out-main-l'), conn('gear-ssl-12', 'in-1'), null, cables)[0]?.cableModelId).toBe(
      'cable-xlr',
    );
    expect(
      suggestCable(conn('gear-iconnectivity-mioxl', 'usb-host-1'), conn('gear-behringer-2-xm', 'usb'), null, cables)[0]
        ?.cableModelId,
    ).toBe('cable-usb-a-b');
    expect(
      suggestCable(conn('gear-apple-ipad-pro-m4-11', 'usb-c'), conn('gear-ssl-12', 'usb'), null, cables)[0]
        ?.cableModelId,
    ).toBe('cable-usb-c-c');
    expect(
      suggestCable(conn(DT2, 'midi-out'), conn('gear-elektron-analog-four-mkii', 'midi-in'), null, cables)[0]
        ?.cableModelId,
    ).toBe('cable-midi-din');
  });

  it('TRS-A MIDI to DIN needs an adapter', () => {
    const best = suggestCable(conn('gear-te-ep-40-riddim', 'midi-out'), conn(DT2, 'midi-in'), null, cables)[0]!;
    expect(best).toMatchObject({
      kind: 'cable+adapter',
      cableModelId: 'cable-midi-din',
      adapters: ['adapter-trs-a-din'],
    });
  });

  it('a TS cable into a TRS jack works with an unbalanced note', () => {
    const o = suggestCable(conn('gear-behringer-pro-800', 'out'), conn(WZ3, 'ch9-line'), null, cables)[0]!;
    expect(o.cableModelId).toBe('cable-ts-6.35');
    expect(o.notes.join(' ')).toContain('unbalanced');
  });

  it('captive PSU plugs: the Elektron supply fits, the NightSky supply does not', () => {
    expect(suggestCable(conn('gear-elektron-psu-3c', 'dc-out'), conn(DT2, 'dc-in'), null, cables)[0]).toMatchObject({
      kind: 'captive',
      score: 100,
    });
    const wrong = suggestCable(conn('gear-strymon-nightsky-psu', 'dc-out'), conn(DT2, 'dc-in'), null, cables)[0]!;
    expect(wrong.score).toBe(0);
    expect(wrong.notes[0]).toContain('5.5×2.1');
    expect(
      suggestCable(
        conn('gear-behringer-rd-8-psu', 'dc-out'),
        conn('gear-behringer-rd-8-mkii', 'dc-in'),
        null,
        cables,
      )[0]?.kind,
    ).toBe('unverified');
  });

  it('insert jacks get a Y-insert cable', () => {
    expect(
      suggestCable(conn(WZ3, 'insert-main-l'), conn('gear-dbx-166xl', 'in-1-trs'), null, cables)[0]?.cableModelId,
    ).toBe('cable-y-insert');
  });

  it('length rounds up to stock; too long is flagged', () => {
    const midi = cables.find((c) => c.id === 'cable-midi-din')!;
    expect(stockedLength(midi, 1100)).toEqual({ lengthMm: 1500, noStock: false });
    expect(stockedLength(midi, 16000)).toEqual({ lengthMm: 16000, noStock: true });
  });
});

describe('cable length from the layout', () => {
  it('Manhattan × slack + loops', () => {
    const s = defaultSettings().cables;
    expect(cableLength({ x: 0, y: 0, z: 0 }, { x: 100, y: 200, z: 300 }, s)).toBeCloseTo(600 * 1.15 + 300);
    expect(cableLength({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 600 }, { ...s, viaHeightMm: 0 })).toBeCloseTo(
      100 * 1.15 + 300,
    );
    expect(cableLength({ x: 0, y: 0, z: 500 }, { x: 0, y: 0, z: 600 }, { ...s, viaHeightMm: 100 })).toBeCloseTo(
      900 * 1.15 + 300,
    );
  });

  it('connector positions follow the face mirror rule and placement', () => {
    const layout = resolveLayout(p, p.setups[0]!);
    const dt = layout.units.get('unit-dt2')!;
    const leftOnBack = connectorWorld(dt, { ...conn(DT2, 'out-main-l'), face: 'back', pos: { x: 0, y: 10 } });
    const rightOnBack = connectorWorld(dt, { ...conn(DT2, 'out-main-l'), face: 'back', pos: { x: 215, y: 10 } });
    // Left edge of the back face (as seen from behind) is the right side seen from the front (spec §3.2).
    expect(leftOnBack.x - rightOnBack.x).toBeCloseTo(215);
    expect(leftOnBack.y).toBeCloseTo(dt.min.y + 176);
  });

  it('a connection between placed units has a length; an unplaced end has none', () => {
    const layout = resolveLayout(p, p.setups[0]!);
    const modelOf = (unitId: string) =>
      p.library.gearModels.find((m) => m.id === p.inventory.gearUnits.find((u) => u.id === unitId)?.modelId);
    const c = p.setups[0]!.connections[0]!;
    expect(requiredLength(c, layout.units, modelOf, defaultSettings().cables)).toBeGreaterThan(300);
    expect(
      requiredLength(
        { ...c, a: { unitId: 'nope', connectorId: 'x' } },
        layout.units,
        modelOf,
        defaultSettings().cables,
      ),
    ).toBeNull();
  });
});
