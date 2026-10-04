// Rule registry and runner (spec §5.12, Appendix F).
import type { Project, Setup } from '@/domain/types';
import type { Issue } from '../issues';
import { clockRules, continuityIssues } from './clock';
import { connectivityRules } from './connectivity';
import { buildContext, type Rule, type RuleDep, type SetupContext } from './context';
import { midiUsbPowerRules } from './midiUsbPower';
import { placementDataRules } from './placementData';

export type { Rule, RuleDep, SetupContext };
export { buildContext };

// SIG-006 also follows L/R through internal paths (M7).
const sig006 = connectivityRules.find((r) => r.id === 'SIG-006')!;
const baseSig006 = sig006.run;
sig006.run = (ctx) => [...baseSig006(ctx), ...continuityIssues(ctx)];
sig006.dependsOn = [...new Set([...sig006.dependsOn, 'unitConfigs' as const, 'library' as const])];

export const rules: Rule[] = [...connectivityRules, ...midiUsbPowerRules, ...clockRules, ...placementDataRules];
export const ruleById = new Map(rules.map((r) => [r.id, r]));

export interface RuleRun {
  issues: Issue[];
  suppressed: (Issue & { reason: string })[];
  /** Per rule: runtime in ms (for the performance budget). */
  timings: Record<string, number>;
}

const sameEntities = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Run the rules for one setup. With `changed`, only rules whose `dependsOn` intersects it run (incremental),
 * and `previous` supplies the other rules' last results.
 */
export function runRules(
  ctx: SetupContext,
  opts: { changed?: Set<RuleDep>; previous?: Issue[]; only?: string[] } = {},
): RuleRun {
  const timings: Record<string, number> = {};
  const all: Issue[] = [];
  const active = rules.filter((r) => !opts.only || opts.only.includes(r.id));
  for (const r of active) {
    const affected = !opts.changed || r.dependsOn.some((d) => opts.changed!.has(d));
    if (!affected && opts.previous) {
      all.push(...opts.previous.filter((i) => i.ruleId === r.id));
      continue;
    }
    const t0 = performance.now();
    try {
      all.push(...r.run(ctx));
    } catch (e) {
      all.push({
        ruleId: r.id,
        severity: 'info',
        entityIds: [],
        message: `Rule ${r.id} failed: ${(e as Error).message}`,
      });
    }
    timings[r.id] = performance.now() - t0;
  }
  const issues: Issue[] = [];
  const suppressed: RuleRun['suppressed'] = [];
  for (const i of all) {
    const s = ctx.setup.suppressedIssues.find((x) => x.ruleId === i.ruleId && sameEntities(x.entityIds, i.entityIds));
    if (s) suppressed.push({ ...i, reason: s.reason });
    else issues.push(i);
  }
  const rank = { error: 0, warning: 1, info: 2 } as const;
  issues.sort((a, b) => rank[a.severity] - rank[b.severity] || a.ruleId.localeCompare(b.ruleId));
  return { issues, suppressed, timings };
}

export function validateSetup(project: Project, setup: Setup): RuleRun {
  return runRules(buildContext(project, setup));
}
