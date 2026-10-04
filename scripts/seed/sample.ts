// seed/studio.sample.json (spec §8.1): every device from the gear reference as an owned unit, the stands,
// a "Current" demo arrangement and a "Planned (standing)" setup with the spec's tier assignment.
import { defaultSettings, defaultUnitConfig } from '../../src/domain/defaults.ts';
import type {
  Connection,
  GearModel,
  GearUnit,
  Placement,
  Project,
  Setup,
  StandModel,
  StandState,
  StandUnit,
  UnitConfig,
} from '../../src/domain/types.ts';

const T = '2026-10-04T00:00:00.000Z';

/** Short unit key → model id. Order is the gear reference numbering. */
const UNITS: [string, string, string?][] = [
  ['heat', 'gear-elektron-analog-heat-mkii'],
  ['a4', 'gear-elektron-analog-four-mkii'],
  ['dt2', 'gear-elektron-digitone-ii'],
  ['ot', 'gear-elektron-octatrack-mkii'],
  ['neutron', 'gear-behringer-neutron'],
  ['pro800', 'gear-behringer-pro-800'],
  ['2xm', 'gear-behringer-2-xm'],
  ['wave2', 'gear-clavia-nord-wave-2'],
  ['mbrute', 'gear-arturia-matrixbrute'],
  ['rd8', 'gear-behringer-rd-8-mkii'],
  ['drum3p', 'gear-clavia-nord-drum-3p'],
  ['ep40', 'gear-te-ep-40-riddim'],
  ['nightsky', 'gear-strymon-nightsky'],
  ['h90', 'gear-eventide-h90'],
  ['dbx', 'gear-dbx-166xl'],
  ['mdx', 'gear-behringer-composer-mdx2100'],
  ['sx2', 'gear-spl-vitalizer-sx2'],
  ['ultrafex', 'gear-behringer-ultrafex-ii-ex3100'],
  ['ssl12', 'gear-ssl-12'],
  ['sidekick', 'gear-te-ep-136-ko-sidekick'],
  ['wz3', 'gear-allen-heath-mixwizard-wz3-16-2'],
  ['keymix', 'gear-spl-grapevine-keymix-6'],
  ['ada', 'gear-behringer-ada8200'],
  ['px3000', 'gear-behringer-ultrapatch-pro-px3000'],
  ['keystep', 'gear-arturia-keystep'],
  ['pyramid', 'gear-squarp-pyramid-mk3'],
  ['mioxl', 'gear-iconnectivity-mioxl'],
  ['nifty', 'gear-cre8audio-niftycase'],
  ['ipad', 'gear-apple-ipad-pro-m4-11', 'Size (11" or 13") not confirmed; swap the model if needed.'],
  // Included supplies
  ['psu-heat', 'gear-elektron-psu-3c'],
  ['psu-a4', 'gear-elektron-psu-3c'],
  ['psu-dt2', 'gear-elektron-psu-3c'],
  ['psu-ot', 'gear-elektron-psu-3c'],
  ['psu-h90', 'gear-eventide-h90-psu'],
  ['psu-nightsky', 'gear-strymon-nightsky-psu'],
  ['psu-rd8', 'gear-behringer-rd-8-psu'],
  ['psu-pro800', 'gear-behringer-pro-800-psu'],
  ['psu-neutron', 'gear-behringer-neutron-psu'],
  ['psu-2xm', 'gear-behringer-2-xm-psu'],
  ['psu-drum3p', 'gear-clavia-nord-drum-3p-psu'],
  ['psu-mioxl', 'gear-iconnectivity-mioxl-psu'],
  ['psu-nifty', 'gear-cre8audio-niftycase-psu'],
  // Placeholder mains distribution (not in the gear reference).
  ['strip-desk', 'gear-generic-power-strip-8', 'Placeholder: desk-side strip.'],
  ['strip-stand', 'gear-generic-power-strip-8', 'Placeholder: strip behind the Jaspers stand.'],
  ['pdu', 'gear-generic-rack-pdu-8', 'Placeholder: rack power distributor.'],
];
const PSU_FOR: Record<string, string> = {
  heat: 'psu-heat', a4: 'psu-a4', dt2: 'psu-dt2', ot: 'psu-ot', h90: 'psu-h90', nightsky: 'psu-nightsky', rd8: 'psu-rd8',
  pro800: 'psu-pro800', neutron: 'psu-neutron', '2xm': 'psu-2xm', drum3p: 'psu-drum3p', mioxl: 'psu-mioxl', nifty: 'psu-nifty',
}; // prettier-ignore

const u = (key: string) => `unit-${key}`;

/** Which unit plugs into which outlet (in order). */
const MAINS: [string, string[]][] = [
  ['pdu', ['dbx', 'mdx', 'ultrafex', 'keymix', 'ada', 'sx2', 'psu-mioxl']],
  ['strip-desk', ['wz3', 'mbrute', 'psu-nightsky', 'psu-h90', 'psu-drum3p', 'psu-2xm', 'psu-neutron', 'psu-pro800']],
  ['strip-stand', ['psu-heat', 'psu-a4', 'psu-dt2', 'psu-ot', 'psu-rd8', 'psu-nifty']],
];
const S = { jaspers: 'stand-unit-jaspers', rack: 'stand-unit-rack', desk: 'stand-unit-desk', euro: 'stand-unit-eurorack' };

// ---------- connections ----------

type Spec = [string, string, string, string, Partial<Connection>?];
const audio = (cable: string, extra: Partial<Connection> = {}): Partial<Connection> => ({ cable: { modelId: cable, adapters: [], autoLength: true }, ...extra });
const midi = (channels: NonNullable<Connection['midi']>['channels'], purposes: NonNullable<Connection['midi']>['purposes']): Partial<Connection> =>
  ({ cable: { modelId: 'cable-midi-din', adapters: [], autoLength: true }, midi: { channels, purposes } }); // prettier-ignore
const stereo = (a: string, aPrefix: string, b: string, bL: string, bR: string, cable: string, bundle: string): Spec[] => [
  [a, `${aPrefix}-l`, b, bL, audio(cable, { bundleId: bundle })],
  [a, `${aPrefix}-r`, b, bR, audio(cable, { bundleId: bundle })],
];

const WIRING: Spec[] = [
  // Audio: Digitone II through the Analog Heat into the MixWizard (the spec's trace example).
  ...stereo('dt2', 'out-main', 'heat', 'in-l', 'in-r', 'cable-trs-6.35', 'dt2-heat'),
  ...stereo('heat', 'out-main', 'wz3', 'ch5-line', 'ch6-line', 'cable-trs-6.35', 'heat-wz3'),
  ...stereo('ot', 'out-main', 'wz3', 'ch1-line', 'ch2-line', 'cable-trs-6.35', 'ot-wz3'),
  ...stereo('a4', 'out-main', 'wz3', 'ch3-line', 'ch4-line', 'cable-trs-6.35', 'a4-wz3'),
  ['rd8', 'out-main', 'wz3', 'ch7-line', audio('cable-trs-6.35')],
  ['neutron', 'out', 'wz3', 'ch8-line', audio('cable-ts-6.35')],
  ['pro800', 'out', 'wz3', 'ch9-line', audio('cable-ts-6.35')],
  ...stereo('2xm', 'out-main', 'wz3', 'ch10-line', 'ch11-line', 'cable-ts-6.35', '2xm-wz3'),
  ...stereo('wave2', 'out', 'wz3', 'ch12-line', 'ch13-line', 'cable-ts-6.35', 'wave2-wz3'),
  ...stereo('mbrute', 'out', 'wz3', 'ch14-line', 'ch15-line', 'cable-ts-6.35', 'mbrute-wz3'),
  ['nifty', 'out-master', 'wz3', 'ch16-line', audio('cable-ts-6.35')],
  // Small sources into the KeyMix 6, which returns into the MixWizard.
  ...stereo('drum3p', 'out', 'keymix', 'ch4-l', 'ch4-r', 'cable-ts-6.35', 'drum3p-keymix'),
  ['ep40', 'out-line', 'sidekick', 'in-1', audio('cable-trs-3.5')],
  ['sidekick', 'out-main', 'keymix', 'ch5-l', audio('cable-trs-3.5-2ts', { bundleId: 'sidekick-keymix', mapping: [{ fromChannel: 'L', toChannel: 'L' }] })],
  ['sidekick', 'out-main', 'keymix', 'ch5-r', audio('cable-trs-3.5-2ts', { bundleId: 'sidekick-keymix', mapping: [{ fromChannel: 'R', toChannel: 'R' }] })],
  ...stereo('keymix', 'out-master', 'wz3', 'ret1-l', 'ret1-r', 'cable-trs-6.35', 'keymix-wz3'),
  // dbx 166XL on the MixWizard main inserts (Y-insert: tip = send, ring = return on the A&H side).
  ['wz3', 'insert-main-l', 'dbx', 'in-1-trs', audio('cable-y-insert', { bundleId: 'main-insert-l', label: 'Insert send L' })],
  ['dbx', 'out-1-trs', 'wz3', 'insert-main-l', audio('cable-y-insert', { bundleId: 'main-insert-l', label: 'Insert return L' })],
  ['wz3', 'insert-main-r', 'dbx', 'in-2-trs', audio('cable-y-insert', { bundleId: 'main-insert-r', label: 'Insert send R' })],
  ['dbx', 'out-2-trs', 'wz3', 'insert-main-r', audio('cable-y-insert', { bundleId: 'main-insert-r', label: 'Insert return R' })],
  // Reverb on aux 1, returned on stereo return 2.
  ['wz3', 'aux-1', 'nightsky', 'in-l', audio('cable-ts-6.35')],
  ...stereo('nightsky', 'out', 'wz3', 'ret2-l', 'ret2-r', 'cable-ts-6.35', 'nightsky-wz3'),
  ['wz3', 'aux-2', 'h90', 'in-1', audio('cable-ts-6.35')],
  // Mix bus into the interface.
  ['wz3', 'out-main-l', 'ssl12', 'in-1', audio('cable-xlr', { bundleId: 'wz3-ssl12' })],
  ['wz3', 'out-main-r', 'ssl12', 'in-2', audio('cable-xlr', { bundleId: 'wz3-ssl12' })],
  // RD-8 individual outs → ADA8200 → ADAT into the SSL 12 (reference §5.2).
  ...Array.from({ length: 8 }, (_, k): Spec => ['rd8', `out-voice-${k + 1}`, 'ada', `in-${k + 1}`, audio('cable-ts-6.35', { bundleId: 'rd8-ada' })]),
  ['ada', 'adat-out', 'ssl12', 'adat-in', audio('cable-toslink')],
  // MIDI: Pyramid is the clock master; the mioXL distributes (it has no Thru, fan-out by routing).
  ['keystep', 'midi-out', 'pyramid', 'midi-in', midi([1], ['notes', 'cc'])],
  ['pyramid', 'midi-out-a', 'mioxl', 'din-in-1', midi('omni', ['notes', 'cc', 'clock', 'transport'])],
  ['mioxl', 'din-out-1', 'dt2', 'midi-in', midi('per-track', ['notes', 'cc', 'clock', 'transport'])],
  ['mioxl', 'din-out-2', 'a4', 'midi-in', midi('per-track', ['notes', 'cc', 'clock', 'transport'])],
  ['mioxl', 'din-out-3', 'ot', 'midi-in', midi('per-track', ['notes', 'cc', 'clock', 'transport'])],
  ['mioxl', 'din-out-4', 'heat', 'midi-in', midi([9], ['cc', 'clock', 'transport'])],
  ['mioxl', 'din-out-5', 'rd8', 'midi-in', midi([10], ['notes', 'clock', 'transport'])],
  ['mioxl', 'din-out-6', 'wave2', 'midi-in', midi([5], ['notes', 'cc', 'clock'])],
  ['mioxl', 'din-out-7', 'mbrute', 'midi-in', midi([6], ['notes', 'cc', 'clock', 'transport'])],
  ['mioxl', 'din-out-8', 'nightsky', 'midi-in', midi([12], ['cc', 'pc', 'clock'])],
  ['mioxl', 'din-out-9', 'h90', 'midi-in', midi([13], ['pc', 'cc', 'clock'])],
  ['mioxl', 'din-out-10', 'drum3p', 'midi-in', midi([11], ['notes', 'pc'])],
  ['mioxl', 'din-out-11', 'neutron', 'midi-in', midi([7], ['notes', 'cc', 'clock'])],
  ['mioxl', 'din-out-12', 'pro800', 'midi-in', midi([8], ['notes', 'cc', 'clock'])],
  // Octatrack Thru forwards the clock to the KeyStep, which converts it for the Riddim (PO sync).
  ['ot', 'midi-thru', 'keystep', 'midi-in', midi('omni', ['clock', 'transport'])],
  ['keystep', 'sync-out', 'ep40', 'sync-in', audio('cable-ts-3.5', { label: 'PO sync (KeyStep 2 PPQ)' })],
  // USB: MIDI-only synths on the mioXL host ports; the iPad hosts the SSL 12.
  ['2xm', 'usb', 'mioxl', 'usb-host-1', audio('cable-usb-a-b', { usb: { hostUnitId: u('mioxl') } })],
  ['nifty', 'usb', 'mioxl', 'usb-host-2', audio('cable-usb-a-b', { usb: { hostUnitId: u('mioxl') } })],
  ['ipad', 'usb-c', 'ssl12', 'usb', audio('cable-usb-c-c', { usb: { hostUnitId: u('ipad') } })],
  // Power: every included wall adapter into its unit.
  ...Object.entries(PSU_FOR).map(([unit, psu]): Spec => [psu, 'dc-out', unit, 'dc-in', { cable: { adapters: [], autoLength: false } }]),
  // Mains: IEC devices via IEC cables, wall adapters plugged in directly (placeholder strips and PDU).
  ...MAINS.flatMap(([strip, loads]) =>
    loads.map((load, k): Spec => {
      const isPsu = load.startsWith('psu-');
      return [strip, `outlet-${k + 1}`, load, isPsu ? 'ac' : 'ac-in', isPsu ? { cable: { adapters: [], autoLength: false } } : audio('cable-iec')];
    }),
  ),
];

function connections(prefix: string): Connection[] {
  return WIRING.map(([a, ac, b, bc, extra = {}], i) => ({
    id: `${prefix}-conn-${String(i + 1).padStart(3, '0')}`,
    a: { unitId: u(a), connectorId: ac },
    b: { unitId: u(b), connectorId: bc },
    cable: { adapters: [], autoLength: true },
    enabled: true,
    ...extra,
    ...(extra.bundleId ? { bundleId: `${prefix}-${extra.bundleId}` } : {}),
  }));
}

// ---------- placements ----------

const onSurface = (stand: string, surfaceId: string, x: number, y = 0): Placement['mount'] => ({ type: 'surface', standUnitId: stand, surfaceId, x, y });
const place = (key: string, mount: Placement['mount'], zIndex = 0): Placement => ({ unitId: u(key), mount, rotationDeg: 0, locked: false, zIndex });
const rack = (key: string, uStart: number) => place(key, { type: 'rack', standUnitId: S.rack, surfaceId: 'bay', uStart });

const RACK_AND_STAND: Placement[] = [
  rack('dbx', 1), rack('mdx', 2), rack('ultrafex', 3), rack('keymix', 4), rack('ada', 5), rack('px3000', 6), rack('mioxl', 7), rack('sx2', 8), rack('pdu', 12),
  place('strip-desk', { type: 'floor', pos: { x: -2400, y: 1200 } }),
  place('strip-stand', { type: 'floor', pos: { x: -200, y: 1100 } }),
  place('neutron', onSurface(S.euro, 'row-1', 8)),
  place('pro800', onSurface(S.euro, 'row-2', 8)),
  place('2xm', onSurface(S.euro, 'row-3', 8)),
]; // prettier-ignore

const STANDS = (tiers: Record<string, { z: number; tiltDeg?: number; y?: number }>): StandState[] => [
  { standUnitId: S.jaspers, pos: { x: -775, y: 350 }, rotationDeg: 0, surfaceStates: tiers },
  { standUnitId: S.desk, pos: { x: -2500, y: 350 }, rotationDeg: 0, surfaceStates: {} },
  { standUnitId: S.rack, pos: { x: -3100, y: 350 }, rotationDeg: 0, surfaceStates: {} },
  { standUnitId: S.euro, pos: { x: 900, y: 350 }, rotationDeg: 0, surfaceStates: {} },
];

const CURRENT_PLACEMENTS: Placement[] = [
  place('mbrute', onSurface(S.jaspers, 'tier-bottom', 295, 20)),
  place('ot', onSurface(S.jaspers, 'tier-middle', 150, 20)),
  place('a4', onSurface(S.jaspers, 'tier-middle', 520, 20)),
  place('dt2', onSurface(S.jaspers, 'tier-middle', 935, 20)),
  place('heat', onSurface(S.jaspers, 'tier-top', 150, 20)),
  place('rd8', onSurface(S.jaspers, 'tier-top', 395, 20)),
  place('pyramid', onSurface(S.jaspers, 'tier-top', 900, 20)),
  place('ipad', onSurface(S.jaspers, 'tier-top', 1170, 20)),
  place('wave2', onSurface(S.desk, 'top', 0, 0)),
  place('wz3', onSurface(S.desk, 'top', 1050, 0)),
  place('ssl12', onSurface(S.desk, 'top', 0, 320)),
  place('nightsky', onSurface(S.desk, 'top', 300, 320)),
  place('h90', onSurface(S.desk, 'top', 500, 320)),
  place('keystep', onSurface(S.desk, 'top', 540, 560)),
  place('drum3p', onSurface(S.desk, 'top', 0, 500)),
  place('ep40', onSurface(S.desk, 'top', 320, 560)),
  place('sidekick', { type: 'stacked', parentUnitId: u('ep40'), x: 0, y: 0 }, 1),
  place('nifty', onSurface(S.desk, 'top', 1050, 560)),
  ...RACK_AND_STAND,
];

/** Spec §8.1: middle Octatrack, Analog Four, KeyStep; top Digitone II, iPad, Analog Heat; bottom RD-8 MKII. */
const PLANNED_PLACEMENTS: Placement[] = [
  place('rd8', onSurface(S.jaspers, 'tier-bottom', 476, 20)),
  place('ot', onSurface(S.jaspers, 'tier-middle', 120, 20)),
  place('a4', onSurface(S.jaspers, 'tier-middle', 500, 20)),
  place('keystep', onSurface(S.jaspers, 'tier-middle', 925, 20)),
  place('dt2', onSurface(S.jaspers, 'tier-top', 200, 20)),
  place('ipad', onSurface(S.jaspers, 'tier-top', 460, 20)),
  place('heat', onSurface(S.jaspers, 'tier-top', 760, 20)),
  place('mbrute', onSurface(S.desk, 'top', 0, 0)),
  place('wz3', onSurface(S.desk, 'top', 1050, 0)),
  place('pyramid', onSurface(S.desk, 'top', 0, 450)),
  place('ssl12', onSurface(S.desk, 'top', 300, 450)),
  place('nightsky', onSurface(S.desk, 'top', 620, 450)),
  place('h90', onSurface(S.desk, 'top', 820, 450)),
  place('drum3p', { type: 'floor', pos: { x: -2500, y: 1800 } }),
  place('ep40', onSurface(S.desk, 'top', 1450, 560)),
  place('sidekick', { type: 'stacked', parentUnitId: u('ep40'), x: 0, y: 0 }, 1),
  place('wave2', { type: 'floor', pos: { x: -2500, y: 1400 } }),
  place('nifty', onSurface(S.desk, 'top', 1000, 600)),
  ...RACK_AND_STAND,
];

// ---------- unit configs ----------

function unitConfigs(models: Map<string, GearModel>): Record<string, UnitConfig> {
  const out: Record<string, UnitConfig> = {};
  for (const [key, modelId] of UNITS) {
    const m = models.get(modelId)!;
    const cfg = defaultUnitConfig(m.ergonomics.defaultUsage);
    if (m.clock?.canBeSlave && m.clock.formats.includes('midi') && m.connectors.some((c) => c.id === 'midi-in'))
      cfg.clockSource = { connectorId: 'midi-in' };
    out[u(key)] = cfg;
  }
  out[u('pyramid')] = { ...out[u('pyramid')]!, clockMaster: true, clockSource: 'internal' };
  out[u('ep40')] = { ...out[u('ep40')]!, clockSource: { connectorId: 'sync-in' } };
  out[u('nifty')] = { ...out[u('nifty')]!, clockSource: { connectorId: 'usb' } }; // MIDI arrives over USB from the mioXL
  out[u('keystep')] = { ...out[u('keystep')]!, notes: 'Clock from MIDI In (via Octatrack Thru); Sync Out set to 2 PPQ for the Riddim.' };
  out[u('px3000')] = { ...out[u('px3000')]!, pathPresets: Object.fromEntries(Array.from({ length: 24 }, (_, k) => [`ch${k + 1}`, 'half-normal'])) };
  return out;
}

function setup(id: string, name: string, status: Setup['status'], description: string, placements: Placement[], tiers: Record<string, { z: number; tiltDeg?: number }>, models: Map<string, GearModel>, derivedFromId?: string): Setup {
  return {
    id, name, description, status, tags: ['sample'], ...(derivedFromId ? { derivedFromId } : {}),
    bodyProfileId: 'body-default', posture: 'standing',
    stands: STANDS(tiers), placements, connections: connections(id), unitConfigs: unitConfigs(models), annotations: [],
    viewState: { layoutView: 'front', viewports: {}, patchPositions: {} },
    createdAt: T, updatedAt: T, suppressedIssues: [],
  }; // prettier-ignore
}

export function sampleProject(gearModels: GearModel[], standModels: StandModel[], cableModels: Project['library']['cableModels']): Project {
  const models = new Map(gearModels.map((m) => [m.id, m]));
  const gearUnits: GearUnit[] = UNITS.map(([key, modelId, notes]) => {
    const m = models.get(modelId);
    if (!m) throw new Error(`sample: unknown model ${modelId}`);
    const nickname = key.startsWith('psu-')
      ? `${m.name} (${key.slice(4)})`
      : key.startsWith('strip-')
        ? `${m.name} (${key.slice(6)})`
        : [m.name, m.variant].filter(Boolean).join(' ');
    return { id: u(key), modelId, nickname, ...(notes ? { notes } : {}) };
  });
  const standUnits: StandUnit[] = [
    { id: S.jaspers, modelId: 'stand-jaspers-3d-145b', nickname: 'Jaspers 3D-145B' },
    { id: S.rack, modelId: 'stand-generic-rack-12u', nickname: 'Rack' },
    { id: S.desk, modelId: 'stand-generic-desk', nickname: 'Desk' },
    { id: S.euro, modelId: 'stand-eurorack-format-3-row', nickname: 'Eurorack-format stand' },
  ];
  const settings = defaultSettings();
  settings.defaultBodyProfileId = 'body-default';
  return {
    schemaVersion: 1,
    meta: {
      name: 'My studio (sample)',
      createdAt: T,
      updatedAt: T,
      notes: 'Built from docs/studio-gear-reference.md (v2). "Current" is a demo arrangement, not a measured one; "Planned (standing)" uses the spec §8.1 tier assignment.',
    },
    settings,
    library: { gearModels, standModels, cableModels, templates: [] },
    inventory: { gearUnits, standUnits, cables: [], rooms: [] },
    bodyProfiles: [{ id: 'body-default', name: 'Default (173 cm)', heightMm: 1730, handedness: 'right' }],
    setups: [
      setup('setup-current', 'Current', 'current', 'Demo arrangement of all gear from the reference (not measured).', CURRENT_PLACEMENTS, { 'tier-bottom': { z: 600 }, 'tier-middle': { z: 900 }, 'tier-top': { z: 1150 } }, models),
      setup('setup-planned-standing', 'Planned (standing)', 'planned', 'Standing plan: planes ≈ 800 / 1000 / 1190 mm (tray = plane − unit height, on the 5 mm adjustment steps of the stand).', PLANNED_PLACEMENTS, { 'tier-bottom': { z: 725 }, 'tier-middle': { z: 920 }, 'tier-top': { z: 1125 } }, models, 'setup-current'),
    ],
    activeSetupId: 'setup-current',
    assets: { mode: 'folder', items: {} },
  }; // prettier-ignore
}
