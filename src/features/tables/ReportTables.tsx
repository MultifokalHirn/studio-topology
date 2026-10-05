// Report tables of the Tables tab (spec §5.14): connection matrix, MIDI channel map, power sheet with adapter
// labels, stand/rack summary, unverified fields and gear sheets.
import clsx from 'clsx';
import { type ReactNode, useMemo, useState } from 'react';
import { Button, Select } from '@/components/ui';
import {
  connectionMatrix,
  MATRIX_FAMILIES,
  matrixCsv,
  midiChannelMap,
  midiMapCsv,
  powerSheet,
  powerSheetCsv,
  standSummary,
  type Cell,
} from '@/engine/reports';
import { buildContext, runRules } from '@/engine/rules';
import type { SetupContext } from '@/engine/rules/context';
import type { Issue } from '@/engine/issues';
import { t } from '@/i18n';
import { reportDocument, sectionHtml } from '@/render/reportHtml';
import { uiStore, useProject } from '@/store';
import { downloadText } from '@/store/fileIO';
import { UnverifiedList } from '../library/UnverifiedList';
import { fileSafe, openPrintWindow } from '../reports/exportIO';

function useSetupContext(): { ctx: SetupContext; issues: Issue[] } | null {
  const project = useProject((s) => s.project);
  return useMemo(() => {
    const setup = project.setups.find((s) => s.id === project.activeSetupId);
    if (!setup) return null;
    const ctx = buildContext(project, setup);
    return { ctx, issues: runRules(ctx).issues };
  }, [project]);
}

function Frame(props: { title: string; setup: string; actions?: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 p-2 dark:border-neutral-700">
        <h2 className="font-semibold">
          {t(props.title)} · {props.setup}
        </h2>
        <span className="flex-1" />
        {props.actions}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{props.children}</div>
      {props.note && (
        <p className="border-t border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">
          {props.note}
        </p>
      )}
    </div>
  );
}

const ROW_CLS = {
  err: 'bg-red-50 dark:bg-red-950/50',
  warn: 'bg-amber-50 dark:bg-amber-950/50',
};

function DataTable(props: {
  label: string;
  head: string[];
  rows: Cell[][];
  rowClass?: (i: number) => keyof typeof ROW_CLS | '';
}) {
  return (
    <table className="w-full text-xs" aria-label={t(props.label)}>
      <thead className="sticky top-0 bg-neutral-100 text-left text-neutral-500 dark:bg-neutral-800">
        <tr>
          {props.head.map((h) => (
            <th key={h} className="px-2 py-1 font-medium">
              {t(h)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r, i) => {
          const cls = props.rowClass?.(i);
          return (
            <tr key={i} className={clsx('border-t border-neutral-100 dark:border-neutral-800', cls && ROW_CLS[cls])}>
              {r.map((c, k) => (
                <td key={k} className="px-2 py-0.5">
                  {c ?? ''}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const csvName = (setup: string, what: string) => `${fileSafe(setup)}-${what}.csv`;

export function MatrixTable() {
  const data = useSetupContext();
  const [group, setGroup] = useState('audio');
  if (!data) return null;
  const { ctx, issues } = data;
  const m = connectionMatrix(ctx, group, issues);
  return (
    <Frame
      title="Connection matrix"
      setup={ctx.setup.name}
      actions={
        <>
          <div className="w-36">
            <Select
              aria-label={t('Signal group')}
              value={group}
              options={MATRIX_FAMILIES.map((g) => ({ value: g.id, label: t(g.label) }))}
              onChange={setGroup}
            />
          </div>
          <Button onClick={() => downloadText(matrixCsv(m), csvName(ctx.setup.name, `matrix-${group}`), 'text/csv')}>
            {t('Export CSV')}
          </Button>
        </>
      }
      note={t('Rows are outputs, columns inputs; only connected ports are listed. ● link, ✕ invalid link, ○ disabled.')}
    >
      {m.rows.length === 0 ? (
        <p className="p-3 text-xs text-neutral-500">{t('No connections in this group.')}</p>
      ) : (
        <table className="text-xs" aria-label={t('Connection matrix')}>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-10 bg-neutral-100 px-2 text-left dark:bg-neutral-800">
                {t('Output \\ input')}
              </th>
              {m.cols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className="sticky top-0 h-40 bg-neutral-100 px-0.5 align-bottom font-normal whitespace-nowrap dark:bg-neutral-800"
                >
                  <span className="inline-block [writing-mode:vertical-rl] rotate-180">{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.key} className="border-t border-neutral-100 dark:border-neutral-800">
                <th
                  scope="row"
                  className="sticky left-0 bg-neutral-50 px-2 text-left font-normal whitespace-nowrap dark:bg-neutral-900"
                >
                  {r.label}
                </th>
                {m.cols.map((c) => {
                  const cell = m.cells.get(`${r.key}|${c.key}`);
                  return (
                    <td
                      key={c.key}
                      className={clsx(
                        'border-l border-neutral-100 text-center dark:border-neutral-800',
                        cell?.invalid && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
                        cell && !cell.invalid && 'text-green-700 dark:text-green-400',
                      )}
                      title={cell ? `${r.label} → ${c.label}` : undefined}
                      data-cell={cell ? (cell.invalid ? 'invalid' : 'link') : undefined}
                    >
                      {cell ? (cell.invalid ? '✕' : cell.enabled ? '●' : '○') : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Frame>
  );
}

export function MidiMapTable() {
  const data = useSetupContext();
  if (!data) return null;
  const rows = midiChannelMap(data.ctx, data.issues);
  return (
    <Frame
      title="MIDI channel map"
      setup={data.ctx.setup.name}
      actions={
        <Button onClick={() => downloadText(midiMapCsv(rows), csvName(data.ctx.setup.name, 'midi-map'), 'text/csv')}>
          {t('Export CSV')}
        </Button>
      }
      note={t('Highlighted rows: one source reaches several destinations on the same channel (MIDI-002).')}
    >
      <DataTable
        label="MIDI channel map"
        head={['Source', 'Track', 'Channel', 'Destination', 'Via']}
        rows={rows.map((r) => [r.source, r.track, r.channel, r.destination, r.via.join(', ')])}
        rowClass={(i) => (rows[i]!.conflict ? 'warn' : '')}
      />
    </Frame>
  );
}

export function PowerSheetTable() {
  const data = useSetupContext();
  if (!data) return null;
  const { ctx } = data;
  const s = powerSheet(ctx);
  const printLabels = () =>
    openPrintWindow(
      reportDocument({
        title: `${ctx.setup.name} · power`,
        paper: 'A4',
        orientation: 'portrait',
        sheets: [],
        sections: [sectionHtml('power', ctx, data.issues)],
      }),
    );
  return (
    <Frame
      title="Power sheet"
      setup={ctx.setup.name}
      actions={
        <>
          <Button onClick={printLabels}>{t('Print with labels…')}</Button>
          <Button onClick={() => downloadText(powerSheetCsv(s), csvName(ctx.setup.name, 'power'), 'text/csv')}>
            {t('Export CSV')}
          </Button>
        </>
      }
      note={
        <span data-testid="mains-total">
          {t('Mains total {w} W at {v} V', { w: Math.round(s.mainsW), v: ctx.project.settings.mainsVoltage })}
          {s.mainsUnknown ? ` + ${t('{n} unit(s) without data', { n: s.mainsUnknown })}` : ''}
          {' · '}
          {t('Supplies, strips and PDUs are listed but not added to the total.')}
        </span>
      }
    >
      <DataTable
        label="Power sheet"
        head={['Unit', 'Source', 'Supply', 'Voltage', 'Polarity', 'Plug', 'Draw', 'W', 'Supply load']}
        rows={s.rows.map((r) => [
          r.unit,
          r.kind === 'none' ? '' : r.kind,
          r.supply || (r.distributor ? t('(distributor)') : ''),
          r.voltage === null ? '' : `${r.voltage} V`,
          r.polarity,
          r.plug,
          r.drawMa === null ? '' : `${r.drawMa} mA${r.peakMa ? ` (${t('peak')} ${r.peakMa})` : ''}`,
          r.watts === null ? '?' : Math.round(r.watts * 10) / 10,
          r.supplyLoad === null ? '' : `${Math.round(r.supplyLoad * 100)} %`,
        ])}
        rowClass={(i) => ((s.rows[i]!.supplyLoad ?? 0) > 1 ? 'err' : (s.rows[i]!.supplyLoad ?? 0) > 0.8 ? 'warn' : '')}
      />
      <h3 className="px-2 pt-3 text-xs font-semibold text-neutral-500 uppercase">{t('Adapter labels')}</h3>
      <ul className="flex flex-wrap gap-2 p-2" aria-label={t('Adapter labels')}>
        {s.labels.map((l, i) => (
          <li key={i} className="w-56 rounded border border-dashed border-neutral-400 p-2 text-xs">
            <b>{l.supply}</b>
            <br />→ {l.load}
            <br />
            <span className="text-neutral-500">{l.spec}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function StandSummaryTable() {
  const data = useSetupContext();
  if (!data) return null;
  const rows = standSummary(data.ctx);
  return (
    <Frame title="Stands and racks" setup={data.ctx.setup.name}>
      <DataTable
        label="Stand summary"
        head={['Stand', 'Surface', 'Units', 'Load', 'Capacity', 'Remaining', 'Rack U', 'Deepest unit']}
        rows={rows.map((r) => [
          r.stand,
          r.surface,
          r.units,
          `${r.loadKg}${r.loadComplete ? '' : '+'} kg`,
          r.capacityKg === null ? '?' : `${r.capacityKg} kg`,
          r.remainingKg === null ? '' : `${r.remainingKg} kg`,
          r.rackU ? `${r.rackU.used} / ${r.rackU.total} U` : '',
          r.depthMm === null ? '' : `${Math.round(r.depthMm)} mm`,
        ])}
        rowClass={(i) => ((rows[i]!.remainingKg ?? 0) < 0 ? 'err' : '')}
      />
      <p className="px-2 py-2 text-xs text-neutral-500">
        {t('Row pitches and occlusion are in the layout report under the Layout canvas.')}{' '}
        <button className="underline" onClick={() => uiStore.getState().setCanvasTab('layout')}>
          {t('Open Layout')}
        </button>
      </p>
    </Frame>
  );
}

export function UnverifiedTable() {
  return <UnverifiedList />;
}

/** Gear sheets: one page per unit, previewed exactly as printed. */
export function GearSheets() {
  const data = useSetupContext();
  const doc = useMemo(
    () =>
      data &&
      reportDocument({
        title: `${data.ctx.setup.name} · gear sheets`,
        paper: 'A4',
        orientation: 'portrait',
        sheets: [],
        sections: [sectionHtml('gear', data.ctx, data.issues)],
      }),
    [data],
  );
  if (!data || !doc) return null;
  return (
    <Frame
      title="Gear sheets"
      setup={data.ctx.setup.name}
      actions={<Button onClick={() => openPrintWindow(doc)}>{t('Print / PDF…')}</Button>}
    >
      <iframe title={t('Gear sheets preview')} sandbox="" srcDoc={doc} className="h-full w-full border-0 bg-white" />
    </Frame>
  );
}
