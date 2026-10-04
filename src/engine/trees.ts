// Clock, USB and power trees (spec §5.14, scenario 7) and the CLK rules' data model.
import type { ClockSpec, Connection, Connector, Project, Setup } from '@/domain/types';
import { connectionFlow, domainFamily } from './connections';
import { nodeKey, type SignalGraph } from './graph';

// ---------- clock ----------

export type ClockFormat = NonNullable<ClockSpec['formats']>[number];

export interface ClockLink {
  from: string;
  to: string;
  connection: Connection;
  /** Format on the wire: midi, dinsync24/48, pulse, po-sync, word, adat, usb-midi. */
  format: string;
  hops: number;
}

export interface ClockTree {
  master: string;
  links: ClockLink[];
  /** Units reached, with hop count. */
  reached: Map<string, number>;
}

/** Does this connection carry clock, and in which format? */
export function clockFormatOf(c: Connection, src: Connector, dst: Connector): string | null {
  if (!c.enabled) return null;
  const f = domainFamily(src.domain);
  if (src.domain === 'clock.dinsync') return src.clock?.format === 'dinsync48' ? 'dinsync48' : 'dinsync24';
  if (f === 'clock') return src.clock?.format ?? (src.domain === 'clock.word' ? 'word' : 'pulse');
  if (f === 'midi') {
    const purposes = c.midi?.purposes;
    const carries = purposes ? purposes.includes('clock') : (src.midi?.carries.includes('clock') ?? true);
    return carries ? (src.domain === 'midi.usb' ? 'usb-midi' : 'midi') : null;
  }
  if (f === 'data' && src.usb?.carries.includes('midi') && dst.usb?.carries.includes('midi')) return 'usb-midi';
  if (src.domain === 'audio.adat') return 'adat';
  return null;
}

/** Masters: units configured as clock master, or with an internal clock source that send clock. */
export function clockMasters(project: Project, setup: Setup): string[] {
  return Object.entries(setup.unitConfigs)
    .filter(([, cfg]) => cfg.clockMaster === true)
    .map(([id]) => id)
    .filter((id) => project.inventory.gearUnits.some((u) => u.id === id));
}

export function clockLinks(g: SignalGraph, setup: Setup): Omit<ClockLink, 'hops'>[] {
  const out: Omit<ClockLink, 'hops'>[] = [];
  for (const c of setup.connections) {
    const a = g.connectorOf(nodeKey(c.a.unitId, c.a.connectorId));
    const b = g.connectorOf(nodeKey(c.b.unitId, c.b.connectorId));
    if (!a || !b) continue;
    const flow = connectionFlow(a, b);
    if (flow.kind === 'invalid') continue;
    const [src, dst, s, d] = flow.from === 'a' ? [a, b, c.a, c.b] : [b, a, c.b, c.a];
    const format = clockFormatOf(c, src, dst);
    if (!format) continue;
    if (flow.kind === 'bidir') {
      // USB: clock flows from the host to the device.
      const host =
        c.usb?.hostUnitId ?? (a.usb?.role === 'host' ? c.a.unitId : b.usb?.role === 'host' ? c.b.unitId : s.unitId);
      const device = host === c.a.unitId ? c.b.unitId : c.a.unitId;
      out.push({ from: host, to: device, connection: c, format });
    } else out.push({ from: s.unitId, to: d.unitId, connection: c, format });
  }
  return out;
}

/** Tree from one master: breadth-first over clock-carrying links; every reached unit relays (Thru, hubs, sync out). */
export function clockTree(g: SignalGraph, setup: Setup, master: string): ClockTree {
  const links = clockLinks(g, setup);
  const reached = new Map<string, number>([[master, 0]]);
  const used: ClockLink[] = [];
  let frontier = [master];
  for (let hops = 1; frontier.length; hops++) {
    const next: string[] = [];
    for (const u of frontier)
      for (const l of links.filter((x) => x.from === u)) {
        // A relaying unit only passes clock on if it follows that input (or has no explicit source).
        const cfg = setup.unitConfigs[l.to];
        used.push({ ...l, hops });
        if (reached.has(l.to)) continue;
        reached.set(l.to, hops);
        if (!cfg?.clockMaster) next.push(l.to); // another master is reached but does not relay
      }
    frontier = next;
  }
  return { master, links: used, reached };
}

/** Units that take clock from a specific input but get no clock there from any master. */
export function unclockedSlaves(project: Project, setup: Setup, trees: ClockTree[]): string[] {
  return Object.entries(setup.unitConfigs)
    .filter(
      ([id, cfg]) =>
        typeof cfg.clockSource === 'object' && !cfg.clockMaster && project.inventory.gearUnits.some((u) => u.id === id),
    )
    .map(([id]) => id)
    .filter((id) => !trees.some((t) => t.reached.has(id)));
}

// ---------- USB ----------

export interface UsbNode {
  unitId: string;
  connectorId: string;
  via?: Connection;
  children: UsbNode[];
  busPoweredDrawMa: number | null;
  audio: boolean;
}

export function usbForest(g: SignalGraph, setup: Setup): UsbNode[] {
  const links: { host: string; hostPort: string; device: string; devicePort: string; c: Connection }[] = [];
  for (const c of setup.connections) {
    if (!c.enabled) continue;
    const a = g.connectorOf(nodeKey(c.a.unitId, c.a.connectorId));
    const b = g.connectorOf(nodeKey(c.b.unitId, c.b.connectorId));
    if (!a?.usb || !b?.usb) continue;
    const aHost = a.usb.role === 'host' || c.usb?.hostUnitId === c.a.unitId;
    const [h, d] = aHost ? [c.a, c.b] : [c.b, c.a];
    links.push({ host: h.unitId, hostPort: h.connectorId, device: d.unitId, devicePort: d.connectorId, c });
  }
  const node = (unitId: string, connectorId: string, via: Connection | undefined, seen: Set<string>): UsbNode => {
    const conn = g.connectorOf(nodeKey(unitId, connectorId));
    const children = seen.has(unitId)
      ? []
      : links
          .filter((l) => l.host === unitId)
          .map((l) => node(l.device, l.devicePort, l.c, new Set([...seen, unitId])));
    return {
      unitId,
      connectorId,
      via,
      children,
      busPoweredDrawMa: conn?.usb?.busPowered ? (conn.usb.drawsBusPowerMa ?? null) : 0,
      audio: !!conn?.usb?.audio,
    };
  };
  const roots = [...new Set(links.map((l) => l.host))].filter((h) => !links.some((l) => l.device === h));
  return roots.map((r) => node(r, links.find((l) => l.host === r)!.hostPort, undefined, new Set()));
}

// ---------- power ----------

export interface PowerNode {
  unitId: string;
  /** Connector on the supplying side and on this unit. */
  via?: { connection: Connection; supplyConnector: string; inputConnector: string };
  children: PowerNode[];
}

export function powerForest(g: SignalGraph, setup: Setup): PowerNode[] {
  const links: { from: string; to: string; c: Connection; fromConn: string; toConn: string }[] = [];
  for (const c of setup.connections) {
    if (!c.enabled) continue;
    const a = g.connectorOf(nodeKey(c.a.unitId, c.a.connectorId));
    const b = g.connectorOf(nodeKey(c.b.unitId, c.b.connectorId));
    if (!a || !b || !a.domain.startsWith('power.') || !b.domain.startsWith('power.')) continue;
    const flow = connectionFlow(a, b);
    if (flow.kind !== 'directed') continue;
    const [s, d] = flow.from === 'a' ? [c.a, c.b] : [c.b, c.a];
    links.push({ from: s.unitId, to: d.unitId, c, fromConn: s.connectorId, toConn: d.connectorId });
  }
  const node = (unitId: string, via: PowerNode['via'], seen: Set<string>): PowerNode => ({
    unitId,
    via,
    children: seen.has(unitId)
      ? []
      : links
          .filter((l) => l.from === unitId)
          .map((l) =>
            node(
              l.to,
              { connection: l.c, supplyConnector: l.fromConn, inputConnector: l.toConn },
              new Set([...seen, unitId]),
            ),
          ),
  });
  const roots = [...new Set(links.map((l) => l.from))].filter((u) => !links.some((l) => l.to === u));
  return roots.map((r) => node(r, undefined, new Set()));
}
