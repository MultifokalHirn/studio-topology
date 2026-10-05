// Scaled drawings for print and export (spec §5.15): layout views as SVG text in world millimetres, laid out on
// paper sheets at a true scale (1:5, 1:10 …) with title block, scale bar and legend, tiled over several pages when
// the drawing is larger than one sheet; 1:1 footprint templates use the same tiler. Pure string building (no DOM),
// so it runs in tests and in the static snapshot.
import { surfaceToWorld } from '@/domain/geometry';
import { assetUrl } from '@/domain/assets';
import { categoryTint } from '@/domain/faces';
import type { Project, Setup } from '@/domain/types';
import { RACK_UNIT_MM } from '@/domain/units';
import type { Issue } from '@/engine/issues';
import type { LayoutReport } from '@/engine/layout';
import { drawOrder, layoutBounds, type LayoutViewKind, surfaceCorners, toView, unitOutline } from './layoutGeometry';

export type Box = { x: number; y: number; w: number; h: number };

export const esc = (s: string | number) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => +v.toFixed(2);
const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');

/** Hairline that stays thin at any scale (spec §7.1). */
const LINE = 'vector-effect="non-scaling-stroke"';

export const VIEW_TITLES: Record<LayoutViewKind, string> = {
  front: 'Front elevation',
  side: 'Side elevation',
  plan: 'Plan',
};

// ---------- layout content (world mm) ----------

/** SVG elements of one layout view in world millimetres (view y grows downward) and their bounding box. */
export function layoutContent(
  project: Project,
  report: LayoutReport,
  view: LayoutViewKind,
  issues: Issue[] = report.issues,
): { svg: string; box: Box } {
  const box = layoutBounds(view, report, { x: 120, y: 80 });
  const out: string[] = [];
  const stand = (id: string) => project.inventory.standUnits.find((s) => s.id === id)?.nickname ?? '';

  // Ground line with height ticks every 100 mm (labels every 500 mm).
  if (view !== 'plan') {
    out.push(
      `<line x1="${n(box.x)}" y1="0" x2="${n(box.x + box.w)}" y2="0" stroke="#404040" stroke-width="1.5" ${LINE}/>`,
    );
    for (let z = 0; z <= -box.y; z += 100) {
      out.push(
        `<line x1="${n(box.x + 10)}" y1="${-z}" x2="${n(box.x + (z % 500 === 0 ? 60 : 35))}" y2="${-z}" stroke="#737373" stroke-width="0.5" ${LINE}/>`,
      );
      if (z % 500 === 0) out.push(`<text x="${n(box.x + 66)}" y="${-z + 9}" font-size="26" fill="#737373">${z}</text>`);
    }
  } else {
    out.push(
      `<circle cx="0" cy="0" r="120" fill="#a3a3a3" fill-opacity="0.25"/><text x="0" y="20" text-anchor="middle" font-size="50" fill="#737373">listening position</text>`,
    );
  }

  for (const s of report.layout.surfaces) {
    const corners = surfaceCorners(s).map((c) => toView(view, c));
    const rack = s.surface.rack;
    if (view === 'plan') {
      out.push(
        `<polygon points="${pts(corners)}" fill="#a3a3a3" fill-opacity="0.12" stroke="#737373" stroke-width="0.75" ${s.surface.kind === 'tier' ? 'stroke-dasharray="6 4"' : ''} ${LINE}/>`,
      );
      continue;
    }
    if (rack) {
      const top = s.frame.origin.z + rack.u * RACK_UNIT_MM;
      const xs = corners.map((c) => c.x);
      const x0 = Math.min(...xs);
      out.push(
        `<rect x="${n(x0)}" y="${n(-top)}" width="${n(Math.max(...xs) - x0)}" height="${n(rack.u * RACK_UNIT_MM)}" fill="#404040" fill-opacity="0.06" stroke="#525252" stroke-width="0.75" ${LINE}/>`,
      );
      if (view === 'front')
        for (let i = 0; i < rack.u; i++)
          out.push(
            `<text x="${n(x0 - 6)}" y="${n(-top + (i + 0.7) * RACK_UNIT_MM)}" text-anchor="end" font-size="14" fill="#a3a3a3">${i + 1}</text>`,
          );
      continue;
    }
    const a = toView(view, surfaceToWorld(s.frame, { x: 0, y: 0, z: 0 }));
    const b =
      view === 'front'
        ? toView(view, surfaceToWorld(s.frame, { x: s.surface.usable.w, y: 0, z: 0 }))
        : toView(view, surfaceToWorld(s.frame, { x: 0, y: s.surface.holders?.lengthMm ?? s.surface.usable.d, z: 0 }));
    const isTier = s.surface.kind === 'tier';
    out.push(
      `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#525252" stroke-width="${isTier ? 2 : 1.5}" ${LINE}/>`,
      `<text x="${n(Math.min(a.x, b.x) - 30)}" y="${n(a.y + 30)}" text-anchor="end" font-size="22" fill="#525252">${esc(
        `${stand(s.standUnitId)} · ${s.surface.label} · ${Math.round(s.frame.origin.z)} mm${s.frame.tiltDeg ? ` · ${s.frame.tiltDeg}°` : ''}`,
      )}</text>`,
    );
  }

  for (const u of [...report.layout.units.values()].sort(drawOrder(view))) {
    const poly = unitOutline(view, u);
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const bb = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
    const mine = issues.filter((i) => i.entityIds.includes(u.unitId) && i.ruleId !== 'DATA-001');
    const stroke = mine.some((i) => i.severity === 'error')
      ? '#b91c1c'
      : mine.some((i) => i.severity === 'warning')
        ? '#b45309'
        : '#404040';
    const img =
      view === 'front' && u.placement.rotationDeg === 0 && Math.abs(u.tiltDeg) < 1
        ? assetUrl(project.assets, u.model.images.front?.id)
        : null;
    out.push(
      `<g data-unit="${esc(u.unitId)}"><title>${esc(u.unit.nickname)}</title>`,
      `<polygon points="${pts(poly)}" fill="${img ? '#ffffff' : categoryTint(u.model.category)}" fill-opacity="0.9" stroke="${stroke}" stroke-width="${stroke === '#404040' ? 0.75 : 1.5}" ${u.size.estimated ? 'stroke-dasharray="6 4"' : ''} ${LINE}/>`,
    );
    if (img)
      out.push(
        `<image href="${esc(img)}" x="${n(bb.x)}" y="${n(bb.y)}" width="${n(bb.w)}" height="${n(bb.h)}" preserveAspectRatio="none"/>`,
      );
    if (bb.w > 40) {
      const fs = Math.max(8, Math.min(26, bb.h * 0.45, (bb.w / Math.max(4, u.unit.nickname.length)) * 1.6));
      out.push(
        `<text x="${n(bb.x + bb.w / 2)}" y="${n(bb.y + bb.h / 2)}" text-anchor="middle" dominant-baseline="central" font-size="${n(fs)}" fill="#171717"${img ? ' stroke="#ffffff" stroke-width="3" paint-order="stroke"' : ''}>${esc(u.unit.nickname)}</text>`,
      );
    }
    out.push('</g>');
  }

  // Overall width dimension under the ground line (front/side) — a labelled dimension line (spec §6).
  if (view !== 'plan' && report.layout.units.size) {
    const all = [...report.layout.units.values()].flatMap((u) => unitOutline(view, u).map((p) => p.x));
    const x0 = Math.min(...all);
    const x1 = Math.max(...all);
    const y = 50;
    out.push(
      `<g stroke="#525252" stroke-width="0.5" ${LINE}><line x1="${n(x0)}" y1="${y}" x2="${n(x1)}" y2="${y}"/><line x1="${n(x0)}" y1="${y - 12}" x2="${n(x0)}" y2="${y + 12}"/><line x1="${n(x1)}" y1="${y - 12}" x2="${n(x1)}" y2="${y + 12}"/></g>`,
      `<text x="${n((x0 + x1) / 2)}" y="${y - 8}" text-anchor="middle" font-size="20" fill="#525252">${Math.round(x1 - x0)} mm</text>`,
    );
  }
  return { svg: out.join('\n'), box };
}

// ---------- footprint templates (1:1) ----------

/** Plan footprints of the setup's placed units (and stands), packed in rows for printing at 1:1 (spec §5.15). */
export function footprintContent(
  project: Project,
  setup: Setup,
  report: LayoutReport,
  opts: { page: { w: number; h: number }; unitIds?: string[]; stands?: boolean; rackGear?: boolean },
): { svg: string; box: Box; count: number; parts: Box[] } {
  const items: { label: string; sub: string; w: number; d: number; estimated: boolean }[] = [];
  for (const u of report.layout.units.values()) {
    if (opts.unitIds && !opts.unitIds.includes(u.unitId)) continue;
    // Gear mounted in a rack needs no paper template (unless asked for or picked explicitly).
    if (!opts.rackGear && !opts.unitIds && u.placement.mount.type === 'rack') continue;
    const m = u.model;
    items.push({
      label: u.unit.nickname,
      sub: `${m.manufacturer} ${m.name} · ${Math.round(u.size.w)} × ${Math.round(u.size.d)} mm`,
      w: u.size.w,
      d: u.size.d,
      estimated: u.size.estimated,
    });
  }
  if (opts.stands)
    for (const st of setup.stands) {
      const su = project.inventory.standUnits.find((x) => x.id === st.standUnitId);
      const m = project.library.standModels.find((x) => x.id === su?.modelId);
      if (!m?.dimensions.w || !m.dimensions.d) continue;
      items.push({
        label: su?.nickname ?? m.name,
        sub: `${m.manufacturer} ${m.name} · ${m.dimensions.w} × ${m.dimensions.d} mm`,
        w: m.dimensions.w,
        d: m.dimensions.d,
        estimated: false,
      });
    }
  // Shelf packing on the page grid: deepest first; an outline that fits one page never straddles a page edge, wider
  // ones start at a page edge and span pages. Rows are as wide as the widest item needs (whole pages).
  items.sort((a, b) => b.d - a.d || b.w - a.w);
  const { w: pw, h: ph } = opts.page;
  const inset = 4;
  const gap = 10;
  const rowW = Math.max(1, ...items.map((it) => Math.ceil((it.w + 2 * inset) / pw))) * pw;
  const out: string[] = [];
  const parts: Box[] = [];
  let x = inset;
  let y = inset;
  let rowH = 0;
  const newRow = () => {
    x = inset;
    y += rowH + gap;
    rowH = 0;
  };
  /** Next position at or after `v` where a length `len` stays within one page of size `size` (when it can). */
  const fitOnPage = (v: number, len: number, size: number) => {
    if (len > size - 2 * inset) return Math.ceil((v - inset) / size) * size + inset;
    const page = Math.floor(v / size);
    return v + len > (page + 1) * size - inset ? (page + 1) * size + inset : v;
  };
  for (const it of items) {
    x = fitOnPage(x, it.w, pw);
    if (x > inset && x + it.w > rowW - inset) {
      newRow();
      x = fitOnPage(x, it.w, pw);
    }
    if (x === inset) y = fitOnPage(y, it.d, ph);
    const fs = Math.max(3, Math.min(8, (it.w / Math.max(6, it.label.length)) * 1.4));
    out.push(
      `<g><rect x="${n(x)}" y="${n(y)}" width="${n(it.w)}" height="${n(it.d)}" fill="none" stroke="#000" stroke-width="0.3"${it.estimated ? ' stroke-dasharray="3 2"' : ''}/>`,
      // Front edge (towards the player) at the bottom, drawn heavier.
      `<line x1="${n(x)}" y1="${n(y + it.d)}" x2="${n(x + it.w)}" y2="${n(y + it.d)}" stroke="#000" stroke-width="1"/>`,
      `<text x="${n(x + it.w / 2)}" y="${n(y + it.d - 2)}" text-anchor="middle" font-size="3">FRONT</text>`,
      // Corner label so every tile of an outline spanning several pages says what it is.
      `<text x="${n(x + 2)}" y="${n(y + 5)}" font-size="3.5">${esc(it.label)} · ${Math.round(it.w)} × ${Math.round(it.d)} mm</text>`,
      `<path d="M${n(x + it.w / 2 - 4)},${n(y + it.d / 2)}h8M${n(x + it.w / 2)},${n(y + it.d / 2 - 4)}v8" stroke="#000" stroke-width="0.2"/>`,
      `<text x="${n(x + it.w / 2)}" y="${n(y + it.d / 2 - 6)}" text-anchor="middle" font-size="${n(fs)}" font-weight="600">${esc(it.label)}</text>`,
      `<text x="${n(x + it.w / 2)}" y="${n(y + it.d / 2 + 6 + fs * 0.6)}" text-anchor="middle" font-size="${n(Math.min(4, fs * 0.7))}">${esc(it.sub)}${it.estimated ? ' (estimated)' : ''}</text></g>`,
    );
    parts.push({ x, y, w: it.w, h: it.d });
    x += it.w + gap;
    rowH = Math.max(rowH, it.d);
  }
  const rowsH = parts.length ? Math.max(...parts.map((b) => b.y + b.h)) + inset : ph;
  return {
    svg: out.join('\n'),
    box: { x: 0, y: 0, w: rowW, h: Math.ceil(rowsH / ph) * ph },
    count: items.length,
    parts,
  };
}

// ---------- sheets ----------

export type Paper = 'A4' | 'A3';
export type Orientation = 'portrait' | 'landscape';
export const PAPER_MM: Record<Paper, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
export const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 100];

export function paperSize(paper: Paper, orientation: Orientation) {
  const p = PAPER_MM[paper];
  return orientation === 'portrait' ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

export interface SheetOptions {
  /** World mm per paper mm (10 = 1:10). */
  scale: number;
  paper: Paper;
  orientation: Orientation;
  title: { project: string; setup: string; drawing: string; date: string };
  /** Legend entries drawn next to the title block. */
  legend?: 'layout' | 'footprint' | 'none';
  /** `start` aligns the drawing to the first page's corner (page-grid packing); default centres it. */
  align?: 'center' | 'start';
}

const MARGIN = 10;
const TITLE_H = 22;

/** Drawing area on one sheet (paper mm). */
export function drawingArea(paper: Paper, orientation: Orientation) {
  const p = paperSize(paper, orientation);
  return { x: MARGIN, y: MARGIN, w: p.w - 2 * MARGIN, h: p.h - 2 * MARGIN - TITLE_H - 3 };
}

/** Smallest standard scale at which `box` fits one sheet. */
export function fitScale(box: Box, paper: Paper, orientation: Orientation): number {
  const a = drawingArea(paper, orientation);
  const need = Math.max(box.w / a.w, box.h / a.h);
  return STANDARD_SCALES.find((s) => s >= need) ?? Math.ceil(need / 50) * 50;
}

/** Pages needed at a scale (columns × rows). */
export function tileCount(box: Box, scale: number, paper: Paper, orientation: Orientation) {
  const a = drawingArea(paper, orientation);
  return {
    cols: Math.max(1, Math.ceil(box.w / scale / a.w - 1e-6)),
    rows: Math.max(1, Math.ceil(box.h / scale / a.h - 1e-6)),
  };
}

function niceBarLength(scale: number): number {
  // Aim for a 30–60 mm bar on paper.
  const target = 50 * scale;
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0]!);
}

function scaleBar(x: number, y: number, scale: number): string {
  const len = niceBarLength(scale);
  const paperLen = len / scale;
  const segs = [0, 1, 2, 3, 4]
    .map(
      (i) =>
        `<rect x="${n(x + (i * paperLen) / 5)}" y="${y}" width="${n(paperLen / 5)}" height="1.6" fill="${i % 2 ? '#fff' : '#000'}" stroke="#000" stroke-width="0.15"/>`,
    )
    .join('');
  return `<g data-scale-bar="${len}">${segs}<text x="${x}" y="${y + 4.6}" font-size="2.4">0</text><text x="${n(x + paperLen)}" y="${y + 4.6}" font-size="2.4" text-anchor="middle">${len >= 1000 ? `${len / 1000} m` : `${len} mm`}</text></g>`;
}

/** Legend in the free strip between the scale bar and the title block, wrapped into columns that fit. */
function legendBlock(x0: number, x1: number, y: number, kind: SheetOptions['legend']): string {
  if (!kind || kind === 'none') return '';
  const rows =
    kind === 'layout'
      ? [
          ['#404040', '', 'Unit (known dimensions)'],
          ['#404040', '2 1', 'Estimated dimensions'],
          ['#b91c1c', '', 'Error'],
          ['#b45309', '', 'Warning'],
        ]
      : [
          ['#000', '', 'Outline, cut on the line'],
          ['#000', '2 1', 'Estimated dimensions'],
        ];
  const colW = 40;
  const cols = Math.max(1, Math.floor((x1 - x0) / colW));
  const perCol = Math.ceil(rows.length / cols);
  return rows
    .map(([c, dash, label], i) => {
      const x = x0 + Math.floor(i / perCol) * colW;
      const yy = y + (i % perCol) * 4.2;
      return `<line x1="${x}" y1="${yy}" x2="${x + 7}" y2="${yy}" stroke="${c}" stroke-width="0.5"${dash ? ` stroke-dasharray="${dash}"` : ''}/><text x="${x + 9}" y="${n(yy + 1)}" font-size="2.6">${esc(label!)}</text>`;
    })
    .join('');
}

/**
 * Lay a world-mm drawing out on sheets at a true scale. Returns one SVG document per page; page sizes are physical
 * (`width="297mm"`), so printing at 100 % reproduces the scale. Multi-page drawings carry tile numbers and
 * alignment marks at the drawing-area corners.
 */
export function sheets(content: { svg: string; box: Box; parts?: Box[] }, opts: SheetOptions): string[] {
  const page = paperSize(opts.paper, opts.orientation);
  const a = drawingArea(opts.paper, opts.orientation);
  const { cols, rows } = tileCount(content.box, opts.scale, opts.paper, opts.orientation);
  const ww = a.w * opts.scale;
  const wh = a.h * opts.scale;
  // Centre the drawing within the tiled area (or align it to the first page for page-grid packing).
  const centre = opts.align !== 'start';
  const ox = content.box.x - (centre ? (cols * ww - content.box.w) / 2 : 0);
  const oy = content.box.y - (centre ? (rows * wh - content.box.h) / 2 : 0);
  // Tiles with nothing on them are left out when the content lists its parts.
  const used = (r: number, c: number) =>
    !content.parts ||
    content.parts.some(
      (b) => b.x < ox + (c + 1) * ww && b.x + b.w > ox + c * ww && b.y < oy + (r + 1) * wh && b.y + b.h > oy + r * wh,
    );
  const tiles: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (used(r, c)) tiles.push([r, c]);
  const total = tiles.length;
  const out: string[] = [];
  tiles.forEach(([r, c], i) => {
    {
      const idx = i + 1;
      const tb = { x: page.w - MARGIN - 110, y: page.h - MARGIN - TITLE_H, w: 110, h: TITLE_H };
      const marks =
        total > 1
          ? [
              [a.x, a.y],
              [a.x + a.w, a.y],
              [a.x, a.y + a.h],
              [a.x + a.w, a.y + a.h],
            ]
              .map(([x, y]) => `<path d="M${x! - 4},${y}h8M${x},${y! - 4}v8" stroke="#000" stroke-width="0.2"/>`)
              .join('')
          : '';
      out.push(
        [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${page.w}mm" height="${page.h}mm" viewBox="0 0 ${page.w} ${page.h}" font-family="Helvetica, Arial, sans-serif" data-page="${idx}" data-scale="${opts.scale}">`,
          `<rect width="${page.w}" height="${page.h}" fill="#fff"/>`,
          `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="none" stroke="#000" stroke-width="0.35"/>`,
          `<svg x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" viewBox="${n(ox + c * ww)} ${n(oy + r * wh)} ${n(ww)} ${n(wh)}" overflow="hidden">`,
          content.svg,
          '</svg>',
          marks,
          `<g font-size="2.8">`,
          `<rect x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" fill="#fff" stroke="#000" stroke-width="0.35"/>`,
          `<line x1="${tb.x}" y1="${tb.y + 8}" x2="${tb.x + tb.w}" y2="${tb.y + 8}" stroke="#000" stroke-width="0.2"/>`,
          `<line x1="${tb.x + 70}" y1="${tb.y + 8}" x2="${tb.x + 70}" y2="${tb.y + tb.h}" stroke="#000" stroke-width="0.2"/>`,
          `<text x="${tb.x + 2}" y="${tb.y + 5.6}" font-size="4" font-weight="600">${esc(opts.title.drawing)}</text>`,
          `<text x="${tb.x + 2}" y="${tb.y + 13}">${esc(opts.title.project)}</text>`,
          `<text x="${tb.x + 2}" y="${tb.y + 18.5}">${esc(opts.title.setup)}</text>`,
          `<text x="${tb.x + 72}" y="${tb.y + 13}" data-scale-label="">Scale 1:${opts.scale} · ${opts.paper}</text>`,
          `<text x="${tb.x + 72}" y="${tb.y + 18.5}">${esc(opts.title.date)} · ${idx}/${total}</text>`,
          rows * cols > 1
            ? `<text x="${a.x + a.w - 1.5}" y="${a.y + 3.5}" font-size="2.6" text-anchor="end">row ${r + 1}, column ${c + 1} of ${rows} × ${cols}</text>`
            : '',
          `</g>`,
          scaleBar(MARGIN, page.h - MARGIN - TITLE_H + 6, opts.scale),
          // Legend beside the scale bar when there is room, else under it.
          tb.x - (MARGIN + 62) >= 40
            ? legendBlock(MARGIN + 62, tb.x - 4, page.h - MARGIN - TITLE_H + 4, opts.legend)
            : legendBlock(MARGIN, tb.x - 4, page.h - MARGIN - TITLE_H + 13.5, opts.legend),
          `<text x="${MARGIN}" y="${page.h - MARGIN + 1}" font-size="2.2" fill="#555">Studio Planner · print at 100 % (no "fit to page") to keep the scale</text>`,
          '</svg>',
        ].join('\n'),
      );
    }
  });
  return out;
}

/** One SVG sized to the content at a scale (no paper): for SVG/PNG export of a view. */
export function standaloneSvg(content: { svg: string; box: Box }, scale: number, title?: string): string {
  const pad = 8 * scale;
  const b = { x: content.box.x - pad, y: content.box.y - pad, w: content.box.w + 2 * pad, h: content.box.h + 2 * pad };
  const w = b.w / scale;
  const h = b.h / scale;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" viewBox="${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}" font-family="Helvetica, Arial, sans-serif" data-scale="${scale}">`,
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="#fff"/>`,
    title ? `<title>${esc(title)}</title>` : '',
    content.svg,
    '</svg>',
  ].join('\n');
}
