// Template instantiation (spec §5.2): pre-fill a new model from a template plus numeric parameters.
import { newId } from './ids';
import { RACK_UNIT_MM } from './units';
import { ensureUnknownProvenance } from './integrity';
import { desk, eurorackStand, rackStand, tieredAFrame } from './stands';
import type { Connector, GearModel, StandModel, Template } from './types';

export type TemplateParams = Record<string, number>;

export function defaultParams(t: Template): TemplateParams {
  return Object.fromEntries((t.params ?? []).map((p) => [p.key, p.default]));
}

function expandGroups(t: Template, params: TemplateParams): Connector[] {
  const out: Connector[] = [...structuredClone(t.connectors ?? []), ...structuredClone(t.gear?.connectors ?? [])];
  for (const group of t.connectorGroups ?? []) {
    const n = group.repeat ? Math.max(0, Math.round(params[group.repeat] ?? 0)) : 1;
    for (let i = 1; i <= n; i++) {
      for (const c of group.connectors) {
        const copy = structuredClone(c);
        copy.id = copy.id.replaceAll('{i}', String(i));
        copy.label = copy.label.replaceAll('{i}', String(i));
        if (copy.channel?.role === 'numbered') copy.channel.index = i;
        if (copy.channel?.group) copy.channel.group = copy.channel.group.replaceAll('{i}', String(i));
        if (copy.exclusiveWith) copy.exclusiveWith = copy.exclusiveWith.map((x) => x.replaceAll('{i}', String(i)));
        out.push(copy);
      }
    }
  }
  return out;
}

/** White-key pitch by key type; resulting widths are estimates (provenance `estimated`). */
const WHITE_KEY_PITCH_MM = { slim: 20, mini: 17, full: 23.5, 'semi-weighted': 23.5, weighted: 23.5 } as const;
const KEYBOARD_CHEEKS_MM = 2 * 60;

export function keyboardWidthMm(keys: number, keyType: keyof typeof WHITE_KEY_PITCH_MM): number {
  const whiteKeys = Math.round((keys * 7) / 12);
  return Math.round(whiteKeys * WHITE_KEY_PITCH_MM[keyType] + KEYBOARD_CHEEKS_MM);
}

/** New gear model from a gear template. Unknown dimensions stay `null` with provenance `unknown`. */
export function instantiateGearTemplate(
  t: Template,
  params: TemplateParams = defaultParams(t),
  id = newId(),
): GearModel {
  if (t.target !== 'gear') throw new Error(`Template ${t.id} is not a gear template`);
  const g = structuredClone(t.gear ?? {});
  const dimensions: GearModel['dimensions'] = g.dimensions ?? {
    w: null,
    d: null,
    h: null,
    weightKg: null,
    heightIncludesKnobsFeet: true,
  };
  const provenance: GearModel['provenance'] = { ...(g.provenance ?? {}) };
  if (dimensions.keyboard && params.keys) {
    dimensions.keyboard.keys = params.keys;
    dimensions.w = keyboardWidthMm(params.keys, dimensions.keyboard.keyType);
    provenance['dimensions.w'] = { kind: 'estimated', note: 'Computed from key count and key pitch.' };
  }
  if (dimensions.rack && params.u) {
    dimensions.rack.u = params.u;
    dimensions.h = params.u * RACK_UNIT_MM;
  }
  if (dimensions.eurorack && params.hp) dimensions.eurorack.hp = params.hp;
  for (const k of ['w', 'd', 'h', 'weightKg'] as const) {
    if (dimensions[k] === null) provenance[`dimensions.${k}`] ??= { kind: 'unknown' };
    else provenance[`dimensions.${k}`] ??= { kind: 'estimated', note: `Template default (${t.name}).` };
  }
  const model: GearModel = {
    id,
    manufacturer: g.manufacturer ?? '',
    name: g.name ?? t.name,
    aliases: g.aliases ?? [],
    category: g.category ?? 'other',
    formFactor: g.formFactor ?? 'desktop',
    tags: g.tags ?? [],
    dimensions,
    mounting: g.mounting ?? {},
    faces: g.faces ?? {},
    connectors: expandGroups(t, params),
    internalPaths: g.internalPaths ?? [],
    power: g.power ?? { sources: [] },
    ...(g.midi ? { midi: g.midi } : {}),
    ...(g.clock ? { clock: g.clock } : {}),
    ergonomics: g.ergonomics ?? {
      interaction: 'knobs-buttons',
      defaultUsage: 'secondary',
      needsDisplayVisibility: false,
    },
    images: {},
    notes: g.notes ?? '',
    sources: [],
    provenance,
    createdFromTemplateId: t.id,
  };
  ensureUnknownProvenance(model, `Not set in template (${t.name}).`);
  return model;
}

/** Connectors from a connector-group template, with ids made unique against `existingIds`. */
export function instantiateConnectorTemplate(
  t: Template,
  existingIds: Iterable<string>,
  params: TemplateParams = defaultParams(t),
): Connector[] {
  const taken = new Set(existingIds);
  return expandGroups(t, params).map((c) => {
    let id = c.id;
    for (let n = 2; taken.has(id); n++) id = `${c.id}-${n}`;
    taken.add(id);
    return { ...c, id };
  });
}

export function instantiateStandTemplate(
  t: Template,
  params: TemplateParams = defaultParams(t),
  id = newId(),
): StandModel {
  if (t.target !== 'stand') throw new Error(`Template ${t.id} is not a stand template`);
  const n = (k: string, d: number) => params[k] ?? d;
  switch (t.generator) {
    case 'tiered-a-frame': {
      const tiers = Math.max(1, Math.round(n('tiers', 3)));
      return tieredAFrame({
        id,
        manufacturer: '',
        name: t.name,
        innerSpanMm: n('innerSpanMm', 1450),
        poleDiameterMm: n('poleDiameterMm', 40),
        heightMm: n('heightMm', 1400),
        tiers: Array.from({ length: tiers }, (_, i) => ({
          label: `Tier ${i + 1}`,
          holderLengthMm: n('holderLengthMm', 400),
          loadKg: null,
          defaultZ: 400 + i * 300,
        })),
      });
    }
    case 'rack':
    case 'rack-case':
      return rackStand({
        id,
        name: t.name,
        u: Math.round(n('u', 12)),
        depthMm: n('depthMm', 400),
        standard: n('inches', 19) === 10 ? '10in' : '19in',
        kind: t.generator,
        rearRails: n('rearRails', 0) > 0,
      });
    case 'desk':
      return desk({ id, name: t.name, w: n('w', 1600), d: n('d', 800), h: n('h', 740) });
    case 'eurorack-stand':
      return eurorackStand({
        id,
        name: t.name,
        rows: Math.round(n('rows', 3)),
        rowDepthMm: n('rowDepthMm', 140),
        widthMm: n('widthMm', 440),
      });
    default: {
      const s = structuredClone(t.stand ?? {});
      return {
        id,
        manufacturer: s.manufacturer ?? '',
        name: s.name ?? t.name,
        type: s.type ?? 'custom',
        dimensions: s.dimensions ?? { w: null, d: null, h: null },
        surfaces: s.surfaces ?? [],
        images: {},
        notes: s.notes ?? '',
        sources: [],
        provenance: s.provenance ?? {},
      };
    }
  }
}
