// ERG rules (spec §5.12, §5.13).
import { ergonomicsReport, REACH_COMFORT_MM, REACH_MAX_MM, type ErgoReport } from '../ergonomics';
import type { Issue } from '../issues';
import type { Rule, SetupContext } from './context';

const reportCache = new WeakMap<SetupContext, ErgoReport | null>();
const ergoOf = (ctx: SetupContext) => {
  if (!reportCache.has(ctx)) reportCache.set(ctx, ergonomicsReport(ctx.project, ctx.setup, ctx.layout.layout));
  return reportCache.get(ctx)!;
};
const mm = (v: number) => `${Math.round(v)} mm`;

export const ergonomicRules: Rule[] = [
  {
    id: 'ERG-001',
    family: 'ERG',
    severity: 'warning',
    title: 'Control plane outside the comfort band',
    rationale:
      'Primary controls belong within ±100 mm of the elbow; below −150 or above +100 mm is outside the acceptable zone.',
    dependsOn: ['placements', 'stands', 'body', 'unitConfigs', 'library'],
    run(ctx) {
      const e = ergoOf(ctx);
      if (!e) return [];
      const band = ctx.project.settings.ergonomics;
      const out: Issue[] = [];
      for (const u of e.units) {
        if (u.usage === 'rare') continue;
        const d = u.plane - e.lm.elbowMm;
        const acceptable = d >= -band.acceptableLowerMm && d <= band.comfortBandMm;
        const comfortable = Math.abs(d) <= band.comfortBandMm;
        const where = `${mm(Math.abs(d))} ${d > 0 ? 'above' : 'below'} the elbow (${mm(e.lm.elbowMm)})`;
        if (!acceptable)
          out.push({
            ruleId: 'ERG-001',
            severity: u.usage === 'primary' ? 'error' : 'warning',
            entityIds: [u.unitId],
            message: `${ctx.nick(u.unitId)}: control plane ${mm(u.plane)} is ${where}, outside the acceptable zone.`,
            details: { planeMm: Math.round(u.plane), elbowMm: Math.round(e.lm.elbowMm) },
            fixes: [{ label: 'Run the tier optimiser', action: { kind: 'optimize-tiers' } }],
          });
        else if (!comfortable && u.usage === 'primary')
          out.push({
            ruleId: 'ERG-001',
            severity: 'warning',
            entityIds: [u.unitId],
            message: `${ctx.nick(u.unitId)}: control plane ${mm(u.plane)} is ${where}, outside the ±${band.comfortBandMm} mm comfort band.`,
            details: { planeMm: Math.round(u.plane), elbowMm: Math.round(e.lm.elbowMm) },
            fixes: [{ label: 'Run the tier optimiser', action: { kind: 'optimize-tiers' } }],
          });
      }
      return out;
    },
  },
  {
    id: 'ERG-002',
    family: 'ERG',
    severity: 'warning',
    title: 'Row pitch below the minimum',
    rationale:
      'Hands need room between rows: tallest lower unit + hand clearance + holder (+ overhang), or 20 mm for staggered rows.',
    dependsOn: ['placements', 'stands', 'library'],
    run(ctx) {
      return ctx.layout.pitches
        .filter((p) => p.pitchMm < p.minPitchMm - 0.5)
        .map((p) => ({
          ruleId: 'ERG-002',
          severity: 'warning' as const,
          entityIds: [p.lower.surfaceId, p.upper.surfaceId, ...p.lower.unitIds, ...p.upper.unitIds],
          message: `${p.lower.label} → ${p.upper.label}: row pitch ${mm(p.pitchMm)} is below the ${mm(p.minPitchMm)} minimum${p.overhang ? ' (upper row overhangs)' : ''}.`,
          details: { pitchMm: Math.round(p.pitchMm), minPitchMm: Math.round(p.minPitchMm) },
          fixes: [{ label: 'Run the tier optimiser', action: { kind: 'optimize-tiers' } }],
        }));
    },
  },
  {
    id: 'ERG-003',
    family: 'ERG',
    severity: 'warning',
    title: 'Primary unit outside the prime zone while a rare unit occupies it',
    rationale: 'The prime zone (comfort band, within ±450 mm of the body centre) should hold the most used gear.',
    dependsOn: ['placements', 'stands', 'body', 'unitConfigs', 'library'],
    run(ctx) {
      const e = ergoOf(ctx);
      if (!e) return [];
      const band = ctx.project.settings.ergonomics.comfortBandMm;
      const prime = (u: ErgoReport['units'][number]) =>
        Math.abs(u.plane - e.lm.elbowMm) <= band && Math.abs(u.lateralMm) <= REACH_COMFORT_MM;
      const rare = e.units.filter((u) => u.usage === 'rare' && prime(u));
      const out: Issue[] = [];
      for (const p of e.units.filter((u) => u.usage === 'primary' && !prime(u))) {
        // Suggest the rare unit whose position would help this primary unit most.
        const best = [...rare].sort((a, b) => Math.abs(a.plane - p.target) - Math.abs(b.plane - p.target))[0];
        if (!best) continue;
        out.push({
          ruleId: 'ERG-003',
          severity: 'warning',
          entityIds: [p.unitId, best.unitId],
          message: `${ctx.nick(p.unitId)} (primary) is outside the prime zone while ${ctx.nick(best.unitId)} (rare) sits in it.`,
          fixes: [
            {
              label: `Swap with ${ctx.nick(best.unitId)}`,
              action: { kind: 'swap-units', a: p.unitId, b: best.unitId },
            },
          ],
        });
      }
      return out;
    },
  },
  {
    id: 'ERG-004',
    family: 'ERG',
    severity: 'info',
    title: 'Steep line of sight to a display',
    rationale: 'Over 40° below horizontal a display is hard to read unless the unit is tilted towards the eye.',
    dependsOn: ['placements', 'stands', 'body', 'library'],
    run(ctx) {
      const e = ergoOf(ctx);
      if (!e) return [];
      return e.units
        .filter(
          (u) =>
            ctx.model(u.unitId)?.ergonomics.needsDisplayVisibility &&
            u.losDeg > 40 &&
            u.tiltDeg < u.recommendedTiltDeg - 1,
        )
        .map((u) => ({
          ruleId: 'ERG-004',
          severity: 'info' as const,
          entityIds: [u.unitId],
          message: `${ctx.nick(u.unitId)}: display ${Math.round(u.losDeg)}° below eye level at ${u.tiltDeg}° tilt (recommended ${Math.round(u.recommendedTiltDeg)}°).`,
          details: { losDeg: Math.round(u.losDeg), recommendedTiltDeg: Math.round(u.recommendedTiltDeg) },
        }));
    },
  },
  {
    id: 'ERG-005',
    family: 'ERG',
    severity: 'warning',
    title: 'Primary unit beyond comfortable lateral reach',
    rationale: 'Comfortable reach is ±450 mm from the body centre line, the maximum ±600 mm.',
    dependsOn: ['placements', 'stands', 'unitConfigs', 'library'],
    run(ctx) {
      const e = ergoOf(ctx);
      if (!e) return [];
      return e.units
        .filter((u) => u.usage === 'primary' && Math.abs(u.lateralMm) > REACH_COMFORT_MM)
        .map((u) => ({
          ruleId: 'ERG-005',
          severity: 'warning' as const,
          entityIds: [u.unitId],
          message: `${ctx.nick(u.unitId)} is ${mm(Math.abs(u.lateralMm))} ${u.lateralMm < 0 ? 'left' : 'right'} of the body centre${Math.abs(u.lateralMm) > REACH_MAX_MM ? `, beyond the ${REACH_MAX_MM} mm maximum reach` : ` (comfortable up to ${REACH_COMFORT_MM} mm)`}.`,
          details: { lateralMm: Math.round(u.lateralMm) },
        }));
    },
  },
];
