import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '@/domain/serialize';
import { embedFolderAssets, toFolderMode } from '@/domain/assets';
import type { Project } from '@/domain/types';
import { analyzeLayout } from '@/engine/layout';
import {
  connectionMatrix,
  connectionRows,
  connectionsCsv,
  matrixCsv,
  midiChannelMap,
  powerSheet,
  powerSheetCsv,
  setupMarkdown,
  signalDot,
  signalMermaid,
  standSummary,
  toCsv,
} from '@/engine/reports';
import { buildContext, runRules } from '@/engine/rules';
import { drawingArea, fitScale, footprintContent, layoutContent, sheets, tileCount } from '@/render/drawing';
import { reportDocument, sectionHtml, snapshotHtml } from '@/render/reportHtml';
import { matches } from '@/features/commands/commands';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const planned = () => {
  const p = sample();
  const setup = p.setups.find((s) => s.name.startsWith('Planned'))!;
  const ctx = buildContext(p, setup);
  return { p, setup, ctx, issues: runRules(ctx).issues };
};

describe('CSV', () => {
  it('quotes commas, quotes and newlines; empty for null', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', null, 3]])).toBe('a,"b,c","say ""hi""",,3\n');
  });
});

describe('tables', () => {
  it('connection rows orient source → destination and carry lengths', () => {
    const { ctx, issues } = planned();
    const rows = connectionRows(ctx, issues);
    expect(rows.length).toBe(ctx.setup.connections.length);
    const main = rows.find((r) => r.from.includes('Main L') && r.domain === 'audio.analog');
    expect(main?.arrow).toBe('→');
    expect(connectionsCsv(rows).split('\n')[0]).toContain('from,to,direction');
  });

  it('matrix lists only connected outputs × inputs; invalid cells come from errors', () => {
    const { ctx } = planned();
    const c = ctx.setup.connections.find((x) => ctx.ends(x)?.a.domain.startsWith('audio.'))!;
    const fake = [{ ruleId: 'DIR-001', severity: 'error' as const, entityIds: [c.id], message: '' }];
    const m = connectionMatrix(ctx, 'audio', fake);
    expect(m.rows.length).toBeGreaterThan(0);
    expect([...m.cells.values()].filter((x) => x.invalid)).toHaveLength(1);
    expect(matrixCsv(m)).toContain('X!');
  });

  it('MIDI channel map lists destinations per source', () => {
    const { ctx, issues } = planned();
    const rows = midiChannelMap(ctx, issues);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.source && r.destination)).toBe(true);
  });

  it('power sheet: supplies feed loads, totals exclude distributors, labels name both ends', () => {
    const { ctx } = planned();
    const s = powerSheet(ctx);
    expect(s.rows.length).toBeGreaterThan(0);
    expect(s.mainsW).toBeGreaterThan(0);
    expect(s.labels.length).toBeGreaterThan(0);
    expect(s.labels[0]!.spec).toMatch(/V/);
    expect(powerSheetCsv(s).split('\n')[0]).toContain('supply_load_pct');
  });

  it('stand summary reports load, capacity and rack U', () => {
    const { ctx } = planned();
    const rows = standSummary(ctx);
    expect(rows.some((r) => r.capacityKg !== null && r.remainingKg !== null)).toBe(true);
  });
});

describe('text exports', () => {
  it('Markdown summary has units, connections and issues', () => {
    const { ctx, issues } = planned();
    const md = setupMarkdown(ctx, issues);
    expect(md).toMatch(/^# Planned/);
    expect(md).toContain('## Units');
    expect(md).toMatch(/## Connections \(\d+\)/);
    expect(md).toMatch(/## Issues \(\d+\)/);
  });

  it('DOT and Mermaid contain one edge per enabled connection', () => {
    const { ctx } = planned();
    const enabled = ctx.setup.connections.filter((c) => c.enabled).length;
    const dot = signalDot(ctx);
    expect(dot).toMatch(/^digraph "Planned/);
    expect(dot.match(/ -> /g)).toHaveLength(enabled);
    const mer = signalMermaid(ctx);
    expect(mer.startsWith('flowchart LR')).toBe(true);
    expect(mer.match(/linkStyle/g)).toHaveLength(enabled);
  });
});

describe('drawings', () => {
  it('a 1:10 front elevation keeps the physical scale and tiles when larger than the sheet', () => {
    const { p, ctx, issues } = planned();
    const content = layoutContent(p, ctx.layout, 'front', issues);
    const a = drawingArea('A4', 'landscape');
    const { cols, rows } = tileCount(content.box, 10, 'A4', 'landscape');
    expect(cols).toBe(Math.ceil(content.box.w / 10 / a.w));
    const pages = sheets(content, {
      scale: 10,
      paper: 'A4',
      orientation: 'landscape',
      title: { project: p.meta.name, setup: ctx.setup.name, drawing: 'Front elevation', date: '2026-10-05' },
      legend: 'layout',
    });
    expect(pages).toHaveLength(cols * rows);
    expect(pages[0]).toContain('width="297mm" height="210mm"');
    expect(pages[0]).toContain('Scale 1:10');
    // The inner viewBox spans area × scale world millimetres.
    expect(pages[0]).toContain(` ${a.w * 10} ${a.h * 10}"`);
    expect(pages[0]).toMatch(/data-scale-bar="\d+"/);
  });

  it('fit scale picks the smallest standard scale that fits', () => {
    const s = fitScale({ x: 0, y: 0, w: 2500, h: 1000 }, 'A4', 'landscape');
    expect(s).toBe(10);
  });

  it('footprint templates are 1:1 with every placed unit', () => {
    const { p, setup, ctx } = planned();
    const page = drawingArea('A4', 'portrait');
    const f = footprintContent(p, setup, ctx.layout, { page });
    const racked = [...ctx.layout.layout.units.values()].filter((u) => u.placement.mount.type === 'rack').length;
    expect(f.count).toBe(ctx.layout.layout.units.size - racked);
    expect(footprintContent(p, setup, ctx.layout, { page, rackGear: true }).count).toBe(ctx.layout.layout.units.size);
    // Outlines that fit a page never straddle a page edge.
    for (const b of f.parts)
      if (b.w <= page.w - 8 && b.h <= page.h - 8) {
        expect(Math.floor(b.x / page.w)).toBe(Math.floor((b.x + b.w) / page.w));
        expect(Math.floor(b.y / page.h)).toBe(Math.floor((b.y + b.h) / page.h));
      }
    const pages = sheets(f, {
      scale: 1,
      paper: 'A4',
      orientation: 'portrait',
      title: { project: '', setup: '', drawing: 'Footprints', date: '' },
      align: 'start',
    });
    // Empty tiles are skipped: no more than three times the paper the outlines themselves cover.
    const area = f.parts.reduce((s, b) => s + b.w * b.h, 0);
    const minimum = Math.ceil(area / (page.w * page.h));
    expect(pages.length).toBeGreaterThanOrEqual(minimum);
    expect(pages.length).toBeLessThanOrEqual(3 * minimum);
    expect(pages[0]).toContain('Scale 1:1');
  });

  it('report and snapshot are self-contained HTML', () => {
    const { ctx, issues } = planned();
    const doc = reportDocument({
      title: 't',
      paper: 'A4',
      orientation: 'landscape',
      sheets: ['<svg></svg>'],
      sections: [sectionHtml('connections', ctx, issues), sectionHtml('bom', ctx, issues)],
    });
    expect(doc).toContain('@page{size:A4 landscape');
    expect(doc).toContain('aria-label="Connection table"');
    expect(doc).toContain('aria-label="Cable BOM"');
    const snap = snapshotHtml(ctx, issues, '2026-10-05');
    expect(snap).not.toMatch(/<(script|link)[^>]+src=/);
    expect(snap).toContain('id="studio-planner-data"');
    const json = snap.match(/<script type="application\/json" id="studio-planner-data">(.*?)<\/script>/s)![1]!;
    expect(JSON.parse(json).setup.id).toBe(ctx.setup.id);
  });
});

describe('golden drawings (spec §10)', () => {
  const golden = (): Project => {
    const r = loadProject(readFileSync(new URL('../fixtures/golden-project.json', import.meta.url), 'utf8'));
    if (!r.ok) throw new Error(r.message);
    return r.project;
  };
  const cases: [string, () => Project, number][] = [
    ['sample · Current', sample, 0],
    ['sample · Planned (standing)', sample, 1],
    ['golden fixture', golden, 0],
  ];
  it.each(cases)('%s: layout SVG text is stable', (_name, load, i) => {
    const p = load();
    const setup = p.setups[i]!;
    const report = analyzeLayout(p, setup);
    const hashes = (['front', 'side', 'plan'] as const).map((v) => {
      const { svg } = layoutContent(p, report, v);
      expect(svg).not.toMatch(/NaN|undefined/);
      return `${v}:${createHash('sha256').update(svg).digest('hex').slice(0, 16)}`;
    });
    expect(hashes).toMatchSnapshot();
  });
});

describe('asset folder mode', () => {
  it('moves data URIs to files and back', () => {
    const project: Pick<Project, 'assets'> = {
      assets: {
        mode: 'embedded',
        items: {
          'img/1': {
            name: 'a',
            mime: 'image/webp',
            widthPx: 1,
            heightPx: 1,
            bytes: 3,
            dataUri: 'data:image/webp;base64,AAA',
          },
          gone: { name: 'b', mime: 'image/png', widthPx: 1, heightPx: 1, bytes: 3, path: 'assets/gone.png' },
        },
      },
    };
    const { project: folder, files } = toFolderMode(project);
    expect(folder.assets.mode).toBe('folder');
    expect(files).toEqual([{ path: 'assets/img_1.webp', dataUri: 'data:image/webp;base64,AAA' }]);
    expect(folder.assets.items['img/1']).not.toHaveProperty('dataUri');
    expect(folder.assets.items['img/1']!.path).toBe('assets/img_1.webp');
    expect(project.assets.items['img/1']!.dataUri).toBeDefined(); // input untouched
    const reopened = structuredClone(folder);
    const missing = embedFolderAssets(reopened, (path) =>
      path === 'assets/img_1.webp' ? 'data:image/webp;base64,AAA' : undefined,
    );
    expect(missing).toEqual(['assets/gone.png']);
    expect(reopened.assets.items['img/1']!.dataUri).toBe('data:image/webp;base64,AAA');
    expect(reopened.assets.mode).toBe('folder'); // still folder while something is missing
  });
});

describe('command palette', () => {
  it('matches every word of the query, in any order', () => {
    expect(matches('patch show', 'View Show Patch')).toBe(true);
    expect(matches('', 'anything')).toBe(true);
    expect(matches('save folder', 'File Save as…')).toBe(false);
  });
});
