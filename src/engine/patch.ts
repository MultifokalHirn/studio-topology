// Patch graph (spec §5.7): nodes = units, ports = connectors, edges = connections with derived flow.
// Includes a deterministic layered fallback layout; the UI refines it with ELK when available.
import { newId } from '@/domain/ids';
import type { Connection, Connector, GearModel, Project, Setup } from '@/domain/types';
import { compatibility, effectiveConnector, requiredLength, suggestCable } from './connections';
import type { ResolvedUnit } from './placement';

export const NODE_W = 200;
export const HEADER_H = 28;
export const ROW_H = 18;
export const COL_GAP = 140;
export const ROW_GAP = 40;

export type PortSide = 'west' | 'east';

export interface PatchPort {
  connector: Connector;
  side: PortSide;
  index: number;
  connected: boolean;
}

export interface PatchNode {
  unitId: string;
  label: string;
  model: GearModel;
  ports: PatchPort[];
  width: number;
  height: number;
}

export interface PatchEdge {
  connection: Connection;
  from: { unitId: string; connectorId: string };
  to: { unitId: string; connectorId: string };
  bidir: boolean;
  invalid: boolean;
}

export interface PatchGraph {
  nodes: PatchNode[];
  edges: PatchEdge[];
}

export function portSide(c: Connector): PortSide {
  if (c.direction === 'in') return 'west';
  if (c.direction === 'out' || c.direction === 'thru') return 'east';
  // bidir: USB devices face their host (west); hosts, patch points and network ports face east.
  return c.usb?.role === 'device' ? 'west' : 'east';
}

/** Units shown in the patch: placed, wired, or explicitly added to the patch (pinned position). */
export function patchUnitIds(project: Project, setup: Setup): string[] {
  const owned = new Set(project.inventory.gearUnits.map((u) => u.id));
  const ids = new Set<string>();
  for (const p of setup.placements) ids.add(p.unitId);
  for (const c of setup.connections) ids.add(c.a.unitId).add(c.b.unitId);
  for (const id of Object.keys(setup.viewState.patchPositions)) ids.add(id);
  return [...ids].filter((id) => owned.has(id));
}

export function buildPatchGraph(
  project: Project,
  setup: Setup,
  opts: { allPorts: boolean; hideUnconnected?: boolean },
): PatchGraph {
  const models = new Map(project.library.gearModels.map((m) => [m.id, m]));
  const units = new Map(project.inventory.gearUnits.map((u) => [u.id, u]));
  const connected = new Set(
    setup.connections.flatMap((c) => [`${c.a.unitId}/${c.a.connectorId}`, `${c.b.unitId}/${c.b.connectorId}`]),
  );
  const nodes: PatchNode[] = [];
  for (const unitId of patchUnitIds(project, setup)) {
    const unit = units.get(unitId)!;
    const model = models.get(unit.modelId);
    if (!model) continue;
    const cfg = setup.unitConfigs[unitId];
    const visible = model.connectors
      .map((c) => effectiveConnector(c, cfg))
      .filter((c) => opts.allPorts || connected.has(`${unitId}/${c.id}`));
    if (opts.hideUnconnected && visible.length === 0) continue;
    const west = visible.filter((c) => portSide(c) === 'west');
    const east = visible.filter((c) => portSide(c) === 'east');
    const ports: PatchPort[] = [
      ...west.map((c, index) => ({
        connector: c,
        side: 'west' as const,
        index,
        connected: connected.has(`${unitId}/${c.id}`),
      })),
      ...east.map((c, index) => ({
        connector: c,
        side: 'east' as const,
        index,
        connected: connected.has(`${unitId}/${c.id}`),
      })),
    ];
    nodes.push({
      unitId,
      label: unit.nickname,
      model,
      ports,
      width: NODE_W,
      height: HEADER_H + Math.max(1, west.length, east.length) * ROW_H + 8,
    });
  }
  const shown = new Set(nodes.map((n) => n.unitId));
  const conn = (unitId: string, id: string) => {
    const unit = units.get(unitId);
    const c = unit ? models.get(unit.modelId)?.connectors.find((x) => x.id === id) : undefined;
    return c ? effectiveConnector(c, setup.unitConfigs[unitId]) : undefined;
  };
  const edges: PatchEdge[] = [];
  for (const c of setup.connections) {
    if (!shown.has(c.a.unitId) || !shown.has(c.b.unitId)) continue;
    const ca = conn(c.a.unitId, c.a.connectorId);
    const cb = conn(c.b.unitId, c.b.connectorId);
    if (!ca || !cb) continue;
    const { flow } = compatibility(ca, cb);
    const forward = flow.from === 'a';
    edges.push({
      connection: c,
      from: forward ? c.a : c.b,
      to: forward ? c.b : c.a,
      bidir: flow.kind === 'bidir',
      invalid: flow.kind === 'invalid',
    });
  }
  return { nodes, edges };
}

export function portPosition(
  node: PatchNode,
  port: PatchPort,
  origin: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: origin.x + (port.side === 'west' ? 0 : node.width),
    y: origin.y + HEADER_H + port.index * ROW_H + ROW_H / 2,
  };
}

/**
 * Layered fallback: column = longest path from a source over directed, non-power edges (cycles broken by DFS order),
 * rows in input order. Pinned positions win.
 */
export function layeredLayout(
  g: PatchGraph,
  pinned: Record<string, { x: number; y: number; pinned: boolean }>,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (e.invalid || e.bidir) continue;
    if (e.from.unitId === e.to.unitId) continue;
    const dom = g.nodes
      .find((n) => n.unitId === e.from.unitId)
      ?.ports.find((p) => p.connector.id === e.from.connectorId)?.connector.domain;
    if (dom?.startsWith('power.')) continue; // supplies would push everything right
    if (!out.has(e.from.unitId)) out.set(e.from.unitId, new Set());
    out.get(e.from.unitId)!.add(e.to.unitId);
  }
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (layer.has(id)) return layer.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let d = 0;
    for (const [src, targets] of out) if (targets.has(id) && src !== id) d = Math.max(d, depth(src) + 1);
    visiting.delete(id);
    layer.set(id, d);
    return d;
  };
  g.nodes.forEach((n) => depth(n.unitId));
  // Units connected only by power (supplies, strips) get their own last column so signal flow reads left to right.
  const signalUnits = new Set<string>();
  for (const e of g.edges) {
    const dom = g.nodes
      .find((n) => n.unitId === e.from.unitId)
      ?.ports.find((p) => p.connector.id === e.from.connectorId)?.connector.domain;
    if (!dom?.startsWith('power.')) signalUnits.add(e.from.unitId).add(e.to.unitId);
  }
  const maxLayer = Math.max(0, ...[...layer.values()]);
  const columns = new Map<number, typeof g.nodes>();
  for (const n of g.nodes) {
    const powerOnly =
      !signalUnits.has(n.unitId) && g.edges.some((e) => e.from.unitId === n.unitId || e.to.unitId === n.unitId);
    const l = powerOnly ? maxLayer + 1 : (layer.get(n.unitId) ?? 0);
    columns.set(l, [...(columns.get(l) ?? []), n]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [l, nodes] of [...columns.entries()].sort(([a], [b]) => a - b)) {
    let y = 0;
    for (const n of nodes) {
      pos.set(n.unitId, { x: l * (NODE_W + COL_GAP), y });
      y += n.height + ROW_GAP;
    }
  }
  for (const [id, p] of Object.entries(pinned)) if (p.pinned && pos.has(id)) pos.set(id, { x: p.x, y: p.y });
  const pinnedIds = new Set(
    Object.entries(pinned)
      .filter(([, p]) => p.pinned)
      .map(([id]) => id),
  );
  return resolveOverlaps(g, pos, pinnedIds);
}

/** Push nodes down until no two overlap (pinned nodes can collide when their port lists grow). */
export function resolveOverlaps(
  g: PatchGraph,
  pos: Map<string, { x: number; y: number }>,
  pinned: Set<string> = new Set(),
): Map<string, { x: number; y: number }> {
  const size = new Map(g.nodes.map((n) => [n.unitId, n]));
  // Pinned nodes claim their spot first; auto-placed nodes move around them.
  const byY = (a: string, b: string) => pos.get(a)!.y - pos.get(b)!.y || pos.get(a)!.x - pos.get(b)!.x;
  const ids = [...pos.keys()];
  const order = [...ids.filter((id) => pinned.has(id)).sort(byY), ...ids.filter((id) => !pinned.has(id)).sort(byY)];
  const placed: { id: string; x: number; y: number; w: number; h: number }[] = [];
  const out = new Map<string, { x: number; y: number }>();
  for (const id of order) {
    const n = size.get(id);
    const p = { ...pos.get(id)! };
    const w = n?.width ?? NODE_W;
    const h = n?.height ?? HEADER_H;
    for (let guard = 0; guard < placed.length + 1; guard++) {
      const hit = placed.find(
        (q) => p.x < q.x + q.w + 10 && p.x + w + 10 > q.x && p.y < q.y + q.h + 10 && p.y + h + 10 > q.y,
      );
      if (!hit) break;
      p.y = hit.y + hit.h + ROW_GAP;
    }
    placed.push({ id, x: p.x, y: p.y, w, h });
    out.set(id, p);
  }
  return out;
}

// ---------- creating connections ----------

/** Stereo/numbered partner for Shift-connect: L↔R in the same group, or the next numbered channel. */
export function pairPartner(model: GearModel, c: Connector): Connector | undefined {
  const ch = c.channel;
  if (!ch) return undefined;
  if ((ch.role === 'L' || ch.role === 'R') && ch.group)
    return model.connectors.find(
      (x) => x.id !== c.id && x.channel?.group === ch.group && x.channel?.role === (ch.role === 'L' ? 'R' : 'L'),
    );
  if (ch.role === 'numbered' && ch.index !== undefined) {
    const n = ch.index;
    const wantId = c.id.replace(String(n), String(n + 1));
    return model.connectors.find(
      (x) => x.id === wantId && x.domain === c.domain && x.direction === c.direction && x.channel?.index === n + 1,
    );
  }
  return undefined;
}

export interface NewConnectionInput {
  a: { unitId: string; connector: Connector };
  b: { unitId: string; connector: Connector };
  bundleId?: string;
  midiChannels?: number[] | 'omni' | 'per-track';
}

/** Build a connection with a suggested cable, the computed length (when both ends are placed) and domain defaults. */
export function makeConnection(
  project: Project,
  units: Map<string, ResolvedUnit>,
  input: NewConnectionInput,
): Connection {
  const modelOf = (unitId: string) =>
    project.library.gearModels.find((m) => m.id === project.inventory.gearUnits.find((u) => u.id === unitId)?.modelId);
  const base: Connection = {
    id: newId(),
    a: { unitId: input.a.unitId, connectorId: input.a.connector.id },
    b: { unitId: input.b.unitId, connectorId: input.b.connector.id },
    cable: { adapters: [], autoLength: true },
    enabled: true,
    ...(input.bundleId ? { bundleId: input.bundleId } : {}),
  };
  const need = requiredLength(base, units, modelOf, project.settings.cables);
  const best = suggestCable(input.a.connector, input.b.connector, need, project.library.cableModels)[0];
  if (best?.cableModelId) base.cable.modelId = best.cableModelId;
  if (best) base.cable.adapters = best.adapters;
  if (best?.lengthMm) base.cable.lengthMm = best.lengthMm;
  const ca = input.a.connector;
  const cb = input.b.connector;
  if (ca.domain.startsWith('midi.') || cb.domain.startsWith('midi.')) {
    const src = compatibility(ca, cb).flow.from === 'a' ? ca : cb;
    const carries = src.midi?.carries ?? ['notes', 'cc'];
    base.midi = {
      channels: input.midiChannels ?? [1],
      purposes: (['notes', 'cc', 'pc', 'clock', 'transport', 'sysex'] as const).filter((p) => carries.includes(p)),
    };
  }
  if (ca.usb && cb.usb) {
    const host = ca.usb.role === 'host' ? input.a.unitId : cb.usb.role === 'host' ? input.b.unitId : undefined;
    if (host) base.usb = { hostUnitId: host };
  }
  return base;
}

export const newBundleId = () => `bundle-${newId()}`;
