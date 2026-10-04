// PLC and DATA rules (spec §5.12). Geometry comes from the cached layout analysis (engine/layout.ts).
import { unverifiedFields } from '@/domain/libraryOps';
import { requiredLength, suggestCable } from '../connections';
import type { Issue } from '../issues';
import type { Rule, SetupContext } from './context';

const fromLayout = (ruleId: string) => (ctx: SetupContext) => ctx.layout.issues.filter((i) => i.ruleId === ruleId);

const layoutRule = (id: string, severity: Issue['severity'], title: string, rationale: string): Rule => ({
  id,
  family: id.startsWith('DATA') ? 'DATA' : 'PLC',
  severity,
  title,
  rationale,
  dependsOn: ['placements', 'stands', 'body', 'library'],
  run: fromLayout(id),
});

/** Heat output (W) above which a unit counts as "hot" for PLC-007. */
const HOT_W = 30;

export const placementDataRules: Rule[] = [
  layoutRule('PLC-001', 'error', 'Collision / overlap', 'Two units cannot occupy the same space.'),
  layoutRule('PLC-002', 'warning', 'Exceeds the surface', 'Units must sit within the usable surface.'),
  layoutRule('PLC-003', 'error', 'Load over the limit', "Stay below the surface's load rating (warning above 80%)."),
  layoutRule(
    'PLC-004',
    'warning',
    'Centre of mass unsupported',
    'More than a third of the depth beyond the holders can tip over.',
  ),
  layoutRule(
    'PLC-005',
    'warning',
    'Occlusion / hand clearance',
    'Upper rows must not hide lower controls (>15%) or leave too little hand room.',
  ),
  layoutRule('PLC-006', 'error', 'Rack fit', 'Rack gear must fit the bay height, width and depth.'),
  {
    id: 'PLC-007',
    family: 'PLC',
    severity: 'info',
    title: 'Thermal',
    rationale: `A unit dissipating ≥ ${HOT_W} W directly below another without a gap heats it.`,
    dependsOn: ['placements', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      const units = [...ctx.layout.layout.units.values()];
      for (const hot of units) {
        const w = hot.model.power.maxW ?? hot.model.power.typicalW;
        if (!w || w < HOT_W) continue;
        for (const above of units) {
          if (above === hot) continue;
          const xo = Math.min(hot.max.x, above.max.x) - Math.max(hot.min.x, above.min.x);
          const yo = Math.min(hot.max.y, above.max.y) - Math.max(hot.min.y, above.min.y);
          const gap = above.min.z - hot.max.z;
          if (xo > 0 && yo > 0 && gap >= -1 && gap < 5)
            out.push({
              ruleId: 'PLC-007',
              severity: 'info',
              entityIds: [hot.unitId, above.unitId],
              message: `${ctx.nick(hot.unitId)} (≈${w} W) sits directly below ${ctx.nick(above.unitId)} with no gap.`,
            });
        }
      }
      return out;
    },
  },
  {
    id: 'PLC-008',
    family: 'PLC',
    severity: 'warning',
    title: 'Cable reach',
    rationale: 'No stocked cable length covers the distance.',
    dependsOn: ['placements', 'connections', 'stands', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      for (const c of ctx.setup.connections) {
        if (!c.enabled) continue;
        const need = requiredLength(c, ctx.layout.layout.units, ctx.model, ctx.project.settings.cables);
        const e = ctx.ends(c);
        if (need === null || !e) continue;
        const model = c.cable.modelId
          ? ctx.project.library.cableModels.find((m) => m.id === c.cable.modelId)
          : undefined;
        if (model) {
          const longest = Math.max(0, ...model.lengthsMm);
          if (need > longest)
            out.push({
              ruleId: 'PLC-008',
              severity: 'warning',
              entityIds: [c.id],
              message: `${model.name}: needs ≈${(need / 1000).toFixed(1)} m; longest stocked is ${(longest / 1000).toFixed(1)} m.`,
              details: { needMm: Math.round(need), longestMm: longest },
            });
        } else {
          const best = suggestCable(e.a, e.b, need, ctx.project.library.cableModels)[0];
          if (best?.noStockedLength)
            out.push({
              ruleId: 'PLC-008',
              severity: 'warning',
              entityIds: [c.id],
              message: `No stocked cable reaches ≈${(need / 1000).toFixed(1)} m.`,
            });
        }
      }
      return out;
    },
  },
  layoutRule('PLC-009', 'warning', 'Slip risk', 'Tilt over 12° needs non-slip feet or VESA/strap mounting.'),
  layoutRule('DATA-001', 'info', 'Estimated dimensions', 'The placement uses estimated or unknown dimensions.'),
  {
    id: 'DATA-002',
    family: 'DATA',
    severity: 'info',
    title: 'Unverified fields',
    rationale: 'Unknown or estimated values make checks less certain.',
    dependsOn: ['placements', 'connections', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      for (const unitId of ctx.present) {
        const m = ctx.model(unitId);
        const n = m ? unverifiedFields(m).length : 0;
        if (n)
          out.push({
            ruleId: 'DATA-002',
            severity: 'info',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)}: ${n} unverified field${n === 1 ? '' : 's'} in its model.`,
            details: { count: n },
          });
      }
      return out;
    },
  },
];
