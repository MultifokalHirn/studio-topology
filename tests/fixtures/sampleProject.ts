// Small, realistic project used by the golden round-trip test. Fixed ids and timestamps so output is stable.
import { defaultSettings } from '@/domain/defaults';
import type { Connector, GearModel, Project, StandModel } from '@/domain/types';

const z = { x: 0, y: 0 };
const midiCarries: NonNullable<Connector['midi']>['carries'] = ['notes', 'cc', 'pc', 'clock', 'transport', 'sysex'];

/** Appendix E. */
export const digitoneII: GearModel = {
  id: 'gear-elektron-digitone-ii',
  manufacturer: 'Elektron',
  name: 'Digitone II',
  aliases: [],
  category: 'synth',
  formFactor: 'desktop',
  tags: ['elektron'],
  dimensions: { w: 215, d: 176, h: 63, weightKg: 1.48, heightIncludesKnobsFeet: true },
  mounting: { vesa: 100 },
  faces: {},
  connectors: [
    {
      id: 'out-main-l',
      label: 'Main L',
      face: 'back',
      pos: z,
      domain: 'audio.analog',
      direction: 'out',
      jack: 'jack-6.35-TRS',
      signal: { balance: 'imp-balanced', level: 'line' },
      channel: { role: 'L', group: 'main' },
    },
    {
      id: 'out-main-r',
      label: 'Main R',
      face: 'back',
      pos: z,
      domain: 'audio.analog',
      direction: 'out',
      jack: 'jack-6.35-TRS',
      signal: { balance: 'imp-balanced', level: 'line' },
      channel: { role: 'R', group: 'main' },
    },
    {
      id: 'in-l',
      label: 'In L',
      face: 'back',
      pos: z,
      domain: 'audio.analog',
      direction: 'in',
      jack: 'jack-6.35-TRS',
      signal: { balance: 'balanced', level: 'line' },
      channel: { role: 'L', group: 'in' },
    },
    {
      id: 'in-r',
      label: 'In R',
      face: 'back',
      pos: z,
      domain: 'audio.analog',
      direction: 'in',
      jack: 'jack-6.35-TRS',
      signal: { balance: 'balanced', level: 'line' },
      channel: { role: 'R', group: 'in' },
    },
    {
      id: 'phones',
      label: 'Headphones',
      face: 'back',
      pos: z,
      domain: 'audio.headphone',
      direction: 'out',
      jack: 'jack-6.35-TRS',
    },
    {
      id: 'midi-in',
      label: 'MIDI In',
      face: 'back',
      pos: z,
      domain: 'midi.din',
      direction: 'in',
      jack: 'din5-f',
      midi: { carries: midiCarries },
    },
    {
      id: 'midi-out',
      label: 'MIDI Out',
      face: 'back',
      pos: z,
      domain: 'midi.din',
      direction: 'out',
      jack: 'din5-f',
      midi: { carries: midiCarries },
      clock: { format: 'dinsync24', canMaster: true, note: 'DIN sync on Out' },
    },
    {
      id: 'midi-thru',
      label: 'MIDI Thru',
      face: 'back',
      pos: z,
      domain: 'midi.din',
      direction: 'thru',
      jack: 'din5-f',
      midi: { carries: midiCarries, thruMode: 'hard' },
    },
    {
      id: 'usb',
      label: 'USB',
      face: 'back',
      pos: z,
      domain: 'usb.data',
      direction: 'bidir',
      jack: 'usb-b-f',
      usb: {
        role: 'device',
        version: '2.0',
        carries: ['midi', 'audio', 'firmware'],
        busPowered: false,
        audio: { inChannels: 2, outChannels: 2, compliance: 'overbridge' },
      },
    },
    {
      id: 'dc-in',
      label: 'DC In',
      face: 'back',
      pos: z,
      domain: 'power.dc',
      direction: 'in',
      jack: 'dc-barrel-5.5x2.5',
    },
  ],
  internalPaths: [],
  power: {
    sources: [
      {
        kind: 'external-dc',
        inputConnectorId: 'dc-in',
        nominalV: 12,
        drawMa: 1000,
        plug: { type: 'barrel', odMm: 5.5, idMm: 2.5, polarity: 'center-positive' },
        included: true,
      },
    ],
    mainsRegion: 'unknown',
  },
  ergonomics: { interaction: 'knobs-buttons', defaultUsage: 'primary', needsDisplayVisibility: true },
  images: { back: { id: 'asset-dt2-back' } },
  notes: '',
  sources: [{ label: 'Elektron Digitone II user manual' }],
  provenance: {
    'dimensions.w': { kind: 'manufacturer' },
    'connectors.0.pos': { kind: 'unknown', note: 'Place on a back-panel image.' },
  },
};

/** Appendix D. */
export const jaspers: StandModel = {
  id: 'stand-jaspers-3d-145b',
  manufacturer: 'Jaspers',
  name: '3D-145B',
  type: 'tiered-keyboard-stand',
  dimensions: { w: 1550, d: 700, h: 1400, innerSpanMm: 1450, weightKg: null },
  surfaces: [
    {
      id: 'tier-bottom',
      label: 'Bottom tier (reinforced)',
      kind: 'tier',
      usable: { w: 1450, d: 600 },
      anchor: { x: 0, y: 0, z: 400 },
      adjustable: { z: { min: 300, max: 1400, step: 5 }, tiltDeg: { min: 0, max: 30, step: 1 } },
      holders: { lengthMm: 600, thicknessMm: 30, pairMinSpacingMm: 150, protrusionAdjustable: false },
      loadKg: 40,
    },
    {
      id: 'tier-middle',
      label: 'Middle tier',
      kind: 'tier',
      usable: { w: 1450, d: 400 },
      anchor: { x: 0, y: 0, z: 800 },
      adjustable: {
        z: { min: 300, max: 1400, step: 5 },
        tiltDeg: { min: 0, max: 30, step: 1 },
        y: { min: -300, max: 300, step: 5 },
      },
      holders: { lengthMm: 400, thicknessMm: 30, pairMinSpacingMm: 150, protrusionAdjustable: false },
      loadKg: 15,
    },
    {
      id: 'tier-top',
      label: 'Top tier',
      kind: 'tier',
      usable: { w: 1450, d: 400 },
      anchor: { x: 0, y: 0, z: 1100 },
      adjustable: {
        z: { min: 300, max: 1400, step: 5 },
        tiltDeg: { min: 0, max: 30, step: 1 },
        y: { min: -300, max: 300, step: 5 },
      },
      holders: { lengthMm: 400, thicknessMm: 30, pairMinSpacingMm: 150, protrusionAdjustable: false },
      loadKg: 15,
    },
  ],
  images: {},
  notes: '',
  sources: [{ label: 'musicstore.de', url: 'https://www.musicstore.de/en_DE/EUR/Jaspers-3D-145B/art-KEY0003689-000' }],
  provenance: {
    'dimensions.w': { kind: 'retailer', url: 'https://www.musicstore.de/en_DE/EUR/Jaspers-3D-145B/art-KEY0003689-000' },
    'surfaces.0.adjustable.z': {
      kind: 'estimated',
      note: 'Retailer lists max height 140 cm only; measure the real stand.',
    },
    'surfaces.1.adjustable.y': {
      kind: 'unknown',
      note: 'Tier depth offsets (A-frame geometry) not published; measure.',
    },
  },
};

const T = '2026-10-04T12:00:00.000Z';

export function sampleProject(): Project {
  const settings = defaultSettings();
  settings.defaultBodyProfileId = 'body-default';
  return {
    schemaVersion: 1,
    meta: { name: 'Golden fixture', createdAt: T, updatedAt: T, author: 'Test' },
    settings,
    library: {
      gearModels: [structuredClone(digitoneII)],
      standModels: [structuredClone(jaspers)],
      cableModels: [
        {
          id: 'cable-midi-din',
          name: 'MIDI DIN 5',
          kind: 'cable',
          endA: 'DIN5-M',
          endB: 'DIN5-M',
          carries: ['midi.din', 'clock.dinsync'],
          lengthsMm: [300, 500, 1000, 1500, 3000, 5000, 10000, 15000],
        },
      ],
      templates: [],
    },
    inventory: {
      gearUnits: [
        { id: 'unit-dt2-a', modelId: 'gear-elektron-digitone-ii', nickname: 'Digitone II', serial: 'X123' },
        {
          id: 'unit-dt2-b',
          modelId: 'gear-elektron-digitone-ii',
          nickname: 'Digitone II #2',
          overrides: { 'dimensions.h': 64 },
        },
      ],
      standUnits: [{ id: 'stand-unit-jaspers', modelId: 'stand-jaspers-3d-145b', nickname: 'Jaspers' }],
      cables: [{ id: 'cable-unit-1', modelId: 'cable-midi-din', lengthMm: 1000, inStock: true }],
      rooms: [],
    },
    bodyProfiles: [{ id: 'body-default', name: 'Default (173 cm)', heightMm: 1730, handedness: 'right' }],
    setups: [
      {
        id: 'setup-current',
        name: 'Current',
        description: 'Fixture setup',
        status: 'current',
        tags: ['fixture'],
        bodyProfileId: 'body-default',
        posture: 'standing',
        stands: [
          {
            standUnitId: 'stand-unit-jaspers',
            pos: { x: 0, y: 0 },
            rotationDeg: 0,
            surfaceStates: { 'tier-top': { z: 1127, tiltDeg: 6 }, 'tier-middle': { z: 937 } },
          },
        ],
        placements: [
          {
            unitId: 'unit-dt2-a',
            mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 100, y: 20 },
            rotationDeg: 0,
            locked: false,
            zIndex: 0,
          },
          {
            unitId: 'unit-dt2-b',
            mount: { type: 'floor', pos: { x: -400, y: 200 } },
            rotationDeg: 90,
            locked: true,
            zIndex: 1,
          },
        ],
        connections: [
          {
            id: 'conn-1',
            a: { unitId: 'unit-dt2-a', connectorId: 'midi-out' },
            b: { unitId: 'unit-dt2-b', connectorId: 'midi-in' },
            cable: { modelId: 'cable-midi-din', lengthMm: 1000, adapters: [], autoLength: true },
            midi: { channels: [3], purposes: ['notes', 'clock'] },
            enabled: true,
          },
        ],
        unitConfigs: {
          'unit-dt2-a': {
            activeAlternates: {},
            clockMaster: true,
            clockSource: 'internal',
            powerAssignments: [],
            usage: 'primary',
          },
        },
        annotations: [
          {
            id: 'ann-1',
            kind: 'measurement',
            view: 'front',
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
            ],
          },
        ],
        viewState: { layoutView: 'front', viewports: { front: { x: 0, y: 0, zoom: 1 } }, patchPositions: {} },
        createdAt: T,
        updatedAt: T,
        suppressedIssues: [],
      },
    ],
    activeSetupId: 'setup-current',
    assets: {
      mode: 'embedded',
      items: {
        'asset-dt2-back': {
          name: 'dt2-back.webp',
          mime: 'image/webp',
          widthPx: 1,
          heightPx: 1,
          bytes: 30,
          dataUri: 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
        },
      },
    },
  };
}
