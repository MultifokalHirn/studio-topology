// Factories for new, schema-valid entities.
import { newId } from './ids';
import type { BodyProfile, Project, Settings, Setup, UnitConfig } from './types';
import { CURRENT_SCHEMA_VERSION } from './migrations';

/** Appendix G. */
export const DEFAULT_DOMAIN_PALETTE: Record<string, string> = {
  'audio.mono': '#374151',
  'audio.L': '#2563EB',
  'audio.R': '#DC2626',
  midi: '#16A34A',
  usb: '#7C3AED',
  cv: '#EA580C',
  clock: '#C026D3',
  digital: '#0D9488',
  power: '#6B7280',
  expression: '#92400E',
  error: '#B91C1C',
  warning: '#B45309',
  info: '#1D4ED8',
};

/** 16 categorical MIDI channel colours: Okabe-Ito (8) extended with 8 distinguishable tints. Badges carry the number too. */
export const DEFAULT_MIDI_CHANNEL_PALETTE = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#000000',
  '#994F00', '#7FC6F0', '#66C5AB', '#B8A900', '#66AAD1', '#F09A66', '#E0AFCA', '#7F7F7F',
]; // prettier-ignore

export function defaultSettings(): Settings {
  return {
    units: { length: 'mm', decimals: 0 },
    theme: 'system',
    palette: { domains: { ...DEFAULT_DOMAIN_PALETTE }, midiChannels: [...DEFAULT_MIDI_CHANNEL_PALETTE] },
    snap: { enabled: true, gridMm: 5, fineMm: 1 },
    animation: { enabled: true, speed: 1, reducedMotion: 'system', bpm: 120 },
    labelDensity: 'minimal',
    ergonomics: {
      handClearanceMm: 90,
      holderThicknessMm: 30,
      viewDistanceMm: 550,
      comfortBandMm: 100,
      acceptableLowerMm: 150,
    },
    cables: { slack: 0.15, serviceLoopMm: 150, viaHeightMm: 0 },
    mainsVoltage: 230,
    defaultBodyProfileId: null,
    autosaveIntervalS: 5,
  };
}

export function defaultBodyProfile(id = newId()): BodyProfile {
  return { id, name: 'Default (173 cm)', heightMm: 1730, handedness: 'right' };
}

export function createSetup(name: string, bodyProfileId: string, now = new Date().toISOString()): Setup {
  return {
    id: newId(),
    name,
    description: '',
    status: 'planned',
    tags: [],
    bodyProfileId,
    posture: 'standing',
    stands: [],
    placements: [],
    connections: [],
    unitConfigs: {},
    annotations: [],
    viewState: { layoutView: 'front', viewports: {}, patchPositions: {} },
    createdAt: now,
    updatedAt: now,
    suppressedIssues: [],
  };
}

export function defaultUnitConfig(usage: UnitConfig['usage'] = 'secondary'): UnitConfig {
  return { activeAlternates: {}, powerAssignments: [], usage };
}

export function createEmptyProject(name = 'Untitled studio', now = new Date().toISOString()): Project {
  const body = defaultBodyProfile();
  const setup = createSetup('Current', body.id, now);
  setup.status = 'current';
  const settings = defaultSettings();
  settings.defaultBodyProfileId = body.id;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { name, createdAt: now, updatedAt: now },
    settings,
    library: { gearModels: [], standModels: [], cableModels: [], templates: [] },
    inventory: { gearUnits: [], standUnits: [], cables: [], rooms: [] },
    bodyProfiles: [body],
    setups: [setup],
    activeSetupId: setup.id,
    assets: { mode: 'folder', items: {} },
  };
}
