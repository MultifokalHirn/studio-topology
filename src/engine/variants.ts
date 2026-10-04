// Compare two setups and build a migration checklist (spec §5.11).
import type { Connection, Placement, Project, Setup } from '@/domain/types';
import { rackHeightU } from '@/domain/rack';
import { formatLength, RACK_UNIT_MM } from '@/domain/units';
import { connectionFlow, requiredLength, stockedLength, suggestCable } from './connections';
import type { LayoutReport, SurfaceReport } from './layout';
import { modelWatts } from './power';
import { buildContext, runRules, type SetupContext } from './rules';
import { endLabel } from './rules/context';

// ---------- keys and labels ----------

/** Identity of a connection across variants: its two endpoints, order-free (ids differ between clones). */
export const connectionKey = (c: Connection): string =>
  [`${c.a.unitId}/${c.a.connectorId}`, `${c.b.unitId}/${c.b.connectorId}`].sort().join('|');

/** "Source · Port → Destination · Port" (direction derived; bidirectional links use ↔). */
export function connectionLabel(ctx: SetupContext, c: Connection): string {
  const e = ctx.ends(c);
  if (!e) return `${endLabel(ctx, c.a)} – ${endLabel(ctx, c.b)}`;
  const f = connectionFlow(e.a, e.b);
  if (f.kind === 'bidir' || f.kind === 'invalid') return `${endLabel(ctx, c.a)} ↔ ${endLabel(ctx, c.b)}`;
  const [s, d] = f.from === 'a' ? [c.a, c.b] : [c.b, c.a];
  return `${endLabel(ctx, s)} → ${endLabel(ctx, d)}`;
}

const mm = (v: number) => `${Math.round(v)} mm`;

/** From/to text for a move; compact when the unit stays on the same surface or rack bay. */
function movedText(ctxA: SetupContext, ctxB: SetupContext, x: Placement, y: Placement) {
  const from = describeMount(ctxA, x);
  const to = describeMount(ctxB, y);
  const m = x.mount;
  const n = y.mount;
  const same =
    (m.type === 'surface' || m.type === 'rack') &&
    m.type === n.type &&
    m.standUnitId === (n as typeof m).standUnitId &&
    m.surfaceId === (n as typeof m).surfaceId;
  if (!same) return { from, to };
  const cut = m.type === 'rack' ? from.lastIndexOf(' U') : from.indexOf(', ');
  const cutB = m.type === 'rack' ? to.lastIndexOf(' U') : to.indexOf(', ');
  return {
    within: from.slice(0, cut),
    from: from.slice(cut).replace(/^, /, '').trim(),
    to: to.slice(cutB).replace(/^, /, '').trim(),
  };
}

/** Where a unit sits, for humans: "Jaspers · Tier 2, x 120 mm", "Rack 12U · U5", "floor (300, 0)". */
export function describeMount(ctx: SetupContext, p: Placement): string {
  const m = p.mount;
  const standName = (id: string) => ctx.project.inventory.standUnits.find((s) => s.id === id)?.nickname ?? id;
  const surfLabel = (standId: string, surfaceId: string) =>
    ctx.layout.layout.surfaceOf(standId, surfaceId)?.surface.label ?? surfaceId;
  const rot = p.rotationDeg ? `, rotated ${p.rotationDeg}°` : '';
  if (m.type === 'surface')
    return `${standName(m.standUnitId)} · ${surfLabel(m.standUnitId, m.surfaceId)}, x ${mm(m.x)}, y ${mm(m.y)}${rot}`;
  if (m.type === 'rack') return `${standName(m.standUnitId)} · ${surfLabel(m.standUnitId, m.surfaceId)} U${m.uStart}`;
  if (m.type === 'stacked') return `on ${ctx.nick(m.parentUnitId)}, x ${mm(m.x)}${rot}`;
  return `floor (${mm(m.pos.x)}, ${mm(m.pos.y)})${rot}`;
}

// ---------- diff ----------

export interface UnitChange {
  unitId: string;
  name: string;
  kind: 'added' | 'removed' | 'moved';
  from?: string;
  to?: string;
  /** Set when the unit stays on the same surface or rack bay: its label; from/to then hold only the position. */
  within?: string;
  /** Distance between the box centres in A and B (mm); null when either is unplaced. */
  distanceMm: number | null;
  /** Placement in B, and the world centre in A and B (for the ghost overlay). */
  centreA?: { x: number; y: number; z: number };
  centreB?: { x: number; y: number; z: number };
}

export interface StandChange {
  standUnitId: string;
  name: string;
  kind: 'added' | 'removed' | 'moved';
  from?: string;
  to?: string;
}

export interface SurfaceChange {
  standUnitId: string;
  surfaceId: string;
  label: string;
  field: 'height' | 'tilt' | 'depth offset';
  from: number;
  to: number;
}

export interface ConnectionChange {
  key: string;
  label: string;
  a?: Connection;
  b?: Connection;
  /** For changed connections: what differs (cable, length, adapters, enabled). */
  changes?: string[];
}

export interface Reroute {
  /** The end both connections share. */
  shared: string;
  from: ConnectionChange;
  to: ConnectionChange;
}

export interface Metrics {
  issues: { error: number; warning: number; info: number };
  rackU: number;
  /** Units in the setup with mains-relevant draw, summed; unknown = units without data. */
  mainsW: number;
  mainsUnknown: number;
  cableLengthMm: number;
  cableUnknown: number;
  standLoadKg: number;
  /** Highest surface load as a share of its capacity (0–1+), null when no capacity is known. */
  maxLoadShare: number | null;
  /** Ergonomic score arrives with M9. */
  ergonomicScore: number | null;
}

export interface SetupDiff {
  units: UnitChange[];
  stands: StandChange[];
  surfaces: SurfaceChange[];
  connections: {
    added: ConnectionChange[];
    removed: ConnectionChange[];
    changed: ConnectionChange[];
    rerouted: Reroute[];
  };
  metrics: { a: Metrics; b: Metrics };
}

type Vec = { x: number; y: number; z: number };
const centre = (u: { min: Vec; max: Vec }) => ({
  x: (u.min.x + u.max.x) / 2,
  y: (u.min.y + u.max.y) / 2,
  z: (u.min.z + u.max.z) / 2,
});
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * How far the user moves a unit: within the same surface or rack bay, measured in that frame (a tier height change
 * is reported separately); otherwise the world distance between box centres.
 */
function moveDistance(
  x: Placement,
  y: Placement,
  ra?: { min: Vec; max: Vec },
  rb?: { min: Vec; max: Vec },
): number | null {
  const m = x.mount;
  const n = y.mount;
  if (m.type === 'surface' && n.type === 'surface' && m.standUnitId === n.standUnitId && m.surfaceId === n.surfaceId)
    return Math.hypot(n.x - m.x, n.y - m.y);
  if (m.type === 'rack' && n.type === 'rack' && m.standUnitId === n.standUnitId && m.surfaceId === n.surfaceId)
    return Math.abs(n.uStart - m.uStart) * RACK_UNIT_MM;
  if (m.type === 'stacked' && n.type === 'stacked' && m.parentUnitId === n.parentUnitId)
    return Math.hypot(n.x - m.x, n.y - m.y);
  return ra && rb ? dist(centre(ra), centre(rb)) : null;
}

const sameMount = (a: Placement, b: Placement) =>
  JSON.stringify(a.mount) === JSON.stringify(b.mount) && a.rotationDeg === b.rotationDeg;

function cableChanges(a: Connection, b: Connection): string[] {
  const out: string[] = [];
  if (a.cable.modelId !== b.cable.modelId) out.push('cable');
  if (!a.cable.autoLength || !b.cable.autoLength)
    if (a.cable.lengthMm !== b.cable.lengthMm || a.cable.autoLength !== b.cable.autoLength) out.push('length');
  if (a.cable.adapters.join() !== b.cable.adapters.join()) out.push('adapters');
  if (a.cable.unitId !== b.cable.unitId) out.push('owned cable');
  if (a.enabled !== b.enabled) out.push(b.enabled ? 'enabled' : 'disabled');
  return out;
}

export function metricsOf(ctx: SetupContext): Metrics {
  const run = runRules(ctx);
  const issues = { error: 0, warning: 0, info: 0 };
  for (const i of run.issues) issues[i.severity]++;
  let rackU = 0;
  for (const p of ctx.setup.placements) if (p.mount.type === 'rack') rackU += rackHeightU(ctx.model(p.unitId)!) ?? 1;
  let mainsW = 0;
  let mainsUnknown = 0;
  for (const id of ctx.present) {
    const m = ctx.model(id);
    if (!m || m.power.sources.length === 0) continue; // passive gear
    // Supplies and strips pass power on; count the loads, not the distributors.
    if (m.power.distribution || m.connectors.some((c) => c.psu)) continue;
    const w = modelWatts(m);
    if (w === null) mainsUnknown++;
    else mainsW += w;
  }
  let cableLengthMm = 0;
  let cableUnknown = 0;
  for (const c of ctx.setup.connections) {
    if (!c.enabled) continue;
    const len = c.cable.autoLength
      ? requiredLength(c, ctx.layout.layout.units, ctx.model, ctx.project.settings.cables)
      : (c.cable.lengthMm ?? null);
    const e = ctx.ends(c);
    // Captive leads and wireless links have no separate cable.
    if (e && (e.a.jack === 'captive-cable' || e.b.jack === 'captive-cable' || e.a.jack === 'wireless')) continue;
    if (len === null) cableUnknown++;
    else cableLengthMm += len;
  }
  const surfaces: SurfaceReport[] = ctx.layout.surfaces;
  const standLoadKg = surfaces.reduce((a, s) => a + s.loadKg, 0);
  const shares = surfaces.filter((s) => s.capacityKg).map((s) => s.loadKg / s.capacityKg!);
  return {
    issues,
    rackU,
    mainsW,
    mainsUnknown,
    cableLengthMm,
    cableUnknown,
    standLoadKg,
    maxLoadShare: shares.length ? Math.max(...shares) : null,
    ergonomicScore: null,
  };
}

function surfaceKey(s: SurfaceReport) {
  return `${s.standUnitId}/${s.surfaceId}`;
}

export function diffSetups(
  project: Project,
  a: Setup,
  b: Setup,
): SetupDiff & { ctxA: SetupContext; ctxB: SetupContext } {
  const ctxA = buildContext(project, a);
  const ctxB = buildContext(project, b);
  return { ...diffContexts(ctxA, ctxB), ctxA, ctxB };
}

export function diffContexts(ctxA: SetupContext, ctxB: SetupContext): SetupDiff {
  const a = ctxA.setup;
  const b = ctxB.setup;
  const la: LayoutReport = ctxA.layout;
  const lb: LayoutReport = ctxB.layout;

  // Units
  const units: UnitChange[] = [];
  const pa = new Map(a.placements.map((p) => [p.unitId, p]));
  const pb = new Map(b.placements.map((p) => [p.unitId, p]));
  for (const id of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(id);
    const y = pb.get(id);
    const ra = la.layout.units.get(id);
    const rb = lb.layout.units.get(id);
    const base = {
      unitId: id,
      name: ctxB.nick(id),
      distanceMm: x && y ? moveDistance(x, y, ra, rb) : null,
      ...(ra ? { centreA: centre(ra) } : {}),
      ...(rb ? { centreB: centre(rb) } : {}),
    };
    if (x && !y) units.push({ ...base, kind: 'removed', from: describeMount(ctxA, x) });
    else if (!x && y) units.push({ ...base, kind: 'added', to: describeMount(ctxB, y) });
    else if (x && y && !sameMount(x, y)) units.push({ ...base, kind: 'moved', ...movedText(ctxA, ctxB, x, y) });
  }

  // Stands
  const stands: StandChange[] = [];
  const sa = new Map(a.stands.map((s) => [s.standUnitId, s]));
  const sb = new Map(b.stands.map((s) => [s.standUnitId, s]));
  const standName = (id: string) => ctxB.project.inventory.standUnits.find((s) => s.id === id)?.nickname ?? id;
  const where = (s: Setup['stands'][number]) =>
    s.onSurface
      ? `on ${standName(s.onSurface.standUnitId)}`
      : `(${mm(s.pos.x)}, ${mm(s.pos.y)})${s.rotationDeg ? `, rotated ${s.rotationDeg}°` : ''}`;
  for (const id of new Set([...sa.keys(), ...sb.keys()])) {
    const x = sa.get(id);
    const y = sb.get(id);
    if (x && !y) stands.push({ standUnitId: id, name: standName(id), kind: 'removed', from: where(x) });
    else if (!x && y) stands.push({ standUnitId: id, name: standName(id), kind: 'added', to: where(y) });
    else if (
      x &&
      y &&
      (x.pos.x !== y.pos.x ||
        x.pos.y !== y.pos.y ||
        x.rotationDeg !== y.rotationDeg ||
        JSON.stringify(x.onSurface) !== JSON.stringify(y.onSurface))
    )
      stands.push({ standUnitId: id, name: standName(id), kind: 'moved', from: where(x), to: where(y) });
  }

  // Tier heights, tilt and depth offsets (stands present in both).
  const surfaces: SurfaceChange[] = [];
  const surfA = new Map(la.surfaces.map((s) => [surfaceKey(s), s]));
  for (const s of lb.surfaces) {
    const o = surfA.get(surfaceKey(s));
    if (!o || !sa.has(s.standUnitId)) continue;
    const label = `${standName(s.standUnitId)} · ${s.label}`;
    const base = { standUnitId: s.standUnitId, surfaceId: s.surfaceId, label };
    // Height is compared on the stand's own frame so moving the whole stand onto something is not a tier change.
    const za = a.stands.find((x) => x.standUnitId === s.standUnitId)?.surfaceStates[s.surfaceId]?.z;
    const zb = b.stands.find((x) => x.standUnitId === s.standUnitId)?.surfaceStates[s.surfaceId]?.z;
    if (za !== zb && Math.abs(o.trayZ - s.trayZ) > 0.5)
      surfaces.push({ ...base, field: 'height', from: o.trayZ, to: s.trayZ });
    if (Math.abs(o.tiltDeg - s.tiltDeg) > 0.05)
      surfaces.push({ ...base, field: 'tilt', from: o.tiltDeg, to: s.tiltDeg });
    if (Math.abs(o.yOffset - s.yOffset) > 0.5)
      surfaces.push({ ...base, field: 'depth offset', from: o.yOffset, to: s.yOffset });
  }

  // Connections
  const ca = new Map(a.connections.map((c) => [connectionKey(c), c]));
  const cb = new Map(b.connections.map((c) => [connectionKey(c), c]));
  const added: ConnectionChange[] = [];
  const removed: ConnectionChange[] = [];
  const changed: ConnectionChange[] = [];
  for (const [k, c] of cb) {
    const o = ca.get(k);
    if (!o) added.push({ key: k, label: connectionLabel(ctxB, c), b: c });
    else {
      const ch = cableChanges(o, c);
      if (ch.length) changed.push({ key: k, label: connectionLabel(ctxB, c), a: o, b: c, changes: ch });
    }
  }
  for (const [k, c] of ca) if (!cb.has(k)) removed.push({ key: k, label: connectionLabel(ctxA, c), a: c });

  // Re-routes: a removed and an added connection that share exactly one end.
  const rerouted: Reroute[] = [];
  const ends = (c: Connection) => [`${c.a.unitId}/${c.a.connectorId}`, `${c.b.unitId}/${c.b.connectorId}`];
  const usedAdded = new Set<string>();
  for (const r of removed) {
    const re = ends(r.a!);
    const match = added.find((x) => !usedAdded.has(x.key) && ends(x.b!).some((e) => re.includes(e)));
    if (!match) continue;
    usedAdded.add(match.key);
    const shared = ends(match.b!).find((e) => re.includes(e))!;
    const [u, ...rest] = shared.split('/');
    rerouted.push({
      shared: `${ctxB.nick(u!)} · ${ctxB.connector(u!, rest.join('/'))?.label ?? rest.join('/')}`,
      from: r,
      to: match,
    });
  }

  return {
    units: units.sort((x, y) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name)),
    stands,
    surfaces,
    connections: { added, removed, changed, rerouted },
    metrics: { a: metricsOf(ctxA), b: metricsOf(ctxB) },
  };
}

// ---------- migration checklist ----------

export type ChecklistSection = 'power-down' | 'disconnect' | 'move' | 'adjust' | 'reconnect' | 'power-up' | 'verify';
export const SECTION_TITLES: Record<ChecklistSection, string> = {
  'power-down': 'Power down',
  disconnect: 'Disconnect cables',
  move: 'Move units',
  adjust: 'Adjust tiers',
  reconnect: 'Reconnect cables',
  'power-up': 'Power up',
  verify: 'Verify settings',
};

export interface ChecklistItem {
  /** Stable id (content-derived) so checkbox state survives re-generation. */
  id: string;
  section: ChecklistSection;
  /** Sub-heading within a section (the unit a cable is grouped under). */
  group?: string;
  text: string;
  detail?: string;
}

/** Cable to use for a connection in the target setup: chosen model, else the best suggestion; stocked length. */
function cableText(ctx: SetupContext, c: Connection): string {
  const e = ctx.ends(c);
  const need = c.cable.autoLength
    ? requiredLength(c, ctx.layout.layout.units, ctx.model, ctx.project.settings.cables)
    : (c.cable.lengthMm ?? null);
  const cables = ctx.project.library.cableModels;
  const owned = c.cable.unitId ? ctx.project.inventory.cables.find((x) => x.id === c.cable.unitId) : undefined;
  if (owned) {
    const m = cables.find((x) => x.id === owned.modelId);
    return [owned.label, m?.name, formatLength(owned.lengthMm, ctx.project.settings.units.length)]
      .filter(Boolean)
      .join(' · ');
  }
  const best = c.cable.modelId ? undefined : e ? suggestCable(e.a, e.b, need, cables)[0] : undefined;
  if (best?.kind === 'captive') return 'captive lead';
  if (best?.kind === 'wireless') return 'wireless';
  const modelId = c.cable.modelId ?? best?.cableModelId;
  const model = cables.find((x) => x.id === modelId);
  const adapters = (c.cable.modelId ? c.cable.adapters : (best?.adapters ?? []))
    .map((id) => cables.find((x) => x.id === id)?.name ?? id)
    .filter(Boolean);
  const len = model ? stockedLength(model, need).lengthMm : need;
  return [
    model?.name ?? 'cable not chosen',
    len !== null ? formatLength(len, ctx.project.settings.units.length) : 'length unknown',
    adapters.length ? `+ ${adapters.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const groupUnit = (ctx: SetupContext, c: Connection) => {
  const e = ctx.ends(c);
  const f = e ? connectionFlow(e.a, e.b) : null;
  return ctx.nick(f?.kind === 'directed' && f.from === 'b' ? c.b.unitId : c.a.unitId);
};

export function migrationChecklist(project: Project, a: Setup, b: Setup): ChecklistItem[] {
  const { ctxA, ctxB, ...d } = diffSetups(project, a, b);
  return checklistFromDiff(ctxA, ctxB, d);
}

export function checklistFromDiff(ctxA: SetupContext, ctxB: SetupContext, d: SetupDiff): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const touchedConnections =
    d.connections.added.length + d.connections.removed.length + d.connections.changed.length > 0;
  const anything = touchedConnections || d.units.length + d.stands.length + d.surfaces.length > 0;
  if (!anything) return items;

  items.push({
    id: 'power-down',
    section: 'power-down',
    text: 'Power down all units and switch off the power strips',
    detail: 'Turn monitors and amplifiers off first.',
  });

  const sortByGroup = (xs: ChecklistItem[]) =>
    xs.sort((x, y) => (x.group ?? '').localeCompare(y.group ?? '') || x.text.localeCompare(y.text));

  // Disconnect: removed connections plus connections whose cable changes.
  items.push(
    ...sortByGroup([
      ...d.connections.removed.map((c) => ({
        id: `disconnect:${c.key}`,
        section: 'disconnect' as const,
        group: groupUnit(ctxA, c.a!),
        text: c.label,
      })),
      ...d.connections.changed
        .filter((c) => c.changes!.some((x) => x !== 'enabled' && x !== 'disabled'))
        .map((c) => ({
          id: `disconnect:${c.key}`,
          section: 'disconnect' as const,
          group: groupUnit(ctxA, c.a!),
          text: c.label,
          detail: `Swap the cable (${c.changes!.join(', ')} change)`,
        })),
      ...d.connections.changed
        .filter((c) => c.changes!.includes('disabled'))
        .map((c) => ({
          id: `disconnect:${c.key}`,
          section: 'disconnect' as const,
          group: groupUnit(ctxA, c.a!),
          text: c.label,
          detail: 'Disabled in the target setup',
        })),
    ]),
  );

  // Move: take off units that leave, then stands, then place/move units.
  for (const u of d.units.filter((x) => x.kind === 'removed'))
    items.push({
      id: `move:${u.unitId}`,
      section: 'move',
      text: `Take ${u.name} off ${u.from}`,
      detail: 'Not placed in the target setup',
    });
  for (const s of d.stands)
    items.push({
      id: `stand:${s.standUnitId}`,
      section: 'move',
      text:
        s.kind === 'added'
          ? `Set up ${s.name} at ${s.to}`
          : s.kind === 'removed'
            ? `Remove ${s.name}`
            : `Move ${s.name} from ${s.from} to ${s.to}`,
    });
  for (const u of d.units.filter((x) => x.kind !== 'removed'))
    items.push({
      id: `move:${u.unitId}`,
      section: 'move',
      text:
        u.kind === 'added'
          ? `Place ${u.name} on ${u.to}`
          : `Move ${u.name}${u.within ? ` on ${u.within}` : ''}: ${u.from} → ${u.to}`,
      ...(u.distanceMm !== null && u.kind === 'moved' ? { detail: `${Math.round(u.distanceMm)} mm` } : {}),
    });

  // Adjust tiers.
  for (const s of d.surfaces) {
    const fmt = (v: number) =>
      s.field === 'tilt' ? `${v.toFixed(1)}°` : formatLength(v, ctxB.project.settings.units.length);
    items.push({
      id: `adjust:${s.standUnitId}/${s.surfaceId}:${s.field}`,
      section: 'adjust',
      text: `${s.label}: ${s.field} ${fmt(s.from)} → ${fmt(s.to)}`,
    });
  }

  // Reconnect: added and changed connections, with cable, length and adapters.
  items.push(
    ...sortByGroup([
      ...d.connections.added.map((c) => ({
        id: `reconnect:${c.key}`,
        section: 'reconnect' as const,
        group: groupUnit(ctxB, c.b!),
        text: c.label,
        detail: c.b!.enabled
          ? cableText(ctxB, c.b!)
          : 'Disabled in the target setup: lay the cable, leave it unplugged',
      })),
      ...d.connections.changed
        .filter((c) => c.b!.enabled && c.changes!.some((x) => x !== 'disabled'))
        .map((c) => ({
          id: `reconnect:${c.key}`,
          section: 'reconnect' as const,
          group: groupUnit(ctxB, c.b!),
          text: c.label,
          detail: cableText(ctxB, c.b!),
        })),
    ]),
  );

  items.push({
    id: 'power-up',
    section: 'power-up',
    text: 'Switch on the power strips, then the units',
    detail: 'Turn monitors and amplifiers on last.',
  });

  // Verify: clock and MIDI settings per unitConfigs of the target setup.
  const cfgA = ctxA.setup.unitConfigs;
  for (const [unitId, cfg] of Object.entries(ctxB.setup.unitConfigs).sort(([x], [y]) =>
    ctxB.nick(x).localeCompare(ctxB.nick(y)),
  )) {
    if (!ctxB.present.has(unitId)) continue;
    const name = ctxB.nick(unitId);
    const changedMark = (k: keyof typeof cfg) =>
      JSON.stringify(cfgA[unitId]?.[k]) !== JSON.stringify(cfg[k]) ? ' (changed)' : '';
    if (cfg.clockMaster || cfg.clockSource) {
      const src = cfg.clockMaster
        ? 'clock master (internal clock, sending)'
        : cfg.clockSource === 'internal'
          ? 'internal clock'
          : `external clock on ${ctxB.connector(unitId, cfg.clockSource!.connectorId)?.label ?? cfg.clockSource!.connectorId}`;
      items.push({
        id: `verify:${unitId}:clock`,
        section: 'verify',
        text: `${name}: ${src}${changedMark('clockMaster') || changedMark('clockSource')}`,
      });
    }
    const ch = (r: Record<string, number> | undefined, dir: string) =>
      Object.entries(r ?? {}).map(([k, v]) =>
        `${dir} ${k === '*' || k === 'all' ? '' : `${k} `}ch ${v}`.replace('  ', ' '),
      );
    const chans = [...ch(cfg.midiRxChannel, 'receive'), ...ch(cfg.midiTxChannel, 'send')];
    if (chans.length)
      items.push({
        id: `verify:${unitId}:midi`,
        section: 'verify',
        text: `${name}: MIDI ${chans.join(', ')}${changedMark('midiRxChannel') || changedMark('midiTxChannel')}`,
      });
    const modes = Object.entries(cfg.activeAlternates).map(
      ([conn, alt]) =>
        `${ctxB.model(unitId)?.connectors.find((c) => c.id === conn)?.label ?? conn} = ${
          ctxB
            .model(unitId)
            ?.connectors.find((c) => c.id === conn)
            ?.alternates?.find((x) => x.id === alt)?.label ?? alt
        }`,
    );
    if (modes.length)
      items.push({
        id: `verify:${unitId}:modes`,
        section: 'verify',
        text: `${name}: port modes ${modes.join(', ')}${changedMark('activeAlternates')}`,
      });
  }
  return items;
}

export function checklistMarkdown(
  title: { from: string; to: string },
  items: ChecklistItem[],
  checked: ReadonlySet<string>,
): string {
  const out = [`# Migration: ${title.from} → ${title.to}`, ''];
  if (!items.length) return [...out, 'Nothing to do: the setups are identical.', ''].join('\n');
  for (const section of Object.keys(SECTION_TITLES) as ChecklistSection[]) {
    const xs = items.filter((i) => i.section === section);
    if (!xs.length) continue;
    out.push(`## ${SECTION_TITLES[section]}`, '');
    let group: string | undefined;
    for (const i of xs) {
      if (i.group !== group) {
        group = i.group;
        if (group) out.push(`### ${group}`, '');
      }
      out.push(`- [${checked.has(i.id) ? 'x' : ' '}] ${i.text}${i.detail ? ` — ${i.detail}` : ''}`);
    }
    out.push('');
  }
  return out.join('\n');
}
