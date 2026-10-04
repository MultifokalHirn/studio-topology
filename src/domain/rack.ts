// Rack fitting (spec §5.6 "Rack view", PLC-006): which U a unit occupies and whether it fits the bay.
import type { GearModel, SurfaceDef } from './types';

export interface RackItem {
  unitId: string;
  /** 1-based, counted from the top of the bay. */
  uStart: number;
  model: GearModel;
}

export type RackProblemKind =
  | 'not-rack'
  | 'unknown-height'
  | 'out-of-range'
  | 'overlap'
  | 'too-deep'
  | 'too-wide'
  | 'unknown-depth'
  | 'needs-adapter';

export interface RackProblem {
  unitId: string;
  kind: RackProblemKind;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface RackFit {
  totalU: number;
  usedU: number;
  freeU: number;
  /** Index 0 = U1 (top). Unit ids occupying each U (several = overlap). */
  occupancy: string[][];
  problems: RackProblem[];
}

/** Whole U a model occupies (fractional heights round up, e.g. 11.2U → 12U). */
export const rackHeightU = (m: GearModel): number | null =>
  m.dimensions.rack ? Math.ceil(m.dimensions.rack.u - 1e-9) : null;

const label = (m: GearModel) => [m.manufacturer, m.name, m.variant].filter(Boolean).join(' ');

/** Depth behind the front rails, when known. */
export function rackDepthMm(m: GearModel): number | null {
  return m.dimensions.rack?.depthBehindEarsMm ?? m.dimensions.d;
}

export function rackFit(bay: SurfaceDef, items: RackItem[]): RackFit {
  const rack = bay.rack;
  if (!rack) throw new Error(`Surface ${bay.id} is not a rack bay`);
  const occupancy: string[][] = Array.from({ length: rack.u }, () => []);
  const problems: RackProblem[] = [];
  const bayStandard = rack.standard ?? '19in';

  for (const { unitId, uStart, model } of items) {
    let h = rackHeightU(model);
    if (h === null) {
      if (model.formFactor !== 'rack') {
        problems.push({
          unitId,
          kind: 'not-rack',
          severity: 'error',
          message: `${label(model)} is not rack gear; put it on a rack shelf instead.`,
        });
        continue;
      }
      // Rack gear whose height is not known yet: occupy 1U so overlaps still show, and say so.
      problems.push({
        unitId,
        kind: 'unknown-height',
        severity: 'warning',
        message: `Rack height of ${label(model)} is unknown; counted as 1U.`,
      });
      h = 1;
    }
    const first = Math.round(uStart);
    const last = first + h - 1;
    if (first < 1 || last > rack.u) {
      problems.push({
        unitId,
        kind: 'out-of-range',
        severity: 'error',
        message: `${label(model)} (${h}U at U${first}) does not fit a ${rack.u}U bay (U${first}–U${last}).`,
      });
    }
    for (let u = Math.max(1, first); u <= Math.min(rack.u, last); u++) occupancy[u - 1]!.push(unitId);

    const gearStandard = model.dimensions.rack?.standard ?? '19in';
    if (gearStandard === '19in' && bayStandard === '10in')
      problems.push({
        unitId,
        kind: 'too-wide',
        severity: 'error',
        message: `${label(model)} is 19" gear; this is a 10" rack.`,
      });
    if (gearStandard === '10in' && bayStandard === '19in')
      problems.push({
        unitId,
        kind: 'needs-adapter',
        severity: 'info',
        message: `${label(model)} is 10" gear: needs a half-rack adapter or shelf in a 19" rack.`,
      });

    const depth = rackDepthMm(model);
    if (depth === null)
      problems.push({
        unitId,
        kind: 'unknown-depth',
        severity: 'info',
        message: `Depth of ${label(model)} is unknown; rack depth cannot be checked.`,
      });
    else if (depth > rack.depthMm)
      problems.push({
        unitId,
        kind: 'too-deep',
        severity: 'error',
        message: `${label(model)} is ${depth} mm deep; the rack allows ${rack.depthMm} mm.`,
      });
  }

  occupancy.forEach((ids, i) => {
    if (ids.length > 1)
      for (const id of ids.slice(1))
        if (!problems.some((p) => p.unitId === id && p.kind === 'overlap'))
          problems.push({
            unitId: id,
            kind: 'overlap',
            severity: 'error',
            message: `Overlaps another unit at U${i + 1}.`,
          });
  });
  const usedU = occupancy.filter((x) => x.length > 0).length;
  return { totalU: rack.u, usedU, freeU: rack.u - usedU, occupancy, problems };
}

/** First free start position for a model, or null when it does not fit anywhere. */
export function firstFreeU(bay: SurfaceDef, items: RackItem[], model: GearModel): number | null {
  const h = rackHeightU(model);
  if (h === null || !bay.rack) return null;
  const occ = rackFit(bay, items).occupancy;
  for (let u = 1; u + h - 1 <= bay.rack.u; u++) {
    if (occ.slice(u - 1, u - 1 + h).every((x) => x.length === 0)) return u;
  }
  return null;
}
