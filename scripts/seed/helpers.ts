// Authoring helpers for the hand-written seed catalogue. Values come from docs/studio-gear-reference.md (v2);
// anything the reference marks "Not located" is `null` and gets provenance `unknown` automatically.
import type {
  Connector,
  Direction,
  FaceId,
  GearModel,
  JackType,
  Provenance,
  SignalDomain,
} from '../../src/domain/types.ts';
import { ensureUnknownProvenance } from '../../src/domain/integrity.ts';

export const REF_SOURCE = { label: 'Home Studio Gear Reference v2 (docs/studio-gear-reference.md)', retrieved: '2026-10-04' };
export const REF_NOTE = 'Gear reference v2';

const P0 = { x: 0, y: 0 };

type Extra = Partial<Omit<Connector, 'id' | 'label' | 'domain' | 'direction' | 'jack'>>;

export function c(
  id: string,
  label: string,
  domain: SignalDomain,
  direction: Direction,
  jack: JackType,
  extra: Extra = {},
): Connector {
  return { id, label, face: 'back', pos: P0, domain, direction, jack, ...extra };
}

type Balance = NonNullable<Connector['signal']>['balance'];
type Level = NonNullable<Connector['signal']>['level'];

/** Stereo pair `<prefix>-l` / `<prefix>-r` sharing `channel.group = prefix`. */
export function pair(
  prefix: string,
  label: string,
  direction: Direction,
  jack: JackType,
  balance: Balance,
  level?: Level,
  extra: Extra = {},
): Connector[] {
  return (['L', 'R'] as const).map((role) =>
    c(`${prefix}-${role.toLowerCase()}`, `${label} ${role}`, 'audio.analog', direction, jack, {
      signal: { balance, ...(level ? { level } : {}) },
      channel: { role, group: prefix },
      ...extra,
    }),
  );
}

export function mono(
  id: string,
  label: string,
  direction: Direction,
  jack: JackType,
  balance: Balance,
  level?: Level,
  extra: Extra = {},
): Connector {
  return c(id, label, 'audio.analog', direction, jack, {
    signal: { balance, ...(level ? { level } : {}) },
    channel: { role: 'mono' },
    ...extra,
  });
}

export function phones(id: string, label: string, jack: JackType, extra: Extra = {}): Connector {
  return c(id, label, 'audio.headphone', 'out', jack, {
    signal: { balance: 'n/a', level: 'headphone' },
    channel: { role: 'stereo' },
    ...extra,
  });
}

export const MIDI_ALL: NonNullable<Connector['midi']>['carries'] = ['notes', 'cc', 'pc', 'sysex', 'clock', 'transport'];

export function midiIn(id = 'midi-in', label = 'MIDI In', extra: Extra = {}): Connector {
  return c(id, label, 'midi.din', 'in', 'din5-f', { midi: { carries: MIDI_ALL }, ...extra });
}
export function midiOut(id = 'midi-out', label = 'MIDI Out', extra: Extra = {}): Connector {
  return c(id, label, 'midi.din', 'out', 'din5-f', { midi: { carries: MIDI_ALL }, ...extra });
}
export function midiThru(id = 'midi-thru', label = 'MIDI Thru', thruMode: 'hard' | 'soft' = 'hard', extra: Extra = {}) {
  return c(id, label, 'midi.din', 'thru', 'din5-f', { midi: { carries: MIDI_ALL, thruMode }, ...extra });
}
/** DIN Out that can be switched to Thru (`alternates` + `unitConfig.activeAlternates`). */
export function midiOutThru(id = 'midi-out-thru', label = 'MIDI Out/Thru', note?: string): Connector {
  return midiOut(id, label, {
    midi: { carries: MIDI_ALL, thruMode: 'switchable-with-out' },
    alternates: [{ id: 'thru', label: 'Thru', direction: 'thru', ...(note ? { note } : {}) }],
  });
}

export function usbDevice(
  id: string,
  jack: JackType,
  carries: NonNullable<Connector['usb']>['carries'],
  extra: Partial<NonNullable<Connector['usb']>> = {},
  connectorExtra: Extra = {},
): Connector {
  return c(id, 'USB', 'usb.data', 'bidir', jack, {
    usb: { role: 'device', version: 'unknown', carries, busPowered: false, ...extra },
    ...connectorExtra,
  });
}

export function dcIn(jack: JackType, id = 'dc-in', label = 'DC In'): Connector {
  return c(id, label, 'power.dc', 'in', jack);
}
export const iecIn = (label = 'Mains (IEC)') => c('ac-in', label, 'power.ac', 'in', 'iec-c14');

/** Numbered connectors `<prefix>-1..n`. */
export function numbered(
  n: number,
  prefix: string,
  label: (i: number) => string,
  domain: SignalDomain,
  direction: Direction,
  jack: JackType,
  extra: (i: number) => Extra = () => ({}),
): Connector[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return c(`${prefix}-${i}`, label(i), domain, direction, jack, {
      channel: { role: 'numbered', index: i },
      ...extra(i),
    });
  });
}

export const onFace = (face: FaceId, list: Connector[]): Connector[] => list.map((x) => ({ ...x, face }));

// ---------- provenance ----------

export const p = (kind: Provenance['kind'], note?: string, url?: string): Provenance => ({
  kind,
  ...(note ? { note } : {}),
  ...(url ? { url } : {}),
});

type GearInput = Omit<
  GearModel,
  'aliases' | 'tags' | 'faces' | 'internalPaths' | 'images' | 'notes' | 'sources' | 'provenance' | 'mounting'
> &
  Partial<Pick<GearModel, 'aliases' | 'tags' | 'internalPaths' | 'notes' | 'sources' | 'mounting'>> & {
    provenance?: Record<string, Provenance>;
    /** Provenance for dimensions/weight when given (default: datasheet via the reference). */
    dimsKind?: Provenance['kind'];
  };

export function gear(input: GearInput): GearModel {
  const { provenance = {}, dimsKind = 'datasheet', ...rest } = input;
  const prov: Record<string, Provenance> = {
    'connectors.*.pos': p('unknown', 'Placeholder (0,0); place on a panel image.'),
    'connectors.*.face': p('estimated', 'Rear panel assumed unless the reference states the panel.'),
    ...provenance,
  };
  for (const k of ['w', 'd', 'h', 'weightKg'] as const) {
    if (rest.dimensions[k] !== null) prov[`dimensions.${k}`] ??= p(dimsKind, REF_NOTE);
  }
  const model: GearModel = {
    aliases: [],
    tags: [],
    faces: {},
    internalPaths: [],
    images: {},
    notes: '',
    sources: [REF_SOURCE],
    mounting: {},
    ...rest,
    provenance: prov,
  };
  // Authoring keys may name connectors by id: `connectors[phones].jack` → `connectors.<index>.jack`.
  for (const key of Object.keys(prov)) {
    const m = /^connectors\[([^\]]+)\](.*)$/.exec(key);
    if (!m) continue;
    const idx = model.connectors.findIndex((x) => x.id === m[1]);
    if (idx < 0) throw new Error(`${model.id}: provenance key ${key} names an unknown connector`);
    prov[`connectors.${idx}${m[2]}`] = prov[key]!;
    delete prov[key];
  }
  model.connectors.forEach((x, i) => {
    if (x.jack === 'unknown') prov[`connectors.${i}.jack`] ??= p('unknown', 'Jack type not located in the gear reference.');
  });
  ensureUnknownProvenance(model, 'Not located in the gear reference.');
  model.provenance = Object.fromEntries(Object.entries(prov).sort(([a], [b]) => a.localeCompare(b)));
  return model;
}

/** Straight-through processing path per channel pair, e.g. in-l→out-l, in-r→out-r. */
export function processPath(id: string, from: string[], to: string[], mode: 'process' | 'passthrough' = 'process') {
  return {
    id,
    from,
    to,
    mode,
    channelMap: from.length === to.length ? from.map((f, i) => ({ from: f, to: to[i]! })) : undefined,
  };
}
