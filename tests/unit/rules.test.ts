// Every rule with a failing and a passing fixture (spec §10).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSetup } from '@/domain/defaults';
import { loadProject } from '@/domain/serialize';
import { instantiateGearTemplate } from '@/domain/templates';
import { Template as TemplateSchema } from '@/domain/schemas';
import type { Connection, Placement, Project, Setup } from '@/domain/types';
import { buildContext, rules, runRules } from '@/engine/rules';

const base = (() => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
})();

type End = [unit: string, connector: string];
let n = 0;
const wire = (a: End, b: End, extra: Partial<Connection> = {}): Connection => ({
  id: `c${++n}`,
  a: { unitId: `unit-${a[0]}`, connectorId: a[1] },
  b: { unitId: `unit-${b[0]}`, connectorId: b[1] },
  cable: { adapters: [], autoLength: true },
  enabled: true,
  ...extra,
});
const onDesk = (unit: string, x: number, y = 0): Placement => ({
  unitId: `unit-${unit}`,
  mount: { type: 'surface', standUnitId: 'stand-unit-desk', surfaceId: 'top', x, y },
  rotationDeg: 0,
  locked: false,
  zIndex: 0,
});

/** Fresh setup with the desk, Jaspers and rack; `build` adds what the fixture needs. */
function fixture(build: (s: Setup, p: Project) => void): { p: Project; s: Setup } {
  const p = structuredClone(base);
  const s = createSetup('Fixture', 'body-default', '2026-01-01T00:00:00.000Z');
  s.stands = [
    { standUnitId: 'stand-unit-desk', pos: { x: 0, y: 500 }, rotationDeg: 0, surfaceStates: {} },
    { standUnitId: 'stand-unit-jaspers', pos: { x: 2000, y: 500 }, rotationDeg: 0, surfaceStates: {} },
  ];
  p.setups = [s];
  p.activeSetupId = s.id;
  build(s, p);
  return { p, s };
}
const run = (f: { p: Project; s: Setup }, id: string) => runRules(buildContext(f.p, f.s), { only: [id] }).issues;
const model = (p: Project, id: string) => p.library.gearModels.find((m) => m.id === id)!;

function addHubs(p: Project, count: number): string[] {
  const tpl = TemplateSchema.parse(
    JSON.parse(readFileSync(new URL('../../seed/templates/tpl-usb-hub.json', import.meta.url), 'utf8')),
  );
  const m = instantiateGearTemplate(tpl, { ports: 2 }, 'gear-test-hub');
  p.library.gearModels.push(m);
  return Array.from({ length: count }, (_, i) => {
    p.inventory.gearUnits.push({ id: `unit-hub${i + 1}`, modelId: m.id, nickname: `Hub ${i + 1}` });
    return `hub${i + 1}`;
  });
}

type Case = {
  fail: (s: Setup, p: Project) => void;
  pass: (s: Setup, p: Project) => void;
  severity?: 'error' | 'warning' | 'info';
};

const CASES: Record<string, Case> = {
  'PHYS-001': {
    fail: (s) => s.connections.push(wire(['psu-nightsky', 'dc-out'], ['dt2', 'dc-in'])),
    pass: (s) => s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in'])),
  },
  'PHYS-002': {
    fail: (s) => s.connections.push(wire(['ep40', 'midi-out'], ['dt2', 'midi-in'])),
    pass: (s) => s.connections.push(wire(['ot', 'midi-out'], ['dt2', 'midi-in'])),
  },
  'PHYS-003': {
    fail: (s) => {
      s.placements.push(onDesk('dt2', 100, 0), onDesk('ssl12', 100, 190));
      s.connections.push(wire(['dt2', 'out-main-l'], ['ssl12', 'in-1']));
    },
    pass: (s) => {
      s.placements.push(onDesk('dt2', 100, 0), onDesk('ssl12', 100, 400));
      s.connections.push(wire(['dt2', 'out-main-l'], ['ssl12', 'in-1']));
    },
  },
  'DIR-001': {
    fail: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['ot', 'out-main-l'])),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'])),
  },
  'DIR-002': {
    fail: (s) =>
      s.connections.push(
        wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line']),
        wire(['ot', 'out-main-l'], ['wz3', 'ch1-line']),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line']),
        wire(['ot', 'out-main-l'], ['wz3', 'ch2-line']),
      ),
  },
  'DIR-003': {
    fail: (s) =>
      s.connections.push(
        wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line']),
        wire(['dt2', 'out-main-l'], ['wz3', 'ch2-line']),
      ),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'])),
  },
  'DIR-004': {
    fail: (s) =>
      s.connections.push(wire(['ot', 'midi-out'], ['dt2', 'midi-in']), wire(['ot', 'midi-out'], ['a4', 'midi-in'])),
    pass: (s) =>
      s.connections.push(wire(['ot', 'midi-out'], ['dt2', 'midi-in']), wire(['dt2', 'midi-thru'], ['a4', 'midi-in'])),
  },
  'SIG-001': {
    fail: (s) => s.connections.push(wire(['wz3', 'aux-1'], ['nightsky', 'in-l'])),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'])),
  },
  'SIG-002': {
    fail: (s) => s.connections.push(wire(['ssl12', 'out-1'], ['neutron', 'patch-in-1'])),
    pass: (s) => s.connections.push(wire(['ssl12', 'out-1'], ['wz3', 'ch1-line'])),
  },
  'SIG-003': {
    fail: (s) => s.connections.push(wire(['pro800', 'out'], ['wz3', 'ch1-line'])),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'])),
  },
  'SIG-004': {
    fail: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['neutron', 'in-ext'])),
    pass: (s) =>
      s.connections.push(
        wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'], { bundleId: 'b' }),
        wire(['dt2', 'out-main-r'], ['wz3', 'ch2-line'], { bundleId: 'b' }),
      ),
  },
  'SIG-005': {
    fail: (s) => s.connections.push(wire(['dt2', 'phones'], ['wz3', 'ch1-line'])),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'])),
  },
  'SIG-006': {
    fail: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['heat', 'in-r'])),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['heat', 'in-l'])),
  },
  'SIG-007': {
    fail: (s, p) => {
      model(p, 'gear-allen-heath-mixwizard-wz3-16-2').connectors.find((c) => c.id === 'ch1-line')!.signal!.maxDbu = 10;
      s.connections.push(wire(['pro800', 'out-audio'], ['wz3', 'ch1-line']));
    },
    pass: (s) => s.connections.push(wire(['pro800', 'out-audio'], ['wz3', 'ch1-line'])),
  },
  'SIG-008': {
    fail: (s) => s.connections.push(wire(['rd8', 'out-voice-1'], ['ada', 'in-1'])),
    pass: (s) => s.connections.push(wire(['dt2', 'out-main-l'], ['ada', 'in-1'])),
  },
  'MIDI-001': {
    fail: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in']),
        wire(['dt2', 'midi-thru'], ['a4', 'midi-in']),
        wire(['a4', 'midi-thru'], ['heat', 'midi-in']),
        wire(['heat', 'midi-thru'], ['rd8', 'midi-in']),
        wire(['rd8', 'midi-thru'], ['mbrute', 'midi-in']),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in']),
        wire(['dt2', 'midi-thru'], ['a4', 'midi-in']),
        wire(['a4', 'midi-thru'], ['heat', 'midi-in']),
        wire(['heat', 'midi-thru'], ['rd8', 'midi-in']),
      ),
  },
  'MIDI-002': {
    fail: (s) =>
      s.connections.push(
        wire(['pyramid', 'midi-out-a'], ['mioxl', 'din-in-1'], { midi: { channels: 'omni', purposes: ['notes'] } }),
        wire(['mioxl', 'din-out-1'], ['dt2', 'midi-in'], { midi: { channels: [3], purposes: ['notes'] } }),
        wire(['mioxl', 'din-out-2'], ['a4', 'midi-in'], { midi: { channels: [3], purposes: ['notes'] } }),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['pyramid', 'midi-out-a'], ['mioxl', 'din-in-1'], { midi: { channels: 'omni', purposes: ['notes'] } }),
        wire(['mioxl', 'din-out-1'], ['dt2', 'midi-in'], { midi: { channels: [3], purposes: ['notes'] } }),
        wire(['mioxl', 'din-out-2'], ['a4', 'midi-in'], { midi: { channels: [4], purposes: ['notes'] } }),
      ),
  },
  'MIDI-003': {
    fail: (s) => s.connections.push(wire(['dt2', 'midi-thru'], ['a4', 'midi-in'])),
    pass: (s) =>
      s.connections.push(wire(['ot', 'midi-out'], ['dt2', 'midi-in']), wire(['dt2', 'midi-thru'], ['a4', 'midi-in'])),
  },
  'MIDI-004': {
    fail: (s) =>
      s.connections.push(
        wire(['ep40', 'midi-out'], ['dt2', 'midi-in'], {
          cable: { modelId: 'cable-midi-din', adapters: ['adapter-trs-b-din'], autoLength: true },
        }),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['ep40', 'midi-out'], ['dt2', 'midi-in'], {
          cable: { modelId: 'cable-midi-din', adapters: ['adapter-trs-a-din'], autoLength: true },
        }),
      ),
  },
  'MIDI-005': {
    fail: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in'], {
          cable: { modelId: 'cable-midi-din', lengthMm: 16000, adapters: [], autoLength: false },
        }),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in'], {
          cable: { modelId: 'cable-midi-din', lengthMm: 3000, adapters: [], autoLength: false },
        }),
      ),
  },
  'MIDI-006': {
    fail: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in'], { midi: { channels: [17], purposes: ['notes'] } }),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in'], { midi: { channels: [16], purposes: ['notes'] } }),
      ),
  },
  'MIDI-007': {
    fail: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in'], {
          midi: {
            channels: 'per-track',
            purposes: ['notes'],
            trackMap: [
              { fromTrack: 't1', toChannel: 1 },
              { fromTrack: 't2', toChannel: 1 },
            ],
          },
        }),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['ot', 'midi-out'], ['dt2', 'midi-in'], {
          midi: {
            channels: 'per-track',
            purposes: ['notes'],
            trackMap: [
              { fromTrack: 't1', toChannel: 1 },
              { fromTrack: 't2', toChannel: 2 },
            ],
          },
        }),
      ),
  },
  'USB-001': {
    fail: (s) => s.connections.push(wire(['dt2', 'usb'], ['ssl12', 'usb'])),
    pass: (s) => s.connections.push(wire(['ipad', 'usb-c'], ['ssl12', 'usb'])),
  },
  'USB-002': {
    severity: 'error',
    fail: (s, p) => {
      model(p, 'gear-apple-ipad-pro-m4-11').connectors.find((c) => c.id === 'usb-c')!.usb!.suppliesBusPowerMa = 100;
      model(p, 'gear-ssl-12').connectors.find((c) => c.id === 'usb')!.usb!.drawsBusPowerMa = 500;
      s.connections.push(wire(['ipad', 'usb-c'], ['ssl12', 'usb']));
    },
    pass: (s, p) => {
      model(p, 'gear-apple-ipad-pro-m4-11').connectors.find((c) => c.id === 'usb-c')!.usb!.suppliesBusPowerMa = 1500;
      model(p, 'gear-ssl-12').connectors.find((c) => c.id === 'usb')!.usb!.drawsBusPowerMa = 500;
      s.connections.push(wire(['ipad', 'usb-c'], ['ssl12', 'usb']));
    },
  },
  'USB-003': {
    fail: (s, p) => {
      const hubs = addHubs(p, 6);
      s.connections.push(wire(['ipad', 'usb-c'], [hubs[0]!, 'upstream']));
      for (let i = 0; i + 1 < hubs.length; i++)
        s.connections.push(wire([hubs[i]!, 'port-1'], [hubs[i + 1]!, 'upstream']));
      s.connections.push(wire([hubs[5]!, 'port-1'], ['ssl12', 'usb']));
    },
    pass: (s, p) => {
      const hubs = addHubs(p, 2);
      s.connections.push(
        wire(['ipad', 'usb-c'], [hubs[0]!, 'upstream']),
        wire([hubs[0]!, 'port-1'], [hubs[1]!, 'upstream']),
        wire([hubs[1]!, 'port-1'], ['ssl12', 'usb']),
      );
    },
  },
  'USB-004': {
    fail: (s) =>
      s.connections.push(wire(['ipad', 'usb-c'], ['ssl12', 'usb']), wire(['ipad', 'usb-c'], ['sidekick', 'usb'])),
    pass: (s) => s.connections.push(wire(['ipad', 'usb-c'], ['ssl12', 'usb'])),
  },
  'USB-005': {
    fail: (s, p) => {
      const [hub] = addHubs(p, 1);
      s.connections.push(wire(['ipad', 'usb-c'], [hub!, 'upstream']), wire([hub!, 'port-1'], ['ssl12', 'usb']));
    },
    pass: (s, p) => {
      const [hub] = addHubs(p, 1);
      s.connections.push(
        wire(['ipad', 'usb-c'], [hub!, 'upstream']),
        wire([hub!, 'port-1'], ['ssl12', 'usb']),
        wire(['psu-dt2', 'dc-out'], [hub!, 'dc-in']),
      );
    },
  },
  'USB-006': {
    fail: (s) =>
      s.connections.push(
        wire(['mioxl', 'usb-host-1'], ['2xm', 'usb'], {
          cable: { modelId: 'cable-usb-a-b', lengthMm: 6000, adapters: [], autoLength: false },
        }),
      ),
    pass: (s) =>
      s.connections.push(
        wire(['mioxl', 'usb-host-1'], ['2xm', 'usb'], {
          cable: { modelId: 'cable-usb-a-b', lengthMm: 3000, adapters: [], autoLength: false },
        }),
      ),
  },
  'PWR-001': {
    fail: (s) => s.connections.push(wire(['psu-nightsky', 'dc-out'], ['dt2', 'dc-in'])),
    pass: (s) => s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in'])),
  },
  'PWR-002': {
    fail: (s) => s.connections.push(wire(['psu-nightsky', 'dc-out'], ['dt2', 'dc-in'])),
    pass: (s) => s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in'])),
  },
  'PWR-003': {
    fail: (s) => s.connections.push(wire(['psu-nightsky', 'dc-out'], ['dt2', 'dc-in'])),
    pass: (s) => s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in'])),
  },
  'PWR-004': {
    severity: 'error',
    fail: (s) => s.connections.push(wire(['psu-h90', 'dc-out'], ['a4', 'dc-in'])), // 1000 mA vs 1250 mA
    pass: (s) => s.connections.push(wire(['psu-a4', 'dc-out'], ['a4', 'dc-in'])),
  },
  'PWR-005': {
    fail: (s, p) => {
      model(p, 'gear-behringer-composer-mdx2100').power.mainsRegion = '115-only';
      s.placements.push({
        unitId: 'unit-mdx',
        mount: { type: 'floor', pos: { x: 0, y: 0 } },
        rotationDeg: 0,
        locked: false,
        zIndex: 0,
      });
    },
    pass: (s, p) => {
      model(p, 'gear-behringer-composer-mdx2100').power.mainsRegion = '115-only';
      s.placements.push({
        unitId: 'unit-mdx',
        mount: { type: 'floor', pos: { x: 0, y: 0 } },
        rotationDeg: 0,
        locked: false,
        zIndex: 0,
      });
      s.unitConfigs['unit-mdx'] = { activeAlternates: {}, powerAssignments: [], usage: 'rare', mainsVoltage: 115 };
    },
  },
  'PWR-006': {
    fail: (s, p) => {
      model(p, 'gear-generic-power-strip-8').power.distribution!.totalCurrentMaMax = 100; // 23 W at 230 V
      s.connections.push(wire(['strip-desk', 'outlet-1'], ['wz3', 'ac-in']));
    },
    pass: (s) => s.connections.push(wire(['strip-desk', 'outlet-1'], ['wz3', 'ac-in'])),
  },
  'PWR-007': {
    fail: (s) => s.placements.push(onDesk('dt2', 0)),
    pass: (s) => {
      s.placements.push(onDesk('dt2', 0));
      s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in']));
    },
  },
  'PWR-008': {
    fail: (s) =>
      s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in']), wire(['psu-dt2', 'dc-out'], ['a4', 'dc-in'])),
    pass: (s) =>
      s.connections.push(wire(['psu-dt2', 'dc-out'], ['dt2', 'dc-in']), wire(['psu-dt2', 'dc-out'], ['ot', 'dc-in'])),
  },
  'PWR-009': {
    fail: (s) => s.connections.push(wire(['psu-h90', 'dc-out'], ['keystep', 'dc-in'])),
    pass: (s) => s.connections.push(wire(['mioxl', 'usb-host-1'], ['keystep', 'usb'])),
  },
  'PLC-001': {
    fail: (s) => s.placements.push(onDesk('dt2', 0), onDesk('heat', 100)),
    pass: (s) => s.placements.push(onDesk('dt2', 0), onDesk('heat', 300)),
  },
  'PLC-002': {
    fail: (s) => s.placements.push(onDesk('dt2', 1500)),
    pass: (s) => s.placements.push(onDesk('dt2', 100)),
  },
  'PLC-003': {
    fail: (s) =>
      s.placements.push({
        ...onDesk('mbrute', 0),
        mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 0, y: 0 },
      }),
    pass: (s) =>
      s.placements.push({
        ...onDesk('mbrute', 0),
        mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-bottom', x: 0, y: 0 },
      }),
  },
  'PLC-004': {
    fail: (s) =>
      s.placements.push({
        ...onDesk('wave2', 0),
        mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 0, y: 250 },
      }),
    pass: (s) =>
      s.placements.push({
        ...onDesk('wave2', 0),
        mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 0, y: 0 },
      }),
  },
  'PLC-005': {
    fail: (s) => {
      // Stand centred in front of the player, as in the sample (occlusion depends on the eye position).
      s.stands[1]!.pos = { x: -775, y: 350 };
      s.stands[1]!.surfaceStates = { 'tier-middle': { z: 920 }, 'tier-top': { z: 1125 } };
      s.placements.push(
        {
          ...onDesk('ot', 0),
          mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-middle', x: 120, y: 20 },
        },
        {
          ...onDesk('dt2', 0),
          mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 200, y: 20 },
        },
      );
    },
    pass: (s) => {
      s.stands[1]!.pos = { x: -775, y: 350 };
      s.stands[1]!.surfaceStates = { 'tier-middle': { z: 920 }, 'tier-top': { z: 1125, y: 300 } };
      s.placements.push(
        {
          ...onDesk('ot', 0),
          mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-middle', x: 120, y: 20 },
        },
        {
          ...onDesk('dt2', 0),
          mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 200, y: 20 },
        },
      );
    },
  },
  'PLC-006': {
    fail: (s) => {
      s.stands.push({ standUnitId: 'stand-unit-rack', pos: { x: -1000, y: 500 }, rotationDeg: 0, surfaceStates: {} });
      s.placements.push({
        unitId: 'unit-dbx',
        mount: { type: 'rack', standUnitId: 'stand-unit-rack', surfaceId: 'bay', uStart: 13 },
        rotationDeg: 0,
        locked: false,
        zIndex: 0,
      });
    },
    pass: (s) => {
      s.stands.push({ standUnitId: 'stand-unit-rack', pos: { x: -1000, y: 500 }, rotationDeg: 0, surfaceStates: {} });
      s.placements.push({
        unitId: 'unit-dbx',
        mount: { type: 'rack', standUnitId: 'stand-unit-rack', surfaceId: 'bay', uStart: 1 },
        rotationDeg: 0,
        locked: false,
        zIndex: 0,
      });
    },
  },
  'PLC-007': {
    fail: (s) =>
      s.placements.push(onDesk('mbrute', 0), {
        unitId: 'unit-dt2',
        mount: { type: 'stacked', parentUnitId: 'unit-mbrute', x: 10, y: 10 },
        rotationDeg: 0,
        locked: false,
        zIndex: 1,
      }),
    pass: (s) => s.placements.push(onDesk('mbrute', 0), onDesk('dt2', 900)),
  },
  'PLC-008': {
    fail: (s) => {
      s.placements.push(onDesk('dt2', 0), { ...onDesk('wz3', 0), mount: { type: 'floor', pos: { x: 6000, y: 4000 } } });
      s.connections.push(
        wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'], {
          cable: { modelId: 'cable-trs-6.35', adapters: [], autoLength: true },
        }),
      );
    },
    pass: (s) => {
      s.placements.push(onDesk('dt2', 0), onDesk('wz3', 600));
      s.connections.push(
        wire(['dt2', 'out-main-l'], ['wz3', 'ch1-line'], {
          cable: { modelId: 'cable-trs-6.35', adapters: [], autoLength: true },
        }),
      );
    },
  },
  'PLC-009': {
    fail: (s) => {
      s.stands[1]!.surfaceStates = { 'tier-top': { z: 1125, tiltDeg: 20 } };
      s.placements.push({
        ...onDesk('heat', 0),
        mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 0, y: 0 },
      });
    },
    pass: (s) => {
      s.stands[1]!.surfaceStates = { 'tier-top': { z: 1125, tiltDeg: 20 } };
      s.placements.push({
        ...onDesk('dt2', 0),
        mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 0, y: 0 },
      }); // VESA
    },
  },
  'DATA-001': {
    fail: (s) => s.placements.push(onDesk('keystep', 0)),
    pass: (s) => s.placements.push(onDesk('dt2', 0)),
  },
  'DATA-002': {
    fail: (s) => s.placements.push(onDesk('ep40', 0)),
    pass: (s, p) => {
      const m = model(p, 'gear-elektron-digitone-ii');
      m.provenance = { 'dimensions.w': { kind: 'measured' } };
      m.connectors.forEach((c, i) => {
        c.pos = { x: 10 + i, y: 10 };
        m.provenance[`connectors.${i}.pos`] = { kind: 'measured' };
      });
      s.placements.push(onDesk('dt2', 0));
    },
  },
};

describe('rule fixtures', () => {
  it('every registered rule has a fixture', () => {
    expect(Object.keys(CASES).sort()).toEqual(rules.map((r) => r.id).sort());
  });

  for (const [id, c] of Object.entries(CASES)) {
    it(`${id} fires on the failing fixture and not on the passing one`, () => {
      const fail = run(fixture(c.fail), id);
      expect(fail.length, `${id} should fire`).toBeGreaterThan(0);
      if (c.severity) expect(fail.map((i) => i.severity)).toContain(c.severity);
      for (const i of fail) expect(i.message.length).toBeGreaterThan(10);
      expect(run(fixture(c.pass), id), `${id} should not fire`).toEqual([]);
    });
  }
});

describe('runner', () => {
  it('suppressions move matching issues aside with their reason', () => {
    const f = fixture((s) => s.connections.push(wire(['dt2', 'out-main-l'], ['ot', 'out-main-l'])));
    const issue = run(f, 'DIR-001')[0]!;
    f.s.suppressedIssues.push({ ruleId: 'DIR-001', entityIds: issue.entityIds, reason: 'Testing a weird patch' });
    const r = runRules(buildContext(f.p, f.s), { only: ['DIR-001'] });
    expect(r.issues).toEqual([]);
    expect(r.suppressed[0]).toMatchObject({ ruleId: 'DIR-001', reason: 'Testing a weird patch' });
  });

  it('incremental runs reuse results of rules that do not depend on the change', () => {
    const f = fixture((s) => s.connections.push(wire(['dt2', 'out-main-l'], ['ot', 'out-main-l'])));
    const full = runRules(buildContext(f.p, f.s));
    const inc = runRules(buildContext(f.p, f.s), { changed: new Set(['placements']), previous: full.issues });
    expect(inc.issues).toEqual(full.issues);
    expect(Object.keys(inc.timings)).not.toContain('DIR-001');
  });

  it('scenario 4 (spec §11)', () => {
    const f = fixture((s, p) => {
      s.connections.push(wire(['dt2', 'out-main-l'], ['ot', 'out-main-l'])); // output → output
      s.connections.push(wire(['psu-nightsky', 'dc-out'], ['dt2', 'dc-in'])); // 9 V centre-negative into an Elektron
      model(p, 'gear-behringer-composer-mdx2100').power.mainsRegion = '115-only';
      s.placements.push({
        unitId: 'unit-mdx',
        mount: { type: 'floor', pos: { x: 0, y: 0 } },
        rotationDeg: 0,
        locked: false,
        zIndex: 0,
      });
      s.connections.push(wire(['ipad', 'usb-c'], ['ssl12', 'usb']), wire(['ipad', 'usb-c'], ['sidekick', 'usb']));
    });
    const r = runRules(buildContext(f.p, f.s));
    const has = (id: string, sev: string) => r.issues.some((i) => i.ruleId === id && i.severity === sev);
    expect(has('DIR-001', 'error')).toBe(true);
    expect(has('PWR-001', 'error')).toBe(true);
    expect(has('PWR-002', 'error')).toBe(true);
    expect(has('PWR-005', 'error')).toBe(true);
    expect(has('USB-004', 'info')).toBe(true);
  });

  it('a full pass on a 200-unit / 1000-connection studio stays within budget', () => {
    const p = structuredClone(base);
    const s = structuredClone(p.setups[0]!);
    // Multiply the sample: 5 copies of every unit and connection.
    const units = [...p.inventory.gearUnits];
    for (let k = 1; k < 5; k++) for (const u of units) p.inventory.gearUnits.push({ ...u, id: `${u.id}-x${k}` });
    const conns = [...s.connections];
    for (let k = 1; k < 11; k++)
      for (const c of conns)
        s.connections.push({
          ...c,
          id: `${c.id}-x${k}`,
          a: { ...c.a, unitId: `${c.a.unitId}-x${k % 5 || 1}` },
          b: { ...c.b, unitId: `${c.b.unitId}-x${k % 5 || 1}` },
        });
    expect(p.inventory.gearUnits.length).toBeGreaterThanOrEqual(200);
    expect(s.connections.length).toBeGreaterThanOrEqual(900);
    const t0 = performance.now();
    runRules(buildContext(p, s));
    const ms = performance.now() - t0;
    // Spec budget: 150 ms on a mid-range laptop; CI machines vary, so allow headroom here.
    expect(ms).toBeLessThan(1500);
  });
});
