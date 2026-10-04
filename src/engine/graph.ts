// Signal graph (Appendix F): a directed multigraph over (unit, connector) nodes. Edges are enabled connections
// (in their derived direction) and active internal paths (input → output). Used by rules, tracing and trees.
import type { Connection, Connector, GearModel, InternalPath, Project, Setup, UnitConfig } from '@/domain/types';
import { connectionFlow, domainFamily, effectiveConnector, type DomainFamily } from './connections';

export type NodeKey = string; // `${unitId}/${connectorId}`
export const nodeKey = (unitId: string, connectorId: string): NodeKey => `${unitId}/${connectorId}`;
export const splitKey = (k: NodeKey) => {
  const i = k.indexOf('/');
  return { unitId: k.slice(0, i), connectorId: k.slice(i + 1) };
};

export interface GraphEdge {
  from: NodeKey;
  to: NodeKey;
  kind: 'cable' | 'internal';
  connection?: Connection;
  path?: InternalPath;
  bidir?: boolean;
}

export interface SignalGraph {
  connectorOf(k: NodeKey): Connector | undefined;
  modelOf(unitId: string): GearModel | undefined;
  out(k: NodeKey): GraphEdge[];
  in(k: NodeKey): GraphEdge[];
  edges: GraphEdge[];
  /** Cable edges by connection id (flow-oriented). */
  cable: Map<string, GraphEdge>;
  downstream(k: NodeKey, opts?: { family?: DomainFamily; maxDepth?: number }): GraphEdge[];
  upstream(k: NodeKey, opts?: { family?: DomainFamily; maxDepth?: number }): GraphEdge[];
  findCycles(family: DomainFamily): NodeKey[][];
}

/** Is an internal path active in this setup (presets per unit or per group, spec §4.4)? */
export function pathActive(path: InternalPath, model: GearModel, cfg?: UnitConfig): boolean {
  if (!path.presetId) return true;
  if (path.group) {
    const chosen = cfg?.pathPresets?.[path.group];
    const first = model.internalPaths.find((p) => p.group === path.group && p.presetId)?.presetId;
    return path.presetId === (chosen ?? first);
  }
  const chosen = cfg?.routingPresetId;
  const first = model.internalPaths.find((p) => p.presetId && !p.group)?.presetId;
  return path.presetId === (chosen ?? first);
}

const baseId = (ref: string) => ref.split(':')[0]!;

export function buildSignalGraph(project: Project, setup: Setup): SignalGraph {
  const units = new Map(project.inventory.gearUnits.map((u) => [u.id, u]));
  const models = new Map(project.library.gearModels.map((m) => [m.id, m]));
  const modelOf = (unitId: string) => models.get(units.get(unitId)?.modelId ?? '');
  const connCache = new Map<NodeKey, Connector | undefined>();
  const connectorOf = (k: NodeKey) => {
    if (connCache.has(k)) return connCache.get(k);
    const { unitId, connectorId } = splitKey(k);
    const raw = modelOf(unitId)?.connectors.find((c) => c.id === connectorId);
    const c = raw ? effectiveConnector(raw, setup.unitConfigs[unitId]) : undefined;
    connCache.set(k, c);
    return c;
  };

  const edges: GraphEdge[] = [];
  const cable = new Map<string, GraphEdge>();
  for (const c of setup.connections) {
    if (!c.enabled) continue;
    const ka = nodeKey(c.a.unitId, c.a.connectorId);
    const kb = nodeKey(c.b.unitId, c.b.connectorId);
    const ca = connectorOf(ka);
    const cb = connectorOf(kb);
    if (!ca || !cb) continue;
    const flow = connectionFlow(ca, cb);
    if (flow.kind === 'invalid') continue;
    const e: GraphEdge =
      flow.from === 'a'
        ? { from: ka, to: kb, kind: 'cable', connection: c }
        : { from: kb, to: ka, kind: 'cable', connection: c };
    if (flow.kind === 'bidir') e.bidir = true;
    edges.push(e);
    cable.set(c.id, e);
    if (flow.kind === 'bidir') edges.push({ from: e.to, to: e.from, kind: 'cable', connection: c, bidir: true });
  }
  // Internal paths of every unit present in the setup.
  const present = new Set(
    setup.connections.flatMap((c) => [c.a.unitId, c.b.unitId]).concat(setup.placements.map((p) => p.unitId)),
  );
  for (const unitId of present) {
    const m = modelOf(unitId);
    if (!m) continue;
    for (const path of m.internalPaths) {
      if (!pathActive(path, m, setup.unitConfigs[unitId])) continue;
      const pairs = path.channelMap?.length
        ? path.channelMap.map((x) => [x.from, x.to] as const)
        : path.from.flatMap((f) => path.to.map((t) => [f, t] as const));
      for (const [f, t] of pairs) {
        const fk = nodeKey(unitId, baseId(f));
        const tk = nodeKey(unitId, baseId(t));
        if (fk !== tk) edges.push({ from: fk, to: tk, kind: 'internal', path });
      }
    }
  }
  // Thru ports repeat the unit's MIDI input(s).
  for (const unitId of present) {
    const m = modelOf(unitId);
    for (const thru of m?.connectors.filter(
      (c) => c.direction === 'thru' || effectiveConnector(c, setup.unitConfigs[unitId]).direction === 'thru',
    ) ?? []) {
      for (const inp of m!.connectors.filter((c) => c.direction === 'in' && c.domain.startsWith('midi.')))
        edges.push({ from: nodeKey(unitId, inp.id), to: nodeKey(unitId, thru.id), kind: 'internal' });
    }
  }

  const outIdx = new Map<NodeKey, GraphEdge[]>();
  const inIdx = new Map<NodeKey, GraphEdge[]>();
  for (const e of edges) {
    (outIdx.get(e.from) ?? outIdx.set(e.from, []).get(e.from)!).push(e);
    (inIdx.get(e.to) ?? inIdx.set(e.to, []).get(e.to)!).push(e);
  }
  const fam = (k: NodeKey) => {
    const c = connectorOf(k);
    return c ? domainFamily(c.domain) : 'other';
  };
  const walk = (
    start: NodeKey,
    dir: 'out' | 'in',
    opts: { family?: DomainFamily; maxDepth?: number } = {},
  ): GraphEdge[] => {
    const seen = new Set<NodeKey>([start]);
    const result: GraphEdge[] = [];
    let frontier = [start];
    for (let depth = 0; frontier.length && depth < (opts.maxDepth ?? 1000); depth++) {
      const next: NodeKey[] = [];
      for (const k of frontier)
        for (const e of (dir === 'out' ? outIdx : inIdx).get(k) ?? []) {
          const n = dir === 'out' ? e.to : e.from;
          if (opts.family && fam(n) !== opts.family && e.kind === 'cable') continue;
          result.push(e);
          if (!seen.has(n)) {
            seen.add(n);
            next.push(n);
          }
        }
      frontier = next;
    }
    return result;
  };

  return {
    connectorOf,
    modelOf,
    out: (k) => outIdx.get(k) ?? [],
    in: (k) => inIdx.get(k) ?? [],
    edges,
    cable,
    downstream: (k, o) => walk(k, 'out', o),
    upstream: (k, o) => walk(k, 'in', o),
    findCycles(family) {
      // Tarjan SCCs over nodes of one family (bidir pairs are ignored: they are not loops).
      const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((k) => fam(k) === family);
      const index = new Map<NodeKey, number>();
      const low = new Map<NodeKey, number>();
      const stack: NodeKey[] = [];
      const on = new Set<NodeKey>();
      const out: NodeKey[][] = [];
      let i = 0;
      const strong = (v: NodeKey) => {
        index.set(v, i);
        low.set(v, i++);
        stack.push(v);
        on.add(v);
        for (const e of outIdx.get(v) ?? []) {
          if (e.bidir || fam(e.to) !== family) continue;
          const w = e.to;
          if (!index.has(w)) {
            strong(w);
            low.set(v, Math.min(low.get(v)!, low.get(w)!));
          } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
        if (low.get(v) === index.get(v)) {
          const comp: NodeKey[] = [];
          let w: NodeKey;
          do {
            w = stack.pop()!;
            on.delete(w);
            comp.push(w);
          } while (w !== v);
          if (comp.length > 1) out.push(comp);
        }
      };
      for (const v of nodes) if (!index.has(v)) strong(v);
      return out;
    },
  };
}
