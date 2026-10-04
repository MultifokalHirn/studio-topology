// Reference §1.1–1.3: Elektron, synths, drum machines and groove boxes (devices 1–12).
import type { GearModel } from '../../src/domain/types.ts';
import {
  c,
  dcIn,
  gear,
  iecIn,
  midiIn,
  midiOut,
  midiOutThru,
  midiThru,
  mono,
  numbered,
  onFace,
  p,
  pair,
  phones,
  processPath,
  usbDevice,
} from './helpers.ts';

const ELEKTRON_DC = { type: 'barrel', odMm: 5.5, idMm: 2.5, polarity: 'center-positive' } as const;
const ELEKTRON_PSU = 'gear-elektron-psu-3c';
const est = (w: number, v: number) => p('estimated', `Derived: ${w} W typical / ${v} V.`);

const elektronMidi = (dinSyncOnThru = false) => [
  midiIn(),
  midiOut('midi-out', 'MIDI Out', { clock: { format: 'dinsync24', canMaster: true, note: 'DIN sync on Out' } }),
  dinSyncOnThru
    ? midiThru('midi-thru', 'MIDI Thru', 'hard', { clock: { format: 'dinsync24', note: 'DIN sync on Thru' } })
    : midiThru(),
];

export const analogHeat: GearModel = gear({
  id: 'gear-elektron-analog-heat-mkii',
  manufacturer: 'Elektron',
  name: 'Analog Heat',
  variant: 'MKII',
  category: 'effect',
  formFactor: 'desktop',
  tags: ['elektron', 'overbridge'],
  dimensions: { w: 215, d: 184, h: 63, weightKg: 1.5, heightIncludesKnobsFeet: true },
  connectors: [
    ...pair('out-main', 'Main Out', 'out', 'jack-6.35-TRS', 'imp-balanced', 'line'),
    phones('phones', 'Headphones', 'jack-6.35-TRS'),
    ...pair('in', 'In', 'in', 'jack-6.35-TRS', 'balanced', 'line'),
    ...numbered(2, 'cv-exp', (i) => `CV/Exp ${i}`, 'expression', 'in', 'jack-6.35-TRS', () => ({
      alternates: [{ id: 'cv', label: 'CV in', domain: 'cv' }],
    })),
    ...elektronMidi(true),
    usbDevice('usb', 'unknown', ['midi', 'audio', 'firmware'], {
      version: '2.0',
      audio: { inChannels: 2, outChannels: 2, compliance: 'class-compliant' },
    }, { notes: 'Isolated USB 2.0; Overbridge supported.' }),
    dcIn('dc-barrel-5.5x2.5'),
  ],
  internalPaths: [processPath('heat', ['in-l', 'in-r'], ['out-main-l', 'out-main-r'])],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: 1000, plug: ELEKTRON_DC, included: true, suppliedModelId: ELEKTRON_PSU }],
    typicalW: 12,
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'dinsync24'], notes: 'LFO syncs to MIDI clock.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'secondary', needsDisplayVisibility: true },
  notes: 'Max operating temperature 36 °C. Ships with PSU-3b or PSU-3c.',
  provenance: {
    'power.sources.0.drawMa': est(12, 12),
    'connectors[usb].jack': p('unknown', 'USB receptacle type not stated in the reference.'),
  },
}); // prettier-ignore

export const analogFour: GearModel = gear({
  id: 'gear-elektron-analog-four-mkii',
  manufacturer: 'Elektron',
  name: 'Analog Four',
  variant: 'MKII',
  category: 'synth',
  formFactor: 'desktop',
  tags: ['elektron', 'overbridge'],
  dimensions: { w: 385, d: 225, h: 82, weightKg: 2.4, heightIncludesKnobsFeet: true },
  connectors: [
    ...pair('out-main', 'Main Out', 'out', 'jack-6.35-TRS', 'imp-balanced', 'line'),
    ...numbered(4, 'out-voice', (i) => `Voice ${i} Out`, 'audio.analog', 'out', 'jack-6.35', () => ({
      signal: { balance: 'unbalanced', level: 'line' },
      notes: 'Elektron: "separate stereo voice output jacks"; mono vs. stereo-pair wiring to verify.',
    })),
    ...numbered(4, 'cv-gate', (i) => `CV/Gate ${String.fromCharCode(64 + i)}`, 'cv', 'out', 'jack-6.35', () => ({
      alternates: [{ id: 'gate', label: 'Gate', domain: 'gate' }],
    })),
    phones('phones', 'Headphones', 'jack-6.35', { notes: 'Not in the retrieved spec; verify.' }),
    ...pair('in-ext', 'Ext In', 'in', 'jack-6.35-TS', 'unbalanced', 'line'),
    ...numbered(2, 'cv-exp', (i) => `CV/Exp ${i}`, 'expression', 'in', 'jack-6.35-TRS', () => ({
      alternates: [{ id: 'cv', label: 'CV in', domain: 'cv' }],
    })),
    ...elektronMidi(),
    usbDevice('usb', 'unknown', ['midi', 'audio', 'firmware'], {
      version: '2.0',
      audio: { inChannels: null, outChannels: null, compliance: 'class-compliant' },
    }, { notes: 'Isolated USB 2.0. Overbridge streams 4 voices, ext in and main to separate DAW tracks.' }),
    dcIn('dc-barrel-5.5x2.5'),
  ],
  internalPaths: [processPath('ext-in-mix', ['in-ext-l', 'in-ext-r'], ['out-main-l', 'out-main-r'])],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: 1250, peakMa: 1667, plug: ELEKTRON_DC, included: true, suppliedModelId: ELEKTRON_PSU }],
    typicalW: 15,
    maxW: 20,
    mainsRegion: 'unknown',
  },
  midi: { channelsRx: 'per-track', clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'dinsync24'], notes: 'Master-capable.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'primary', needsDisplayVisibility: true },
  provenance: {
    ...Object.fromEntries(
      [1, 2, 3, 4].map((i) => [`connectors[out-voice-${i}].channel`, p('estimated', 'Mono vs. stereo-pair wiring to verify (⚠).')]),
    ),
    'connectors[phones]': p('estimated', 'Headphone out not in the retrieved spec.'),
    'connectors[usb].jack': p('unknown', 'USB receptacle type not stated in the reference.'),
    'connectors[usb].usb.audio': p('unknown', 'Class-compliant channel count not stated.'),
    'power.sources.0.drawMa': est(15, 12),
    'power.sources.0.peakMa': p('estimated', 'Derived: 20 W max / 12 V.'),
  },
}); // prettier-ignore

export const digitoneII: GearModel = gear({
  id: 'gear-elektron-digitone-ii',
  manufacturer: 'Elektron',
  name: 'Digitone II',
  category: 'synth',
  formFactor: 'desktop',
  tags: ['elektron', 'overbridge'],
  dimensions: { w: 215, d: 176, h: 63, weightKg: 1.48, heightIncludesKnobsFeet: true },
  mounting: { vesa: 100 },
  connectors: [
    ...pair('out-main', 'Main', 'out', 'jack-6.35-TRS', 'imp-balanced', 'line'),
    ...pair('in', 'In', 'in', 'jack-6.35-TRS', 'balanced', 'line'),
    phones('phones', 'Headphones', 'jack-6.35-TRS'),
    ...elektronMidi(),
    usbDevice('usb', 'usb-b-f', ['midi', 'audio', 'firmware'], {
      version: '2.0',
      audio: { inChannels: 2, outChannels: 2, compliance: 'class-compliant' },
    }, { notes: 'Overbridge multitrack.' }),
    dcIn('dc-barrel-5.5x2.5'),
  ],
  internalPaths: [processPath('in-mix', ['in-l', 'in-r'], ['out-main-l', 'out-main-r'])],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: 1000, plug: ELEKTRON_DC, included: true, suppliedModelId: ELEKTRON_PSU }],
    typicalW: 12,
    mainsRegion: 'unknown',
  },
  midi: { channelsRx: 'per-track', clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'dinsync24'] },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'primary', needsDisplayVisibility: true },
  notes: '100 × 100 mm VESA mount holes.',
  provenance: {
    'connectors[usb].usb.audio': p('estimated', 'Class-compliant channel count from spec Appendix E (2 in / 2 out).'),
  },
}); // prettier-ignore

export const octatrack: GearModel = gear({
  id: 'gear-elektron-octatrack-mkii',
  manufacturer: 'Elektron',
  name: 'Octatrack',
  variant: 'MKII',
  category: 'sampler',
  formFactor: 'desktop',
  tags: ['elektron'],
  dimensions: { w: 340, d: 185, h: 63, weightKg: 2.3, heightIncludesKnobsFeet: true },
  connectors: [
    ...pair('out-main', 'Main', 'out', 'jack-6.35-TRS', 'imp-balanced', 'line'),
    ...pair('out-cue', 'Cue', 'out', 'jack-6.35-TRS', 'imp-balanced', 'line'),
    phones('phones', 'Headphones', 'unknown'),
    ...pair('in-ab', 'In A/B', 'in', 'jack-6.35-TRS', 'balanced', 'line').map((x, i) => ({ ...x, label: i ? 'In B' : 'In A' })),
    ...pair('in-cd', 'In C/D', 'in', 'jack-6.35-TRS', 'balanced', 'line').map((x, i) => ({ ...x, label: i ? 'In D' : 'In C' })),
    midiIn(),
    midiOut(),
    midiThru(),
    usbDevice('usb', 'unknown', ['midi', 'data', 'firmware'], { version: '2.0' }, { notes: 'MIDI and CF-card file transfer.' }),
    dcIn('dc-barrel-5.5x2.5'),
  ],
  internalPaths: [
    processPath('in-ab-main', ['in-ab-l', 'in-ab-r'], ['out-main-l', 'out-main-r']),
    processPath('in-cd-main', ['in-cd-l', 'in-cd-r'], ['out-main-l', 'out-main-r']),
  ],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: 583, plug: ELEKTRON_DC, included: true, suppliedModelId: ELEKTRON_PSU }],
    typicalW: 7,
    mainsRegion: 'unknown',
  },
  midi: {
    channelsRx: 'per-track',
    tracks: Array.from({ length: 8 }, (_, i) => ({ id: `t${i + 1}`, label: `MIDI track ${i + 1}` })),
    clockIn: true,
    clockOut: true,
  },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi'], notes: 'No DIN sync listed.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'primary', needsDisplayVisibility: true },
  notes: 'CF-card storage. Depth 184–185 mm across sources.',
  provenance: {
    'dimensions.d': p('datasheet', 'Sources give 184–185 mm; larger value used.'),
    'connectors[phones].jack': p('unknown', 'Headphone jack size not stated.'),
    'connectors[usb].jack': p('unknown', 'USB receptacle type not stated in the reference.'),
    'power.sources.0.drawMa': est(7, 12),
  },
}); // prettier-ignore

const PATCH_NOTE = 'Patch point (CV, gate or audio). Individual labels not in the reference; rename from the panel.';

export const neutron: GearModel = gear({
  id: 'gear-behringer-neutron',
  manufacturer: 'Behringer',
  name: 'Neutron',
  category: 'synth',
  formFactor: 'desktop',
  tags: ['behringer', 'semi-modular', 'eurorack-width'],
  dimensions: { w: 424, d: 136, h: 94, weightKg: 2.0, heightIncludesKnobsFeet: true, eurorack: { hp: 80 } },
  connectors: [
    mono('out', 'Output', 'out', 'jack-6.35', 'unbalanced', 'line'),
    phones('phones', 'Headphones', 'jack-6.35', { notes: 'Own level knob.' }),
    mono('in-ext', 'Ext In', 'in', 'jack-6.35', 'unbalanced', 'line'),
    midiIn(),
    midiThru('midi-thru', 'MIDI Thru', 'soft'),
    usbDevice('usb', 'usb-b-f', ['midi']),
    dcIn('unknown'),
    ...onFace('top', numbered(24, 'patch-out', (i) => `Patch out ${i}`, 'cv', 'out', 'jack-3.5', () => ({ notes: PATCH_NOTE }))),
    ...onFace('top', numbered(32, 'patch-in', (i) => `Patch in ${i}`, 'cv', 'in', 'jack-3.5', () => ({ notes: PATCH_NOTE }))),
  ],
  internalPaths: [processPath('ext-in', ['in-ext'], ['out'])],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: null, plug: { type: 'barrel', odMm: null, idMm: null, polarity: 'center-positive' }, included: true, suppliedModelId: 'gear-behringer-neutron-psu' }],
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: false },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'], notes: 'LFO syncs to MIDI clock. Follower.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: '80 HP Eurorack width. Mounted on the separate stand with the Pro-800 and 2-XM.',
  provenance: {
    'power.sources.0.plug.polarity': p('datasheet', 'Centre-positive per one source; plug size not located.'),
    'connectors[out].jack': p('unknown', '¼" stated; TS/TRS not stated.'),
  },
}); // prettier-ignore

export const pro800: GearModel = gear({
  id: 'gear-behringer-pro-800',
  manufacturer: 'Behringer',
  name: 'Pro-800',
  category: 'synth',
  formFactor: 'desktop',
  tags: ['behringer', 'eurorack-width'],
  dimensions: { w: 424, d: 136, h: 97, weightKg: 1.65, heightIncludesKnobsFeet: true, eurorack: { hp: 80 } },
  connectors: [
    mono('out', 'Output', 'out', 'jack-6.35-TS', 'unbalanced', 'line', { signal: { balance: 'unbalanced', level: 'line', maxDbu: 5 } }),
    mono('out-audio', 'Audio Out (⅛")', 'out', 'jack-3.5-TS', 'unbalanced', 'line', { signal: { balance: 'unbalanced', level: 'line', maxDbu: 20 } }),
    phones('phones', 'Headphones', 'jack-3.5-TRS'),
    c('sync-in', 'Sync In', 'clock.pulse', 'in', 'jack-3.5', { clock: { format: 'pulse', canSlave: true, note: 'Format not located.' } }),
    c('cv-filter', 'Filter CV In', 'cv', 'in', 'jack-3.5'),
    c('footswitch', 'Footswitch', 'footswitch', 'in', 'jack-6.35'),
    midiIn(),
    midiOutThru('midi-out-thru', 'MIDI Out/Thru', 'Sources differ on labelling of the second DIN.'),
    usbDevice('usb', 'usb-b-f', ['midi'], {}, { notes: 'Class-compliant.' }),
    dcIn('unknown'),
  ],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: 1200, plug: { type: 'barrel', odMm: null, idMm: null, polarity: null }, included: true, suppliedModelId: 'gear-behringer-pro-800-psu' }],
    maxW: 14.4,
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'], notes: 'MIDI clock for arp/sequencer. 3.5 mm sync in format not located.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: '80 HP Eurorack width. Mounted on the separate stand.',
  provenance: {
    'power.sources.0.drawMa': p('datasheet', '12 V 1.2 A rating (adapter rating, used as upper bound).'),
  },
}); // prettier-ignore

export const twoXm: GearModel = gear({
  id: 'gear-behringer-2-xm',
  manufacturer: 'Behringer',
  name: '2-XM',
  category: 'synth',
  formFactor: 'desktop',
  tags: ['behringer', 'eurorack-width'],
  dimensions: { w: 424.4, d: 135.6, h: 94, weightKg: null, heightIncludesKnobsFeet: true, eurorack: { hp: 80 } },
  connectors: [
    ...pair('out-main', 'Out', 'out', 'jack-6.35', 'unbalanced', 'line', { notes: 'TS vs. TRS differs by source.' }),
    c('out-top', 'Stereo Out (top)', 'audio.analog', 'out', 'jack-3.5-TRS', { face: 'top', channel: { role: 'stereo' }, signal: { balance: 'n/a', level: 'line' } }),
    ...onFace('top', numbered(2, 'in-ext', (i) => `Ext audio in ${i}`, 'audio.analog', 'in', 'jack-3.5', () => ({ signal: { balance: 'unbalanced', level: 'line' } }))),
    ...onFace('top', numbered(14, 'patch-in', (i) => `Patch in ${i}`, 'cv', 'in', 'jack-3.5', () => ({ notes: PATCH_NOTE }))),
    ...onFace('top', numbered(16, 'patch-out', (i) => `Patch out ${i}`, 'cv', 'out', 'jack-3.5', () => ({ notes: PATCH_NOTE }))),
    midiIn(),
    midiThru(),
    usbDevice('usb', 'usb-b-f', ['midi', 'audio'], { audio: { inChannels: null, outChannels: null, compliance: 'unknown' } }, { notes: 'USB audio disputed: Sweetwater lists audio + MIDI, Thomann lists no digital output.' }),
    dcIn('unknown'),
  ],
  internalPaths: [processPath('ext-in', ['in-ext-1', 'in-ext-2'], ['out-main-l', 'out-main-r'])],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', drawMa: null, included: true, suppliedModelId: 'gear-behringer-2-xm-psu' }],
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true },
  clock: { canBeMaster: false, canBeSlave: false, formats: [], notes: 'No clock jacks.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: '80 HP Eurorack width. Mounted on the separate stand. Patch field: 32 × 3.5 mm (16 in / 16 out).',
  provenance: {
    'connectors[out-main-l].jack': p('unknown', 'TS vs. TRS differs by source (⚠).'),
    'connectors[out-main-r].jack': p('unknown', 'TS vs. TRS differs by source (⚠).'),
    'connectors[usb].usb.audio': p('unknown', 'Disputed between retailers (spec Appendix I.6).'),
  },
}); // prettier-ignore

export const nordWave2: GearModel = gear({
  id: 'gear-clavia-nord-wave-2',
  manufacturer: 'Clavia',
  name: 'Nord Wave 2',
  aliases: ['Nord Wave 2'],
  category: 'synth',
  formFactor: 'keyboard',
  tags: ['nord', 'keys'],
  dimensions: { w: 990, d: 295, h: 100, weightKg: 8.75, heightIncludesKnobsFeet: true, keyboard: { keys: 61, keyType: 'semi-weighted' } },
  connectors: [
    ...pair('out', 'Out', 'out', 'jack-6.35-TS', 'unbalanced', 'line'),
    phones('phones', 'Headphones', 'jack-6.35'),
    c('sustain', 'Sustain Pedal', 'footswitch', 'in', 'jack-6.35'),
    c('ctrl-pedal', 'Control Pedal', 'expression', 'in', 'jack-6.35-TRS'),
    c('in-monitor', 'Monitor In', 'audio.analog', 'in', 'jack-3.5', { channel: { role: 'stereo' }, signal: { balance: 'n/a', level: 'line' }, notes: 'Retailer-listed; absent from Nord\'s own spec page.' }),
    midiIn(),
    midiOut(),
    usbDevice('usb', 'usb-b-f', ['midi']),
  ],
  power: { sources: [], mainsRegion: 'unknown' },
  midi: { clockIn: true },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'], notes: 'Master clock syncs to incoming MIDI clock.' },
  ergonomics: { interaction: 'keys', defaultUsage: 'primary', needsDisplayVisibility: false },
  notes: '61-key. Power input not located.',
  provenance: {
    'dimensions.keyboard.keyType': p('unknown', 'Key action not in the reference.'),
    'power.sources': p('unknown', 'Power input not located.'),
    'connectors[in-monitor]': p('retailer', 'Monitor in listed by retailers only.'),
  },
}); // prettier-ignore

export const matrixBrute: GearModel = gear({
  id: 'gear-arturia-matrixbrute',
  manufacturer: 'Arturia',
  name: 'MatrixBrute',
  category: 'synth',
  formFactor: 'keyboard',
  tags: ['arturia', 'keys', 'cv'],
  dimensions: { w: 860, d: 432, h: 107, weightKg: 23.0, heightIncludesKnobsFeet: true, keyboard: { keys: 49, keyType: 'full' } },
  connectors: [
    ...pair('out', 'Out', 'out', 'jack-6.35', 'unbalanced', 'line'),
    mono('in-ext', 'Audio In', 'in', 'jack-6.35', 'unbalanced', 'line', { alternates: [{ id: 'inst', label: 'Instrument level' }] }),
    ...numbered(12, 'cv-out', (i) => `CV out ${i}`, 'cv', 'out', 'jack-3.5'),
    c('gate-out', 'Gate Out', 'gate', 'out', 'jack-3.5'),
    c('sync-out', 'Sync Out', 'clock.pulse', 'out', 'jack-3.5', { clock: { format: 'pulse', canMaster: true, note: 'Gate, Clock, 24 ppqn, 48 ppqn' } }),
    ...numbered(12, 'cv-in', (i) => `CV in ${i}`, 'cv', 'in', 'jack-3.5'),
    c('gate-in', 'Gate In', 'gate', 'in', 'jack-3.5'),
    c('sync-in', 'Sync In', 'clock.pulse', 'in', 'jack-3.5', { clock: { format: 'pulse', canSlave: true, note: 'Gate, Clock, 24 ppqn, 48 ppqn' } }),
    ...numbered(2, 'exp', (i) => `Expression ${i}`, 'expression', 'in', 'jack-6.35-TRS'),
    c('sustain', 'Sustain Pedal', 'footswitch', 'in', 'jack-6.35'),
    midiIn(),
    midiOut(),
    midiThru(),
    usbDevice('usb', 'usb-b-f', ['midi']),
    iecIn(),
  ],
  internalPaths: [processPath('ext-in', ['in-ext'], ['out-l', 'out-r'])],
  power: {
    sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true }],
    maxW: 45,
    mainsRegion: 'auto-100-240',
  },
  midi: { clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'pulse-24ppqn', 'pulse-48ppqn'], notes: 'Sync in/out: Gate, Clock, 24 ppqn, 48 ppqn.' },
  ergonomics: { interaction: 'keys', defaultUsage: 'primary', needsDisplayVisibility: false },
  notes: '49-key. 12 CV in / 12 CV out.',
  dimsKind: 'datasheet',
  provenance: {
    'dimensions.weightKg': p('retailer', 'Thomann; may be packed weight (⚠).'),
    'dimensions.keyboard.keyType': p('unknown', 'Key action not in the reference.'),
    'connectors[out-l].jack': p('unknown', '¼" line; TS/TRS not stated.'),
    'connectors[out-r].jack': p('unknown', '¼" line; TS/TRS not stated.'),
  },
}); // prettier-ignore

export const rd8: GearModel = gear({
  id: 'gear-behringer-rd-8-mkii',
  manufacturer: 'Behringer',
  name: 'RD-8',
  variant: 'MKII',
  category: 'drum-machine',
  formFactor: 'desktop',
  tags: ['behringer'],
  dimensions: { w: 498, d: 265, h: 77, weightKg: 3.0, heightIncludesKnobsFeet: true },
  connectors: [
    mono('out-main', 'Main Out (mono)', 'out', 'jack-6.35-TRS', 'balanced', 'line'),
    ...numbered(11, 'out-voice', (i) => `Voice out ${i}`, 'audio.analog', 'out', 'jack-6.35-TS', () => ({
      signal: { balance: 'unbalanced', level: 'line' },
      notes: 'Individual voice output; voice names not in the reference.',
    })),
    phones('phones', 'Headphones', 'jack-6.35-TRS'),
    ...numbered(3, 'trig-out', (i) => `Trigger out ${i}`, 'gate', 'out', 'unknown', () => ({
      signal: { balance: 'n/a', level: 'gate-5v' },
      notes: '+5 V, 1 ms.',
    })),
    c('clock-out', 'Clock Out', 'clock.pulse', 'out', 'unknown', { clock: { format: 'pulse', canMaster: true, note: 'Jack type and PPQN not located.' } }),
    c('clock-in', 'Clock In', 'clock.pulse', 'in', 'unknown', { clock: { format: 'pulse', canSlave: true, note: 'Jack type and PPQN not located.' } }),
    midiIn(),
    midiOut(),
    midiThru(),
    usbDevice('usb', 'usb-b-f', ['midi'], {}, { notes: 'Class-compliant; also carries sync.' }),
    dcIn('unknown'),
  ],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 18, drawMa: 833, plug: { type: 'barrel', odMm: null, idMm: null, polarity: null }, included: true, suppliedModelId: 'gear-behringer-rd-8-psu' }],
    typicalW: 15,
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi'], notes: 'Sync modes: Internal / MIDI / USB / Clock. Clock jack PPQN not located.' },
  ergonomics: { interaction: 'pads', defaultUsage: 'primary', needsDisplayVisibility: true },
  notes: '18 V supply, not 12 V: can damage 12 V units if swapped.',
  provenance: { 'power.sources.0.drawMa': est(15, 18) },
}); // prettier-ignore

export const nordDrum3p: GearModel = gear({
  id: 'gear-clavia-nord-drum-3p',
  manufacturer: 'Clavia',
  name: 'Nord Drum 3P',
  category: 'drum-machine',
  formFactor: 'desktop',
  tags: ['nord'],
  dimensions: { w: 299, d: 281, h: 48.5, weightKg: 1.85, heightIncludesKnobsFeet: true },
  connectors: [
    ...pair('out', 'Out', 'out', 'jack-6.35', 'unbalanced', 'line'),
    phones('phones', 'Headphones', 'jack-3.5'),
    c('trig-in', 'Trigger In (kick pad)', 'gate', 'in', 'jack-6.35'),
    midiIn(),
    midiOut(),
    dcIn('unknown'),
  ],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', drawMa: null, included: true, suppliedModelId: 'gear-clavia-nord-drum-3p-psu' }],
    mainsRegion: 'unknown',
  },
  midi: { clockIn: false, notes: 'Notes, PC, CC only; no clock documented.' },
  ergonomics: { interaction: 'pads', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: 'Integrated six-pad surface. No USB port listed.',
}); // prettier-ignore

export const ep40: GearModel = gear({
  id: 'gear-te-ep-40-riddim',
  manufacturer: 'Teenage Engineering',
  name: 'EP-40 Riddim',
  category: 'sampler',
  formFactor: 'handheld',
  tags: ['teenage-engineering', 'ep-series'],
  dimensions: { w: null, d: null, h: null, weightKg: null, heightIncludesKnobsFeet: true },
  connectors: [
    c('out-line', 'Line Out', 'audio.analog', 'out', 'jack-3.5-TRS', { channel: { role: 'stereo' }, signal: { balance: 'n/a', level: 'line' } }),
    c('in-line', 'Line In', 'audio.analog', 'in', 'jack-3.5-TRS', { channel: { role: 'stereo' }, signal: { balance: 'n/a', level: 'line' } }),
    c('sync-out', 'Sync Out', 'clock.pulse', 'out', 'jack-3.5', { clock: { format: 'po-sync', canMaster: true, note: 'Pocket-Operator style (dual 8th note). A MIDI cable will not work.' } }),
    c('sync-in', 'Sync In', 'clock.pulse', 'in', 'jack-3.5', { clock: { format: 'po-sync', canSlave: true, note: 'Pocket-Operator style (dual 8th note).' } }),
    c('midi-in', 'MIDI In (TRS-A)', 'midi.trs-a', 'in', 'jack-3.5-TRS', { midi: { carries: ['notes', 'cc', 'clock', 'transport'], trsType: 'A' } }),
    c('midi-out', 'MIDI Out (TRS-A)', 'midi.trs-a', 'out', 'jack-3.5-TRS', { midi: { carries: ['notes', 'cc', 'clock', 'transport'], trsType: 'A' } }),
    usbDevice('usb', 'usb-c-f', ['midi', 'data', 'power'], { busPowered: true, drawsBusPowerMa: null }, { notes: 'MIDI, sample transfer and power.' }),
  ],
  power: {
    sources: [
      { kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: false },
      { kind: 'battery', drawMa: null, included: false, maxVoltageNote: '4 × AAA' },
    ],
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'po-sync'], notes: 'Clock via TRS-A MIDI and USB; analog sync is Pocket-Operator style.' },
  ergonomics: { interaction: 'pads', defaultUsage: 'secondary', needsDisplayVisibility: true },
  notes: 'No DIN: TRS-A adapters needed. Built-in speaker and mic.',
}); // prettier-ignore

export const instrumentModels = [analogHeat, analogFour, digitoneII, octatrack, neutron, pro800, twoXm, nordWave2, matrixBrute, rd8, nordDrum3p, ep40];
