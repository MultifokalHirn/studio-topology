// Rule context (Appendix F): one setup with cached graph, geometry and lookups.
import type { BodyProfile, Connection, Connector, GearModel, GearUnit, Project, Setup } from '@/domain/types';
import { analyzeLayout, type LayoutReport } from '../layout';
import { buildSignalGraph, nodeKey, type SignalGraph } from '../graph';
import type { Issue } from '../issues';

export type RuleDep = 'placements' | 'connections' | 'stands' | 'unitConfigs' | 'body' | 'library';

export interface SetupContext {
  project: Project;
  setup: Setup;
  graph: SignalGraph;
  /** Geometry cache: resolved placements and layout analysis. */
  layout: LayoutReport;
  body: BodyProfile | undefined;
  unit(unitId: string): GearUnit | undefined;
  model(unitId: string): GearModel | undefined;
  nick(unitId: string): string;
  /** Connector as configured in this setup (alternates applied). */
  connector(unitId: string, connectorId: string): Connector | undefined;
  ends(c: Connection): { a: Connector; b: Connector } | undefined;
  /** Units that take part in the setup (placed, connected, or added to the patch). */
  present: Set<string>;
  connectionsAt(unitId: string, connectorId: string): Connection[];
}

export interface Rule {
  id: string;
  family: 'PHYS' | 'DIR' | 'SIG' | 'MIDI' | 'CLK' | 'USB' | 'PWR' | 'PLC' | 'ERG' | 'DATA';
  severity: Issue['severity'];
  title: string;
  rationale: string;
  dependsOn: RuleDep[];
  run(ctx: SetupContext): Issue[];
}

export function buildContext(project: Project, setup: Setup): SetupContext {
  const graph = buildSignalGraph(project, setup);
  const units = new Map(project.inventory.gearUnits.map((u) => [u.id, u]));
  const byEnd = new Map<string, Connection[]>();
  for (const c of setup.connections)
    for (const e of [c.a, c.b]) {
      const k = nodeKey(e.unitId, e.connectorId);
      byEnd.set(k, [...(byEnd.get(k) ?? []), c]);
    }
  const connector = (unitId: string, connectorId: string) => graph.connectorOf(nodeKey(unitId, connectorId));
  return {
    project,
    setup,
    graph,
    layout: analyzeLayout(project, setup),
    body: project.bodyProfiles.find((b) => b.id === setup.bodyProfileId) ?? project.bodyProfiles[0],
    unit: (id) => units.get(id),
    model: (id) => graph.modelOf(id),
    nick: (id) => units.get(id)?.nickname ?? id,
    connector,
    ends(c) {
      const a = connector(c.a.unitId, c.a.connectorId);
      const b = connector(c.b.unitId, c.b.connectorId);
      return a && b ? { a, b } : undefined;
    },
    // Placed, wired, or added to the patch view.
    present: new Set(
      [
        ...setup.placements.map((p) => p.unitId),
        ...setup.connections.flatMap((c) => [c.a.unitId, c.b.unitId]),
        ...Object.keys(setup.viewState.patchPositions),
      ].filter((id) => units.has(id)),
    ),
    connectionsAt: (unitId, connectorId) => byEnd.get(nodeKey(unitId, connectorId)) ?? [],
  };
}

/** Human label for one end of a connection. */
export function endLabel(ctx: SetupContext, e: Connection['a']): string {
  return `${ctx.nick(e.unitId)} · ${ctx.connector(e.unitId, e.connectorId)?.label ?? e.connectorId}`;
}
