// Tables tab (spec §5.14): connections, BOM, matrix, MIDI map, trees, power sheet, stands, unverified, gear sheets.
import clsx from 'clsx';
import { useState } from 'react';
import { t } from '@/i18n';
import { BomTable } from './BomTable';
import { ConnectionsTable } from './ConnectionsTable';
import {
  GearSheets,
  MatrixTable,
  MidiMapTable,
  PowerSheetTable,
  StandSummaryTable,
  UnverifiedTable,
} from './ReportTables';
import { TreesView } from './TreesView';

type TableTab =
  | 'connections'
  | 'bom'
  | 'matrix'
  | 'midi'
  | 'clock'
  | 'usb'
  | 'power'
  | 'power-sheet'
  | 'stands'
  | 'unverified'
  | 'gear';

export function TablesView() {
  const [tab, setTab] = useState<TableTab>('connections');
  return (
    <div className="flex h-full flex-col">
      <div
        role="tablist"
        aria-label={t('Tables')}
        className="flex flex-wrap gap-1 border-b border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700"
      >
        {(
          [
            ['connections', 'Connections'],
            ['bom', 'Cable BOM'],
            ['matrix', 'Matrix'],
            ['midi', 'MIDI map'],
            ['clock', 'MIDI/clock tree'],
            ['usb', 'USB tree'],
            ['power', 'Power tree'],
            ['power-sheet', 'Power sheet'],
            ['stands', 'Stands'],
            ['unverified', 'Unverified'],
            ['gear', 'Gear sheets'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              'rounded px-2 py-0.5',
              tab === id ? 'bg-neutral-200 font-semibold dark:bg-neutral-700' : 'text-neutral-500',
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'connections' ? (
          <ConnectionsTable />
        ) : tab === 'bom' ? (
          <BomTable />
        ) : tab === 'matrix' ? (
          <MatrixTable />
        ) : tab === 'midi' ? (
          <MidiMapTable />
        ) : tab === 'power-sheet' ? (
          <PowerSheetTable />
        ) : tab === 'stands' ? (
          <StandSummaryTable />
        ) : tab === 'unverified' ? (
          <UnverifiedTable />
        ) : tab === 'gear' ? (
          <GearSheets />
        ) : (
          <TreesView kind={tab} />
        )}
      </div>
    </div>
  );
}
