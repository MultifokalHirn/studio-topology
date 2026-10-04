// Seed stands (spec §8.1, Appendix D), built-in cables (§8.2) and templates (§5.2).
import { eurorackStand, rackStand, desk } from '../../src/domain/stands.ts';
import type { CableModel, Connector, GearModel, StandModel, Template } from '../../src/domain/types.ts';
import { c, MIDI_ALL, midiIn, midiOut, midiThru, mono, p, pair, phones, usbDevice } from './helpers.ts';

// ---------- stands ----------

const JASPERS_URL = 'https://www.musicstore.de/en_DE/EUR/Jaspers-3D-145B/art-KEY0003689-000';
const holders = (lengthMm: number) => ({ lengthMm, thicknessMm: 30, pairMinSpacingMm: 150, protrusionAdjustable: false });
const tierAdj = (withY: boolean) => ({
  z: { min: 300, max: 1400, step: 5 },
  tiltDeg: { min: 0, max: 30, step: 1 },
  ...(withY ? { y: { min: -300, max: 300, step: 5 } } : {}),
});

/** Appendix D. */
export const jaspers: StandModel = {
  id: 'stand-jaspers-3d-145b',
  manufacturer: 'Jaspers',
  name: '3D-145B',
  type: 'tiered-keyboard-stand',
  dimensions: { w: 1550, d: 700, h: 1400, innerSpanMm: 1450, weightKg: null },
  surfaces: [
    { id: 'tier-bottom', label: 'Bottom tier (reinforced)', kind: 'tier', usable: { w: 1450, d: 600 }, anchor: { x: 0, y: 0, z: 400 }, adjustable: tierAdj(false), holders: holders(600), loadKg: 40 },
    { id: 'tier-middle', label: 'Middle tier', kind: 'tier', usable: { w: 1450, d: 400 }, anchor: { x: 0, y: 0, z: 800 }, adjustable: tierAdj(true), holders: holders(400), loadKg: 15 },
    { id: 'tier-top', label: 'Top tier', kind: 'tier', usable: { w: 1450, d: 400 }, anchor: { x: 0, y: 0, z: 1100 }, adjustable: tierAdj(true), holders: holders(400), loadKg: 15 },
  ],
  structure: { poleDiameterMm: 40 },
  images: {},
  notes: 'Holder lengths and load limits from retailer specs; heights, tilt ranges and depth offsets are placeholders until measured.',
  sources: [{ label: 'musicstore.de', url: JASPERS_URL }],
  provenance: {
    'dimensions.w': p('retailer', undefined, JASPERS_URL),
    'dimensions.weightKg': p('unknown'),
    'structure.poleDiameterMm': p('estimated', 'Not published; measure.'),
    'surfaces.0.adjustable.z': p('estimated', 'Retailer lists max height 140 cm only; measure the real stand.'),
    'surfaces.0.loadKg': p('retailer'),
    'surfaces.1.adjustable.y': p('unknown', 'Tier depth offsets (A-frame geometry) not published; measure.'),
    'surfaces.2.adjustable.y': p('unknown', 'Tier depth offsets (A-frame geometry) not published; measure.'),
    'surfaces.1.loadKg': p('retailer'),
    'surfaces.2.loadKg': p('retailer'),
  },
}; // prettier-ignore

export const rack8u: StandModel = {
  ...rackStand({ id: 'stand-generic-rack-8u', name: 'Rack 8U', u: 8, depthMm: 400 }),
  notes: 'Sized for the eight 1U units in the gear reference (7U confirmed + SX 2). Depth is a placeholder; replace with your rack.',
  provenance: { 'surfaces.0.rack.depthMm': p('estimated', 'Placeholder depth.'), 'dimensions.d': p('estimated', 'Placeholder depth.') },
};

export const studioDesk: StandModel = {
  ...desk({ id: 'stand-generic-desk', name: 'Desk', w: 1600, d: 800, h: 740 }),
  notes: 'Generic desk; replace the dimensions with yours.',
  provenance: { 'dimensions.w': p('estimated'), 'dimensions.d': p('estimated'), 'dimensions.h': p('estimated') },
};

export const eurorackFormatStand: StandModel = {
  ...eurorackStand({ id: 'stand-eurorack-format-3-row', name: 'Eurorack-format stand (3 rows)', rows: 3, rowDepthMm: 140, widthMm: 440 }),
  notes: 'Separate stand for the Neutron, Pro-800 and 2-XM (each ~424 × 136 mm). Geometry is a placeholder; measure.',
};

export const standModels = [jaspers, rack8u, studioDesk, eurorackFormatStand];

// ---------- cables (§8.2) ----------

const L_AUDIO = [300, 500, 1000, 1500, 2000, 3000, 5000, 6000];
const L_PATCH = [150, 300, 450, 600, 900];
const L_MIDI = [300, 500, 1000, 1500, 3000, 5000, 10000, 15000];
const L_USB = [300, 500, 1000, 1500, 2000, 3000, 5000];

const cable = (id: string, name: string, endA: CableModel['endA'], endB: CableModel['endB'], carries: CableModel['carries'], lengthsMm: number[], extra: Partial<CableModel> = {}): CableModel =>
  ({ id, name, kind: 'cable', endA, endB, carries, lengthsMm, ...extra }); // prettier-ignore
const adapter = (id: string, name: string, endA: CableModel['endA'], endB: CableModel['endB'], carries: CableModel['carries'], extra: Partial<CableModel> = {}): CableModel =>
  ({ id, name, kind: 'adapter', endA, endB, carries, lengthsMm: [0], notes: 'endA: plug presented to the gear; endB: plug type the adapter accepts.', ...extra }); // prettier-ignore

export const cableModels: CableModel[] = [
  cable('cable-ts-6.35', '¼" TS – ¼" TS', 'TS-6.35', 'TS-6.35', ['audio.analog', 'cv', 'gate', 'clock.pulse', 'footswitch'], L_AUDIO, { balanced: false }),
  cable('cable-trs-6.35', '¼" TRS – ¼" TRS (balanced)', 'TRS-6.35', 'TRS-6.35', ['audio.analog', 'audio.headphone', 'expression'], L_AUDIO, { balanced: true }),
  cable('cable-xlr', 'XLR M – XLR F', 'XLR-M', 'XLR-F', ['audio.analog'], [500, 1000, 2000, 3000, 5000, 10000], { balanced: true }),
  cable('cable-xlrm-trs', 'XLR M – ¼" TRS', 'XLR-M', 'TRS-6.35', ['audio.analog'], [1000, 2000, 3000, 5000], { balanced: true }),
  cable('cable-xlrf-trs', 'XLR F – ¼" TRS', 'XLR-F', 'TRS-6.35', ['audio.analog'], [1000, 2000, 3000, 5000], { balanced: true }),
  cable('cable-ts-3.5', '3.5 mm TS patch', 'TS-3.5', 'TS-3.5', ['cv', 'gate', 'clock.pulse', 'audio.analog'], L_PATCH, { balanced: false }),
  cable('cable-trs-3.5', '3.5 mm TRS – 3.5 mm TRS', 'TRS-3.5', 'TRS-3.5', ['audio.analog', 'midi.trs-a', 'midi.trs-b', 'clock.pulse'], [300, 500, 1000, 1500, 3000]),
  cable('cable-ts-3.5-6.35', '3.5 mm TS – ¼" TS', 'TS-3.5', 'TS-6.35', ['audio.analog', 'cv', 'gate', 'clock.pulse'], [300, 1000, 2000, 3000]),
  cable('cable-trs-3.5-2ts', '3.5 mm TRS stereo – 2 × ¼" TS', 'TRS-3.5', 'TS-6.35', ['audio.analog'], [1000, 2000, 3000], { swap: 'tip-ring-for-L-R', notes: 'Tip = L, ring = R.' }),
  cable('cable-y-insert', 'Insert Y: ¼" TRS – 2 × ¼" TS', 'Y-insert', 'TS-6.35', ['audio.analog'], [1000, 2000, 3000], { notes: 'Tip/ring to send/return per the insert jack.' }),
  cable('cable-midi-din', 'MIDI DIN 5', 'DIN5-M', 'DIN5-M', ['midi.din', 'clock.dinsync'], L_MIDI),
  adapter('adapter-trs-a-din', '3.5 mm TRS-A – MIDI DIN adapter', 'TRS-3.5', 'DIN5-M', ['midi.trs-a']),
  adapter('adapter-trs-b-din', '3.5 mm TRS-B – MIDI DIN adapter', 'TRS-3.5', 'DIN5-M', ['midi.trs-b']),
  adapter('adapter-3.5-6.35', '3.5 mm jack → ¼" plug adapter', 'TRS-6.35', 'TRS-3.5', ['audio.analog', 'audio.headphone']),
  adapter('adapter-6.35-3.5', '¼" jack → 3.5 mm plug adapter', 'TRS-3.5', 'TRS-6.35', ['audio.analog', 'audio.headphone']),
  cable('cable-usb-a-b', 'USB-A – USB-B', 'USB-A', 'USB-B', ['usb.data', 'power.usb'], L_USB, { maxLengthMm: 5000 }),
  cable('cable-usb-a-c', 'USB-A – USB-C', 'USB-A', 'USB-C', ['usb.data', 'power.usb'], L_USB, { maxLengthMm: 5000 }),
  cable('cable-usb-a-micro', 'USB-A – micro-USB', 'USB-A', 'USB-micro-B', ['usb.data', 'power.usb'], L_USB, { maxLengthMm: 5000 }),
  cable('cable-usb-a-mini', 'USB-A – mini-USB', 'USB-A', 'USB-mini-B', ['usb.data', 'power.usb'], L_USB, { maxLengthMm: 5000 }),
  cable('cable-usb-c-c', 'USB-C – USB-C', 'USB-C', 'USB-C', ['usb.data', 'power.usb'], [300, 500, 1000, 2000, 3000], { maxLengthMm: 4000 }),
  cable('cable-usb-c-b', 'USB-C – USB-B', 'USB-C', 'USB-B', ['usb.data', 'power.usb'], L_USB, { maxLengthMm: 5000 }),
  cable('cable-usb-c-micro', 'USB-C – micro-USB', 'USB-C', 'USB-micro-B', ['usb.data', 'power.usb'], [300, 1000, 2000]),
  cable('cable-usb-c-mini', 'USB-C – mini-USB', 'USB-C', 'USB-mini-B', ['usb.data', 'power.usb'], [300, 1000, 2000]),
  cable('cable-toslink', 'TOSLINK optical', 'TOSLINK', 'TOSLINK', ['audio.adat', 'audio.spdif'], [500, 1000, 2000, 3000, 5000, 10000]),
  cable('cable-ethernet', 'Ethernet (RJ45)', 'RJ45', 'RJ45', ['ethernet'], [500, 1000, 2000, 3000, 5000, 10000]),
  cable('cable-bnc', 'BNC word clock (75 Ω)', 'BNC', 'BNC', ['clock.word'], [500, 1000, 2000]),
  cable('cable-dc-extension', 'DC barrel extension 5.5 × 2.1/2.5', 'DC-barrel', 'DC-barrel', ['power.dc'], [500, 1000, 2000]),
  cable('cable-iec', 'IEC C13 mains cable', 'IEC-C13', 'IEC-C13', ['power.ac'], [1000, 1500, 2000, 3000]),
]; // prettier-ignore

// ---------- templates (§5.2) ----------

const dims = (w: number | null, d: number | null, h: number | null, weightKg: number | null = null) => ({ w, d, h, weightKg, heightIncludesKnobsFeet: true });
const dc12 = { sources: [{ kind: 'external-dc' as const, inputConnectorId: 'dc-in', nominalV: 12, drawMa: null, plug: { type: 'barrel' as const, odMm: 5.5, idMm: 2.5, polarity: 'center-positive' as const }, included: true }] };
const iec = { sources: [{ kind: 'internal-mains' as const, inputConnectorId: 'ac-in', plug: { type: 'iec-c14' as const }, included: true }], mainsRegion: 'unknown' as const };
const dcInC = c('dc-in', 'DC In', 'power.dc', 'in', 'dc-barrel-5.5x2.5');
const iecC = c('ac-in', 'Mains (IEC)', 'power.ac', 'in', 'iec-c14');
const ergo = (interaction: GearModel['ergonomics']['interaction'], defaultUsage: GearModel['ergonomics']['defaultUsage'] = 'secondary', needsDisplayVisibility = false) =>
  ({ interaction, defaultUsage, needsDisplayVisibility }); // prettier-ignore
const rack1U = (d: number | null) => ({ w: 482.6, d, h: 44.45, weightKg: null, heightIncludesKnobsFeet: false, rack: { u: 1, earsIncluded: true } });

const conn = {
  stereoTsOut: pair('out', 'Out', 'out', 'jack-6.35-TS', 'unbalanced', 'line'),
  stereoTrsOut: pair('out', 'Out', 'out', 'jack-6.35-TRS', 'balanced', 'line'),
  stereoTrsIn: pair('in', 'In', 'in', 'jack-6.35-TRS', 'balanced', 'line'),
  stereoTsIn: pair('in', 'In', 'in', 'jack-6.35-TS', 'unbalanced', 'instrument'),
  midiIOT: [midiIn(), midiOut(), midiThru()],
  midiIO: [midiIn(), midiOut()],
  usbBMidi: [usbDevice('usb', 'usb-b-f', ['midi'], { version: '2.0' })],
  usbCAudio: [usbDevice('usb', 'usb-c-f', ['audio', 'midi'], { version: '2.0', audio: { inChannels: 2, outChannels: 2, compliance: 'class-compliant' } })],
  phones: [phones('phones', 'Headphones', 'jack-6.35-TRS')],
  sync35: [
    c('sync-in', 'Sync In', 'clock.pulse', 'in', 'jack-3.5', { clock: { format: 'pulse', canSlave: true } }),
    c('sync-out', 'Sync Out', 'clock.pulse', 'out', 'jack-3.5', { clock: { format: 'pulse', canMaster: true } }),
  ],
  cvGate: [c('cv-out', 'CV Out', 'cv', 'out', 'jack-3.5', { cv: { standard: '1V/oct' } }), c('gate-out', 'Gate Out', 'gate', 'out', 'jack-3.5')],
};

const tpl = (t: Template): Template => t;
const gearTpl = (id: string, name: string, group: string, gear: NonNullable<Template['gear']>, extra: Partial<Template> = {}): Template =>
  tpl({ id: `tpl-${id}`, name, group, target: 'gear', gear, ...extra }); // prettier-ignore
const connTpl = (id: string, name: string, connectors: Connector[]): Template =>
  tpl({ id: `tpl-conn-${id}`, name, group: 'Connector groups', target: 'connectors', connectors });

export const templates: Template[] = [
  // Desktop gear
  gearTpl('desktop-synth', 'Desktop synth', 'Desktop gear', { category: 'synth', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...conn.stereoTrsOut, ...conn.phones, ...conn.midiIOT, ...conn.usbBMidi, dcInC], power: dc12, ergonomics: ergo('knobs-buttons', 'primary', true) }),
  gearTpl('drum-machine', 'Drum machine', 'Desktop gear', { category: 'drum-machine', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...conn.stereoTrsOut, ...conn.phones, ...conn.midiIOT, ...conn.usbBMidi, ...conn.sync35, dcInC], power: dc12, ergonomics: ergo('pads', 'primary', true) }, {
    params: [{ key: 'voiceOuts', label: 'Individual outs', default: 0 }],
    connectorGroups: [{ repeat: 'voiceOuts', connectors: [mono('out-voice-{i}', 'Voice out {i}', 'out', 'jack-6.35-TS', 'unbalanced', 'line', { channel: { role: 'numbered' } })] }],
  }),
  gearTpl('sampler', 'Sampler / groovebox', 'Desktop gear', { category: 'sampler', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...conn.stereoTrsOut, ...conn.stereoTrsIn, ...conn.phones, ...conn.midiIOT, ...conn.usbBMidi, dcInC], power: dc12, ergonomics: ergo('knobs-buttons', 'primary', true) }),
  gearTpl('sequencer', 'Sequencer', 'Desktop gear', { category: 'sequencer', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [midiIn(), midiOut('midi-out-a', 'MIDI Out A'), midiOut('midi-out-b', 'MIDI Out B'), ...conn.cvGate, ...conn.sync35, ...conn.usbBMidi], power: { sources: [{ kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true }] }, clock: { canBeMaster: true, canBeSlave: true, formats: ['midi'] }, ergonomics: ergo('knobs-buttons', 'primary', true) }),
  gearTpl('controller-keyboard', 'Controller keyboard (N keys)', 'Desktop gear', { category: 'controller', formFactor: 'keyboard', dimensions: { ...dims(null, null, null), keyboard: { keys: 49, keyType: 'full' } }, connectors: [midiOut(), c('sustain', 'Sustain', 'footswitch', 'in', 'jack-6.35'), ...conn.usbBMidi], power: { sources: [{ kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true }] }, ergonomics: ergo('keys', 'primary') }, {
    params: [{ key: 'keys', label: 'Keys', default: 49 }],
  }),
  // Effects
  gearTpl('pedal-effect', 'Pedal-format effect (stereo)', 'Effects', { category: 'effect', formFactor: 'pedal', dimensions: dims(null, null, null), connectors: [...conn.stereoTsIn, ...conn.stereoTsOut, c('exp', 'EXP', 'expression', 'in', 'jack-6.35-TRS'), c('dc-in', 'DC In', 'power.dc', 'in', 'dc-barrel-5.5x2.1')], power: { sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 9, drawMa: null, plug: { type: 'barrel', odMm: 5.5, idMm: 2.1, polarity: 'center-negative' }, included: true }] }, internalPaths: [{ id: 'fx', from: ['in-l', 'in-r'], to: ['out-l', 'out-r'], mode: 'process', channelMap: [{ from: 'in-l', to: 'out-l' }, { from: 'in-r', to: 'out-r' }] }], ergonomics: ergo('footswitch') }),
  gearTpl('desktop-effect', 'Desktop effect (stereo)', 'Effects', { category: 'effect', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...conn.stereoTrsIn, ...conn.stereoTrsOut, dcInC], power: dc12, internalPaths: [{ id: 'fx', from: ['in-l', 'in-r'], to: ['out-l', 'out-r'], mode: 'process', channelMap: [{ from: 'in-l', to: 'out-l' }, { from: 'in-r', to: 'out-r' }] }], ergonomics: ergo('knobs-buttons') }),
  gearTpl('rack-effect', 'Rack effect 1U', 'Effects', { category: 'effect', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, connectors: [...pair('in', 'In', 'in', 'jack-6.35-TRS', 'balanced', '+4dBu'), ...pair('out', 'Out', 'out', 'jack-6.35-TRS', 'balanced', '+4dBu'), iecC], power: iec, ergonomics: ergo('set-and-forget', 'rare') }),
  gearTpl('dynamics-1u', 'Dynamics 1U (dual channel XLR+TRS)', 'Effects', { category: 'dynamics', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, connectors: [1, 2].flatMap((i) => [mono(`in-${i}-xlr`, `In ${i} (XLR)`, 'in', 'xlr-f', 'balanced', '+4dBu'), mono(`in-${i}-trs`, `In ${i} (TRS)`, 'in', 'jack-6.35-TRS', 'balanced', '+4dBu'), mono(`out-${i}-xlr`, `Out ${i} (XLR)`, 'out', 'xlr-m', 'balanced', '+4dBu'), mono(`out-${i}-trs`, `Out ${i} (TRS)`, 'out', 'jack-6.35-TRS', 'balanced', '+4dBu'), c(`sidechain-${i}`, `Sidechain ${i}`, 'audio.analog', 'bidir', 'jack-6.35-TRS', { insert: { tip: 'return', ring: 'send' } })]).concat([iecC]), power: iec, ergonomics: ergo('set-and-forget', 'rare') }),
  gearTpl('exciter-1u', 'Exciter/enhancer 1U', 'Effects', { category: 'effect', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, connectors: [...pair('in', 'In', 'in', 'xlr-f', 'balanced', '+4dBu'), ...pair('out', 'Out', 'out', 'xlr-m', 'balanced', '+4dBu'), iecC], power: iec, ergonomics: ergo('set-and-forget', 'rare') }),
  // Audio infrastructure
  gearTpl('mixer', 'Mixer (N-channel)', 'Audio infrastructure', { category: 'mixer', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...pair('out-main', 'Main Out', 'out', 'xlr-m', 'balanced', '+4dBu'), ...conn.phones, iecC], power: iec, ergonomics: ergo('fader', 'primary') }, {
    params: [{ key: 'channels', label: 'Channels', default: 8 }],
    connectorGroups: [{ repeat: 'channels', connectors: [mono('ch{i}-mic', 'CH {i} Mic', 'in', 'xlr-f', 'balanced', 'mic', { channel: { role: 'numbered' } }), mono('ch{i}-line', 'CH {i} Line', 'in', 'jack-6.35-TRS', 'balanced', 'line', { channel: { role: 'numbered' } })] }],
  }),
  gearTpl('usb-interface', 'USB audio interface (N in / M out)', 'Audio infrastructure', { category: 'interface', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...conn.phones, ...conn.usbCAudio], power: { sources: [{ kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true }] }, ergonomics: ergo('knobs-buttons') }, {
    params: [{ key: 'inputs', label: 'Inputs', default: 2 }, { key: 'outputs', label: 'Outputs', default: 2 }],
    connectorGroups: [
      { repeat: 'inputs', connectors: [c('in-{i}', 'Input {i}', 'audio.analog', 'in', 'combo-xlr-trs', { signal: { balance: 'balanced', level: 'mic', phantom: 'switchable' }, channel: { role: 'numbered' } })] },
      { repeat: 'outputs', connectors: [mono('out-{i}', 'Output {i}', 'out', 'jack-6.35-TRS', 'balanced', 'line', { channel: { role: 'numbered' } })] },
    ],
  }),
  gearTpl('adat-converter', 'ADAT converter 1U', 'Audio infrastructure', { category: 'converter', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, connectors: [c('adat-in', 'ADAT In', 'audio.adat', 'in', 'toslink-f'), c('adat-out', 'ADAT Out', 'audio.adat', 'out', 'toslink-f'), c('wordclock-in', 'Word Clock In', 'clock.word', 'in', 'bnc-f'), iecC], power: iec, ergonomics: ergo('set-and-forget', 'rare') }, {
    connectorGroups: [{ repeat: 'channels', connectors: [c('in-{i}', 'Input {i}', 'audio.analog', 'in', 'combo-xlr-trs', { channel: { role: 'numbered' } }), mono('out-{i}', 'Line Out {i}', 'out', 'xlr-m', 'balanced', '+4dBu', { channel: { role: 'numbered' } })] }],
    params: [{ key: 'channels', label: 'Channels', default: 8 }],
  }),
  gearTpl('patchbay', 'Patchbay 1U (48-point)', 'Audio infrastructure', { category: 'patchbay', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, power: { sources: [] }, ergonomics: ergo('set-and-forget') }, {
    params: [{ key: 'channels', label: 'Channels (2 points each)', default: 24 }],
    connectorGroups: [{ repeat: 'channels', connectors: (['front-top', 'front-bottom', 'rear-top', 'rear-bottom'] as const).map((k) => c(`${k}-{i}`, `${k.replace('-', ' ')} {i}`, 'audio.analog', 'bidir', 'jack-6.35-TRS', { face: k.startsWith('front') ? 'front' : 'back', channel: { role: 'numbered', group: 'ch{i}' } })) }],
    description: 'Normalling modes per channel: add internal paths with group ch{i} and presets normal / half-normal.',
  }),
  gearTpl('summing-mixer', 'Summing mixer', 'Audio infrastructure', { category: 'mixer', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, connectors: [...pair('out-main', 'Main Out', 'out', 'xlr-m', 'balanced', '+4dBu'), iecC], power: iec, ergonomics: ergo('set-and-forget', 'rare') }, {
    params: [{ key: 'channels', label: 'Inputs', default: 8 }],
    connectorGroups: [{ repeat: 'channels', connectors: [mono('in-{i}', 'In {i}', 'in', 'jack-6.35-TRS', 'balanced', '+4dBu', { channel: { role: 'numbered' } })] }],
  }),
  // MIDI / CV
  gearTpl('midi-hub-rack', 'MIDI hub rack 1U', 'MIDI/CV', { category: 'midi-hub', formFactor: 'rack', dimensions: rack1U(null), mounting: { rackEars: true }, connectors: [usbDevice('usb-computer', 'usb-b-f', ['midi']), dcInC], power: dc12, ergonomics: ergo('set-and-forget', 'rare') }, {
    params: [{ key: 'ins', label: 'DIN ins', default: 8 }, { key: 'outs', label: 'DIN outs', default: 8 }],
    connectorGroups: [
      { repeat: 'ins', connectors: [c('din-in-{i}', 'DIN In {i}', 'midi.din', 'in', 'din5-f', { midi: { carries: MIDI_ALL }, channel: { role: 'numbered' } })] },
      { repeat: 'outs', connectors: [c('din-out-{i}', 'DIN Out {i}', 'midi.din', 'out', 'din5-f', { midi: { carries: MIDI_ALL }, channel: { role: 'numbered' } })] },
    ],
  }),
  gearTpl('midi-interface', 'MIDI interface', 'MIDI/CV', { category: 'midi-hub', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [...conn.midiIO, usbDevice('usb', 'usb-b-f', ['midi', 'power'], { busPowered: true, drawsBusPowerMa: null })], power: { sources: [{ kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true }] }, ergonomics: ergo('set-and-forget', 'rare') }),
  gearTpl('eurorack-case', 'Eurorack case (N HP)', 'MIDI/CV', { category: 'eurorack-case', formFactor: 'eurorack', dimensions: { ...dims(null, null, null), eurorack: { hp: 84 } }, connectors: [midiIn(), usbDevice('usb', 'usb-b-f', ['midi']), ...conn.cvGate, dcInC], power: { sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', drawMa: null, included: true }], busRails: { plus12Ma: null, minus12Ma: null, plus5Ma: null } }, ergonomics: ergo('knobs-buttons') }, {
    params: [{ key: 'hp', label: 'HP', default: 84 }],
  }),
  // Power
  gearTpl('wall-wart', 'Wall-wart DC supply', 'Power', { category: 'power', formFactor: 'other', dimensions: dims(null, null, null), connectors: [c('ac', 'Mains plug', 'power.ac', 'in', 'mains-plug'), c('dc-out', 'DC Out', 'power.dc', 'out', 'captive-cable', { psu: { voltage: 12, currentMaMax: 1000, plug: { type: 'barrel', odMm: 5.5, idMm: 2.5, polarity: 'center-positive' }, polarity: 'center-positive' } })], power: { sources: [] }, ergonomics: ergo('set-and-forget', 'rare') }),
  gearTpl('power-strip', 'Power strip (N outlets)', 'Power', { category: 'power', formFactor: 'other', dimensions: dims(null, null, null), connectors: [c('ac', 'Mains plug', 'power.ac', 'in', 'mains-plug')], power: { sources: [] }, ergonomics: ergo('set-and-forget', 'rare') }, {
    params: [{ key: 'outlets', label: 'Outlets', default: 6 }],
    connectorGroups: [{ repeat: 'outlets', connectors: [c('outlet-{i}', 'Outlet {i}', 'power.ac', 'out', 'unknown', { channel: { role: 'numbered' }, psu: { voltage: 230, currentMaMax: null } })] }],
  }),
  gearTpl('usb-hub', 'USB hub (N ports)', 'Power', { category: 'accessory', formFactor: 'other', dimensions: dims(null, null, null), connectors: [usbDevice('upstream', 'usb-c-f', ['data'], { version: '3.0' }), c('dc-in', 'DC In (powered hubs)', 'power.dc', 'in', 'unknown')], power: { sources: [{ kind: 'optional-dc', inputConnectorId: 'dc-in', drawMa: null, included: false }] }, ergonomics: ergo('set-and-forget', 'rare') }, {
    params: [{ key: 'ports', label: 'Ports', default: 4 }],
    connectorGroups: [{ repeat: 'ports', connectors: [c('port-{i}', 'Port {i}', 'usb.data', 'bidir', 'usb-a-f', { usb: { role: 'host', version: '3.0', carries: ['midi', 'audio', 'data', 'power'], suppliesBusPowerMa: 900 }, channel: { role: 'numbered' } })] }],
    description: 'Set suppliesBusPowerMa to 0 or remove the DC input for unpowered hubs.',
  }),
  // Computers
  gearTpl('tablet', 'Tablet (USB-C)', 'Computers', { category: 'tablet', formFactor: 'tablet', dimensions: dims(null, null, null), connectors: [c('usb-c', 'USB-C', 'usb.data', 'bidir', 'usb-c-f', { usb: { role: 'host', version: 'unknown', carries: ['midi', 'audio', 'data', 'power'], suppliesBusPowerMa: null } })], power: { sources: [{ kind: 'battery', drawMa: null, included: true }] }, ergonomics: ergo('touch', 'primary', true) }),
  gearTpl('laptop', 'Laptop', 'Computers', { category: 'computer', formFactor: 'desktop', dimensions: dims(null, null, null), connectors: [c('usb-c-1', 'USB-C 1', 'usb.data', 'bidir', 'usb-c-f', { usb: { role: 'host', version: 'unknown', carries: ['midi', 'audio', 'data', 'power'], suppliesBusPowerMa: 1500 } }), c('usb-c-2', 'USB-C 2', 'usb.data', 'bidir', 'usb-c-f', { usb: { role: 'host', version: 'unknown', carries: ['midi', 'audio', 'data', 'power'], suppliesBusPowerMa: 1500 } }), phones('phones', 'Headphones', 'jack-3.5-TRS')], power: { sources: [{ kind: 'battery', drawMa: null, included: true }] }, ergonomics: ergo('touch', 'primary', true) }),
  gearTpl('monitor-speakers', 'Monitor speakers (pair)', 'Computers', { category: 'monitor-speaker', formFactor: 'speaker', dimensions: dims(null, null, null), connectors: [...pair('in', 'In', 'in', 'combo-xlr-trs', 'balanced', '+4dBu'), iecC], power: iec, ergonomics: ergo('set-and-forget', 'rare') }, { description: 'One model for the pair: In L feeds the left speaker, In R the right.' }),
  gearTpl('headphones', 'Headphones', 'Computers', { category: 'headphones', formFactor: 'handheld', dimensions: dims(null, null, null), connectors: [c('plug', 'Plug (¼" TRS)', 'audio.headphone', 'in', 'captive-cable', { channel: { role: 'stereo' } })], power: { sources: [] }, ergonomics: ergo('set-and-forget') }),
  // Stands
  tpl({ id: 'tpl-stand-a-frame', name: 'Tiered A-frame keyboard stand', group: 'Stands', target: 'stand', generator: 'tiered-a-frame', params: [{ key: 'tiers', label: 'Tiers', default: 3 }, { key: 'innerSpanMm', label: 'Inner span', default: 1450, unit: 'mm' }, { key: 'holderLengthMm', label: 'Holder length', default: 400, unit: 'mm' }, { key: 'heightMm', label: 'Max height', default: 1400, unit: 'mm' }, { key: 'poleDiameterMm', label: 'Pole diameter', default: 40, unit: 'mm' }] }),
  tpl({ id: 'tpl-stand-x', name: 'X-stand', group: 'Stands', target: 'stand', stand: { type: 'custom', dimensions: { w: 1000, d: 450, h: null }, surfaces: [{ id: 'top', label: 'Arms', kind: 'tier', usable: { w: 1000, d: 450 }, anchor: { x: 0, y: 0, z: 800 }, adjustable: { z: { min: 600, max: 1000, step: 25 } }, loadKg: null }] } }),
  tpl({ id: 'tpl-stand-desk', name: 'Desk', group: 'Stands', target: 'stand', generator: 'desk', params: [{ key: 'w', label: 'Width', default: 1600, unit: 'mm' }, { key: 'd', label: 'Depth', default: 800, unit: 'mm' }, { key: 'h', label: 'Height', default: 740, unit: 'mm' }] }),
  tpl({ id: 'tpl-stand-rack', name: '19" rack', group: 'Stands', target: 'stand', generator: 'rack', params: [{ key: 'u', label: 'Units', default: 12, unit: 'U' }, { key: 'depthMm', label: 'Depth', default: 400, unit: 'mm' }] }),
  tpl({ id: 'tpl-stand-eurorack', name: 'Eurorack stand', group: 'Stands', target: 'stand', generator: 'eurorack-stand', params: [{ key: 'rows', label: 'Rows', default: 3 }, { key: 'rowDepthMm', label: 'Row depth', default: 140, unit: 'mm' }, { key: 'widthMm', label: 'Width', default: 440, unit: 'mm' }] }),
  tpl({ id: 'tpl-stand-shelf', name: 'Shelf', group: 'Stands', target: 'stand', stand: { type: 'shelf', dimensions: { w: 800, d: 300, h: null }, surfaces: [{ id: 'shelf', label: 'Shelf', kind: 'shelf', usable: { w: 800, d: 300 }, anchor: { x: 0, y: 0, z: 1000 }, adjustable: {}, loadKg: null }] } }),
  tpl({ id: 'tpl-stand-pedalboard', name: 'Pedalboard', group: 'Stands', target: 'stand', stand: { type: 'pedalboard', dimensions: { w: 600, d: 320, h: 60 }, surfaces: [{ id: 'board', label: 'Board', kind: 'desktop', usable: { w: 600, d: 320 }, anchor: { x: 0, y: 0, z: 60 }, adjustable: {}, loadKg: null }] } }),
  tpl({ id: 'tpl-stand-floor', name: 'Floor', group: 'Stands', target: 'stand', stand: { type: 'floor', dimensions: { w: null, d: null, h: 0 }, surfaces: [{ id: 'floor', label: 'Floor', kind: 'floor', usable: { w: 3000, d: 3000 }, anchor: { x: 0, y: 0, z: 0 }, adjustable: {}, loadKg: null }] } }),
  // Connector groups
  connTpl('stereo-ts-out', 'Stereo ¼" TS out pair', pair('out', 'Out', 'out', 'jack-6.35-TS', 'unbalanced', 'line')),
  connTpl('balanced-trs-io', 'Balanced ¼" TRS stereo in/out', [...pair('in', 'In', 'in', 'jack-6.35-TRS', 'balanced', 'line'), ...pair('out', 'Out', 'out', 'jack-6.35-TRS', 'balanced', 'line')]),
  connTpl('midi-din-iot', 'MIDI DIN In/Out/Thru', [midiIn(), midiOut(), midiThru()]),
  connTpl('midi-din-io', 'MIDI DIN In/Out', [midiIn(), midiOut()]),
  connTpl('usb-b-midi', 'USB-B device (MIDI)', [usbDevice('usb', 'usb-b-f', ['midi'], { version: '2.0' })]),
  connTpl('usb-c-audio-midi', 'USB-C device (audio+MIDI)', [usbDevice('usb', 'usb-c-f', ['audio', 'midi'], { version: '2.0', audio: { inChannels: 2, outChannels: 2, compliance: 'class-compliant' } })]),
  connTpl('dc-12v', 'DC barrel input 12 V centre-positive 5.5×2.5', [dcInC]),
  connTpl('iec', 'IEC C14 inlet', [iecC]),
  connTpl('headphone', 'Headphone ¼" stereo', [phones('phones', 'Headphones', 'jack-6.35-TRS')]),
  connTpl('sync-35', '3.5 mm sync in/out', conn.sync35),
  connTpl('cv-gate', 'CV/Gate pair', conn.cvGate),
]; // prettier-ignore
