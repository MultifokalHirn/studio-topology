// MIDI, USB and PWR rules (spec §5.12).
import type { Connection, Connector } from '@/domain/types';
import { modelWatts } from '../power';
import { barrelSize, connectionFlow, domainFamily } from '../connections';
import { nodeKey } from '../graph';
import type { Issue } from '../issues';
import { endLabel, type Rule, type SetupContext } from './context';

const live = (ctx: SetupContext) => ctx.setup.connections.filter((c) => c.enabled);
const isMidi = (c: Connector) => domainFamily(c.domain) === 'midi';
function orient(ctx: SetupContext, c: Connection) {
  const e = ctx.ends(c);
  if (!e) return undefined;
  const f = connectionFlow(e.a, e.b);
  return f.from === 'a'
    ? { src: e.a, dst: e.b, s: c.a, d: c.b, kind: f.kind }
    : { src: e.b, dst: e.a, s: c.b, d: c.a, kind: f.kind };
}

// ---------- MIDI ----------

const midiRules: Rule[] = [
  {
    id: 'MIDI-001',
    family: 'MIDI',
    severity: 'warning',
    title: 'Thru chain deeper than 3 hops',
    rationale: 'Each Thru adds latency and can corrupt timing; use a hub beyond three hops.',
    dependsOn: ['connections'],
    run(ctx) {
      const out: Issue[] = [];
      // Hop count = number of Thru ports between the original source and a destination.
      const hops = (unitId: string, depth: number, seen: Set<string>, chain: string[]) => {
        const m = ctx.model(unitId);
        for (const thru of m?.connectors.filter((x) => ctx.connector(unitId, x.id)?.direction === 'thru') ?? []) {
          for (const c of ctx.connectionsAt(unitId, thru.id).filter((x) => x.enabled)) {
            const o = orient(ctx, c);
            if (!o || o.s.unitId !== unitId || seen.has(o.d.unitId)) continue;
            const next = [...chain, c.id];
            if (depth + 1 > 3)
              out.push({
                ruleId: 'MIDI-001',
                severity: 'warning',
                entityIds: next,
                message: `MIDI Thru chain of ${depth + 1} hops reaches ${ctx.nick(o.d.unitId)}; use a MIDI hub.`,
                details: { hops: depth + 1 },
              });
            hops(o.d.unitId, depth + 1, new Set([...seen, o.d.unitId]), next);
          }
        }
      };
      for (const c of live(ctx)) {
        const o = orient(ctx, c);
        if (o && isMidi(o.src) && o.src.direction === 'out')
          hops(o.d.unitId, 0, new Set([o.s.unitId, o.d.unitId]), [c.id]);
      }
      return dedupe(out);
    },
  },
  {
    id: 'MIDI-002',
    family: 'MIDI',
    severity: 'info',
    title: 'Channel collision',
    rationale: 'Two destinations listening on the same channel from one source both play.',
    dependsOn: ['connections'],
    run(ctx) {
      // Per MIDI output port: downstream destination units (through hubs and thrus) with the channels on each first cable.
      const out: Issue[] = [];
      for (const [, edge] of ctx.graph.cable) {
        const src = ctx.graph.connectorOf(edge.from);
        if (!src || !isMidi(src) || src.direction !== 'out') continue;
        // Only origins: the source unit is not itself fed by MIDI (hubs pass through).
        const reached = ctx.graph
          .downstream(edge.from, { family: 'midi' })
          .filter((e) => e.kind === 'cable' && e.connection?.midi);
        const byChannel = new Map<number, Set<string>>();
        for (const e of reached) {
          const dstUnit = e.to.split('/')[0]!;
          const ch = e.connection!.midi!.channels;
          if (!Array.isArray(ch)) continue;
          for (const n of ch) byChannel.set(n, new Set([...(byChannel.get(n) ?? []), dstUnit]));
        }
        for (const [n, unitsOn] of byChannel)
          if (unitsOn.size > 1)
            out.push({
              ruleId: 'MIDI-002',
              severity: 'info',
              entityIds: [...unitsOn].sort(),
              message: `Channel ${n} from ${endLabel(ctx, { unitId: edge.from.split('/')[0]!, connectorId: edge.from.split('/').slice(1).join('/') })} reaches ${[...unitsOn].map((u) => ctx.nick(u)).join(' and ')}.`,
              details: { channel: n },
            });
      }
      return dedupe(out);
    },
  },
  {
    id: 'MIDI-003',
    family: 'MIDI',
    severity: 'error',
    title: 'MIDI source without input',
    rationale: 'A Thru only repeats what arrives at MIDI In; with nothing connected it sends nothing.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      return live(ctx).flatMap((c): Issue[] => {
        const o = orient(ctx, c);
        if (!o || !isMidi(o.src) || o.src.direction !== 'thru') return [];
        const fed = ctx
          .model(o.s.unitId)
          ?.connectors.some(
            (x) => x.direction === 'in' && isMidi(x) && ctx.connectionsAt(o.s.unitId, x.id).some((y) => y.enabled),
          );
        return fed
          ? []
          : [
              {
                ruleId: 'MIDI-003',
                severity: 'error',
                entityIds: [c.id],
                message: `${endLabel(ctx, o.s)} is used as a source, but nothing feeds ${ctx.nick(o.s.unitId)}'s MIDI In.`,
              },
            ];
      });
    },
  },
  {
    id: 'MIDI-004',
    family: 'MIDI',
    severity: 'error',
    title: 'TRS MIDI type A/B mismatch',
    rationale: 'TRS-A and TRS-B swap tip and ring; mixing them without a converter does not work.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      return live(ctx).flatMap((c): Issue[] => {
        const e = ctx.ends(c);
        if (!e) return [];
        const types = [e.a, e.b].map(
          (x) => x.midi?.trsType ?? (x.domain === 'midi.trs-a' ? 'A' : x.domain === 'midi.trs-b' ? 'B' : null),
        );
        const adapter = c.cable.adapters
          .map((a) => ctx.project.library.cableModels.find((m) => m.id === a))
          .find((m) => m?.carries.some((d) => d.startsWith('midi.trs')));
        const adapterType = adapter?.carries.includes('midi.trs-a')
          ? 'A'
          : adapter?.carries.includes('midi.trs-b')
            ? 'B'
            : null;
        const all = [...types, adapterType].filter(Boolean);
        return new Set(all).size > 1
          ? [
              {
                ruleId: 'MIDI-004',
                severity: 'error',
                entityIds: [c.id],
                message: `TRS MIDI type mismatch (${all.join(' / ')}) on ${endLabel(ctx, c.a)} → ${endLabel(ctx, c.b)}.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'MIDI-005',
    family: 'MIDI',
    severity: 'warning',
    title: 'DIN MIDI cable over 15 m',
    rationale: 'The MIDI spec limits DIN cables to 15 m.',
    dependsOn: ['connections'],
    run(ctx) {
      return live(ctx).flatMap((c): Issue[] => {
        const e = ctx.ends(c);
        return e && (e.a.domain === 'midi.din' || e.b.domain === 'midi.din') && (c.cable.lengthMm ?? 0) > 15000
          ? [
              {
                ruleId: 'MIDI-005',
                severity: 'warning',
                entityIds: [c.id],
                message: `MIDI cable of ${(c.cable.lengthMm! / 1000).toFixed(1)} m (max 15 m).`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'MIDI-006',
    family: 'MIDI',
    severity: 'error',
    title: 'Channel outside 1–16',
    rationale: 'MIDI 1.0 has 16 channels.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      const out: Issue[] = [];
      for (const c of ctx.setup.connections) {
        const bad = Array.isArray(c.midi?.channels) ? c.midi!.channels.filter((n) => n < 1 || n > 16) : [];
        bad.push(...(c.midi?.trackMap ?? []).map((t) => t.toChannel).filter((n) => n < 1 || n > 16));
        if (bad.length)
          out.push({
            ruleId: 'MIDI-006',
            severity: 'error',
            entityIds: [c.id],
            message: `MIDI channel ${bad.join(', ')} is outside 1–16.`,
          });
      }
      for (const [unitId, cfg] of Object.entries(ctx.setup.unitConfigs))
        for (const [track, n] of Object.entries({ ...cfg.midiRxChannel, ...cfg.midiTxChannel }))
          if (n < 1 || n > 16)
            out.push({
              ruleId: 'MIDI-006',
              severity: 'error',
              entityIds: [unitId],
              message: `${ctx.nick(unitId)} track ${track}: channel ${n} is outside 1–16.`,
            });
      return out;
    },
  },
  {
    id: 'MIDI-007',
    family: 'MIDI',
    severity: 'info',
    title: 'Two tracks on one channel to the same device',
    rationale: 'Both tracks play the same destination part.',
    dependsOn: ['connections'],
    run(ctx) {
      return live(ctx).flatMap((c): Issue[] => {
        const map = c.midi?.trackMap ?? [];
        const seen = new Map<number, string[]>();
        for (const t of map) seen.set(t.toChannel, [...(seen.get(t.toChannel) ?? []), t.fromTrack ?? '?']);
        return [...seen.entries()]
          .filter(([, tr]) => tr.length > 1)
          .map(([ch, tr]) => ({
            ruleId: 'MIDI-007',
            severity: 'info' as const,
            entityIds: [c.id],
            message: `Tracks ${tr.join(', ')} all send on channel ${ch} to ${ctx.nick(c.b.unitId)}.`,
          }));
      });
    },
  },
];

// ---------- USB ----------

/** Default bus-power budget of a host port (spec §5.12 USB-002). */
export function usbBudgetMa(c: Connector): number {
  if (c.usb?.suppliesBusPowerMa !== undefined && c.usb.suppliesBusPowerMa !== null) return c.usb.suppliesBusPowerMa;
  if (c.jack === 'usb-c-f') return 1500;
  if (c.usb?.version && /^3/.test(c.usb.version)) return 900;
  return 500;
}

const isHub = (ctx: SetupContext, unitId: string) => {
  const m = ctx.model(unitId);
  return !!m && m.connectors.some((c) => c.usb?.role === 'device') && m.connectors.some((c) => c.usb?.role === 'host');
};
const isPowered = (ctx: SetupContext, unitId: string) => {
  const m = ctx.model(unitId);
  return !!m?.power.sources.some(
    (s) =>
      s.kind !== 'usb-bus' &&
      s.inputConnectorId &&
      ctx.connectionsAt(unitId, s.inputConnectorId).some((c) => c.enabled),
  );
};

interface UsbEnd {
  end: Connection['a'];
  conn: Connector;
}
interface UsbLink {
  c: Connection;
  host: UsbEnd | null;
  device: UsbEnd | null;
}

function usbLinks(ctx: SetupContext): UsbLink[] {
  return live(ctx).flatMap((c): UsbLink[] => {
    const e = ctx.ends(c);
    if (!e?.a.usb || !e.b.usb) return [];
    const hostEnd =
      e.a.usb.role === 'host'
        ? 'a'
        : e.b.usb.role === 'host'
          ? 'b'
          : c.usb
            ? c.usb.hostUnitId === c.a.unitId
              ? 'a'
              : 'b'
            : null;
    if (!hostEnd) return [{ c, host: null, device: null }];
    const host = hostEnd === 'a' ? { end: c.a, conn: e.a } : { end: c.b, conn: e.b };
    const device = hostEnd === 'a' ? { end: c.b, conn: e.b } : { end: c.a, conn: e.a };
    return [{ c, host, device }];
  });
}

const usbRules: Rule[] = [
  {
    id: 'USB-001',
    family: 'USB',
    severity: 'error',
    title: 'Device to device without a host',
    rationale: 'Two USB devices cannot talk without a host (computer, tablet, USB-host hub).',
    dependsOn: ['connections'],
    run(ctx) {
      return usbLinks(ctx)
        .filter((l) => !l.host)
        .map((l) => ({
          ruleId: 'USB-001',
          severity: 'error' as const,
          entityIds: [l.c.id],
          message: `${endLabel(ctx, l.c.a)} ↔ ${endLabel(ctx, l.c.b)}: two USB devices with no host.`,
        }));
    },
  },
  {
    id: 'USB-002',
    family: 'USB',
    severity: 'warning',
    title: 'Bus power over budget',
    rationale: 'USB 2.0 ports supply 500 mA, USB 3.x 900 mA, USB-C 1.5 A by default (configurable per port).',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      const byPort = new Map<
        string,
        {
          host: NonNullable<ReturnType<typeof usbLinks>[number]['host']>;
          devices: NonNullable<ReturnType<typeof usbLinks>[number]['device']>[];
          ids: string[];
        }
      >();
      for (const l of usbLinks(ctx)) {
        if (!l.host || !l.device) continue;
        const k = nodeKey(l.host.end.unitId, l.host.end.connectorId);
        const entry = byPort.get(k) ?? { host: l.host, devices: [], ids: [] };
        entry.devices.push(l.device);
        entry.ids.push(l.c.id);
        byPort.set(k, entry);
      }
      const out: Issue[] = [];
      for (const { host, devices, ids } of byPort.values()) {
        const drawing = devices.filter((d) => d.conn.usb?.busPowered && !isPowered(ctx, d.end.unitId));
        if (!drawing.length) continue;
        const unknown = drawing.filter(
          (d) => d.conn.usb?.drawsBusPowerMa === null || d.conn.usb?.drawsBusPowerMa === undefined,
        );
        const sum = drawing.reduce((n, d) => n + (d.conn.usb?.drawsBusPowerMa ?? 0), 0);
        const budget = usbBudgetMa(host.conn);
        const budgetKnown = host.conn.usb?.suppliesBusPowerMa !== null;
        if (sum > budget)
          out.push({
            ruleId: 'USB-002',
            severity: sum > budget * 1.25 ? 'error' : 'warning',
            entityIds: ids,
            message: `${endLabel(ctx, host.end)} supplies ${budget} mA; bus-powered devices draw ${sum} mA.`,
            details: { drawMa: sum, budgetMa: budget },
          });
        else if (unknown.length || !budgetKnown)
          out.push({
            ruleId: 'USB-002',
            severity: 'info',
            entityIds: ids,
            message: `${endLabel(ctx, host.end)} powers ${drawing.map((d) => ctx.nick(d.end.unitId)).join(', ')}; ${unknown.length ? 'their draw is unknown' : 'the port budget is unverified'} (assumed ${budget} mA).`,
          });
      }
      return out;
    },
  },
  {
    id: 'USB-003',
    family: 'USB',
    severity: 'error',
    title: 'Hub depth over 5',
    rationale: 'USB allows at most five hubs between host and device.',
    dependsOn: ['connections'],
    run(ctx) {
      const links = usbLinks(ctx).filter((l) => l.host && l.device);
      const parent = new Map(links.map((l) => [l.device!.end.unitId, l.host!.end.unitId]));
      const out: Issue[] = [];
      for (const unitId of parent.keys()) {
        let depth = 0;
        let cur = parent.get(unitId);
        const seen = new Set([unitId]);
        while (cur && !seen.has(cur)) {
          if (isHub(ctx, cur)) depth++;
          seen.add(cur);
          cur = parent.get(cur);
        }
        if (depth > 5)
          out.push({
            ruleId: 'USB-003',
            severity: 'error',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)} sits behind ${depth} USB hubs (max 5).`,
          });
      }
      return out;
    },
  },
  {
    id: 'USB-004',
    family: 'USB',
    severity: 'info',
    title: 'Several USB audio devices on one host',
    rationale: 'Each USB audio device has its own clock; combine them as an aggregate device or route via Overbridge.',
    dependsOn: ['connections'],
    run(ctx) {
      const byHost = new Map<string, { units: Set<string>; ids: string[] }>();
      for (const l of usbLinks(ctx)) {
        if (!l.host || !l.device?.conn.usb?.audio) continue;
        // Walk up through hubs to the real host.
        let host = l.host.end.unitId;
        const seen = new Set<string>();
        while (isHub(ctx, host) && !seen.has(host)) {
          seen.add(host);
          const up = usbLinks(ctx).find((x) => x.device?.end.unitId === host);
          if (!up?.host) break;
          host = up.host.end.unitId;
        }
        const e = byHost.get(host) ?? { units: new Set(), ids: [] };
        e.units.add(l.device.end.unitId);
        e.ids.push(l.c.id);
        byHost.set(host, e);
      }
      return [...byHost.entries()]
        .filter(([, e]) => e.units.size > 1)
        .map(([host, e]) => ({
          ruleId: 'USB-004',
          severity: 'info' as const,
          entityIds: [host, ...e.units],
          message: `${ctx.nick(host)} hosts ${e.units.size} USB audio devices (${[...e.units].map((u) => ctx.nick(u)).join(', ')}): separate clocks; use an aggregate device.`,
        }));
    },
  },
  {
    id: 'USB-005',
    family: 'USB',
    severity: 'warning',
    title: 'Bus-powered device behind an unpowered hub',
    rationale: "An unpowered hub shares one port's budget across all its devices.",
    dependsOn: ['connections'],
    run(ctx) {
      return usbLinks(ctx).flatMap((l): Issue[] =>
        l.host && l.device?.conn.usb?.busPowered && isHub(ctx, l.host.end.unitId) && !isPowered(ctx, l.host.end.unitId)
          ? [
              {
                ruleId: 'USB-005',
                severity: 'warning',
                entityIds: [l.c.id],
                message: `${ctx.nick(l.device.end.unitId)} is bus-powered behind the unpowered hub ${ctx.nick(l.host.end.unitId)}.`,
              },
            ]
          : [],
      );
    },
  },
  {
    id: 'USB-006',
    family: 'USB',
    severity: 'warning',
    title: 'USB 2.0 cable over 5 m',
    rationale: 'USB 2.0 is specified up to 5 m per cable.',
    dependsOn: ['connections'],
    run(ctx) {
      return usbLinks(ctx).flatMap((l): Issue[] =>
        (l.c.cable.lengthMm ?? 0) > 5000
          ? [
              {
                ruleId: 'USB-006',
                severity: 'warning',
                entityIds: [l.c.id],
                message: `USB cable of ${(l.c.cable.lengthMm! / 1000).toFixed(1)} m (max 5 m for USB 2.0).`,
              },
            ]
          : [],
      );
    },
  },
];

// ---------- power ----------

interface Feed {
  c: Connection;
  supply: { unitId: string; conn: Connector };
  load: { unitId: string; conn: Connector };
}
function feeds(ctx: SetupContext, domain: 'power.dc' | 'power.ac'): Feed[] {
  return live(ctx).flatMap((c) => {
    const o = orient(ctx, c);
    if (!o || o.kind !== 'directed' || o.src.domain !== domain || o.dst.domain !== domain) return [];
    return [{ c, supply: { unitId: o.s.unitId, conn: o.src }, load: { unitId: o.d.unitId, conn: o.dst } }];
  });
}
const sourceFor = (ctx: SetupContext, f: Feed) =>
  ctx.model(f.load.unitId)?.power.sources.find((s) => s.inputConnectorId === f.load.conn.id);

/** Estimated mains draw (W) of a unit: maxW, else typicalW, else DC draw × voltage. */
function unitWatts(ctx: SetupContext, unitId: string): number | null {
  return modelWatts(ctx.model(unitId));
}

const powerRules: Rule[] = [
  {
    id: 'PWR-001',
    family: 'PWR',
    severity: 'error',
    title: 'Supply voltage outside the accepted range',
    rationale: 'Wrong voltage damages gear (±5% tolerance).',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      return feeds(ctx, 'power.dc').flatMap((f): Issue[] => {
        const v = f.supply.conn.psu?.voltage;
        const s = sourceFor(ctx, f);
        if (v === null || v === undefined || !s) return [];
        const min = (s.voltageMinV ?? s.nominalV ?? NaN) * 0.95;
        const max = (s.voltageMaxV ?? s.nominalV ?? NaN) * 1.05;
        if (Number.isNaN(min) || Number.isNaN(max) || (v >= min && v <= max)) return [];
        return [
          {
            ruleId: 'PWR-001',
            severity: 'error',
            entityIds: [f.c.id, f.load.unitId],
            message: `${ctx.nick(f.supply.unitId)} supplies ${v} V; ${ctx.nick(f.load.unitId)} accepts ${s.voltageMinV ?? s.nominalV}–${s.voltageMaxV ?? s.nominalV} V${s.maxVoltageNote ? ` (${s.maxVoltageNote})` : ''}.`,
            details: { supplyV: v, minV: s.voltageMinV ?? s.nominalV ?? 0, maxV: s.voltageMaxV ?? s.nominalV ?? 0 },
          },
        ];
      });
    },
  },
  {
    id: 'PWR-002',
    family: 'PWR',
    severity: 'error',
    title: 'Polarity mismatch',
    rationale: 'Reversed polarity can destroy the unit.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      return feeds(ctx, 'power.dc').flatMap((f): Issue[] => {
        const have =
          f.supply.conn.psu?.polarity ??
          (f.supply.conn.psu?.plug?.type === 'barrel' ? f.supply.conn.psu.plug.polarity : null);
        const s = sourceFor(ctx, f);
        const want = s?.plug?.type === 'barrel' ? s.plug.polarity : null;
        return have && want && have !== want
          ? [
              {
                ruleId: 'PWR-002',
                severity: 'error',
                entityIds: [f.c.id, f.load.unitId],
                message: `${ctx.nick(f.supply.unitId)} is ${have}; ${ctx.nick(f.load.unitId)} needs ${want}.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'PWR-003',
    family: 'PWR',
    severity: 'error',
    title: 'Plug size mismatch',
    rationale: 'A barrel that does not fit makes poor contact or none.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      return feeds(ctx, 'power.dc').flatMap((f): Issue[] => {
        const plug = f.supply.conn.psu?.plug;
        const jack = barrelSize(f.load.conn.jack);
        if (plug?.type !== 'barrel' || !jack || plug.odMm === null || plug.idMm === null) return [];
        return plug.odMm !== jack.odMm || plug.idMm !== jack.idMm
          ? [
              {
                ruleId: 'PWR-003',
                severity: 'error',
                entityIds: [f.c.id, f.load.unitId],
                message: `${ctx.nick(f.supply.unitId)} has a ${plug.odMm}×${plug.idMm} mm plug; ${ctx.nick(f.load.unitId)} has a ${jack.odMm}×${jack.idMm} mm jack.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'PWR-004',
    family: 'PWR',
    severity: 'warning',
    title: 'Supply current too low',
    rationale: 'Supplies should have 25% headroom over the draw.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      return feeds(ctx, 'power.dc').flatMap((f): Issue[] => {
        const cap = f.supply.conn.psu?.currentMaMax;
        const draw = sourceFor(ctx, f)?.drawMa;
        if (!cap || !draw) return [];
        if (cap < draw)
          return [
            {
              ruleId: 'PWR-004',
              severity: 'error',
              entityIds: [f.c.id],
              message: `${ctx.nick(f.supply.unitId)} supplies ${cap} mA; ${ctx.nick(f.load.unitId)} draws ${draw} mA.`,
              details: { supplyMa: cap, drawMa: draw },
            },
          ];
        // The 25% margin targets third-party supplies; the unit's own included supply is matched by the maker.
        const own = sourceFor(ctx, f)?.suppliedModelId === ctx.unit(f.supply.unitId)?.modelId;
        if (!own && cap < 1.25 * draw)
          return [
            {
              ruleId: 'PWR-004',
              severity: 'warning',
              entityIds: [f.c.id],
              message: `${ctx.nick(f.supply.unitId)} (${cap} mA) has less than 25% headroom over ${ctx.nick(f.load.unitId)} (${draw} mA).`,
              details: { supplyMa: cap, drawMa: draw },
            },
          ];
        return [];
      });
    },
  },
  {
    id: 'PWR-005',
    family: 'PWR',
    severity: 'error',
    title: 'Mains region mismatch',
    rationale: 'A 115 V-only unit on 230 V mains (or the reverse) is destroyed or does not start.',
    dependsOn: ['placements', 'connections', 'unitConfigs', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      for (const unitId of ctx.present) {
        const region = ctx.model(unitId)?.power.mainsRegion;
        const mains = ctx.setup.unitConfigs[unitId]?.mainsVoltage ?? ctx.project.settings.mainsVoltage;
        if ((region === '115-only' && mains === 230) || (region === '230-only' && mains === 115))
          out.push({
            ruleId: 'PWR-005',
            severity: 'error',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)} is ${region === '115-only' ? '115 V' : '230 V'} only; mains here is ${mains} V.`,
            fixes: [
              { label: "Use a step-down transformer or set the unit's voltage selector", action: { kind: 'info' } },
            ],
          });
      }
      return out;
    },
  },
  {
    id: 'PWR-006',
    family: 'PWR',
    severity: 'error',
    title: 'Strip or outlet rating exceeded',
    rationale: 'A strip carries at most its rated current in total.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      const byStrip = new Map<string, Feed[]>();
      for (const f of feeds(ctx, 'power.ac'))
        byStrip.set(f.supply.unitId, [...(byStrip.get(f.supply.unitId) ?? []), f]);
      const out: Issue[] = [];
      for (const [strip, list] of byStrip) {
        const dist = ctx.model(strip)?.power.distribution;
        if (!dist?.totalCurrentMaMax || !dist.voltage) continue;
        // Loads below wall adapters count via the adapter's load.
        const watts = list.map((f) => {
          const down = feeds(ctx, 'power.dc').filter((g) => g.supply.unitId === f.load.unitId);
          return down.length
            ? down.reduce((n, g) => n + (unitWatts(ctx, g.load.unitId) ?? 0), 0)
            : (unitWatts(ctx, f.load.unitId) ?? 0);
        });
        const totalW = watts.reduce((a, b) => a + b, 0);
        const ratingW = (dist.voltage * dist.totalCurrentMaMax) / 1000;
        if (totalW > ratingW)
          out.push({
            ruleId: 'PWR-006',
            severity: 'error',
            entityIds: [strip, ...list.map((f) => f.c.id)],
            message: `${ctx.nick(strip)} carries ≈${Math.round(totalW)} W; rated ${Math.round(ratingW)} W.`,
            details: { loadW: Math.round(totalW), ratingW: Math.round(ratingW) },
          });
        const outlets =
          ctx.model(strip)?.connectors.filter((c) => c.domain === 'power.ac' && c.direction === 'out') ?? [];
        for (const o of outlets) {
          const n = ctx.connectionsAt(strip, o.id).filter((c) => c.enabled).length;
          if (n > 1)
            out.push({
              ruleId: 'PWR-006',
              severity: 'error',
              entityIds: [strip],
              message: `${ctx.nick(strip)} · ${o.label} has ${n} plugs.`,
            });
        }
      }
      return out;
    },
  },
  {
    id: 'PWR-007',
    family: 'PWR',
    severity: 'warning',
    title: 'No power assigned',
    rationale: 'Every powered unit needs a supply, USB bus power or a battery.',
    dependsOn: ['placements', 'connections', 'unitConfigs', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      for (const unitId of ctx.present) {
        const m = ctx.model(unitId);
        if (!m || m.power.sources.length === 0) continue;
        // Wall adapters and strips are supplies themselves; their mains plug is checked through their loads.
        if (m.connectors.some((c) => c.domain.startsWith('power.') && c.direction === 'out' && c.psu)) continue;
        const ok = m.power.sources.some((s) => {
          if (s.kind === 'battery') return true;
          if (!s.inputConnectorId) return false;
          return (
            ctx.connectionsAt(unitId, s.inputConnectorId).some((c) => c.enabled) ||
            ctx.setup.unitConfigs[unitId]?.powerAssignments.some((a) => a.connectorId === s.inputConnectorId)
          );
        });
        if (!ok)
          out.push({
            ruleId: 'PWR-007',
            severity: 'warning',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)} has no power connected (${m.power.sources.map((s) => s.kind).join(' / ')}).`,
          });
      }
      return out;
    },
  },
  {
    id: 'PWR-008',
    family: 'PWR',
    severity: 'error',
    title: 'Supply shared beyond its rating',
    rationale: 'Daisy-chained loads on one supply must stay within its current rating.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      const bySupply = new Map<string, Feed[]>();
      for (const f of feeds(ctx, 'power.dc')) {
        const k = nodeKey(f.supply.unitId, f.supply.conn.id);
        bySupply.set(k, [...(bySupply.get(k) ?? []), f]);
      }
      return [...bySupply.values()].flatMap((list): Issue[] => {
        if (list.length < 2) return [];
        const cap = list[0]!.supply.conn.psu?.currentMaMax;
        const draw = list.reduce((n, f) => n + (sourceFor(ctx, f)?.drawMa ?? 0), 0);
        return cap && draw > cap
          ? [
              {
                ruleId: 'PWR-008',
                severity: 'error',
                entityIds: list.map((f) => f.c.id),
                message: `${ctx.nick(list[0]!.supply.unitId)} (${cap} mA) feeds ${list.length} units drawing ${draw} mA.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'PWR-009',
    family: 'PWR',
    severity: 'info',
    title: 'Only an optional supply',
    rationale: 'The unit runs from a supply that is not included with it.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      for (const unitId of ctx.present) {
        const m = ctx.model(unitId);
        const used = m?.power.sources.filter(
          (s) => s.inputConnectorId && ctx.connectionsAt(unitId, s.inputConnectorId).some((c) => c.enabled),
        );
        if (used?.length && used.every((s) => s.kind === 'optional-dc' && !s.included))
          out.push({
            ruleId: 'PWR-009',
            severity: 'info',
            entityIds: [unitId],
            message: `${ctx.nick(unitId)} runs only from an optional supply that is not included with it.`,
          });
      }
      return out;
    },
  },
];

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.ruleId}|${[...i.entityIds].sort().join(',')}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const midiUsbPowerRules: Rule[] = [...midiRules, ...usbRules, ...powerRules];
