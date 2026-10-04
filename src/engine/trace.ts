// Signal tracing (spec §5.10): downstream/upstream paths, terminal destinations, breadcrumbs, channel continuity.
import type { Connector } from '@/domain/types';
import { domainFamily, type DomainFamily } from './connections';
import { nodeKey, splitKey, type GraphEdge, type NodeKey, type SignalGraph } from './graph';

export interface Terminal {
  node: NodeKey;
  /** destination: an input that consumes the signal; dead-end: an output (or thru) with nothing connected. */
  kind: 'destination' | 'dead-end';
}

export interface Trace {
  start: NodeKey;
  family: DomainFamily;
  /** Every edge on the way (for highlighting). */
  edges: GraphEdge[];
  nodes: Set<NodeKey>;
  /** Simple paths from the start to each terminal (capped). */
  paths: NodeKey[][];
  terminals: Terminal[];
}

const MAX_PATHS = 200;

/** Family a trace follows: the start connector's; USB data carries audio/MIDI, so it is followed too. */
function follows(family: DomainFamily, c: Connector | undefined): boolean {
  if (!c) return false;
  const f = domainFamily(c.domain);
  if (f === family) return true;
  return (
    (family === 'audio' || family === 'midi' || family === 'digital-audio') &&
    (f === 'data' || f === 'digital-audio' || f === 'audio')
  );
}

export function traceFrom(g: SignalGraph, start: NodeKey, direction: 'down' | 'up' = 'down'): Trace {
  const startConn = g.connectorOf(start);
  const family = startConn ? domainFamily(startConn.domain) : 'other';
  const next = (k: NodeKey) =>
    (direction === 'down' ? g.out(k) : g.in(k)).filter((e) =>
      follows(family, g.connectorOf(direction === 'down' ? e.to : e.from)),
    );
  const edges: GraphEdge[] = [];
  const nodes = new Set<NodeKey>([start]);
  const seenEdge = new Set<GraphEdge>();
  const paths: NodeKey[][] = [];
  const terminals = new Map<NodeKey, Terminal>();

  const dfs = (k: NodeKey, path: NodeKey[]) => {
    const outs = next(k).filter((e) => !path.includes(direction === 'down' ? e.to : e.from));
    if (outs.length === 0) {
      if (k !== start) {
        const c = g.connectorOf(k);
        const kind: Terminal['kind'] =
          direction === 'down' && c && (c.direction === 'out' || c.direction === 'thru') ? 'dead-end' : 'destination';
        terminals.set(k, { node: k, kind });
        if (paths.length < MAX_PATHS) paths.push(path);
      } else if (direction === 'down') terminals.set(k, { node: k, kind: 'dead-end' });
      return;
    }
    for (const e of outs) {
      const n = direction === 'down' ? e.to : e.from;
      if (!seenEdge.has(e)) {
        seenEdge.add(e);
        edges.push(e);
      }
      nodes.add(n);
      if (paths.length < MAX_PATHS) dfs(n, [...path, n]);
    }
  };
  dfs(start, [start]);
  return { start, family, edges, nodes, paths, terminals: [...terminals.values()] };
}

export function nodeLabel(g: SignalGraph, k: NodeKey, nick: (unitId: string) => string): string {
  const { unitId, connectorId } = splitKey(k);
  return `${nick(unitId)} · ${g.connectorOf(k)?.label ?? connectorId}`;
}

/** Breadcrumb of the first path: "Digitone II · Main L → Analog Heat · In L → …" (spec §5.10). */
export function breadcrumb(g: SignalGraph, trace: Trace, nick: (unitId: string) => string): string {
  const path = trace.paths[0] ?? [trace.start];
  const more =
    trace.paths.length > 1 ? ` (+${trace.paths.length - 1} more path${trace.paths.length > 2 ? 's' : ''})` : '';
  return path.map((k) => nodeLabel(g, k, nick)).join(' → ') + more;
}

export interface ContinuityBreak {
  /** The edge where the side flips. */
  edge: GraphEdge;
  from: 'L' | 'R';
  to: 'L' | 'R';
  path: NodeKey[];
}

const side = (c: Connector | undefined): 'L' | 'R' | null =>
  c?.channel?.role === 'L' || c?.channel?.role === 'R' ? c.channel.role : null;

/**
 * Channel continuity (spec §5.10, SIG-006): follow an L or R source downstream through cables and non-summing
 * internal paths; report where the side flips (L arriving at an R port). Mixer sums and splits are not breaks.
 */
export function continuityBreaks(g: SignalGraph, start: NodeKey): ContinuityBreak[] {
  const origin = side(g.connectorOf(start));
  if (!origin) return [];
  const out: ContinuityBreak[] = [];
  const seen = new Set<NodeKey>([start]);
  const walk = (k: NodeKey, current: 'L' | 'R', path: NodeKey[]) => {
    for (const e of g.out(k)) {
      if (e.kind === 'internal' && e.path && (e.path.mode === 'sum' || e.path.mode === 'split')) continue;
      if (seen.has(e.to)) continue;
      const s = side(g.connectorOf(e.to));
      if (s && s !== current) out.push({ edge: e, from: current, to: s, path: [...path, e.to] });
      seen.add(e.to);
      walk(e.to, s ?? current, [...path, e.to]);
    }
  };
  walk(start, origin, [start]);
  return out;
}

export { nodeKey };
