// Reference §1.4–1.6: effects, dynamics, mixers, interfaces, routing, controllers (devices 13–29).
import type { Connector, GearModel, InternalPath } from '../../src/domain/types.ts';
import { RACK_PANEL_WIDTH_MM, RACK_UNIT_MM } from '../../src/domain/units.ts';
import {
  c,
  dcIn,
  gear,
  iecIn,
  MIDI_ALL,
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

const rack1U = (d: number | null, weightKg: number | null) => ({
  w: RACK_PANEL_WIDTH_MM,
  d,
  h: RACK_UNIT_MM,
  weightKg,
  heightIncludesKnobsFeet: false,
  rack: { u: 1, earsIncluded: true },
});
const RACK_PROV = {
  'dimensions.w': p('datasheet', '19" rack panel.'),
  'dimensions.h': p('datasheet', '1U.'),
};

/** Dual-channel balanced I/O with XLR and ¼" TRS wired in parallel (dbx, Composer, Ultrafex). */
function dualXlrTrs(kind: 'in' | 'out'): Connector[] {
  const label = kind === 'in' ? 'In' : 'Out';
  const balance = 'balanced' as const;
  return [1, 2].flatMap((ch) => {
    const xlr = mono(`${kind}-${ch}-xlr`, `${label} ${ch} (XLR)`, kind, kind === 'in' ? 'xlr-f' : 'xlr-m', balance, '+4dBu', {
      channel: { role: 'numbered', index: ch },
    });
    const trs = mono(`${kind}-${ch}-trs`, `${label} ${ch} (TRS)`, kind, 'jack-6.35-TRS', balance, '+4dBu', {
      channel: { role: 'numbered', index: ch },
    });
    if (kind === 'in') {
      xlr.exclusiveWith = [trs.id];
      trs.exclusiveWith = [xlr.id];
      xlr.notes = trs.notes = 'XLR and TRS inputs are wired in parallel; use one.';
    } else xlr.notes = trs.notes = 'XLR and TRS outputs are wired in parallel.';
    return [xlr, trs];
  });
}
const dualPaths = (): InternalPath[] =>
  [1, 2].map((ch) => ({
    id: `ch${ch}`,
    from: [`in-${ch}-xlr`, `in-${ch}-trs`],
    to: [`out-${ch}-xlr`, `out-${ch}-trs`],
    mode: 'process',
  }));

export const nightSky: GearModel = gear({
  id: 'gear-strymon-nightsky',
  manufacturer: 'Strymon',
  name: 'NightSky',
  category: 'effect',
  formFactor: 'pedal',
  tags: ['strymon', 'reverb'],
  dimensions: { w: 178, d: 114, h: 44, weightKg: null, heightIncludesKnobsFeet: false },
  connectors: [
    ...pair('out', 'Out', 'out', 'jack-6.35-TS', 'unbalanced', 'line', { notes: 'Low impedance.' }),
    ...pair('in', 'In', 'in', 'jack-6.35-TS', 'unbalanced', 'hi-z', { notes: 'Mono uses L only.' }),
    c('exp', 'EXP', 'expression', 'in', 'jack-6.35-TRS', {
      alternates: [{ id: 'midi', label: 'MIDI In (Strymon cable)', domain: 'midi.trs-a', note: 'Via Strymon MIDI EXP cable.' }],
    }),
    midiIn(),
    midiOut('midi-out', 'MIDI Out', { alternates: [{ id: 'thru', label: 'Pass-through', direction: 'thru' }] }),
    usbDevice('usb', 'unknown', ['midi', 'firmware']),
    dcIn('dc-barrel-5.5x2.1'),
  ],
  internalPaths: [processPath('fx', ['in-l', 'in-r'], ['out-l', 'out-r'])],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 9, voltageMaxV: 9, drawMa: 300, plug: { type: 'barrel', odMm: 5.5, idMm: 2.1, polarity: 'center-negative' }, included: true, suppliedModelId: 'gear-strymon-nightsky-psu', maxVoltageNote: 'Maximum 9 V' }],
    maxW: 2.7,
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'] },
  ergonomics: { interaction: 'footswitch', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: 'Body height 44 mm; about 63 mm with footswitches. 8-step sequencer. Opposite polarity to Elektron/Eventide supplies.',
  provenance: { 'power.sources.0.drawMa': p('datasheet', '≥300 mA required; used as the draw.') },
}); // prettier-ignore

export const h90: GearModel = gear({
  id: 'gear-eventide-h90',
  manufacturer: 'Eventide',
  name: 'H90',
  category: 'effect',
  formFactor: 'pedal',
  tags: ['eventide'],
  dimensions: { w: 170, d: 136, h: 68, weightKg: 0.84, heightIncludesKnobsFeet: true },
  connectors: [
    ...numbered(4, 'out', (i) => `Out ${i}`, 'audio.analog', 'out', 'jack-6.35-TS', () => ({ signal: { balance: 'unbalanced', level: 'line' } })),
    ...numbered(4, 'in', (i) => `In ${i}`, 'audio.analog', 'in', 'jack-6.35-TS', () => ({ signal: { balance: 'unbalanced', level: 'instrument' } })),
    ...numbered(2, 'exp', (i) => `Exp/Aux ${i}`, 'expression', 'in', 'jack-6.35', () => ({ alternates: [{ id: 'aux', label: 'Aux switch', domain: 'footswitch' }] })),
    phones('phones', 'Headphones', 'unknown', { notes: 'Listed only in the reference\'s open items (jack size); verify that it exists.' }),
    midiIn(),
    midiOutThru('midi-out-thru', 'MIDI Out/Thru'),
    usbDevice('usb', 'usb-c-f', ['midi', 'data', 'firmware'], {}, { notes: 'Control, updates, MIDI. Bluetooth control on macOS/iPadOS.' }),
    dcIn('dc-barrel-5.5x2.5'),
  ],
  internalPaths: [
    { id: 'stereo', from: ['in-1', 'in-2', 'in-3', 'in-4'], to: ['out-1', 'out-2', 'out-3', 'out-4'], mode: 'process', channelMap: [1, 2, 3, 4].map((i) => ({ from: `in-${i}`, to: `out-${i}` })), condition: '2 stereo paths or dual-path routing' },
  ],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, voltageMinV: 9, voltageMaxV: 12, drawMa: 600, peakMa: 800, plug: { type: 'barrel', odMm: 5.5, idMm: 2.5, polarity: 'center-positive' }, included: true, suppliedModelId: 'gear-eventide-h90-psu' }],
    maxW: 7.2,
    inrushNote: 'Startup spike above running current.',
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'], notes: 'MIDI clock or tap tempo.' },
  ergonomics: { interaction: 'footswitch', defaultUsage: 'secondary', needsDisplayVisibility: true },
  notes: 'Eventide: 600 mA at 12 V, 800 mA at 9 V. Supplied PSU 12 V 1 A.',
  provenance: {
    'power.sources.0.peakMa': p('datasheet', '800 mA is the 9 V draw, used as the peak.'),
    'connectors[phones]': p('unknown', 'Existence not confirmed by the connectivity table.'),
  },
}); // prettier-ignore

export const dbx166xl: GearModel = gear({
  id: 'gear-dbx-166xl',
  manufacturer: 'dbx',
  name: '166XL',
  category: 'dynamics',
  formFactor: 'rack',
  tags: ['rack', 'compressor'],
  dimensions: rack1U(172, 2.29),
  mounting: { rackEars: true },
  connectors: [
    ...dualXlrTrs('in'),
    ...dualXlrTrs('out'),
    ...numbered(2, 'sidechain', (i) => `Sidechain ${i}`, 'audio.analog', 'bidir', 'jack-6.35-TRS', () => ({
      insert: { tip: 'return', ring: 'send' },
      signal: { balance: 'unbalanced', level: 'line' },
    })),
    iecIn(),
  ],
  internalPaths: dualPaths(),
  power: { sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true }], maxW: 15, mainsRegion: 'unknown' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
  notes: 'Mains: 100–120 V 60 Hz or 230 V 50 Hz depending on the unit. Check the rear-panel rating.',
  provenance: { ...RACK_PROV, 'power.mainsRegion': p('unknown', 'Depends on the unit; check the rear panel.') },
}); // prettier-ignore

export const mdx2100: GearModel = gear({
  id: 'gear-behringer-composer-mdx2100',
  manufacturer: 'Behringer',
  name: 'Composer',
  variant: 'MDX2100',
  aliases: ['MDX2100'],
  category: 'dynamics',
  formFactor: 'rack',
  tags: ['rack', 'compressor'],
  dimensions: rack1U(null, null),
  mounting: { rackEars: true },
  connectors: [
    ...dualXlrTrs('in'),
    ...dualXlrTrs('out'),
    ...numbered(2, 'key', (i) => `Key/Sidechain ${i}`, 'audio.analog', 'in', 'unknown', () => ({ notes: 'Type and wiring not verified on this model.' })),
    iecIn(),
  ],
  internalPaths: dualPaths(),
  power: { sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true }], typicalW: null, mainsRegion: 'unknown' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
  notes: 'Internal transformer. US units are often fixed at 115 V; some are switchable 100/240 V. Check before plugging into 230 V mains.',
  provenance: { ...RACK_PROV, 'power.mainsRegion': p('unknown', 'Possibly 115 V-only (US unit); verify.') },
}); // prettier-ignore

export const vitalizerSx2: GearModel = gear({
  id: 'gear-spl-vitalizer-sx2',
  manufacturer: 'SPL',
  name: 'Vitalizer',
  variant: 'SX 2',
  category: 'effect',
  formFactor: 'rack',
  tags: ['rack', 'enhancer'],
  dimensions: { w: RACK_PANEL_WIDTH_MM, d: null, h: null, weightKg: null, heightIncludesKnobsFeet: false },
  mounting: { rackEars: true },
  connectors: [
    ...pair('in', 'In', 'in', 'xlr-f', 'balanced', '+4dBu'),
    ...pair('out', 'Out', 'out', 'xlr-m', 'balanced', '+4dBu'),
    iecIn(),
  ],
  internalPaths: [processPath('fx', ['in-l', 'in-r'], ['out-l', 'out-r'])],
  power: { sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true }], typicalW: null, mainsRegion: 'unknown' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
  notes: 'Early-to-mid-1990s unit. Internal ring transformer; voltage selector unconfirmed: check before plugging in. Possibly 1U like other Vitalizers (not verified).',
  provenance: {
    'dimensions.w': p('datasheet', '19" rack panel.'),
    'dimensions.h': p('unknown', 'Rack height not located; likely 1U (unverified).'),
    'connectors[in-l]': p('user', 'XLR confirmed by owner review; ¼" jacks not confirmed.'),
    'connectors[ac-in].jack': p('estimated', 'IEC likely.'),
  },
}); // prettier-ignore

export const ultrafex: GearModel = gear({
  id: 'gear-behringer-ultrafex-ii-ex3100',
  manufacturer: 'Behringer',
  name: 'Ultrafex II',
  variant: 'EX3100',
  aliases: ['EX3100'],
  category: 'effect',
  formFactor: 'rack',
  tags: ['rack', 'enhancer'],
  dimensions: rack1U(null, null),
  mounting: { rackEars: true },
  connectors: [...dualXlrTrs('in'), ...dualXlrTrs('out'), c('ac-in', 'Mains', 'power.ac', 'in', 'unknown')],
  internalPaths: dualPaths(),
  power: { sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', included: true }], typicalW: null, mainsRegion: 'unknown' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
  provenance: { ...RACK_PROV, 'dimensions.h': p('retailer', '1U per retailers; verify.') },
}); // prettier-ignore

export const ssl12: GearModel = gear({
  id: 'gear-ssl-12',
  manufacturer: 'Solid State Logic',
  name: 'SSL 12',
  aliases: ['SSL12'],
  category: 'interface',
  formFactor: 'desktop',
  tags: ['interface', 'usb-audio'],
  dimensions: { w: 286.7, d: 154.9, h: 58.7, weightKg: 1.4, heightIncludesKnobsFeet: true },
  connectors: [
    ...numbered(4, 'in', (i) => `Input ${i}`, 'audio.analog', 'in', 'combo-xlr-trs', () => ({ signal: { balance: 'balanced', level: 'mic', phantom: 'switchable' }, alternates: [{ id: 'line', label: 'Line' }] })),
    ...numbered(2, 'inst', (i) => `Instrument ${i}`, 'audio.analog', 'in', 'jack-6.35', () => ({ face: 'front', signal: { balance: 'unbalanced', level: 'hi-z' }, notes: 'Hi-Z input for channels 1–2.' })),
    ...numbered(4, 'out', (i) => `Line Out ${i}`, 'audio.analog', 'out', 'jack-6.35-TRS', () => ({ signal: { balance: 'balanced', level: 'line' }, notes: 'DC-coupled; usable for CV.' })),
    ...[1, 2].map((i) => phones(`phones-${i}`, `Headphones ${String.fromCharCode(64 + i)}`, 'jack-6.35', {
      face: 'front',
      alternates: [{ id: 'line', label: 'Mono line out', domain: 'audio.analog', note: 'Re-assignable as a mono line out (8 outs total).' }],
    })),
    c('adat-in', 'ADAT In', 'audio.adat', 'in', 'toslink-f', { channel: { role: 'numbered', bus: 'adat' }, notes: '8 channels. No ADAT out.' }),
    midiIn(),
    midiOut(),
    usbDevice('usb', 'usb-c-f', ['audio', 'midi', 'power'], {
      version: '2.0',
      busPowered: true,
      drawsBusPowerMa: null,
      audio: { inChannels: 12, outChannels: 8, compliance: 'class-compliant', maxRateHz: 192000 },
    }, { notes: 'USB 2.0 protocol; designed for a USB 3.0 port for bus power. Loopback.' }),
  ],
  internalPaths: [
    { id: 'analog-to-host', from: ['in-1', 'in-2', 'in-3', 'in-4', 'inst-1', 'inst-2', 'adat-in'], to: ['usb'], mode: 'host-bridge' },
    { id: 'host-to-analog', from: ['usb'], to: ['out-1', 'out-2', 'out-3', 'out-4', 'phones-1', 'phones-2'], mode: 'host-bridge' },
    { id: 'midi-to-host', from: ['midi-in'], to: ['usb'], mode: 'host-bridge' },
    { id: 'host-to-midi', from: ['usb'], to: ['midi-out'], mode: 'host-bridge' },
  ],
  power: {
    sources: [{ kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true }],
    mainsRegion: 'unknown',
  },
  midi: { notes: 'MIDI In/Out exposed to the host over USB.' },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['adat'], notes: 'Can lock to ADAT input.' },
  audio: { sampleRatesHz: [44100, 48000, 88200, 96000, 176400, 192000], adatMaxHzNote: 'ADAT input runs at 44.1/48 kHz from the ADA8200.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: 'Bus-powered; power switch on the unit; talkback mic built in. Keep off unpowered hubs.',
  provenance: {
    'audio.sampleRatesHz': p('estimated', 'Reference states "up to 192 kHz"; intermediate rates assumed.'),
    'connectors[usb].usb.drawsBusPowerMa': p('unknown', 'Designed for a USB 3.0 port (900 mA nominal); actual draw not located.'),
  },
}); // prettier-ignore

const stereo35 = (id: string, label: string, direction: 'in' | 'out') =>
  c(id, label, 'audio.analog', direction, 'jack-3.5-TRS', { channel: { role: 'stereo' }, signal: { balance: 'n/a', level: 'line' } });

export const sidekick: GearModel = gear({
  id: 'gear-te-ep-136-ko-sidekick',
  manufacturer: 'Teenage Engineering',
  name: 'EP-136 K.O. Sidekick',
  aliases: ['Sidekick'],
  category: 'mixer',
  formFactor: 'handheld',
  tags: ['teenage-engineering', 'ep-series', 'usb-audio'],
  dimensions: { w: 240, d: 88, h: 16, weightKg: 0.3, heightIncludesKnobsFeet: true },
  mounting: { pegs: 'Clips onto EP-series units with pegs' },
  connectors: [
    stereo35('out-main', 'Main Out', 'out'),
    stereo35('out-cue', 'Cue Out', 'out'),
    stereo35('in-1', 'Channel 1 In', 'in'),
    stereo35('in-2', 'Channel 2 In', 'in'),
    stereo35('in-aux', 'Aux In', 'in'),
    usbDevice('usb', 'usb-c-f', ['audio', 'midi', 'power'], {
      busPowered: true,
      drawsBusPowerMa: null,
      audio: { inChannels: 8, outChannels: 4, compliance: 'class-compliant' },
    }, { notes: 'Bidirectional USB MIDI.' }),
  ],
  internalPaths: [{ id: 'mix', from: ['in-1', 'in-2', 'in-aux'], to: ['out-main'], mode: 'sum' }, { id: 'cue', from: ['in-1', 'in-2'], to: ['out-cue'], mode: 'split' }],
  power: {
    sources: [
      { kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: false },
      { kind: 'battery', drawMa: null, included: false, maxVoltageNote: '2 × AAA' },
    ],
    mainsRegion: 'unknown',
  },
  midi: { notes: 'Clock via USB MIDI; beat-match per channel.' },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'] },
  ergonomics: { interaction: 'fader', defaultUsage: 'secondary', needsDisplayVisibility: false },
}); // prettier-ignore

function mixWizardConnectors(): Connector[] {
  const channels = Array.from({ length: 16 }, (_, k) => k + 1).flatMap((i) => [
    mono(`ch${i}-mic`, `CH ${i} Mic`, 'in', 'xlr-f', 'balanced', 'mic', { channel: { role: 'numbered', index: i }, signal: { balance: 'balanced', level: 'mic', phantom: 'switchable' }, exclusiveWith: [`ch${i}-line`] }),
    mono(`ch${i}-line`, `CH ${i} Line`, 'in', 'jack-6.35-TRS', 'balanced', 'line', { channel: { role: 'numbered', index: i } }),
    c(`ch${i}-insert`, `CH ${i} Insert`, 'audio.analog', 'bidir', 'jack-6.35-TRS', { channel: { role: 'numbered', index: i }, insert: {} }),
    mono(`ch${i}-direct`, `CH ${i} Direct Out`, 'out', 'jack-6.35', 'balanced', 'line', { channel: { role: 'numbered', index: i } }),
  ]);
  return [
    ...channels,
    ...numbered(6, 'aux', (i) => `Aux ${i} Send`, 'audio.analog', 'out', 'jack-6.35-TRS', () => ({ signal: { balance: 'balanced', level: 'line' } })),
    ...pair('ret1', 'Stereo Return 1', 'in', 'jack-6.35-TRS', 'balanced', 'line'),
    ...pair('ret2', 'Stereo Return 2', 'in', 'jack-6.35-TRS', 'balanced', 'line'),
    ...pair('out-main', 'Main Out', 'out', 'xlr-m', 'balanced', '+4dBu'),
    mono('out-mono', 'Mono Master Out', 'out', 'xlr-m', 'balanced', '+4dBu'),
    ...numbered(2, 'out-ab', (i) => `A/B Out ${i}`, 'audio.analog', 'out', 'jack-6.35-TRS', () => ({ signal: { balance: 'balanced', level: 'line' } })),
    ...(['l', 'r'] as const).map((s) => c(`insert-main-${s}`, `Main ${s.toUpperCase()} Insert`, 'audio.analog', 'bidir', 'jack-6.35-TRS', { channel: { role: s === 'l' ? 'L' : 'R', group: 'main' }, insert: {} })),
    ...onFace('front', [phones('phones', 'Headphones', 'jack-6.35'), ...pair('out-monitor', 'Local Monitor', 'out', 'jack-6.35', 'unbalanced', 'line')]),
    c('midi', 'MIDI (FX editor/control)', 'midi.din', 'in', 'unknown', { midi: { carries: ['pc', 'cc', 'sysex'] }, notes: 'Port type not confirmed.' }),
    iecIn(),
    dcIn('unknown', 'dc-backup', 'Backup PSU (MPS12)'),
  ];
}

export const mixWizard: GearModel = gear({
  id: 'gear-allen-heath-mixwizard-wz3-16-2',
  manufacturer: 'Allen & Heath',
  name: 'MixWizard',
  variant: 'WZ3 16:2',
  aliases: ['WZ3 16:2'],
  category: 'mixer',
  formFactor: 'desktop',
  tags: ['mixer'],
  dimensions: { w: 507, d: 530, h: 194, weightKg: 10, heightIncludesKnobsFeet: true, rack: { u: 10, earsIncluded: true, depthBehindEarsMm: 122 } },
  mounting: { rackEars: true },
  connectors: mixWizardConnectors(),
  internalPaths: [
    { id: 'channels-to-main', from: Array.from({ length: 16 }, (_, k) => [`ch${k + 1}-mic`, `ch${k + 1}-line`]).flat().concat(['ret1-l', 'ret1-r', 'ret2-l', 'ret2-r']), to: ['out-main-l', 'out-main-r', 'out-mono', 'out-ab-1', 'out-ab-2', 'phones', 'out-monitor-l', 'out-monitor-r'], mode: 'sum', channelMap: [{ from: 'ret1-l', to: 'out-main-l' }, { from: 'ret1-r', to: 'out-main-r' }, { from: 'ret2-l', to: 'out-main-l' }, { from: 'ret2-r', to: 'out-main-r' }] },
    { id: 'aux-sends', from: Array.from({ length: 16 }, (_, k) => [`ch${k + 1}-mic`, `ch${k + 1}-line`]).flat(), to: ['aux-1', 'aux-2', 'aux-3', 'aux-4', 'aux-5', 'aux-6'], mode: 'sum' },
    ...Array.from({ length: 16 }, (_, k): InternalPath => ({ id: `ch${k + 1}-insert`, from: [`ch${k + 1}-mic`, `ch${k + 1}-line`], to: [`ch${k + 1}-insert`], mode: 'insert-normal', condition: 'Insert send/return before the channel fader' })),
    ...Array.from({ length: 16 }, (_, k): InternalPath => ({ id: `ch${k + 1}-direct`, from: [`ch${k + 1}-mic`, `ch${k + 1}-line`], to: [`ch${k + 1}-direct`], mode: 'split' })),
    { id: 'main-insert', from: ['out-main-l', 'out-main-r'], to: ['insert-main-l', 'insert-main-r'], mode: 'insert-normal', channelMap: [{ from: 'out-main-l', to: 'insert-main-l' }, { from: 'out-main-r', to: 'insert-main-r' }] },
  ],
  power: {
    sources: [
      { kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true },
      { kind: 'optional-dc', inputConnectorId: 'dc-backup', drawMa: null, included: false, maxVoltageNote: 'Optional MPS12 backup PSU' },
    ],
    maxW: 45,
    mainsRegion: 'auto-100-240',
    inrushNote: 'T630 mA fuse.',
  },
  ergonomics: { interaction: 'fader', defaultUsage: 'primary', needsDisplayVisibility: false },
  notes: 'Free-standing 507 × 530 × 194 mm. Rack-mount: 10U with underside connectors (444 mm, 122 mm deep) or 11.2U with rear connectors (497 mm, 193 mm deep). USB option only on the WZ4.',
  provenance: {
    'dimensions.rack': p('datasheet', '10U (underside connectors); 11.2U with rear connectors.'),
    'connectors[ch1-direct].jack': p('unknown', 'Direct out jack type not stated.'),
  },
}); // prettier-ignore

export const keyMix6: GearModel = gear({
  id: 'gear-spl-grapevine-keymix-6',
  manufacturer: 'SPL',
  name: 'Grapevine KeyMix 6',
  aliases: ['KeyMix 6'],
  category: 'mixer',
  formFactor: 'rack',
  tags: ['rack', 'mixer'],
  dimensions: rack1U(null, null),
  mounting: { rackEars: true },
  connectors: [
    mono('ch1-mic', 'CH 1 Mic', 'in', 'xlr-f', 'balanced', 'mic', { face: 'front', signal: { balance: 'balanced', level: 'mic', phantom: 'switchable' }, channel: { role: 'numbered', index: 1 } }),
    mono('ch2', 'CH 2 Mono/Mic', 'in', 'jack-6.35-TRS', 'balanced', 'line', { channel: { role: 'numbered', index: 2 } }),
    mono('ch3', 'CH 3 Mono', 'in', 'jack-6.35-TS', 'unbalanced', 'line', { channel: { role: 'numbered', index: 3 } }),
    ...[4, 5, 6].flatMap((i) => pair(`ch${i}`, `CH ${i}`, 'in', 'jack-6.35-TS', 'unbalanced', 'line')),
    ...pair('out-master', 'Master Out', 'out', 'jack-6.35-TRS', 'balanced', 'line'),
    ...pair('out-monitor', 'Monitor/Phones', 'out', 'jack-6.35', 'unbalanced', 'line').map((x) =>
      x.id === 'out-monitor-r' ? { ...x, alternates: [{ id: 'phones', label: 'Headphones', domain: 'audio.headphone' as const, note: 'Headphones go in the right jack.' }] } : x,
    ),
    c('insert-mic', 'Mic Insert', 'audio.analog', 'bidir', 'jack-6.35-TRS', { insert: {} }),
    ...(['l', 'r'] as const).map((s) => c(`insert-main-${s}`, `Main Insert ${s.toUpperCase()}`, 'audio.analog', 'bidir', 'jack-6.35-TRS', { insert: {}, channel: { role: s === 'l' ? 'L' : 'R', group: 'main' }, notes: 'Intended for processors such as a Vitalizer.' })),
    iecIn(),
  ],
  internalPaths: [
    { id: 'mix', from: ['ch1-mic', 'ch2', 'ch3', 'ch4-l', 'ch4-r', 'ch5-l', 'ch5-r', 'ch6-l', 'ch6-r'], to: ['out-master-l', 'out-master-r', 'out-monitor-l', 'out-monitor-r'], mode: 'sum' },
    { id: 'mic-insert', from: ['ch1-mic'], to: ['insert-mic'], mode: 'insert-normal' },
    { id: 'main-insert', from: ['out-master-l', 'out-master-r'], to: ['insert-main-l', 'insert-main-r'], mode: 'insert-normal', channelMap: [{ from: 'out-master-l', to: 'insert-main-l' }, { from: 'out-master-r', to: 'insert-main-r' }] },
  ],
  power: { sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true }], typicalW: null, mainsRegion: 'unknown' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: 'Ground-lift switch. Fuse rating conflicts across SPL documents (63 mA vs. 125 mA).',
  provenance: RACK_PROV,
}); // prettier-ignore

export const ada8200: GearModel = gear({
  id: 'gear-behringer-ada8200',
  manufacturer: 'Behringer',
  name: 'Ultragain Digital ADA8200',
  aliases: ['ADA8200'],
  category: 'converter',
  formFactor: 'rack',
  tags: ['rack', 'adat'],
  dimensions: rack1U(null, null),
  mounting: { rackEars: true },
  connectors: [
    ...onFace('front', numbered(8, 'in', (i) => `Input ${i}`, 'audio.analog', 'in', 'combo-xlr-trs', () => ({ signal: { balance: 'balanced', level: 'mic', phantom: 'switchable' }, alternates: [{ id: 'line', label: 'Line' }] }))),
    ...numbered(8, 'out', (i) => `Line Out ${i}`, 'audio.analog', 'out', 'xlr-m', () => ({ signal: { balance: 'balanced', level: '+4dBu' } })),
    c('adat-out', 'ADAT Out', 'audio.adat', 'out', 'toslink-f', { notes: '8 ch, 24-bit, 44.1/48 kHz.' }),
    c('adat-in', 'ADAT In', 'audio.adat', 'in', 'toslink-f'),
    c('wordclock-in', 'Word Clock In', 'clock.word', 'in', 'bnc-f', { clock: { format: 'word', canSlave: true } }),
    iecIn(),
  ],
  internalPaths: [
    { id: 'ad', from: Array.from({ length: 8 }, (_, k) => `in-${k + 1}`), to: ['adat-out'], mode: 'process', channelMap: Array.from({ length: 8 }, (_, k) => ({ from: `in-${k + 1}`, to: `adat-out:${k + 1}` })) },
    { id: 'da', from: ['adat-in'], to: Array.from({ length: 8 }, (_, k) => `out-${k + 1}`), mode: 'process', channelMap: Array.from({ length: 8 }, (_, k) => ({ from: `adat-in:${k + 1}`, to: `out-${k + 1}` })) },
  ],
  power: { sources: [{ kind: 'internal-mains', inputConnectorId: 'ac-in', plug: { type: 'iec-c14' }, included: true }], typicalW: null, mainsRegion: 'unknown' },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['adat', 'word'], notes: 'Sync from internal (44.1/48 kHz), ADAT input or word clock input.' },
  audio: { sampleRatesHz: [44100, 48000], bitDepths: [24] },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
  notes: 'Feeding the SSL 12 (ADAT in only), its line outputs stay unused.',
  provenance: RACK_PROV,
}); // prettier-ignore

function px3000(): { connectors: Connector[]; internalPaths: InternalPath[] } {
  const connectors: Connector[] = [];
  const internalPaths: InternalPath[] = [];
  for (const face of ['front', 'rear'] as const) {
    for (const row of ['top', 'bottom'] as const) {
      for (let i = 1; i <= 24; i++) {
        connectors.push(
          c(`${face}-${row}-${i}`, `${face === 'front' ? 'Front' : 'Rear'} ${row} ${i}`, 'audio.analog', 'bidir', 'jack-6.35-TRS', {
            face: face === 'front' ? 'front' : 'back',
            signal: { balance: 'balanced', level: 'line' },
            channel: { role: 'numbered', index: i, group: `ch${i}` },
          }),
        );
      }
    }
  }
  for (let i = 1; i <= 24; i++) {
    const g = `ch${i}`;
    internalPaths.push(
      { id: `${g}-top`, from: [`rear-top-${i}`], to: [`front-top-${i}`], mode: 'passthrough' },
      { id: `${g}-bottom`, from: [`rear-bottom-${i}`], to: [`front-bottom-${i}`], mode: 'passthrough' },
      { id: `${g}-normal`, from: [`rear-top-${i}`], to: [`rear-bottom-${i}`], mode: 'insert-normal', group: g, presetId: 'normal', condition: 'Broken by a plug in either front jack' },
      { id: `${g}-half-normal`, from: [`rear-top-${i}`], to: [`rear-bottom-${i}`], mode: 'insert-normal', group: g, presetId: 'half-normal', condition: 'Broken only by a plug in the front bottom jack' },
    );
  }
  return { connectors, internalPaths };
}

export const px3000Model: GearModel = gear({
  id: 'gear-behringer-ultrapatch-pro-px3000',
  manufacturer: 'Behringer',
  name: 'Ultrapatch Pro PX3000',
  aliases: ['PX3000'],
  category: 'patchbay',
  formFactor: 'rack',
  tags: ['rack', 'patchbay'],
  dimensions: { ...rack1U(93, 1.8), h: 44.5 },
  mounting: { rackEars: true },
  ...px3000(),
  power: { sources: [], typicalW: 0, mainsRegion: 'unknown' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: '48-point balanced patchbay (24 channels × top/bottom), ¼" TRS front and rear. Modes per channel: Normal / Half-Normal / Thru, selected per setup via unitConfig.pathPresets[chN] ("thru" activates no normalling path).',
  provenance: { 'dimensions.w': p('datasheet', '19" rack panel.'), 'power.sources': p('datasheet', 'Passive.') },
}); // prettier-ignore

export const keyStep: GearModel = gear({
  id: 'gear-arturia-keystep',
  manufacturer: 'Arturia',
  name: 'KeyStep',
  variant: 'original 32-key',
  category: 'controller',
  formFactor: 'keyboard',
  tags: ['arturia', 'sequencer', 'cv', 'clock-converter'],
  dimensions: { w: null, d: null, h: null, weightKg: null, heightIncludesKnobsFeet: true, keyboard: { keys: 32, keyType: 'slim' } },
  connectors: [
    c('cv-pitch', 'Pitch CV', 'cv', 'out', 'jack-3.5', { cv: { standard: '1V/oct' } }),
    c('gate', 'Gate', 'gate', 'out', 'jack-3.5'),
    c('cv-mod', 'Mod CV', 'cv', 'out', 'jack-3.5', { cv: { standard: 'mod/velocity/aftertouch (assignable)' } }),
    c('sync-out', 'Sync Out', 'clock.pulse', 'out', 'jack-3.5', { clock: { format: 'pulse', canMaster: true, note: '1 pulse/step, 2 PPQ (Volca), 24 PPQ DIN, 48 PPQ DIN' } }),
    c('sync-in', 'Sync In', 'clock.pulse', 'in', 'jack-3.5', { clock: { format: 'pulse', canSlave: true, note: '1 pulse/step, 2 PPQ (Volca), 24 PPQ DIN, 48 PPQ DIN' } }),
    c('sustain', 'Sustain Pedal', 'footswitch', 'in', 'jack-6.35'),
    midiIn(),
    midiOut(),
    usbDevice('usb', 'usb-micro-b-f', ['midi', 'power'], { busPowered: true, drawsBusPowerMa: null }),
    dcIn('unknown', 'dc-in', 'DC In (optional 9 V)'),
  ],
  power: {
    sources: [
      { kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true },
      { kind: 'optional-dc', inputConnectorId: 'dc-in', nominalV: 9, drawMa: null, plug: { type: 'barrel', odMm: null, idMm: null, polarity: null }, included: false },
    ],
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: true },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'pulse-step', 'pulse-2ppqn', 'pulse-24ppqn', 'pulse-48ppqn', 'po-sync'], notes: 'Clock sources: internal, USB, MIDI or sync in. Works as a clock converter.' },
  ergonomics: { interaction: 'keys', defaultUsage: 'primary', needsDisplayVisibility: false },
  notes: '32 slim keys. Dimensions not located.',
  provenance: { 'clock.formats': p('estimated', 'po-sync assumed compatible with the 2 PPQ (Volca) mode; reference: "the KeyStep can convert clock formats".') },
}); // prettier-ignore

export const pyramid: GearModel = gear({
  id: 'gear-squarp-pyramid-mk3',
  manufacturer: 'Squarp',
  name: 'Pyramid',
  variant: 'MK3',
  category: 'sequencer',
  formFactor: 'desktop',
  tags: ['sequencer', 'cv', 'clock-master'],
  dimensions: { w: null, d: null, h: null, weightKg: null, heightIncludesKnobsFeet: true },
  connectors: [
    midiIn(),
    midiOut('midi-out-a', 'MIDI Out A'),
    midiOut('midi-out-b', 'MIDI Out B', {
      alternates: [
        { id: 'dinsync24', label: 'DIN sync 24', domain: 'clock.dinsync' },
        { id: 'dinsync48', label: 'DIN sync 48', domain: 'clock.dinsync' },
      ],
      clock: { format: 'midi', canMaster: true, note: 'DIN sync (Sync24/Sync48 etc.) selectable on Out B.' },
    }),
    c('cv-out', 'CV Out', 'cv', 'out', 'jack-3.5'),
    c('env-out', 'Env Out', 'cv', 'out', 'jack-3.5'),
    c('gate-out', 'Gate Out', 'gate', 'out', 'jack-3.5'),
    ...numbered(4, 'cv-in', (i) => `CV/Gate In ${i}`, 'cv', 'in', 'jack-3.5'),
    ...numbered(2, 'pedal', (i) => `Pedal ${i}`, 'footswitch', 'in', 'jack-6.35'),
    usbDevice('usb', 'usb-mini-b-f', ['midi', 'power'], { busPowered: true, drawsBusPowerMa: null }),
  ],
  power: { sources: [{ kind: 'usb-bus', inputConnectorId: 'usb', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: true }], mainsRegion: 'unknown' },
  midi: {
    tracks: Array.from({ length: 64 }, (_, i) => ({ id: `t${i + 1}`, label: `Track ${i + 1}` })),
    clockIn: true,
    clockOut: true,
  },
  clock: { canBeMaster: true, canBeSlave: true, formats: ['midi', 'dinsync24', 'dinsync48'], notes: 'Master-capable. Converts incoming MIDI clock to DIN sync on Out B.' },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'primary', needsDisplayVisibility: true },
  notes: 'Dimensions not located (MK1/MK2 front panel 206 × 268 mm). Number of CV/Gate/Env outputs not stated; one of each modelled.',
  provenance: {
    'midi.tracks': p('user', '64 tracks per spec §4.6.'),
    'connectors[cv-out]': p('estimated', 'Output count not stated in the reference.'),
  },
}); // prettier-ignore

export const mioXL: GearModel = gear({
  id: 'gear-iconnectivity-mioxl',
  manufacturer: 'iConnectivity',
  name: 'mioXL',
  category: 'midi-hub',
  formFactor: 'rack',
  tags: ['rack', 'midi'],
  dimensions: { ...rack1U(145, 1.9) },
  mounting: { rackEars: true },
  connectors: [
    ...numbered(8, 'din-in', (i) => `DIN In ${i}`, 'midi.din', 'in', 'din5-f', () => ({ midi: { carries: MIDI_ALL } })),
    ...numbered(12, 'din-out', (i) => `DIN Out ${i}`, 'midi.din', 'out', 'din5-f', () => ({ midi: { carries: MIDI_ALL } })),
    ...numbered(10, 'usb-host', (i) => `USB Host ${i}`, 'usb.data', 'bidir', 'usb-a-f', () => ({ usb: { role: 'host', version: 'unknown', carries: ['midi', 'power'], suppliesBusPowerMa: null } })),
    { ...usbDevice('usb-computer', 'unknown', ['midi']), label: 'USB (computer)' },
    c('ethernet', 'Ethernet (RTP-MIDI)', 'ethernet', 'bidir', 'rj45', { notes: '22 virtual RTP-MIDI ports.' }),
    dcIn('unknown'),
  ],
  internalPaths: [
    { id: 'route-all', from: [...Array.from({ length: 8 }, (_, k) => `din-in-${k + 1}`), ...Array.from({ length: 10 }, (_, k) => `usb-host-${k + 1}`), 'usb-computer', 'ethernet'], to: [...Array.from({ length: 12 }, (_, k) => `din-out-${k + 1}`), ...Array.from({ length: 10 }, (_, k) => `usb-host-${k + 1}`), 'usb-computer', 'ethernet'], mode: 'split', presetId: 'default', condition: 'Routing, filtering and merging configured in software' },
  ],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', nominalV: 12, drawMa: null, plug: { type: 'barrel', odMm: null, idMm: null, polarity: null }, included: true, suppliedModelId: 'gear-iconnectivity-mioxl-psu' }],
    maxW: 36,
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: true, notes: 'Routes, filters and merges; no Thru, fan-out by routing.' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
  notes: 'Depth ~145 mm (sources range 120–170). 36 W (3 A) external supply with interchangeable blades; plug size not located.',
  provenance: {
    ...RACK_PROV,
    'dimensions.d': p('estimated', 'Sources range 120–170 mm.'),
    'dimensions.weightKg': p('estimated', '~1.9 kg.'),
    'power.sources.0.drawMa': p('unknown', 'Supply rated 36 W (3 A); unit draw not located.'),
  },
}); // prettier-ignore

export const niftyCase: GearModel = gear({
  id: 'gear-cre8audio-niftycase',
  manufacturer: 'cre8audio',
  name: 'NiftyCASE',
  category: 'eurorack-case',
  formFactor: 'eurorack',
  tags: ['eurorack', 'midi-to-cv'],
  dimensions: { w: null, d: null, h: null, weightKg: null, heightIncludesKnobsFeet: true, eurorack: { hp: 84, depthMm: 55 } },
  connectors: [
    mono('out-master', 'Master Out (mono)', 'out', 'jack-6.35', 'unbalanced', 'line', { notes: 'Sums the two 3.5 mm audio inputs.' }),
    ...numbered(2, 'in', (i) => `Audio In ${i}`, 'audio.analog', 'in', 'jack-3.5', () => ({ signal: { balance: 'unbalanced', level: 'eurorack-audio' } })),
    ...[1, 2].flatMap((i) => [
      c(`cv-${i}`, `CV ${i} Out`, 'cv', 'out', 'jack-3.5', { cv: { standard: '1V/oct' } }),
      c(`gate-${i}`, `Gate ${i} Out`, 'gate', 'out', 'jack-3.5'),
    ]),
    c('mod-out', 'Mod Out', 'cv', 'out', 'jack-3.5'),
    c('clock-out', 'Clock Out', 'clock.pulse', 'out', 'jack-3.5', { clock: { format: 'pulse', canMaster: false, note: 'MIDI clock converted to 1/8-note triggers.' } }),
    midiIn(),
    midiThru(),
    usbDevice('usb', 'usb-b-f', ['midi'], {}, { notes: 'MIDI input only.' }),
    dcIn('unknown'),
  ],
  internalPaths: [{ id: 'audio-sum', from: ['in-1', 'in-2'], to: ['out-master'], mode: 'sum' }],
  power: {
    sources: [{ kind: 'external-dc', inputConnectorId: 'dc-in', drawMa: null, included: true, suppliedModelId: 'gear-cre8audio-niftycase-psu' }],
    busRails: { plus12Ma: 1500, minus12Ma: 500, plus5Ma: 500 },
    mainsRegion: 'unknown',
  },
  midi: { clockIn: true, clockOut: false },
  clock: { canBeMaster: false, canBeSlave: true, formats: ['midi'], notes: 'Converts MIDI clock to 1/8-note triggers on Clock Out.' },
  ergonomics: { interaction: 'set-and-forget', defaultUsage: 'secondary', needsDisplayVisibility: false },
  notes: '84 HP usable rail width, 55 mm module depth. Exterior dimensions not located.',
  provenance: { 'power.busRails': p('datasheet', '+12 V 1.5 A, −12 V 0.5 A, +5 V 0.5 A.') },
}); // prettier-ignore

function ipad(size: '11' | '13'): GearModel {
  const dims = size === '11' ? { w: 249.7, d: 177.5, h: 5.3, weightKg: 0.444 } : { w: 281.6, d: 215.5, h: 5.1, weightKg: 0.579 };
  return gear({
    id: `gear-apple-ipad-pro-m4-${size}`,
    manufacturer: 'Apple',
    name: 'iPad Pro M4',
    variant: `${size}-inch`,
    category: 'tablet',
    formFactor: 'tablet',
    tags: ['apple', 'usb-host'],
    dimensions: { ...dims, heightIncludesKnobsFeet: true },
    connectors: [
      c('usb-c', 'USB-C (Thunderbolt / USB 4)', 'usb.data', 'bidir', 'usb-c-f', {
        face: 'right',
        usb: { role: 'host', version: '4', carries: ['midi', 'audio', 'data', 'power'], suppliesBusPowerMa: null, audio: { inChannels: null, outChannels: null, compliance: 'class-compliant' } },
        notes: 'Single port: needs a powered hub for several devices. Bus power for the SSL 12 not verified.',
      }),
      c('ble-midi', 'Bluetooth LE MIDI', 'midi.ble', 'bidir', 'wireless', { midi: { carries: MIDI_ALL } }),
    ],
    power: { sources: [{ kind: 'battery', drawMa: null, included: true }, { kind: 'usb-bus', inputConnectorId: 'usb-c', nominalV: 5, drawMa: null, plug: { type: 'usb' }, included: false }], mainsRegion: 'unknown' },
    midi: { notes: 'MIDI over USB and Bluetooth LE via apps.' },
    clock: { canBeMaster: true, canBeSlave: true, formats: ['midi'], notes: 'Via apps.' },
    ergonomics: { interaction: 'touch', defaultUsage: 'primary', needsDisplayVisibility: true },
    notes: 'No headphone jack; analog audio needs a USB-C adapter or interface. Which size is owned is not confirmed.',
    dimsKind: 'estimated',
    provenance: {
      'dimensions.w': p('estimated', 'Apple figures recalled from memory, not re-verified.'),
      'connectors[usb-c].usb.suppliesBusPowerMa': p('unknown', 'iPad USB-C output budget unverified (spec Appendix I.5).'),
    },
  }); // prettier-ignore
}
export const ipad11 = ipad('11');
export const ipad13 = ipad('13');

export const studioModels = [nightSky, h90, dbx166xl, mdx2100, vitalizerSx2, ultrafex, ssl12, sidekick, mixWizard, keyMix6, ada8200, px3000Model, keyStep, pyramid, mioXL, niftyCase, ipad11, ipad13];

// ---------- external supplies (included with the gear above, reference §3) ----------

type Barrel = Extract<NonNullable<Connector['psu']>['plug'], { type: 'barrel' }>;
function psu(id: string, name: string, forModel: string, voltage: number | null, currentMaMax: number | null, plug: Barrel | null, extra: { manufacturer?: string; notes?: string } = {}): GearModel {
  return gear({
    id,
    manufacturer: extra.manufacturer ?? 'Generic',
    name,
    category: 'power',
    formFactor: 'other',
    tags: ['psu', 'wall-wart'],
    dimensions: { w: null, d: null, h: null, weightKg: null, heightIncludesKnobsFeet: true },
    connectors: [
      c('ac', 'Mains plug', 'power.ac', 'in', 'mains-plug'),
      c('dc-out', 'DC Out', 'power.dc', 'out', 'captive-cable', {
        psu: { voltage, currentMaMax, ...(plug ? { plug, ...(plug.polarity ? { polarity: plug.polarity } : {}) } : {}) },
      }),
    ],
    power: { sources: [], mainsRegion: 'unknown' },
    ergonomics: { interaction: 'set-and-forget', defaultUsage: 'rare', needsDisplayVisibility: false },
    notes: [`Included with ${forModel}.`, extra.notes].filter(Boolean).join(' '),
    provenance: { 'connectors.*.face': p('estimated', 'Not applicable to a wall adapter.') },
  });
}

const barrel = (odMm: number | null, idMm: number | null, polarity: Barrel['polarity']): Barrel => ({ type: 'barrel', odMm, idMm, polarity });

export const psuModels = [
  psu('gear-elektron-psu-3c', 'PSU-3c', 'Elektron Analog Heat, Analog Four, Digitone II, Octatrack', 12, 2000, barrel(5.5, 2.5, 'center-positive'), { manufacturer: 'Elektron' }),
  psu('gear-eventide-h90-psu', 'H90 power supply', 'Eventide H90', 12, 1000, barrel(5.5, 2.5, 'center-positive'), { manufacturer: 'Eventide' }),
  psu('gear-strymon-nightsky-psu', 'NightSky power supply', 'Strymon NightSky', 9, null, barrel(5.5, 2.1, 'center-negative'), { manufacturer: 'Strymon', notes: 'Rating not located; the unit needs ≥300 mA.' }),
  psu('gear-behringer-rd-8-psu', 'RD-8 MKII power supply', 'Behringer RD-8 MKII', 18, 1000, barrel(null, null, null), { manufacturer: 'Behringer', notes: '18 V: never plug into 12 V units.' }),
  psu('gear-behringer-pro-800-psu', 'Pro-800 power supply', 'Behringer Pro-800', 12, 1200, barrel(null, null, null), { manufacturer: 'Behringer' }),
  psu('gear-behringer-neutron-psu', 'Neutron power supply', 'Behringer Neutron', 12, null, barrel(null, null, 'center-positive'), { manufacturer: 'Behringer' }),
  psu('gear-behringer-2-xm-psu', '2-XM power supply', 'Behringer 2-XM', null, null, null, { manufacturer: 'Behringer' }),
  psu('gear-clavia-nord-drum-3p-psu', 'Nord Drum 3P power supply', 'Clavia Nord Drum 3P', null, null, null, { manufacturer: 'Clavia' }),
  psu('gear-iconnectivity-mioxl-psu', 'mioXL power supply', 'iConnectivity mioXL', 12, 3000, barrel(null, null, null), { manufacturer: 'iConnectivity', notes: '36 W, interchangeable-blade wall adapter.' }),
  psu('gear-cre8audio-niftycase-psu', 'NiftyCASE power supply', 'cre8audio NiftyCASE', null, null, null, { manufacturer: 'cre8audio' }),
];
