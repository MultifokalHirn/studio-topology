// Tables tab (spec §5.14): sub-views; more tables arrive with the reports milestone.
import clsx from 'clsx';
import { useState } from 'react';
import { t } from '@/i18n';
import { BomTable } from './BomTable';
import { ConnectionsTable } from './ConnectionsTable';

export function TablesView() {
  const [tab, setTab] = useState<'connections' | 'bom'>('connections');
  return (
    <div className="flex h-full flex-col">
      <div
        role="tablist"
        aria-label={t('Tables')}
        className="flex gap-1 border-b border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700"
      >
        {(
          [
            ['connections', 'Connections'],
            ['bom', 'Cable BOM'],
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
      <div className="min-h-0 flex-1">{tab === 'connections' ? <ConnectionsTable /> : <BomTable />}</div>
    </div>
  );
}
