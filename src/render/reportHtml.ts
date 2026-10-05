// Printable reports and the static snapshot (spec §5.14, §5.15) as self-contained HTML strings. Pure: callers open
// the report in a print window (the browser's print dialog saves PDF) or download the snapshot file.
import { assetUrl } from '@/domain/assets';
import { describePath, modelLabel, unverifiedFields } from '@/domain/libraryOps';
import type { Project, Setup } from '@/domain/types';
import type { Issue } from '@/engine/issues';
import {
  connectionMatrix,
  connectionRows,
  MATRIX_FAMILIES,
  midiChannelMap,
  powerSheet,
  setupBom,
  setupMarkdown,
  standSummary,
  type Cell,
} from '@/engine/reports';
import type { SetupContext } from '@/engine/rules/context';
import {
  esc,
  fitScale,
  layoutContent,
  type Orientation,
  type Paper,
  paperSize,
  standaloneSvg,
  VIEW_TITLES,
} from './drawing';
import type { LayoutViewKind } from './layoutGeometry';

export function htmlTable(
  head: string[],
  rows: Cell[][],
  opts: { label?: string; rowClass?: (i: number) => string } = {},
) {
  return [
    `<table${opts.label ? ` aria-label="${esc(opts.label)}"` : ''}><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>`,
    ...rows.map(
      (r, i) =>
        `<tr${opts.rowClass?.(i) ? ` class="${opts.rowClass(i)}"` : ''}>${r.map((c) => `<td>${esc(c ?? '')}</td>`).join('')}</tr>`,
    ),
    '</tbody></table>',
  ].join('');
}

export type ReportSection =
  'connections' | 'matrix' | 'bom' | 'midi' | 'power' | 'stands' | 'issues' | 'unverified' | 'gear';

export const REPORT_SECTIONS: { id: ReportSection; label: string }[] = [
  { id: 'connections', label: 'Connection table' },
  { id: 'bom', label: 'Cable BOM' },
  { id: 'matrix', label: 'Connection matrix' },
  { id: 'midi', label: 'MIDI channel map' },
  { id: 'power', label: 'Power sheet and adapter labels' },
  { id: 'stands', label: 'Stand / rack summary' },
  { id: 'issues', label: 'Issues' },
  { id: 'unverified', label: 'Unverified fields' },
  { id: 'gear', label: 'Gear sheets' },
];

const sev = (s: string | null) => (s === 'error' ? 'err' : s === 'warning' ? 'warn' : '');

export function sectionHtml(id: ReportSection, ctx: SetupContext, issues: Issue[]): string {
  const h = (title: string) => `<h2>${esc(title)} · ${esc(ctx.setup.name)}</h2>`;
  switch (id) {
    case 'connections': {
      const rows = connectionRows(ctx, issues);
      return (
        h('Connections') +
        htmlTable(
          ['Label', 'From', '', 'To', 'Signal', 'Cable', 'Length', 'MIDI'],
          rows.map((r) => [
            r.label,
            r.from,
            r.arrow,
            r.to,
            r.domain,
            [r.cable, ...r.adapters].filter(Boolean).join(' + '),
            r.lengthMm === null ? '' : `${r.lengthMm} mm`,
            r.midi,
          ]),
          { label: 'Connection table', rowClass: (i) => `${sev(rows[i]!.severity)}${rows[i]!.enabled ? '' : ' off'}` },
        )
      );
    }
    case 'bom': {
      const rows = setupBom(ctx);
      return (
        h('Cable BOM') +
        htmlTable(
          ['Cable / adapter', 'Length', 'Needed', 'Owned', 'Missing'],
          rows.map((r) => [
            r.name,
            r.lengthMm === null ? 'unknown' : `${r.lengthMm / 1000} m`,
            r.needed,
            r.owned,
            r.missing,
          ]),
          { label: 'Cable BOM', rowClass: (i) => (rows[i]!.missing ? 'err' : '') },
        )
      );
    }
    case 'matrix':
      return (
        h('Connection matrix') +
        MATRIX_FAMILIES.map((g) => {
          const m = connectionMatrix(ctx, g.id, issues);
          if (!m.rows.length) return '';
          const head = `<tr><th>${esc(g.label)}: output \\ input</th>${m.cols.map((c) => `<th class="v"><span>${esc(c.label)}</span></th>`).join('')}</tr>`;
          const body = m.rows
            .map(
              (r) =>
                `<tr><th>${esc(r.label)}</th>${m.cols
                  .map((c) => {
                    const cell = m.cells.get(`${r.key}|${c.key}`);
                    return `<td class="${cell ? (cell.invalid ? 'cell err' : 'cell on') : ''}">${cell ? (cell.invalid ? '✕' : '●') : ''}</td>`;
                  })
                  .join('')}</tr>`,
            )
            .join('');
          return `<h3>${esc(g.label)}</h3><table class="matrix" aria-label="${esc(g.label)} matrix"><thead>${head}</thead><tbody>${body}</tbody></table>`;
        }).join('')
      );
    case 'midi': {
      const rows = midiChannelMap(ctx, issues);
      return (
        h('MIDI channel map') +
        htmlTable(
          ['Source', 'Track', 'Channel', 'Destination', 'Via'],
          rows.map((r) => [r.source, r.track, r.channel, r.destination, r.via.join(', ')]),
          { label: 'MIDI channel map', rowClass: (i) => (rows[i]!.conflict ? 'warn' : '') },
        )
      );
    }
    case 'power': {
      const s = powerSheet(ctx);
      return (
        h('Power sheet') +
        htmlTable(
          ['Unit', 'Supply', 'Voltage', 'Polarity', 'Plug', 'Draw', 'W', 'Supply load'],
          s.rows.map((r) => [
            r.unit,
            r.supply || (r.distributor ? 'distributor' : ''),
            r.voltage === null ? '' : `${r.voltage} V`,
            r.polarity,
            r.plug,
            r.drawMa === null ? '' : `${r.drawMa} mA${r.peakMa ? ` (peak ${r.peakMa})` : ''}`,
            r.watts === null ? '?' : Math.round(r.watts * 10) / 10,
            r.supplyLoad === null ? '' : `${Math.round(r.supplyLoad * 100)} %`,
          ]),
          { label: 'Power sheet', rowClass: (i) => ((s.rows[i]!.supplyLoad ?? 0) > 1 ? 'err' : '') },
        ) +
        `<p>Mains total: <b>${Math.round(s.mainsW)} W</b>${s.mainsUnknown ? ` + ${s.mainsUnknown} unit(s) without data` : ''} at ${ctx.project.settings.mainsVoltage} V.</p>` +
        `<h3>Adapter labels</h3><div class="labels">${s.labels
          .map(
            (l) =>
              `<div class="label"><b>${esc(l.supply)}</b><br>→ ${esc(l.load)}<br><small>${esc(l.spec)}</small></div>`,
          )
          .join('')}</div>`
      );
    }
    case 'stands': {
      const rows = standSummary(ctx);
      return (
        h('Stands and racks') +
        htmlTable(
          ['Stand', 'Surface', 'Units', 'Load', 'Capacity', 'Remaining', 'Rack U', 'Deepest unit'],
          rows.map((r) => [
            r.stand,
            r.surface,
            r.units,
            `${r.loadKg}${r.loadComplete ? '' : '+'} kg`,
            r.capacityKg === null ? '?' : `${r.capacityKg} kg`,
            r.remainingKg === null ? '' : `${r.remainingKg} kg`,
            r.rackU ? `${r.rackU.used} / ${r.rackU.total} U` : '',
            r.depthMm === null ? '' : `${Math.round(r.depthMm)} mm`,
          ]),
          { label: 'Stand summary', rowClass: (i) => ((rows[i]!.remainingKg ?? 0) < 0 ? 'err' : '') },
        )
      );
    }
    case 'issues':
      return (
        h('Issues') +
        (issues.length
          ? htmlTable(
              ['Rule', 'Severity', 'Message'],
              issues.map((i) => [i.ruleId, i.severity, i.message]),
              { label: 'Issues', rowClass: (k) => sev(issues[k]!.severity) },
            )
          : '<p>No issues.</p>')
      );
    case 'unverified': {
      const models = [...new Set([...ctx.present].map((id) => ctx.model(id)).filter((m) => !!m))];
      const rows = models.flatMap((m) =>
        unverifiedFields(m).map((f): Cell[] => [modelLabel(m), describePath(m, f.path), f.kind, f.note ?? '']),
      );
      return (
        h('Unverified fields') + htmlTable(['Model', 'Field', 'Status', 'Note'], rows, { label: 'Unverified fields' })
      );
    }
    case 'gear':
      return [...ctx.present]
        .sort((a, b) => ctx.nick(a).localeCompare(ctx.nick(b)))
        .map((id) => gearSheet(ctx, id))
        .join('');
  }
}

function gearSheet(ctx: SetupContext, unitId: string): string {
  const m = ctx.model(unitId);
  if (!m) return '';
  const d = m.dimensions;
  const v = (x: number | null | undefined, unit: string) =>
    x === null || x === undefined ? 'unknown' : `${x} ${unit}`;
  const img = assetUrl(ctx.project.assets, m.images.front?.id) ?? assetUrl(ctx.project.assets, m.images.photo?.id);
  const src = m.power.sources[0];
  const specs: Cell[][] = [
    ['Model', modelLabel(m)],
    ['Category', `${m.category} · ${m.formFactor}`],
    ['Size (w × d × h)', `${v(d.w, '')}× ${v(d.d, '')}× ${v(d.h, 'mm')}`.replace(/ {2}/g, ' ')],
    ['Weight', v(d.weightKg, 'kg')],
    [
      'Power',
      src
        ? `${src.kind}${src.nominalV ? ` · ${src.nominalV} V` : ''}${src.drawMa ? ` · ${src.drawMa} mA` : ''}`
        : 'none',
    ],
  ];
  const unverified = unverifiedFields(m);
  return [
    `<section class="gear"><h2>${esc(ctx.nick(unitId))}</h2>`,
    `<div class="gear-head">${htmlTable(['Field', 'Value'], specs)}${img ? `<img src="${esc(img)}" alt="${esc(m.name)} front">` : ''}</div>`,
    `<h3>Connectors (${m.connectors.length})</h3>`,
    htmlTable(
      ['Label', 'Face', 'Signal', 'Direction', 'Jack', 'Channel'],
      m.connectors.map((c) => [c.label, c.face, c.domain, c.direction, c.jack, c.channel?.role ?? '']),
    ),
    unverified.length
      ? `<h3>Provenance: unverified (${unverified.length})</h3>` +
        htmlTable(
          ['Field', 'Status', 'Note'],
          unverified.map((f) => [describePath(m, f.path), f.kind, f.note ?? '']),
        )
      : '<p>All key fields verified.</p>',
    '</section>',
  ].join('');
}

const BASE_CSS = `
body{font:10pt Helvetica,Arial,sans-serif;color:#111;margin:0}
h1{font-size:16pt;margin:0 0 4mm}h2{font-size:13pt;margin:6mm 0 2mm}h3{font-size:11pt;margin:4mm 0 1mm}
table{border-collapse:collapse;width:100%;margin-bottom:3mm}th,td{border:0.2mm solid #999;padding:0.6mm 1.2mm;text-align:left;vertical-align:top}
th{background:#eee}tr.err td{background:#fde2e2}tr.warn td{background:#fdf0d5}tr.off td{color:#888}
table.matrix{width:auto}table.matrix td.cell{text-align:center}table.matrix td.on{color:#15803d}table.matrix td.err{color:#b91c1c;background:#fde2e2}
th.v{height:30mm;white-space:nowrap;vertical-align:bottom}th.v span{writing-mode:vertical-rl;transform:rotate(180deg)}
.labels{display:flex;flex-wrap:wrap;gap:2mm}.label{border:0.3mm dashed #555;padding:2mm;width:55mm;font-size:9pt}
.gear{break-before:page}.gear-head{display:flex;gap:4mm;align-items:flex-start}.gear-head table{width:auto}.gear-head img{max-width:90mm;max-height:50mm}
`;

/** Printable report: drawing sheets first (one per page, physical size), then table sections. */
export function reportDocument(opts: {
  title: string;
  paper: Paper;
  orientation: Orientation;
  sheets: string[];
  sections: string[];
}): string {
  const { paper, orientation } = opts;
  const page = paperSize(paper, orientation);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
@page{size:${paper} ${orientation};margin:0}
${BASE_CSS}
.sheet{width:${page.w}mm;height:${page.h}mm;overflow:hidden;break-after:page}.sheet svg{display:block}
.pages{padding:10mm}
@media screen{body{background:#888}.sheet,.pages{background:#fff;margin:5mm auto;box-shadow:0 0 3mm #0004}.pages{width:${page.w - 20}mm}}
</style></head><body>
${opts.sheets.map((s) => `<div class="sheet">${s}</div>`).join('\n')}
${opts.sections.length ? `<div class="pages">${opts.sections.join('\n')}</div>` : ''}
</body></html>`;
}

/**
 * Static, read-only snapshot of a setup (spec §5.15): one HTML file with the three layout views, the tables and the
 * setup's data embedded as JSON, plus a tiny tab viewer. No external resources.
 */
export function snapshotHtml(ctx: SetupContext, issues: Issue[], generatedAt: string): string {
  const views = (['front', 'side', 'plan'] as LayoutViewKind[]).map((v) => {
    const content = layoutContent(ctx.project, ctx.layout, v, issues);
    const scale = fitScale(content.box, 'A3', 'landscape');
    return { id: v, title: VIEW_TITLES[v], body: standaloneSvg(content, scale, VIEW_TITLES[v]) };
  });
  const tabs = [
    ...views,
    ...(['connections', 'bom', 'matrix', 'midi', 'power', 'stands', 'issues'] as ReportSection[]).map((id) => ({
      id,
      title: REPORT_SECTIONS.find((s) => s.id === id)!.label,
      body: sectionHtml(id, ctx, issues),
    })),
    { id: 'summary', title: 'Summary (Markdown)', body: `<pre>${esc(setupMarkdown(ctx, issues))}</pre>` },
  ];
  const data = JSON.stringify(snapshotData(ctx.project, ctx.setup)).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ctx.setup.name)} · ${esc(ctx.project.meta.name)}</title><style>
${BASE_CSS}
body{margin:0;background:#f5f5f5}header{padding:3mm 5mm;background:#fff;border-bottom:1px solid #ccc}
nav{display:flex;flex-wrap:wrap;gap:1mm;padding:2mm 5mm;background:#fff;border-bottom:1px solid #ccc}
nav button{border:1px solid #bbb;background:#fff;border-radius:3px;padding:1mm 3mm;cursor:pointer;font:inherit}
nav button[aria-selected=true]{background:#111;color:#fff}
main section{padding:5mm;background:#fff;margin:4mm;display:none}main section.on{display:block}
main section svg{width:100%;height:auto;max-height:80vh}
pre{white-space:pre-wrap;font-size:9pt}
@media (prefers-color-scheme:dark){body{background:#222;color:#eee}header,nav,main section{background:#111}nav button{background:#222;color:#eee}th{background:#333}}
</style></head><body>
<header><h1>${esc(ctx.setup.name)}</h1><div>${esc(ctx.project.meta.name)} · read-only snapshot · generated ${esc(generatedAt)} · ${issues.length} issue(s)</div></header>
<nav role="tablist">${tabs.map((t, i) => `<button role="tab" aria-selected="${i === 0}" data-tab="${t.id}">${esc(t.title)}</button>`).join('')}</nav>
<main>${tabs.map((t, i) => `<section id="tab-${t.id}" class="${i === 0 ? 'on' : ''}" role="tabpanel" aria-label="${esc(t.title)}">${t.body}</section>`).join('\n')}</main>
<script type="application/json" id="studio-planner-data">${data}</script>
<script>
document.querySelectorAll('nav button').forEach(function(b){b.addEventListener('click',function(){
document.querySelectorAll('nav button').forEach(function(x){x.setAttribute('aria-selected',String(x===b))});
document.querySelectorAll('main section').forEach(function(s){s.classList.toggle('on',s.id==='tab-'+b.dataset.tab)});});});
</script></body></html>`;
}

/** The part of the project a setup needs (its units, models, stands, cables and images) for the snapshot. */
export function snapshotData(project: Project, setup: Setup) {
  const unitIds = new Set([
    ...setup.placements.map((p) => p.unitId),
    ...setup.connections.flatMap((c) => [c.a.unitId, c.b.unitId]),
    ...Object.keys(setup.viewState.patchPositions),
  ]);
  const units = project.inventory.gearUnits.filter((u) => unitIds.has(u.id));
  const modelIds = new Set(units.map((u) => u.modelId));
  const standUnits = project.inventory.standUnits.filter((s) => setup.stands.some((x) => x.standUnitId === s.id));
  return {
    kind: 'studio-planner-snapshot',
    schemaVersion: project.schemaVersion,
    project: project.meta.name,
    setup,
    gearUnits: units,
    gearModels: project.library.gearModels.filter((m) => modelIds.has(m.id)),
    standUnits,
    standModels: project.library.standModels.filter((m) => standUnits.some((s) => s.modelId === m.id)),
    cableModels: project.library.cableModels,
  };
}
