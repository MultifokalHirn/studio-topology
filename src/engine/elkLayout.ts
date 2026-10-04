// ELK layered layout for the patch view (spec §2: elkjs, left to right). Pure apart from running ELK.
import ELK from 'elkjs/lib/elk.bundled.js';
import { HEADER_H, ROW_H, type PatchGraph } from './patch';

export interface ElkInput {
  id: string;
  layoutOptions: Record<string, string>;
  children: {
    id: string;
    width: number;
    height: number;
    layoutOptions: Record<string, string>;
    ports: { id: string; width: number; height: number; x: number; y: number; layoutOptions: Record<string, string> }[];
  }[];
  edges: { id: string; sources: string[]; targets: string[] }[];
}

export function elkGraph(g: PatchGraph): ElkInput {
  const portId = (unitId: string, connectorId: string) => `${unitId}::${connectorId}`;
  const nodeIds = new Set(g.nodes.map((n) => n.unitId));
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
      'elk.spacing.nodeNode': '40',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: g.nodes.map((n) => ({
      id: n.unitId,
      width: n.width,
      height: n.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: n.ports.map((p) => ({
        id: portId(n.unitId, p.connector.id),
        width: 1,
        height: 1,
        x: p.side === 'west' ? 0 : n.width,
        y: HEADER_H + p.index * ROW_H + ROW_H / 2,
        layoutOptions: { 'elk.port.side': p.side === 'west' ? 'WEST' : 'EAST' },
      })),
    })),
    edges: g.edges
      .filter(
        (e) => !e.invalid && nodeIds.has(e.from.unitId) && nodeIds.has(e.to.unitId) && e.from.unitId !== e.to.unitId,
      )
      .map((e) => ({
        id: e.connection.id,
        sources: [portId(e.from.unitId, e.from.connectorId)],
        targets: [portId(e.to.unitId, e.to.connectorId)],
      })),
  };
}

/** Node positions from ELK (top-left corners). */
export async function elkPositions(g: PatchGraph): Promise<Map<string, { x: number; y: number }>> {
  const elk = new ELK();
  const out = await elk.layout(elkGraph(g) as unknown as Parameters<typeof elk.layout>[0]);
  return new Map((out.children ?? []).map((c) => [c.id, { x: Math.round(c.x ?? 0), y: Math.round(c.y ?? 0) }]));
}
