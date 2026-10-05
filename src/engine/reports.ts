// Tables and data exports (spec §5.14, §5.15): connection list and matrix, MIDI channel map, power sheet,
// stand/rack summary, Markdown summary, Graphviz DOT and Mermaid. Pure; the Tables tab and exports render these.
import type { Connection, Connector, PowerSource } from '@/domain/types';
import { rackHeightU } from '@/domain/rack';
import { cableBom } from './bom';
import { connectionFlow, domainFamily, requiredLength, type DomainFamily } from './connections';
import type { Issue } from './issues';
import { modelWatts } from './power';
import { endLabel, type SetupContext } from './rules/context';
import { describeMount } from './variants';

// ---------- CSV ----------

export type Cell = string | number | null | undefined;

/** RFC 4180 CSV with a header row; `null`/`undefined` become empty cells. */
export function toCsv(rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

// ---------- connections ----------

export interface ConnectionRow {
  id: string;
  label: string;
  from: string;
  to: string;
  /** "→" for directed links, "↔" for bidirectional or invalid ones. */
  arrow: '→' | '↔';
  domain: string;
  family: DomainFamily;
  cable: string;
  adapters: string[];
  /** Cable length in mm: set by hand, else computed from the layout; null when unknown. */
  lengthMm: number | null;
  midi: string;
  enabled: boolean;
  severity: Issue['severity'] | null;
}

/** Source and destination ends of a connection (bidirectional and invalid links keep a → b). */
export function orient(ctx: SetupContext, c: Connection) {
  const e = ctx.ends(c);
  const f = e ? connectionFlow(e.a, e.b) : null;
  const flip = f?.kind === 'directed' && f.from === 'b';
  return {
    src: flip ? c.b : c.a,
    dst: flip ? c.a : c.b,
    srcConn: (flip ? e?.b : e?.a) as Connector | undefined,
    dstConn: (flip ? e?.a : e?.b) as Connector | undefined,
    directed: f?.kind === 'directed',
  };
}

const worst = (issues: Issue[]): Issue['severity'] | null =>
  issues.some((i) => i.severity === 'error')
    ? 'error'
    : issues.some((i) => i.severity === 'warning')
      ? 'warning'
      : issues.length
        ? 'info'
        : null;

export function midiText(c: Connection): string {
  const m = c.midi;
  if (!m) return '';
  const ch = Array.isArray(m.channels) ? `ch ${m.channels.join(', ')}` : m.channels;
  return [ch, m.purposes.join('/')].filter(Boolean).join(' · ');
}

export function connectionRows(ctx: SetupContext, issues: Issue[] = []): ConnectionRow[] {
  const cableName = (id: string | undefined) =>
    id ? (ctx.project.library.cableModels.find((m) => m.id === id)?.name ?? id) : '';
  return ctx.setup.connections.map((c) => {
    const o = orient(ctx, c);
    const domain = o.srcConn?.domain ?? o.dstConn?.domain ?? 'other';
    const lengthMm = c.cable.autoLength
      ? requiredLength(c, ctx.layout.layout.units, ctx.model, ctx.project.settings.cables)
      : (c.cable.lengthMm ?? null);
    return {
      id: c.id,
      label: c.label ?? '',
      from: endLabel(ctx, o.src),
      to: endLabel(ctx, o.dst),
      arrow: o.directed ? '→' : '↔',
      domain,
      family: domainFamily(domain),
      cable: cableName(c.cable.modelId),
      adapters: c.cable.adapters.map(cableName),
      lengthMm: lengthMm === null ? null : Math.round(lengthMm),
      midi: midiText(c),
      enabled: c.enabled,
      severity: worst(issues.filter((i) => i.entityIds.includes(c.id))),
    };
  });
}

export function connectionsCsv(rows: ConnectionRow[]): string {
  return toCsv([
    ['label', 'from', 'to', 'direction', 'signal', 'cable', 'adapters', 'length_mm', 'midi', 'enabled', 'issue'],
    ...rows.map((r) => [
      r.label,
      r.from,
      r.to,
      r.arrow === '→' ? 'directed' : 'bidirectional',
      r.domain,
      r.cable,
      r.adapters.join(' + '),
      r.lengthMm,
      r.midi,
      r.enabled ? 'yes' : 'no',
      r.severity,
    ]),
  ]);
}

// ---------- connection matrix ----------

export const MATRIX_FAMILIES: { id: string; label: string; families: DomainFamily[] }[] = [
  { id: 'audio', label: 'Audio', families: ['audio', 'digital-audio'] },
  { id: 'midi', label: 'MIDI', families: ['midi'] },
  { id: 'clock', label: 'CV / clock', families: ['clock', 'cv', 'control'] },
  { id: 'data', label: 'USB / network', families: ['data'] },
  { id: 'power', label: 'Power', families: ['power.dc', 'power.ac', 'power.usb'] },
];

export interface ConnectionMatrix {
  /** Source ports (outputs), as `unitId/connectorId` with a label. */
  rows: { key: string; label: string }[];
  /** Destination ports (inputs). */
  cols: { key: string; label: string }[];
  /** `${row}|${col}` → connections between them. */
  cells: Map<string, { connectionIds: string[]; invalid: boolean; enabled: boolean }>;
}

/**
 * Outputs (rows) × inputs (columns) for one signal group (spec §5.14). Only ports that take part in a connection are
 * listed; a cell is invalid when any of its connections carries an error.
 */
export function connectionMatrix(ctx: SetupContext, groupId: string, issues: Issue[] = []): ConnectionMatrix {
  const group = MATRIX_FAMILIES.find((g) => g.id === groupId);
  const rows = new Map<string, string>();
  const cols = new Map<string, string>();
  const cells: ConnectionMatrix['cells'] = new Map();
  for (const c of ctx.setup.connections) {
    const o = orient(ctx, c);
    const domain = o.srcConn?.domain ?? o.dstConn?.domain;
    if (!domain || !group?.families.includes(domainFamily(domain))) continue;
    const r = `${o.src.unitId}/${o.src.connectorId}`;
    const k = `${o.dst.unitId}/${o.dst.connectorId}`;
    rows.set(r, endLabel(ctx, o.src));
    cols.set(k, endLabel(ctx, o.dst));
    const cell = cells.get(`${r}|${k}`) ?? { connectionIds: [], invalid: false, enabled: false };
    cell.connectionIds.push(c.id);
    cell.invalid ||= issues.some((i) => i.severity === 'error' && i.entityIds.includes(c.id));
    cell.enabled ||= c.enabled;
    cells.set(`${r}|${k}`, cell);
  }
  const sorted = (m: Map<string, string>) =>
    [...m].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  return { rows: sorted(rows), cols: sorted(cols), cells };
}

export function matrixCsv(m: ConnectionMatrix): string {
  return toCsv([
    ['output \\ input', ...m.cols.map((c) => c.label)],
    ...m.rows.map((r) => [
      r.label,
      ...m.cols.map((c) => {
        const cell = m.cells.get(`${r.key}|${c.key}`);
        return cell ? (cell.invalid ? 'X!' : cell.enabled ? 'X' : '(x)') : '';
      }),
    ]),
  ]);
}

// ---------- MIDI channel map ----------

export interface MidiMapRow {
  source: string;
  /** Track name (from the connection's track map) or "—". */
  track: string;
  channel: string;
  destination: string;
  /** Unit relaying the last hop (Thru port or hub); empty for a direct cable. */
  via: string[];
  conflict: boolean;
}

/**
 * Per MIDI origin port: which channels reach which destination unit (through Thrus and hubs). Channels come from the
 * first cable's `midi.channels` (or its track map); conflicts are MIDI-002 issues.
 */
export function midiChannelMap(ctx: SetupContext, issues: Issue[] = []): MidiMapRow[] {
  const out: MidiMapRow[] = [];
  const isMidiOut = (c: Connector | undefined) => !!c && domainFamily(c.domain) === 'midi' && c.direction === 'out';
  const conflicts = issues.filter((i) => i.ruleId === 'MIDI-002');
  for (const [, edge] of ctx.graph.cable) {
    if (!isMidiOut(ctx.graph.connectorOf(edge.from))) continue;
    // Origins only: the first hop must leave from an Out port of a unit (Thru chains are followed below).
    const [srcUnit, ...rest] = edge.from.split('/');
    const source = endLabel(ctx, { unitId: srcUnit!, connectorId: rest.join('/') });
    const first = edge.connection;
    if (!first) continue;
    const reached = [
      edge,
      ...ctx.graph.downstream(edge.to, { family: 'midi' }).filter((e) => e.kind === 'cable' && e.connection),
    ];
    for (const e of reached) {
      const dstUnit = e.to.split('/')[0]!;
      const dst = ctx.graph.connectorOf(e.to);
      if (dst?.direction !== 'in') continue;
      // The unit relaying the last hop (a Thru box or hub).
      const via = e === edge ? [] : [ctx.nick(e.from.split('/')[0]!)];
      const conn = e.connection!;
      const m = conn.midi ?? first.midi;
      const tracks = m?.trackMap?.length
        ? m.trackMap.map((t) => ({ track: t.fromTrack ?? '—', channel: String(t.toChannel) }))
        : [
            {
              track: '—',
              channel: !m ? 'unset' : Array.isArray(m.channels) ? m.channels.join(', ') : m.channels,
            },
          ];
      for (const t of tracks)
        out.push({
          source,
          track: t.track,
          channel: t.channel,
          destination: ctx.nick(dstUnit),
          via,
          conflict: conflicts.some(
            (i) => i.entityIds.includes(dstUnit) && t.channel.split(', ').includes(String(i.details?.channel)),
          ),
        });
    }
  }
  const key = (r: MidiMapRow) => `${r.source}|${r.track}|${r.channel}|${r.destination}`;
  return [...new Map(out.map((r) => [key(r), r])).values()].sort(
    (a, b) => a.source.localeCompare(b.source) || a.destination.localeCompare(b.destination),
  );
}

export function midiMapCsv(rows: MidiMapRow[]): string {
  return toCsv([
    ['source', 'track', 'channel', 'destination', 'via', 'conflict'],
    ...rows.map((r) => [r.source, r.track, r.channel, r.destination, r.via.join(' > '), r.conflict ? 'yes' : '']),
  ]);
}

// ---------- power sheet ----------

export interface PowerRow {
  unitId: string;
  unit: string;
  kind: PowerSource['kind'] | 'none';
  /** What feeds this unit: "<supply> · <port>", "included supply (not wired)", or "". */
  supply: string;
  voltage: number | null;
  polarity: string;
  plug: string;
  drawMa: number | null;
  peakMa: number | null;
  watts: number | null;
  /** Draw as a share of the feeding supply's rating, 0–1+; null when unknown. */
  supplyLoad: number | null;
  /** Supplies, strips and PDUs pass power on; they are not counted in the mains total. */
  distributor: boolean;
}

export interface PowerSheet {
  rows: PowerRow[];
  mainsW: number;
  mainsUnknown: number;
  /** Adapter label sheet: what plugs into what (printable). */
  labels: { supply: string; load: string; spec: string }[];
}

export function plugText(p: PowerSource['plug']): string {
  if (!p) return '';
  if (p.type === 'barrel') return `barrel ${p.odMm ?? '?'} × ${p.idMm ?? '?'} mm`;
  if (p.type === 'other') return p.note;
  return p.type === 'iec-c14' ? 'IEC C14' : 'USB';
}
const polarityText = (p: PowerSource['plug']) =>
  p?.type === 'barrel' && p.polarity ? (p.polarity === 'center-positive' ? '⊕ centre +' : '⊖ centre −') : '';

export function powerSheet(ctx: SetupContext): PowerSheet {
  const rows: PowerRow[] = [];
  const labels: PowerSheet['labels'] = [];
  let mainsW = 0;
  let mainsUnknown = 0;
  for (const id of [...ctx.present].sort((a, b) => ctx.nick(a).localeCompare(ctx.nick(b)))) {
    const m = ctx.model(id);
    if (!m) continue;
    const distributor = !!m.power.distribution || m.connectors.some((c) => c.psu);
    const src = m.power.sources[0];
    const watts = modelWatts(m);
    if (m.power.sources.length && !distributor) {
      if (watts === null) mainsUnknown++;
      else mainsW += watts;
    }
    // The connection feeding the source's input connector (or any power input).
    const inputs = m.connectors.filter(
      (c) => c.id === src?.inputConnectorId || (c.direction === 'in' && c.domain.startsWith('power.')),
    );
    let supply = '';
    let supplyLoad: number | null = null;
    for (const inp of inputs) {
      const feed = ctx.connectionsAt(id, inp.id).find((c) => c.enabled);
      if (!feed) continue;
      const other = feed.a.unitId === id && feed.a.connectorId === inp.id ? feed.b : feed.a;
      const psu = ctx.connector(other.unitId, other.connectorId)?.psu;
      supply = endLabel(ctx, other);
      if (psu?.currentMaMax && src?.drawMa) supplyLoad = src.drawMa / psu.currentMaMax;
      labels.push({
        supply: ctx.nick(other.unitId),
        load: `${ctx.nick(id)} · ${inp.label}`,
        spec: [
          psu?.voltage ? `${psu.voltage} V` : src?.nominalV ? `${src.nominalV} V` : '',
          plugText(psu?.plug ?? src?.plug),
          polarityText(psu?.plug ?? src?.plug),
        ]
          .filter(Boolean)
          .join(' · '),
      });
      break;
    }
    if (!supply && src?.included && src.suppliedModelId) supply = 'included supply (not wired)';
    if (!src && !distributor) continue; // passive gear
    rows.push({
      unitId: id,
      unit: ctx.nick(id),
      kind: src?.kind ?? 'none',
      supply,
      voltage: src?.nominalV ?? null,
      polarity: polarityText(src?.plug),
      plug: plugText(src?.plug),
      drawMa: src?.drawMa ?? null,
      peakMa: src?.peakMa ?? null,
      watts,
      supplyLoad,
      distributor,
    });
  }
  return { rows, mainsW, mainsUnknown, labels };
}

export function powerSheetCsv(s: PowerSheet): string {
  return toCsv([
    ['unit', 'source', 'supply', 'voltage_v', 'polarity', 'plug', 'draw_ma', 'peak_ma', 'watts', 'supply_load_pct'],
    ...s.rows.map((r) => [
      r.unit,
      r.kind,
      r.supply,
      r.voltage,
      r.polarity,
      r.plug,
      r.drawMa,
      r.peakMa,
      r.watts === null ? null : Math.round(r.watts * 10) / 10,
      r.supplyLoad === null ? null : Math.round(r.supplyLoad * 100),
    ]),
  ]);
}

// ---------- stand / rack summary ----------

export interface StandSummaryRow {
  stand: string;
  surface: string;
  kind: string;
  loadKg: number;
  loadComplete: boolean;
  capacityKg: number | null;
  remainingKg: number | null;
  /** Rack bays: U used / total. */
  rackU: { used: number; total: number } | null;
  /** Deepest unit on the surface (mm). */
  depthMm: number | null;
  units: number;
}

export function standSummary(ctx: SetupContext): StandSummaryRow[] {
  const stand = (id: string) => ctx.project.inventory.standUnits.find((s) => s.id === id)?.nickname ?? id;
  return ctx.layout.surfaces.map((s) => {
    const units = s.unitIds.map((id) => ctx.layout.layout.units.get(id)).filter((u) => !!u);
    const bay = ctx.layout.layout.surfaceOf(s.standUnitId, s.surfaceId)?.surface.rack;
    return {
      stand: stand(s.standUnitId),
      surface: s.label,
      kind: s.kind,
      loadKg: Math.round(s.loadKg * 10) / 10,
      loadComplete: s.loadComplete,
      capacityKg: s.capacityKg,
      remainingKg: s.capacityKg === null ? null : Math.round((s.capacityKg - s.loadKg) * 10) / 10,
      rackU: bay ? { used: units.reduce((n, u) => n + (rackHeightU(u.model) ?? 1), 0), total: bay.u } : null,
      depthMm: units.length ? Math.max(...units.map((u) => u.size.d)) : null,
      units: units.length,
    };
  });
}

// ---------- Markdown summary ----------

const mdCell = (s: Cell) => String(s ?? '').replace(/\|/g, '\\|');
function mdTable(head: string[], rows: Cell[][]): string[] {
  return [
    `| ${head.map(mdCell).join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`),
    '',
  ];
}

/** Markdown summary of a setup: units, connections, issues (spec §5.15). */
export function setupMarkdown(ctx: SetupContext, issues: Issue[]): string {
  const { setup, project } = ctx;
  const out = [`# ${setup.name}`, '', `Project: ${project.meta.name} · status: ${setup.status}`, ''];
  if (setup.description) out.push(setup.description, '');
  out.push('## Units', '');
  out.push(
    ...mdTable(
      ['Unit', 'Model', 'Position'],
      [...ctx.present]
        .map((id) => {
          const p = setup.placements.find((x) => x.unitId === id);
          const m = ctx.model(id);
          return [ctx.nick(id), m ? `${m.manufacturer} ${m.name}` : '', p ? describeMount(ctx, p) : 'not placed'];
        })
        .sort((a, b) => a[0]!.localeCompare(b[0]!)),
    ),
  );
  const rows = connectionRows(ctx, issues);
  out.push(`## Connections (${rows.length})`, '');
  out.push(
    ...mdTable(
      ['Label', 'From', '', 'To', 'Signal', 'Cable', 'Length'],
      rows.map((r) => [
        r.label,
        r.from,
        r.arrow,
        r.to,
        r.domain + (r.midi ? ` (${r.midi})` : ''),
        [r.cable, ...r.adapters].filter(Boolean).join(' + '),
        r.lengthMm === null ? '' : `${r.lengthMm} mm`,
      ]),
    ),
  );
  out.push(`## Issues (${issues.length})`, '');
  if (!issues.length) out.push('No issues.', '');
  else out.push(...issues.map((i) => `- **${i.ruleId}** (${i.severity}): ${i.message}`), '');
  return out.join('\n');
}

// ---------- signal graph: DOT and Mermaid ----------

interface GraphExport {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label: string; family: DomainFamily; directed: boolean; color: string }[];
}

const FAMILY_COLOR: Partial<Record<DomainFamily, string>> = {
  audio: 'audio.mono',
  'digital-audio': 'digital',
  midi: 'midi',
  clock: 'clock',
  cv: 'cv',
  control: 'expression',
  data: 'usb',
  'power.dc': 'power',
  'power.ac': 'power',
  'power.usb': 'power',
};

function graphExport(ctx: SetupContext, opts: { families?: DomainFamily[] } = {}): GraphExport {
  const nodes = new Map<string, string>();
  const ids = new Map<string, string>();
  const nodeId = (unitId: string) => {
    if (!ids.has(unitId)) ids.set(unitId, `n${ids.size + 1}`);
    nodes.set(ids.get(unitId)!, ctx.nick(unitId));
    return ids.get(unitId)!;
  };
  const palette = ctx.project.settings.palette.domains;
  const edges: GraphExport['edges'] = [];
  for (const c of ctx.setup.connections) {
    if (!c.enabled) continue;
    const o = orient(ctx, c);
    const domain = o.srcConn?.domain ?? o.dstConn?.domain ?? 'other';
    const family = domainFamily(domain);
    if (opts.families && !opts.families.includes(family)) continue;
    const role = o.srcConn?.channel?.role;
    const key =
      family === 'audio' && (role === 'L' || role === 'R') ? `audio.${role}` : (FAMILY_COLOR[family] ?? 'power');
    edges.push({
      from: nodeId(o.src.unitId),
      to: nodeId(o.dst.unitId),
      label: [
        `${o.srcConn?.label ?? o.src.connectorId} → ${o.dstConn?.label ?? o.dst.connectorId}`,
        midiText(c),
        c.label,
      ]
        .filter(Boolean)
        .join(' · '),
      family,
      directed: o.directed,
      color: palette[key] ?? '#555555',
    });
  }
  return { nodes: [...nodes].map(([id, label]) => ({ id, label })), edges };
}

const dotStr = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Graphviz DOT of the signal graph: one node per unit, one edge per enabled connection. */
export function signalDot(ctx: SetupContext, opts: { families?: DomainFamily[] } = {}): string {
  const g = graphExport(ctx, opts);
  return [
    `digraph ${dotStr(ctx.setup.name)} {`,
    '  rankdir=LR;',
    '  node [shape=box, fontname="Helvetica", fontsize=10];',
    '  edge [fontname="Helvetica", fontsize=8];',
    ...g.nodes.map((n) => `  ${n.id} [label=${dotStr(n.label)}];`),
    ...g.edges.map(
      (e) =>
        `  ${e.from} -> ${e.to} [label=${dotStr(e.label)}, color=${dotStr(e.color)}${e.directed ? '' : ', dir=both'}];`,
    ),
    '}',
    '',
  ].join('\n');
}

const mermaidStr = (s: string) => s.replace(/"/g, '#quot;').replace(/[|]/g, '#124;');

/** Mermaid flowchart of the signal graph (renders in GitHub Markdown). */
export function signalMermaid(ctx: SetupContext, opts: { families?: DomainFamily[] } = {}): string {
  const g = graphExport(ctx, opts);
  const out = ['flowchart LR'];
  for (const n of g.nodes) out.push(`  ${n.id}["${mermaidStr(n.label)}"]`);
  g.edges.forEach((e) => out.push(`  ${e.from} ${e.directed ? '-->' : '<-->'}|"${mermaidStr(e.label)}"| ${e.to}`));
  g.edges.forEach((e, i) => out.push(`  linkStyle ${i} stroke:${e.color}`));
  return out.join('\n') + '\n';
}

// ---------- BOM (re-exported for report builders) ----------

export function setupBom(ctx: SetupContext) {
  return cableBom(ctx.setup.connections, ctx.project.library.cableModels, ctx.project.inventory.cables);
}
