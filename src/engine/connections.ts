// Connection semantics (spec §4.10, Appendix A/B, §5.8): derived direction, compatibility, plug mating,
// cable suggestions and layout-based cable length. Pure.
import { faceLocalToBody, surfaceToWorld, type Vec3 } from '@/domain/geometry';
import type {
  CableModel,
  Connection,
  Connector,
  Direction,
  GearModel,
  JackType,
  PlugType,
  Settings,
  SignalDomain,
  UnitConfig,
} from '@/domain/types';
import type { ResolvedUnit } from './placement';
import { unitSize } from './placement';

// ---------- alternates ----------

/** Connector as configured in this setup: an active alternate overrides domain, direction and label. */
export function effectiveConnector(c: Connector, cfg?: UnitConfig): Connector {
  const altId = cfg?.activeAlternates[c.id];
  const alt = altId ? c.alternates?.find((a) => a.id === altId) : undefined;
  if (!alt) return c;
  return {
    ...c,
    label: `${c.label} (${alt.label})`,
    domain: alt.domain ?? c.domain,
    direction: alt.direction ?? c.direction,
  };
}

// ---------- direction ----------

export type FlowKind = 'directed' | 'bidir' | 'invalid';
export interface Flow {
  kind: FlowKind;
  /** For directed flows: which end is the source. */
  from: 'a' | 'b';
  reason?: string;
}

const isSource = (d: Direction) => d === 'out' || d === 'thru';

/** Direction is never stored (spec §4.10): derive it from the two connectors. */
export function connectionFlow(a: Connector, b: Connector): Flow {
  const da = a.direction;
  const db = b.direction;
  if (isSource(da) && db === 'in') return { kind: 'directed', from: 'a' };
  if (da === 'in' && isSource(db)) return { kind: 'directed', from: 'b' };
  if (da === 'bidir' && db === 'bidir') return { kind: 'bidir', from: 'a' };
  // Passive analog bidir ports (patchbay points, insert jacks) take whatever direction the other end has.
  const passive = (c: Connector) => c.direction === 'bidir' && c.domain === 'audio.analog';
  if (passive(a) && (isSource(db) || db === 'in')) return { kind: 'directed', from: isSource(db) ? 'b' : 'a' };
  if (passive(b) && (isSource(da) || da === 'in')) return { kind: 'directed', from: isSource(da) ? 'a' : 'b' };
  if (isSource(da) && isSource(db)) return { kind: 'invalid', from: 'a', reason: 'Output to output' };
  if (da === 'in' && db === 'in') return { kind: 'invalid', from: 'a', reason: 'Input to input' };
  return { kind: 'invalid', from: 'a', reason: `${da} to ${db}` };
}

// ---------- domain families (Appendix B) ----------

export type DomainFamily =
  | 'audio'
  | 'digital-audio'
  | 'midi'
  | 'clock'
  | 'cv'
  | 'control'
  | 'data'
  | 'power.dc'
  | 'power.ac'
  | 'power.usb'
  | 'other';

export function domainFamily(d: SignalDomain): DomainFamily {
  if (d === 'audio.adat' || d === 'audio.spdif' || d === 'audio.aes') return 'digital-audio';
  if (d.startsWith('audio.')) return 'audio';
  if (d.startsWith('midi.')) return 'midi';
  if (d.startsWith('clock.')) return 'clock';
  if (d === 'cv' || d === 'gate') return 'cv';
  if (d === 'expression' || d === 'footswitch') return 'control';
  if (d === 'usb.data' || d === 'ethernet') return 'data';
  if (d === 'power.dc' || d === 'power.ac' || d === 'power.usb') return d;
  return 'other';
}

export interface Compatibility {
  /** Hard block: the connect tool refuses (DIR-001, power to signal). */
  blocked: boolean;
  /** Reasons shown in the tooltip; non-blocking ones become rule warnings later (SIG-002 …). */
  reasons: string[];
  flow: Flow;
}

const CROSS_OK: [DomainFamily, DomainFamily][] = [
  ['cv', 'audio'], // DC-coupled outs (SSL 12) and Eurorack audio: allowed, SIG-002 warns
  ['cv', 'clock'],
  ['cv', 'control'],
  ['audio', 'clock'],
];

export function compatibility(a: Connector, b: Connector): Compatibility {
  const flow = connectionFlow(a, b);
  const reasons: string[] = [];
  let blocked = false;
  if (flow.kind === 'invalid') {
    blocked = true;
    reasons.push(flow.reason ?? 'Incompatible directions');
  }
  const fa = domainFamily(a.domain);
  const fb = domainFamily(b.domain);
  if (fa !== fb) {
    const power = fa.startsWith('power') || fb.startsWith('power');
    if (power) {
      blocked = true;
      reasons.push(`${a.domain} cannot connect to ${b.domain}`);
    } else if (CROSS_OK.some(([x, y]) => (x === fa && y === fb) || (x === fb && y === fa)))
      reasons.push(`Cross-domain: ${a.domain} → ${b.domain} (SIG-002)`);
    else reasons.push(`Different signal types: ${a.domain} and ${b.domain}`);
  }
  if (a.domain.startsWith('midi.trs') && b.domain.startsWith('midi.trs') && a.domain !== b.domain)
    reasons.push('TRS MIDI type A/B mismatch (MIDI-004)');
  return { blocked, reasons, flow };
}

// ---------- plug ↔ jack mating (Appendix A) ----------

export type Mate = 'ok' | 'ok-info' | 'no' | 'unknown';

const MATES: Record<PlugType, Partial<Record<string, 'ok' | 'ok-info'>>> = {
  'TS-6.35': { 'jack-6.35-TS': 'ok', 'jack-6.35-TRS': 'ok-info', 'jack-6.35': 'ok', 'combo-xlr-trs': 'ok' },
  'TRS-6.35': { 'jack-6.35-TRS': 'ok', 'jack-6.35-TS': 'ok-info', 'jack-6.35': 'ok', 'combo-xlr-trs': 'ok' },
  'TS-3.5': { 'jack-3.5-TS': 'ok', 'jack-3.5-TRS': 'ok-info', 'jack-3.5': 'ok' },
  'TRS-3.5': { 'jack-3.5-TRS': 'ok', 'jack-3.5-TS': 'ok-info', 'jack-3.5': 'ok' },
  'XLR-M': { 'xlr-f': 'ok', 'combo-xlr-trs': 'ok' },
  'XLR-F': { 'xlr-m': 'ok' },
  'DIN5-M': { 'din5-f': 'ok' },
  'RCA-M': { 'rca-f': 'ok' },
  TOSLINK: { 'toslink-f': 'ok' },
  BNC: { 'bnc-f': 'ok' },
  'USB-A': { 'usb-a-f': 'ok' },
  'USB-B': { 'usb-b-f': 'ok' },
  'USB-C': { 'usb-c-f': 'ok' },
  'USB-micro-B': { 'usb-micro-b-f': 'ok' },
  'USB-mini-B': { 'usb-mini-b-f': 'ok' },
  RJ45: { rj45: 'ok' },
  'DC-barrel': {},
  'IEC-C13': { 'iec-c14': 'ok' },
  'Mains-plug': { 'mains-socket': 'ok' },
  'Y-insert': { 'jack-6.35-TRS': 'ok' },
};

/** Does `plug` go into `jack`? DC barrels mate any barrel jack here; OD/ID are checked by `barrelFits`. */
export function mate(plug: PlugType, jack: JackType): Mate {
  if (jack === 'unknown') return 'unknown';
  if (plug === 'DC-barrel') return jack.startsWith('dc-barrel-') ? 'ok' : 'no';
  return MATES[plug][jack] ?? 'no';
}

export function barrelSize(jack: JackType): { odMm: number; idMm: number } | null {
  const m = /^dc-barrel-([\d.]+)x([\d.]+)$/.exec(jack);
  return m ? { odMm: Number(m[1]), idMm: Number(m[2]) } : null;
}

// ---------- cable suggestions (spec §5.8) ----------

export interface CableOption {
  kind: 'cable' | 'cable+adapter' | 'captive' | 'wireless' | 'unverified';
  cableModelId?: string;
  adapters: string[];
  /** Which cable end goes to connection end `a` ('A' or 'B'). */
  orientation?: 'A' | 'B';
  lengthMm: number | null;
  /** The computed length exceeds every stocked length (PLC-008). */
  noStockedLength?: boolean;
  score: number;
  notes: string[];
}

function carries(cable: CableModel, domain: SignalDomain): boolean {
  return (
    cable.carries.includes(domain) ||
    cable.carries.some((d) => domainFamily(d) === domainFamily(domain) && domainFamily(domain) !== 'other')
  );
}

export function stockedLength(cable: CableModel, needMm: number | null): { lengthMm: number | null; noStock: boolean } {
  if (needMm === null) return { lengthMm: null, noStock: false };
  const fits = cable.lengthsMm.filter((l) => l >= needMm).sort((a, b) => a - b)[0];
  if (fits !== undefined) return { lengthMm: fits, noStock: false };
  return { lengthMm: Math.ceil(needMm / 100) * 100, noStock: true };
}

/** The plug a captive connector presents (PSU DC leads, wall-wart mains plugs). */
function captivePlug(c: Connector): PlugType | null {
  if (c.jack === 'mains-plug') return 'Mains-plug';
  if (c.jack === 'captive-cable' && c.psu?.plug?.type === 'barrel') return 'DC-barrel';
  return null;
}

/** Ranked cable options between two connectors (best first). */
export function suggestCable(a: Connector, b: Connector, lengthMm: number | null, cables: CableModel[]): CableOption[] {
  const domain = a.domain === b.domain ? a.domain : a.domain;
  if (a.jack === 'wireless' || b.jack === 'wireless')
    return a.jack === b.jack
      ? [{ kind: 'wireless', adapters: [], lengthMm: null, score: 100, notes: ['Wireless link, no cable'] }]
      : [];

  const captive = [a, b].find((c) => c.jack === 'captive-cable' || c.jack === 'mains-plug');
  if (captive) {
    const other = captive === a ? b : a;
    const plug = captivePlug(captive);
    const notes: string[] = [];
    let ok: Mate = plug ? mate(plug, other.jack) : 'unknown';
    if (plug === 'DC-barrel' && ok === 'ok') {
      const want = barrelSize(other.jack);
      const have = captive.psu?.plug?.type === 'barrel' ? captive.psu.plug : null;
      if (
        want &&
        have &&
        have.odMm !== null &&
        have.idMm !== null &&
        (have.odMm !== want.odMm || have.idMm !== want.idMm)
      ) {
        ok = 'no';
        notes.push(`Plug ${have.odMm}×${have.idMm} mm does not fit a ${want.odMm}×${want.idMm} mm jack`);
      } else if (!want || !have || have.odMm === null || have.idMm === null) {
        ok = 'unknown';
        notes.push('Barrel size not known on one side; cannot verify the fit');
      }
    }
    if (ok === 'no' && notes.length === 0) notes.push(`${captive.label} plug does not fit ${other.jack}`);
    if (ok === 'unknown' && notes.length === 0) notes.push('Plug type not known; cannot verify the fit');
    return [
      {
        kind: ok === 'unknown' ? 'unverified' : 'captive',
        adapters: [],
        lengthMm: null,
        score: ok === 'no' ? 0 : ok === 'unknown' ? 40 : 100,
        notes,
      },
    ];
  }

  const out: CableOption[] = [];
  const fit = (plug: PlugType, jack: JackType) => mate(plug, jack);
  const insertEnd = !!a.insert || !!b.insert;
  for (const cable of cables.filter((c) => c.kind === 'cable')) {
    if (!carries(cable, domain)) continue;
    // Y-insert cables only make sense on insert jacks; there they are the right choice.
    const yInsert = cable.endA === 'Y-insert' || cable.endB === 'Y-insert';
    if (yInsert && !insertEnd) continue;
    for (const orientation of ['A', 'B'] as const) {
      const pa = orientation === 'A' ? cable.endA : cable.endB;
      const pb = orientation === 'A' ? cable.endB : cable.endA;
      const ma = fit(pa, a.jack);
      const mb = fit(pb, b.jack);
      if (ma === 'no' || mb === 'no') continue;
      const { lengthMm: l, noStock } = stockedLength(cable, lengthMm);
      const notes: string[] = [];
      let score = 100;
      for (const [m, c] of [
        [ma, a],
        [mb, b],
      ] as const) {
        if (m === 'ok-info') {
          score -= 10;
          notes.push(`${c.label}: TS/TRS mismatch on ${c.jack} (balanced collapses to unbalanced)`);
        }
        if (m === 'unknown') {
          score -= 40;
          notes.push(`${c.label}: jack type unknown, fit not verified`);
        }
      }
      if (insertEnd) score += yInsert ? 10 : -20;
      const bothBalanced = a.signal?.balance === 'balanced' && b.signal?.balance === 'balanced';
      if (bothBalanced && cable.balanced) score += 5;
      if (noStock) {
        score -= 30;
        notes.push('No stocked length is long enough (PLC-008)');
      }
      out.push({
        kind: 'cable',
        cableModelId: cable.id,
        adapters: [],
        orientation,
        lengthMm: l,
        noStockedLength: noStock,
        score,
        notes,
      });
    }
  }
  if (out.length === 0) {
    // Cable plus one adapter at either end: adapter.endA goes into the jack, adapter.endB accepts the cable's plug.
    const adapters = cables.filter((c) => c.kind === 'adapter');
    for (const cable of cables.filter((c) => c.kind === 'cable' && carries(c, domain))) {
      for (const orientation of ['A', 'B'] as const) {
        const pa = orientation === 'A' ? cable.endA : cable.endB;
        const pb = orientation === 'A' ? cable.endB : cable.endA;
        for (const ad of adapters) {
          const viaA = fit(pb, b.jack) !== 'no' && fit(ad.endA, a.jack) !== 'no' && ad.endB === pa;
          const viaB = fit(pa, a.jack) !== 'no' && fit(ad.endA, b.jack) !== 'no' && ad.endB === pb;
          if (!viaA && !viaB) continue;
          if (!ad.carries.some((d) => domainFamily(d) === domainFamily(domain))) continue;
          const { lengthMm: l, noStock } = stockedLength(cable, lengthMm);
          out.push({
            kind: 'cable+adapter',
            cableModelId: cable.id,
            adapters: [ad.id],
            orientation,
            lengthMm: l,
            noStockedLength: noStock,
            score: 70 - (noStock ? 30 : 0),
            notes: [`Adapter: ${ad.name}`],
          });
        }
      }
    }
  }
  // De-duplicate (same cable/adapters in both orientations) and rank.
  const seen = new Set<string>();
  return out
    .sort((x, y) => y.score - x.score || (x.lengthMm ?? 0) - (y.lengthMm ?? 0))
    .filter((o) => {
      const k = `${o.cableModelId}|${o.adapters.join(',')}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// ---------- geometry: connector positions and cable length ----------

/** World position of a connector on a placed unit (honours face, rotation, tilt and stand transforms). */
export function connectorWorld(u: ResolvedUnit, c: Connector): Vec3 {
  const raw = unitSize(u.model);
  const body = faceLocalToBody(c.face, c.pos, raw);
  // Rotate the body point about the footprint centre by the placement rotation (counter-clockwise from above).
  const cx = raw.w / 2;
  const cy = raw.d / 2;
  const r = (u.placement.rotationDeg * Math.PI) / 180;
  const dx = body.x - cx;
  const dy = body.y - cy;
  const x = Math.round((dx * Math.cos(r) - dy * Math.sin(r)) * 1e6) / 1e6 + u.size.w / 2;
  const y = Math.round((dx * Math.sin(r) + dy * Math.cos(r)) * 1e6) / 1e6 + u.size.d / 2;
  return surfaceToWorld(u.frame, { x: u.local.x + x, y: u.local.y + y, z: u.local.z + body.z });
}

/** Spec §5.8 / Appendix C: 3-D Manhattan (optionally via a routing height) × (1 + slack) + 2 service loops. */
export function cableLength(pa: Vec3, pb: Vec3, s: Settings['cables']): number {
  const dz =
    s.viaHeightMm > 0 ? Math.abs(pa.z - s.viaHeightMm) + Math.abs(pb.z - s.viaHeightMm) : Math.abs(pa.z - pb.z);
  const manhattan = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y) + dz;
  return manhattan * (1 + s.slack) + 2 * s.serviceLoopMm;
}

/** Required length for a connection, or null when either unit is not placed. */
export function requiredLength(
  c: Connection,
  units: Map<string, ResolvedUnit>,
  modelOf: (unitId: string) => GearModel | undefined,
  s: Settings['cables'],
): number | null {
  const ua = units.get(c.a.unitId);
  const ub = units.get(c.b.unitId);
  if (!ua || !ub) return null;
  const ca = modelOf(c.a.unitId)?.connectors.find((x) => x.id === c.a.connectorId);
  const cb = modelOf(c.b.unitId)?.connectors.find((x) => x.id === c.b.connectorId);
  if (!ua || !ub || !ca || !cb) return null;
  return cableLength(connectorWorld(ua, ca), connectorWorld(ub, cb), s);
}
