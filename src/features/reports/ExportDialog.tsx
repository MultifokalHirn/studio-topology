// Export dialog (spec §5.15): scaled drawings (PDF via print, SVG, PNG) with tables, 1:1 footprint templates, CSV /
// Markdown / DOT / Mermaid data, the static HTML snapshot, and saving with an asset folder.
import { useMemo, useState } from 'react';
import { Button, Checkbox, Field, Modal, Select } from '@/components/ui';
import type { Setup } from '@/domain/types';
import {
  connectionMatrix,
  connectionRows,
  connectionsCsv,
  MATRIX_FAMILIES,
  matrixCsv,
  midiChannelMap,
  midiMapCsv,
  powerSheet,
  powerSheetCsv,
  setupBom,
  setupMarkdown,
  signalDot,
  signalMermaid,
} from '@/engine/reports';
import { bomCsv } from '@/engine/bom';
import { buildContext, runRules } from '@/engine/rules';
import { t } from '@/i18n';
import {
  drawingArea,
  fitScale,
  footprintContent,
  layoutContent,
  type Orientation,
  type Paper,
  sheets,
  STANDARD_SCALES,
  standaloneSvg,
  tileCount,
  VIEW_TITLES,
} from '@/render/drawing';
import type { LayoutViewKind } from '@/render/layoutGeometry';
import { REPORT_SECTIONS, reportDocument, type ReportSection, sectionHtml, snapshotHtml } from '@/render/reportHtml';
import { uiStore, useProject, useUi } from '@/store';
import { downloadBlob, downloadText, hasDirectoryAccess } from '@/store/fileIO';
import { saveProjectFolder } from '../project/actions';
import { captureCanvasSvg, fileSafe, openPrintWindow, svgToPng } from './exportIO';

const today = () => new Date().toISOString().slice(0, 10);

export function ExportDialog() {
  const project = useProject((s) => s.project);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const close = () => uiStore.getState().setDialog(null);
  return (
    <Modal title={t('Export')} wide onClose={close} footer={<Button onClick={close}>{t('Close')}</Button>}>
      {setup ? <ExportBody setup={setup} /> : <p>{t('No active setup.')}</p>}
    </Modal>
  );
}

function Group(props: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section
      className="space-y-2 rounded border border-neutral-200 p-3 dark:border-neutral-700"
      aria-label={props.title}
    >
      <h3 className="text-xs font-semibold text-neutral-500 uppercase">{props.title}</h3>
      {props.hint && <p className="text-xs text-neutral-500">{props.hint}</p>}
      {props.children}
    </section>
  );
}

function ExportBody({ setup }: { setup: Setup }) {
  const project = useProject((s) => s.project);
  const canvasTab = useUi((s) => s.canvasTab);
  const [view, setView] = useState<LayoutViewKind>(uiStore.getState().layoutView);
  const [scale, setScale] = useState<string>('10');
  const [paper, setPaper] = useState<Paper>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [sections, setSections] = useState<Set<ReportSection>>(new Set(['connections', 'bom']));
  const [tilePaper, setTilePaper] = useState<Paper>('A4');
  const [tileStands, setTileStands] = useState(false);
  const [tileRack, setTileRack] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);
  const [matrixGroup, setMatrixGroup] = useState('audio');
  const [status, setStatus] = useState('');
  const selection = useUi((s) => s.selection);

  const { ctx, issues } = useMemo(() => {
    const c = buildContext(project, setup);
    return { ctx: c, issues: runRules(c).issues };
  }, [project, setup]);
  const content = useMemo(() => layoutContent(project, ctx.layout, view, issues), [project, ctx, view, issues]);
  const numericScale = scale === 'fit' ? fitScale(content.box, paper, orientation) : Number(scale);
  const tiles = tileCount(content.box, numericScale, paper, orientation);
  const base = `${fileSafe(setup.name)}`;
  const title = (drawing: string) => ({ project: project.meta.name, setup: setup.name, drawing, date: today() });

  const selectedUnit =
    selection?.kind === 'gear-unit' && ctx.layout.layout.units.has(selection.id) ? selection.id : null;
  const footprints = useMemo(() => {
    const area = drawingArea(tilePaper, 'portrait');
    return footprintContent(project, setup, ctx.layout, {
      page: area,
      stands: tileStands,
      rackGear: tileRack,
      ...(onlySelected && selectedUnit ? { unitIds: [selectedUnit] } : {}),
    });
  }, [project, setup, ctx, tilePaper, tileStands, tileRack, onlySelected, selectedUnit]);
  const footprintPages = useMemo(
    () =>
      sheets(
        { ...footprints, svg: '' },
        { scale: 1, paper: tilePaper, orientation: 'portrait', title: title(''), align: 'start' },
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [footprints, tilePaper],
  );

  const report = () => {
    const pages = sheets(content, {
      scale: numericScale,
      paper,
      orientation,
      title: title(VIEW_TITLES[view]),
      legend: 'layout',
    });
    const html = reportDocument({
      title: `${setup.name} · ${VIEW_TITLES[view]} 1:${numericScale}`,
      paper,
      orientation,
      sheets: pages,
      sections: REPORT_SECTIONS.filter((s) => sections.has(s.id)).map((s) => sectionHtml(s.id, ctx, issues)),
    });
    if (!openPrintWindow(html)) setStatus(t('The browser blocked the print window; allow pop-ups for this page.'));
  };
  const drawingSvg = () => standaloneSvg(content, numericScale, `${setup.name} · ${VIEW_TITLES[view]}`);
  const fileName = (ext: string) => `${base}-${view}-1-${numericScale}.${ext}`;

  const run = async (label: string, fn: () => unknown) => {
    try {
      setStatus('');
      await fn();
    } catch (e) {
      setStatus(t('{what} failed: {msg}', { what: label, msg: (e as Error).message }));
    }
  };

  const patchSvg = () => {
    const el = document.querySelector<SVGSVGElement>('svg[aria-label^="Patch of"]');
    if (!el) throw new Error(t('Open the Patch tab first.'));
    return captureCanvasSvg(el, `${setup.name} · patch`);
  };

  return (
    <div className="space-y-3 text-sm">
      <Group
        title={t('Drawing and report')}
        hint={t(
          'PDF uses the print dialog: choose "Save as PDF" and print at 100 % (no fit to page) to keep the scale.',
        )}
      >
        <div className="grid grid-cols-4 gap-3">
          <Field label={t('View')}>
            {(id) => (
              <Select
                id={id}
                value={view}
                options={(['front', 'side', 'plan'] as const).map((v) => ({ value: v, label: t(VIEW_TITLES[v]) }))}
                onChange={setView}
              />
            )}
          </Field>
          <Field label={t('Scale')}>
            {(id) => (
              <Select
                id={id}
                value={scale}
                options={[
                  ...STANDARD_SCALES.filter((s) => s >= 5).map((s) => ({ value: String(s), label: `1:${s}` })),
                  { value: 'fit', label: t('Fit one page') },
                ]}
                onChange={setScale}
              />
            )}
          </Field>
          <Field label={t('Paper')}>
            {(id) => <Select id={id} value={paper} options={['A4', 'A3'] as const} onChange={setPaper} />}
          </Field>
          <Field label={t('Orientation')}>
            {(id) => (
              <Select
                id={id}
                value={orientation}
                options={[
                  { value: 'landscape', label: t('Landscape') },
                  { value: 'portrait', label: t('Portrait') },
                ]}
                onChange={setOrientation}
              />
            )}
          </Field>
        </div>
        <p className="text-xs text-neutral-500" data-testid="drawing-pages">
          {t('{w} × {h} mm at 1:{s} → {n} page(s) ({c} × {r})', {
            w: Math.round(content.box.w),
            h: Math.round(content.box.h),
            s: numericScale,
            n: tiles.cols * tiles.rows,
            c: tiles.cols,
            r: tiles.rows,
          })}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {REPORT_SECTIONS.map((s) => (
            <Checkbox
              key={s.id}
              label={t(s.label)}
              checked={sections.has(s.id)}
              onChange={(v) => {
                const next = new Set(sections);
                if (v) next.add(s.id);
                else next.delete(s.id);
                setSections(next);
              }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={report}>
            {t('Print / PDF…')}
          </Button>
          <Button onClick={() => downloadText(drawingSvg(), fileName('svg'), 'image/svg+xml')}>{t('SVG')}</Button>
          <Button
            onClick={() => run('PNG', async () => downloadBlob(await svgToPng(drawingSvg(), 200), fileName('png')))}
          >
            {t('PNG')}
          </Button>
        </div>
      </Group>

      <Group
        title={t('Footprint templates (1:1)')}
        hint={t('Paper outlines of each unit at full size, tiled over pages with alignment marks; tape them together.')}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('Paper')}>
            {(id) => <Select id={id} value={tilePaper} options={['A4', 'A3'] as const} onChange={setTilePaper} />}
          </Field>
          <Checkbox label={t('Include stands')} checked={tileStands} onChange={setTileStands} />
          <Checkbox label={t('Include rack gear')} checked={tileRack} onChange={setTileRack} />
          <Checkbox
            label={t('Selected unit only')}
            checked={onlySelected && !!selectedUnit}
            onChange={setOnlySelected}
          />
          <span className="text-xs text-neutral-500" data-testid="footprint-pages">
            {t('{n} outline(s) → {p} page(s)', {
              n: footprints.count,
              p: footprintPages,
            })}
          </span>
        </div>
        <Button
          disabled={!footprints.count}
          onClick={() => {
            const pages = sheets(footprints, {
              scale: 1,
              paper: tilePaper,
              orientation: 'portrait',
              title: title('Footprint templates'),
              legend: 'footprint',
              align: 'start',
            });
            const html = reportDocument({
              title: `${setup.name} · footprints 1:1`,
              paper: tilePaper,
              orientation: 'portrait',
              sheets: pages,
              sections: [],
            });
            if (!openPrintWindow(html))
              setStatus(t('The browser blocked the print window; allow pop-ups for this page.'));
          }}
        >
          {t('Print templates…')}
        </Button>
      </Group>

      <Group title={t('Data')}>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => downloadText(bomCsv(setupBom(ctx)), `${base}-cable-bom.csv`, 'text/csv')}>
            {t('Cable BOM (CSV)')}
          </Button>
          <Button onClick={() => downloadText(powerSheetCsv(powerSheet(ctx)), `${base}-power.csv`, 'text/csv')}>
            {t('Power sheet (CSV)')}
          </Button>
          <Button
            onClick={() =>
              downloadText(connectionsCsv(connectionRows(ctx, issues)), `${base}-connections.csv`, 'text/csv')
            }
          >
            {t('Connections (CSV)')}
          </Button>
          <Button
            onClick={() => downloadText(midiMapCsv(midiChannelMap(ctx, issues)), `${base}-midi-map.csv`, 'text/csv')}
          >
            {t('MIDI map (CSV)')}
          </Button>
          <span className="inline-flex items-center gap-1">
            <span className="w-32">
              <Select
                aria-label={t('Matrix signal group')}
                value={matrixGroup}
                options={MATRIX_FAMILIES.map((g) => ({ value: g.id, label: t(g.label) }))}
                onChange={setMatrixGroup}
              />
            </span>
            <Button
              onClick={() =>
                downloadText(
                  matrixCsv(connectionMatrix(ctx, matrixGroup, issues)),
                  `${base}-matrix-${matrixGroup}.csv`,
                  'text/csv',
                )
              }
            >
              {t('Connection matrix (CSV)')}
            </Button>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => downloadText(setupMarkdown(ctx, issues), `${base}-summary.md`, 'text/markdown')}>
            {t('Summary (Markdown)')}
          </Button>
          <Button onClick={() => downloadText(signalDot(ctx), `${base}-signal.dot`, 'text/vnd.graphviz')}>
            {t('Signal graph (DOT)')}
          </Button>
          <Button onClick={() => downloadText(signalMermaid(ctx), `${base}-signal.mmd`, 'text/plain')}>
            {t('Signal graph (Mermaid)')}
          </Button>
          <Button
            disabled={canvasTab !== 'patch'}
            title={canvasTab === 'patch' ? undefined : t('Open the Patch tab first.')}
            onClick={() => run('SVG', () => downloadText(patchSvg(), `${base}-patch.svg`, 'image/svg+xml'))}
          >
            {t('Patch diagram (SVG)')}
          </Button>
          <Button
            disabled={canvasTab !== 'patch'}
            title={canvasTab === 'patch' ? undefined : t('Open the Patch tab first.')}
            onClick={() => run('PNG', async () => downloadBlob(await svgToPng(patchSvg(), 150), `${base}-patch.png`))}
          >
            {t('Patch diagram (PNG)')}
          </Button>
        </div>
      </Group>

      <Group title={t('Share and save')}>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              downloadText(
                snapshotHtml(ctx, issues, new Date().toISOString().slice(0, 16)),
                `${base}-snapshot.html`,
                'text/html',
              )
            }
          >
            {t('Static snapshot (HTML)')}
          </Button>
          <Button
            disabled={!hasDirectoryAccess()}
            title={hasDirectoryAccess() ? undefined : t('Needs a Chromium browser (File System Access API).')}
            onClick={() =>
              run('Save', async () => {
                const dir = await saveProjectFolder();
                if (dir) setStatus(t('Saved to folder "{dir}" with an assets/ folder.', { dir }));
              })
            }
          >
            {t('Save with asset folder…')}
          </Button>
        </div>
        <p className="text-xs text-neutral-500">
          {t('Library bundles (models, stands, cables, templates) are exported from the Library tab.')}
        </p>
      </Group>
      {status && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
          {status}
        </p>
      )}
    </div>
  );
}
