import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@/domain/defaults';
import { loadProject } from '@/domain/serialize';
import type { Placement, Project, Setup } from '@/domain/types';
import { landmarks } from '@/engine/body';
import { analyzeLayout, minRowPitch, occlusionFraction } from '@/engine/layout';
import { effectiveModel, resolveLayout, unitSize } from '@/engine/placement';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const surface = (unit: string, surfaceId: string, x: number, y = 20): Placement => ({
  unitId: `unit-${unit}`,
  mount: { type: 'surface', standUnitId: 'stand-unit-jaspers', surfaceId, x, y },
  rotationDeg: 0,
  locked: false,
  zIndex: 0,
});

/** Spec §11 scenario 2: Jaspers with planes 800/1000/1190; OT, A4, KeyStep middle; Digitone II and iPad top. */
function scenario2(topTray: number): { p: Project; s: Setup } {
  const p = sample();
  const s = structuredClone(p.setups.find((x) => x.name === 'Planned (standing)')!);
  s.stands = s.stands.filter((x) => x.standUnitId === 'stand-unit-jaspers');
  s.stands[0]!.surfaceStates = {
    'tier-bottom': { z: 800 - 77 },
    'tier-middle': { z: 1000 - 82 },
    'tier-top': { z: topTray },
  };
  s.placements = [
    surface('ot', 'tier-middle', 120),
    surface('a4', 'tier-middle', 500),
    surface('keystep', 'tier-middle', 925),
    surface('dt2', 'tier-top', 200),
    surface('ipad', 'tier-top', 1150),
  ];
  return { p, s };
}

describe('body landmarks (spec §5.13)', () => {
  const body = { id: 'b', name: 'b', heightMm: 1730, handedness: 'right' as const };
  it('H = 1730 standing and seated within ±2 mm', () => {
    const st = landmarks(body, 'standing');
    expect(Math.abs(st.elbowMm - 1090)).toBeLessThanOrEqual(2);
    expect(Math.abs(st.eyeMm - 1620)).toBeLessThanOrEqual(2);
    const se = landmarks(body, 'seated');
    expect(Math.abs(se.elbowMm - 710)).toBeLessThanOrEqual(2);
    expect(Math.abs(se.eyeMm - 1250)).toBeLessThanOrEqual(2);
    expect(se.seatMm).toBeCloseTo(470.56, 1);
  });

  it('overrides win', () => {
    expect(landmarks({ ...body, overrides: { elbowStandingMm: 1000 } }, 'standing').elbowMm).toBe(1000);
  });
});

describe('row pitch (spec §10)', () => {
  const e = defaultSettings().ergonomics;
  it('minimum pitch with overhang for 63 and 82 mm lower units ≈ 184 / 202 mm', () => {
    expect(Math.abs(minRowPitch(63, 63, true, e) - 184)).toBeLessThanOrEqual(2);
    expect(Math.abs(minRowPitch(82, 63, true, e) - 202)).toBeLessThanOrEqual(2);
  });
  it('staggered rows only need sightline clearance', () => {
    expect(minRowPitch(82, 63, false, e)).toBe(102);
  });
});

describe('placement resolution', () => {
  it('trays, control planes and racks', () => {
    const { p, s } = scenario2(1127);
    const layout = resolveLayout(p, s);
    const ot = layout.units.get('unit-ot')!;
    expect(ot.trayZ).toBe(918);
    expect(ot.controlPlaneZ).toBe(981);
    expect(layout.units.get('unit-dt2')!.controlPlaneZ).toBe(1190);
    const sample2 = sample();
    const rackLayout = resolveLayout(sample2, sample2.setups[0]!);
    const dbx = rackLayout.units.get('unit-dbx')!; // U1 of a 12U bay, bay floor at z = 20
    expect(dbx.min.z).toBeCloseTo(20 + 11 * 44.45);
    expect(dbx.max.z).toBeCloseTo(20 + 12 * 44.45);
  });

  it('unknown dimensions use flagged estimates; keyboards from their key count', () => {
    const p = sample();
    const ks = p.library.gearModels.find((m) => m.id === 'gear-arturia-keystep')!;
    expect(unitSize(ks)).toMatchObject({ w: 500, d: 180, h: 50, estimated: true });
  });

  it('unit overrides apply', () => {
    const p = sample();
    const dt = p.library.gearModels.find((m) => m.id === 'gear-elektron-digitone-ii')!;
    expect(
      effectiveModel(dt, { id: 'u', modelId: dt.id, nickname: 'x', overrides: { 'dimensions.h': 70 } }).dimensions.h,
    ).toBe(70);
  });
});

describe('occlusion', () => {
  it('directly above and close to the eye hides the lower unit; moved back it does not', () => {
    const { p, s } = scenario2(1127);
    const layout = resolveLayout(p, s);
    const dt = layout.units.get('unit-dt2')!;
    const ot = layout.units.get('unit-ot')!;
    const eye = { x: 0, y: 0, z: 1620 };
    expect(occlusionFraction(dt, ot, eye)).toBeGreaterThan(0.15);
    s.stands[0]!.surfaceStates['tier-top'] = { z: 1127, y: 250 };
    expect(occlusionFraction(resolveLayout(p, s).units.get('unit-dt2')!, ot, eye)).toBe(0);
  });

  it('a unit below the control plane never occludes', () => {
    const { p, s } = scenario2(1127);
    const layout = resolveLayout(p, s);
    expect(
      occlusionFraction(layout.units.get('unit-ot')!, layout.units.get('unit-dt2')!, { x: 0, y: 0, z: 1620 }),
    ).toBe(0);
  });
});

describe('scenario 2 (spec §11)', () => {
  it('reports width budget, load per tier, row pitch and occlusion; raising the top tier 20 mm clears the warning', () => {
    const before = analyzeLayout(...(Object.values(scenario2(1127)) as [Project, Setup]));
    const middle = before.surfaces.find((r) => r.surfaceId === 'tier-middle')!;
    expect(middle.widthUsedMm).toBe(340 + 385 + 500);
    expect(middle.widthAvailMm).toBe(1450);
    expect(middle.loadKg).toBeCloseTo(2.3 + 2.4);
    expect(middle.loadComplete).toBe(false); // KeyStep weight unknown
    expect(middle.planeZ).toBe(1000);
    const top = before.surfaces.find((r) => r.surfaceId === 'tier-top')!;
    expect(top.loadKg).toBeCloseTo(1.48 + 0.444);
    expect(top.planeZ).toBe(1190);
    const pitch = before.pitches.find((x) => x.upper.surfaceId === 'tier-top')!;
    expect(pitch.pitchMm).toBe(190);
    const occ = before.occlusions.find((o) => o.upperUnitId === 'unit-dt2' && o.lowerUnitId === 'unit-ot')!;
    expect(occ.hiddenFraction).toBeGreaterThan(0.15);
    expect(before.issues.filter((i) => i.ruleId === 'PLC-005').map((i) => i.entityIds)).toContainEqual([
      'unit-dt2',
      'unit-ot',
    ]);

    const after = analyzeLayout(...(Object.values(scenario2(1147)) as [Project, Setup]));
    expect(
      after.occlusions.find((o) => o.upperUnitId === 'unit-dt2' && o.lowerUnitId === 'unit-ot')!.hiddenFraction,
    ).toBeLessThanOrEqual(0.15);
    expect(after.issues.filter((i) => i.ruleId === 'PLC-005')).toEqual([]);
  });
});

describe('placement checks', () => {
  it('overlap, surface bounds, load, centre of mass and slip risk', () => {
    const { p, s } = scenario2(1147);
    s.placements.push(surface('heat', 'tier-top', 160)); // on top of the Digitone II
    s.placements.push(surface('mbrute', 'tier-middle', 1300, 0)); // too wide for the tier, and heavy
    s.placements.push(surface('wave2', 'tier-top', 400, 250)); // 295 deep from y = 250: 145 mm behind 400 mm holders
    s.stands[0]!.surfaceStates['tier-top'] = { z: 1147, tiltDeg: 20 };
    const ids = (rule: string) =>
      analyzeLayout(p, s)
        .issues.filter((i) => i.ruleId === rule)
        .flatMap((i) => i.entityIds);
    expect(ids('PLC-001')).toEqual(expect.arrayContaining(['unit-dt2', 'unit-heat']));
    expect(ids('PLC-002')).toContain('unit-mbrute');
    expect(analyzeLayout(p, s).issues.find((i) => i.ruleId === 'PLC-003')?.severity).toBe('error'); // 23 kg on a 15 kg tier
    expect(ids('PLC-004')).toContain('unit-wave2');
    expect(ids('PLC-009')).toEqual(expect.arrayContaining(['unit-heat', 'unit-ipad'])); // 20° tilt, no non-slip feet
    expect(ids('PLC-009')).not.toContain('unit-dt2'); // VESA-mounted
  });
});
