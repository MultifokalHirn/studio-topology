// Parametric stand generators (spec §5.4). Pure: used by the seed build and the stand editor.
import { RACK_INNER_WIDTH_MM, RACK_PANEL_WIDTH_MM, RACK_UNIT_MM } from './units';
import type { Provenance, StandModel, SurfaceDef } from './types';

const est = (note: string): Provenance => ({ kind: 'estimated', note });

export interface TierParams {
  label: string;
  holderLengthMm: number;
  loadKg: number | null;
  defaultZ: number;
}

export interface TieredAFrameParams {
  id: string;
  manufacturer: string;
  name: string;
  innerSpanMm: number;
  poleDiameterMm: number;
  heightMm: number;
  tiers: TierParams[];
  holderThicknessMm?: number;
}

/** Tiered A-frame keyboard stand (bottom tier first). Tier depth offsets are adjustable and unknown until measured. */
export function tieredAFrame(p: TieredAFrameParams): StandModel {
  const thickness = p.holderThicknessMm ?? 30;
  const surfaces: SurfaceDef[] = p.tiers.map((t, i) => ({
    id: `tier-${i + 1}`,
    label: t.label,
    kind: 'tier',
    usable: { w: p.innerSpanMm, d: t.holderLengthMm },
    anchor: { x: 0, y: 0, z: t.defaultZ },
    adjustable: {
      z: { min: 300, max: p.heightMm, step: 5 },
      tiltDeg: { min: 0, max: 30, step: 1 },
      ...(i > 0 ? { y: { min: -300, max: 300, step: 5 } } : {}),
    },
    holders: { lengthMm: t.holderLengthMm, thicknessMm: thickness, pairMinSpacingMm: 150, protrusionAdjustable: false },
    loadKg: t.loadKg,
  }));
  const provenance: Record<string, Provenance> = {};
  surfaces.forEach((s, i) => {
    provenance[`surfaces.${i}.adjustable.z`] = est('Generator default; measure the real stand.');
    if (s.adjustable.y)
      provenance[`surfaces.${i}.adjustable.y`] = { kind: 'unknown', note: 'Tier depth offset; measure.' };
  });
  return {
    id: p.id,
    manufacturer: p.manufacturer,
    name: p.name,
    type: 'tiered-keyboard-stand',
    dimensions: {
      w: p.innerSpanMm + 2 * p.poleDiameterMm + 40,
      d: null,
      h: p.heightMm,
      innerSpanMm: p.innerSpanMm,
      weightKg: null,
    },
    surfaces,
    structure: { poleDiameterMm: p.poleDiameterMm },
    images: {},
    notes: '',
    sources: [],
    provenance,
  };
}

/** 19" rack with one rack bay of `u` units (placements use `uStart`). */
export function rackStand(p: {
  id: string;
  name: string;
  u: number;
  depthMm: number;
  manufacturer?: string;
}): StandModel {
  const h = p.u * RACK_UNIT_MM;
  return {
    id: p.id,
    manufacturer: p.manufacturer ?? 'Generic',
    name: p.name,
    type: 'rack',
    dimensions: { w: RACK_PANEL_WIDTH_MM + 40, d: p.depthMm + 40, h: h + 40, weightKg: null },
    surfaces: [
      {
        id: 'bay',
        label: `Rack bay (${p.u}U)`,
        kind: 'rack-bay',
        usable: { w: RACK_INNER_WIDTH_MM, d: p.depthMm },
        anchor: { x: 20, y: 0, z: 20 },
        adjustable: {},
        loadKg: null,
        rack: { u: p.u, innerWidthMm: RACK_INNER_WIDTH_MM, depthMm: p.depthMm },
      },
    ],
    images: {},
    notes: 'EIA-310 rails, 44.45 mm per U.',
    sources: [],
    provenance: {},
  };
}

export function desk(p: {
  id: string;
  name: string;
  w: number;
  d: number;
  h: number;
  loadKg?: number | null;
}): StandModel {
  return {
    id: p.id,
    manufacturer: 'Generic',
    name: p.name,
    type: 'desk',
    dimensions: { w: p.w, d: p.d, h: p.h, weightKg: null },
    surfaces: [
      {
        id: 'top',
        label: 'Desktop',
        kind: 'desktop',
        usable: { w: p.w, d: p.d },
        anchor: { x: 0, y: 0, z: p.h },
        adjustable: {},
        loadKg: p.loadKg ?? null,
      },
    ],
    images: {},
    notes: '',
    sources: [],
    provenance: {},
  };
}

/** Stand with `rows` tilted shelves sized for Eurorack-width desktop units (424 mm). */
export function eurorackStand(p: {
  id: string;
  name: string;
  rows: number;
  rowDepthMm: number;
  widthMm: number;
}): StandModel {
  const surfaces: SurfaceDef[] = Array.from({ length: p.rows }, (_, i) => ({
    id: `row-${i + 1}`,
    label: `Row ${i + 1}`,
    kind: 'shelf',
    usable: { w: p.widthMm, d: p.rowDepthMm },
    anchor: { x: 0, y: i * p.rowDepthMm, z: 40 + i * 110 },
    adjustable: { tiltDeg: { min: 0, max: 45, step: 1 } },
    loadKg: null,
  }));
  return {
    id: p.id,
    manufacturer: 'Generic',
    name: p.name,
    type: 'custom',
    dimensions: { w: p.widthMm + 30, d: p.rows * p.rowDepthMm, h: 40 + p.rows * 110, weightKg: null },
    surfaces,
    images: {},
    notes: '',
    sources: [],
    provenance: Object.fromEntries(
      surfaces.map((_, i) => [`surfaces.${i}.anchor`, est('Generator default; measure the real stand.')]),
    ),
  };
}
