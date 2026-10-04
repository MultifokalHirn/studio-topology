// CLK rules (spec §5.12) and graph-based SIG-006 channel continuity (§5.10).
import type { ClockSpec, Connector } from '@/domain/types';
import { nodeKey } from '../graph';
import type { Issue } from '../issues';
import { continuityBreaks } from '../trace';
import { clockLinks, clockMasters, clockTree, type ClockTree } from '../trees';
import { endLabel, type Rule, type SetupContext } from './context';

const treesOf = (ctx: SetupContext): ClockTree[] =>
  clockMasters(ctx.project, ctx.setup).map((m) => clockTree(ctx.graph, ctx.setup, m));

/** Formats a port can send or receive, from its own clock block and the unit's clock spec. */
function portFormats(c: Connector | undefined, spec: ClockSpec | undefined, wire: string): Set<string> {
  const out = new Set<string>();
  if (wire === 'midi' || wire === 'usb-midi') out.add('midi');
  if (c?.clock?.format === 'dinsync24' || wire === 'dinsync24') out.add('dinsync24');
  if (c?.clock?.format === 'dinsync48' || wire === 'dinsync48') out.add('dinsync48');
  if (c?.clock?.format === 'po-sync') out.add('po-sync');
  if (c?.clock?.format === 'word') out.add('word');
  if (c?.clock?.format === 'pulse' || wire === 'pulse')
    for (const f of spec?.formats ?? []) if (f.startsWith('pulse') || f === 'po-sync') out.add(f);
  return out;
}

export const clockRules: Rule[] = [
  {
    id: 'CLK-001',
    family: 'CLK',
    severity: 'warning',
    title: 'More than one clock master',
    rationale: 'A connected clock domain needs exactly one master.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      const trees = treesOf(ctx);
      const out: Issue[] = [];
      for (let i = 0; i < trees.length; i++)
        for (let j = i + 1; j < trees.length; j++) {
          const a = trees[i]!;
          const b = trees[j]!;
          const shared = [...a.reached.keys()].filter((u) => b.reached.has(u));
          const [src, dst] = a.reached.has(b.master)
            ? [a.master, b.master]
            : b.reached.has(a.master)
              ? [b.master, a.master]
              : [null, null];
          const others = shared.filter((u) => u !== a.master && u !== b.master);
          if (src || others.length)
            out.push({
              ruleId: 'CLK-001',
              severity: 'warning',
              entityIds: [a.master, b.master].sort(),
              message: src
                ? `${ctx.nick(src)} sends clock to ${ctx.nick(dst!)}, which is also set as clock master.`
                : `${ctx.nick(a.master)} and ${ctx.nick(b.master)} are both clock masters and both reach ${ctx.nick(others[0]!)}.`,
              fixes: [
                {
                  label: 'Make one of them follow external clock',
                  action: { kind: 'set-clock-slave', unitId: b.master },
                },
              ],
            });
        }
      return out;
    },
  },
  {
    id: 'CLK-002',
    family: 'CLK',
    severity: 'error',
    title: 'Clock loop',
    rationale: 'Clock returning to its source causes runaway tempo or stalls.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      const links = clockLinks(ctx.graph, ctx.setup);
      const adj = new Map<string, string[]>();
      for (const l of links) adj.set(l.from, [...(adj.get(l.from) ?? []), l.to]);
      const out: Issue[] = [];
      const state = new Map<string, 1 | 2>();
      const stack: string[] = [];
      const visit = (u: string) => {
        state.set(u, 1);
        stack.push(u);
        for (const v of adj.get(u) ?? []) {
          if (state.get(v) === 1) {
            const cycle = stack.slice(stack.indexOf(v));
            out.push({
              ruleId: 'CLK-002',
              severity: 'error',
              entityIds: [...cycle].sort(),
              message: `Clock loop: ${[...cycle, v].map((x) => ctx.nick(x)).join(' → ')}.`,
            });
          } else if (!state.has(v)) visit(v);
        }
        stack.pop();
        state.set(u, 2);
      };
      for (const u of adj.keys()) if (!state.has(u)) visit(u);
      const seen = new Set<string>();
      return out.filter((i) => (seen.has(i.entityIds.join()) ? false : (seen.add(i.entityIds.join()), true)));
    },
  },
  {
    id: 'CLK-003',
    family: 'CLK',
    severity: 'info',
    title: 'Slave without incoming clock',
    rationale: 'The unit follows external clock but no clock reaches the chosen input.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      const trees = treesOf(ctx);
      const links = clockLinks(ctx.graph, ctx.setup);
      const out: Issue[] = [];
      for (const unitId of ctx.present) {
        const cfg = ctx.setup.unitConfigs[unitId];
        if (!cfg || cfg.clockMaster || typeof cfg.clockSource !== 'object') continue;
        const input = cfg.clockSource.connectorId;
        const arriving = links.filter(
          (l) =>
            l.to === unitId &&
            [l.connection.a, l.connection.b].some((e) => e.unitId === unitId && e.connectorId === input),
        );
        const fromMaster = arriving.some((l) => trees.some((t) => t.reached.has(l.from)));
        if (!fromMaster)
          out.push({
            ruleId: 'CLK-003',
            severity: 'info',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)} follows clock on ${ctx.connector(unitId, input)?.label ?? input}, but ${arriving.length ? 'no master drives that chain' : 'nothing sends clock there'}.`,
          });
      }
      return out;
    },
  },
  {
    id: 'CLK-004',
    family: 'CLK',
    severity: 'warning',
    title: 'Clock format mismatch',
    rationale:
      'DIN sync 24 vs 48, pulse rates, Pocket-Operator sync and MIDI clock are not interchangeable without a converter.',
    dependsOn: ['connections', 'unitConfigs', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      const converters = ctx.project.inventory.gearUnits.filter((u) => {
        const f = ctx.project.library.gearModels.find((m) => m.id === u.modelId)?.clock?.formats ?? [];
        return f.length > 2;
      });
      for (const l of clockLinks(ctx.graph, ctx.setup)) {
        if (l.format === 'midi' || l.format === 'usb-midi' || l.format === 'adat') continue;
        const srcEnd = [l.connection.a, l.connection.b].find((e) => e.unitId === l.from)!;
        const dstEnd = [l.connection.a, l.connection.b].find((e) => e.unitId === l.to && e !== srcEnd)!;
        const sc = ctx.connector(srcEnd.unitId, srcEnd.connectorId);
        const dc = ctx.connector(dstEnd.unitId, dstEnd.connectorId);
        const send = portFormats(sc, ctx.model(l.from)?.clock, l.format);
        const recv = portFormats(dc, ctx.model(l.to)?.clock, dc?.clock?.format ?? l.format);
        if (!send.size || !recv.size || [...send].some((f) => recv.has(f))) continue;
        const helper = converters.find((u) => {
          const f = new Set(ctx.project.library.gearModels.find((m) => m.id === u.modelId)?.clock?.formats ?? []);
          return (
            [...send].some((x) => f.has(x as never)) &&
            [...recv].some((x) => f.has(x as never)) &&
            u.id !== l.from &&
            u.id !== l.to
          );
        });
        out.push({
          ruleId: 'CLK-004',
          severity: 'warning',
          entityIds: [l.connection.id],
          message: `${endLabel(ctx, srcEnd)} sends ${[...send].join('/')}; ${endLabel(ctx, dstEnd)} expects ${[...recv].join('/')}.`,
          fixes: helper
            ? [{ label: `Convert with ${helper.nickname}`, action: { kind: 'use-converter', unitId: helper.id } }]
            : undefined,
        });
      }
      return out;
    },
  },
  {
    id: 'CLK-005',
    family: 'CLK',
    severity: 'info',
    title: 'Clock only via a USB host',
    rationale: 'Clock that only arrives over USB depends on the host app (tablet/computer) running.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      const links = clockLinks(ctx.graph, ctx.setup);
      const trees = treesOf(ctx);
      const out: Issue[] = [];
      for (const unitId of ctx.present) {
        if (!ctx.model(unitId)?.clock?.canBeSlave) continue;
        const incoming = links.filter((l) => l.to === unitId);
        // A USB host that relays a master's clock (e.g. a MIDI hub) is fine; an app on a tablet/computer is the concern.
        const relayed = incoming.some((l) => trees.some((t) => t.reached.has(l.from)));
        if (incoming.length && !relayed && incoming.every((l) => l.format === 'usb-midi'))
          out.push({
            ruleId: 'CLK-005',
            severity: 'info',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)} gets clock only over USB from ${[...new Set(incoming.map((l) => ctx.nick(l.from)))].join(', ')}.`,
          });
      }
      return out;
    },
  },
];

/** SIG-006 through internal paths: an L/R source whose side flips further down the chain. */
export function continuityIssues(ctx: SetupContext): Issue[] {
  const out: Issue[] = [];
  for (const c of ctx.setup.connections) {
    if (!c.enabled) continue;
    const e = ctx.graph.cable.get(c.id);
    if (!e) continue;
    const src = ctx.graph.connectorOf(e.from);
    if (src?.channel?.role !== 'L' && src?.channel?.role !== 'R') continue;
    // Only start at origins (outputs that are not fed by an internal path from an L/R input).
    for (const b of continuityBreaks(ctx.graph, e.from)) {
      if (b.edge.kind === 'cable' && b.edge.connection?.id === c.id) continue; // direct swap: reported by the cable check
      const id = b.edge.connection?.id ?? b.edge.to;
      out.push({
        ruleId: 'SIG-006',
        severity: 'warning',
        entityIds: [id],
        message: `L/R continuity: the ${b.from} signal from ${endLabel(ctx, { unitId: e.from.split('/')[0]!, connectorId: e.from.split('/').slice(1).join('/') })} arrives at the ${b.to} port ${ctx.nick(b.edge.to.split('/')[0]!)} · ${ctx.graph.connectorOf(b.edge.to)?.label}.`,
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((i) => (seen.has(i.entityIds.join()) ? false : (seen.add(i.entityIds.join()), true)));
}

export { nodeKey };
