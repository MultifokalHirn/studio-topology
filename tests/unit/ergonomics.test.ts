import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '@/domain/serialize';
import { placeOnSurface } from '@/domain/setupOps';
import type { Project } from '@/domain/types';
import {
  adviseAssignment,
  applyTierRecommendations,
  comfortScore,
  ergonomicsReport,
  optimizeTiers,
  recommendedTilt,
  targetPlane,
} from '@/engine/ergonomics';
import { analyzeLayout } from '@/engine/layout';
import { buildContext, runRules } from '@/engine/rules';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const planesOf = (rs: ReturnType<typeof optimizeTiers>['recommendations']) =>
  Object.fromEntries(rs.map((r) => [r.surfaceId, r.to.planeZ!]));

describe('scores (spec §5.13)', () => {
  it('targets, comfort and tilt', () => {
    const m = sample().library.gearModels.find((x) => x.id.includes('digitone'))!;
    expect(targetPlane(m, 'primary', 1090)).toBe(1040);
    expect(targetPlane(m, 'rare', 1090)).toBe(990);
    expect(targetPlane({ ...m, ergonomics: { ...m.ergonomics, interaction: 'keys' } }, 'primary', 1090)).toBe(1090);
    expect(comfortScore(1040, 1040)).toBe(100);
    expect(comfortScore(1165, 1040)).toBe(50);
    expect(comfortScore(700, 1040)).toBe(0);
    expect(recommendedTilt(50, true)).toBe(12);
    expect(recommendedTilt(40, false)).toBe(15);
    expect(recommendedTilt(20, false)).toBe(0);
  });

  it('setup score is the usage-weighted mean', () => {
    const p = sample();
    const e = ergonomicsReport(p, p.setups[1]!)!;
    const w = e.units.reduce((a, u) => a + u.weight, 0);
    expect(e.score).toBeCloseTo(e.units.reduce((a, u) => a + u.weight * u.score, 0) / w, 6);
    expect(e.units.find((u) => u.unitId === 'unit-dt2')).toMatchObject({
      usage: 'primary',
      weight: 3,
      target: 1040 - 0.1,
    });
  });
});

describe('scenario 8: ergonomics (spec §11)', () => {
  it('standing H = 1730: planes near 1190 / 1000 / 800; seated near 880 / 690 / 490 with ERG-001 on the top row', () => {
    const p = sample();
    const plan = p.setups[1]!;
    const standing = optimizeTiers(p, plan);
    const sp = planesOf(standing.recommendations);
    // Our minimum pitch (tallest lower unit + 90 mm hand + 30 mm holder) and the knob target (elbow − 50) put the
    // stack 30–50 mm higher than the spec's illustrative figures (docs/decisions.md #79).
    expect(Math.abs(sp['tier-top']! - 1190)).toBeLessThanOrEqual(60);
    expect(Math.abs(sp['tier-middle']! - 1000)).toBeLessThanOrEqual(60);
    expect(Math.abs(sp['tier-bottom']! - 800)).toBeLessThanOrEqual(60);
    for (const q of standing.pitches) expect(q.pitchMm).toBeGreaterThanOrEqual(q.minPitchMm - 0.5);
    for (const r of standing.recommendations) expect(r.to.z % 5).toBe(0);

    const seated = structuredClone(plan);
    seated.posture = 'seated';
    const res = optimizeTiers(p, seated);
    const pp = planesOf(res.recommendations);
    expect(Math.abs(pp['tier-top']! - 880)).toBeLessThanOrEqual(60);
    expect(Math.abs(pp['tier-middle']! - 690)).toBeLessThanOrEqual(60);
    expect(Math.abs(pp['tier-bottom']! - 490)).toBeLessThanOrEqual(60);
    expect(res.scoreAfter!).toBeGreaterThan(res.scoreBefore!);

    applyTierRecommendations(p, seated, res.recommendations);
    const top = analyzeLayout(p, seated).surfaces.find((s) => s.surfaceId === 'tier-top')!.unitIds;
    const erg = runRules(buildContext(p, seated), { only: ['ERG-001'] }).issues;
    const onTop = erg.filter((i) => top.includes(i.entityIds[0]!));
    expect(onTop.length).toBeGreaterThan(0);
    expect(onTop.some((i) => seated.unitConfigs[i.entityIds[0]!]?.usage === 'primary')).toBe(true);

    // Idempotent: optimising the optimised setup changes nothing.
    const again = optimizeTiers(p, seated);
    for (const r of again.recommendations) expect([r.to.z, r.to.tiltDeg]).toEqual([r.from.z, r.from.tiltDeg]);
  });

  it('assignment advisor keeps width budgets and does not lower the score', () => {
    const p = sample();
    const plan = p.setups[1]!;
    const a = adviseAssignment(p, plan, 'stand-unit-jaspers');
    expect(a.scoreAfter!).toBeGreaterThanOrEqual(a.scoreBefore!);
    const s = structuredClone(plan);
    for (const m of a.moves) placeOnSurface(s, m.unitId, 'stand-unit-jaspers', m.toSurfaceId, m.x, m.y);
    const r = analyzeLayout(p, s);
    for (const row of r.surfaces.filter((x) => x.kind === 'tier'))
      expect(row.widthUsedMm).toBeLessThanOrEqual(row.widthAvailMm);
    expect(r.issues.filter((i) => i.ruleId === 'PLC-001')).toEqual([]); // no overlaps after packing
  });
});
