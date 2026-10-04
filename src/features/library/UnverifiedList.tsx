// Project-wide "Unverified fields" list (spec §3.3, §5.14).
import { ProvenanceBadge } from '@/components/ui';
import { describePath, modelLabel, unverifiedFields } from '@/domain/libraryOps';
import { t } from '@/i18n';
import { uiStore, useProject } from '@/store';

export function UnverifiedList() {
  const models = useProject((s) => s.project.library.gearModels);
  const rows = models
    .map((m) => ({ m, fields: unverifiedFields(m) }))
    .filter((r) => r.fields.length > 0)
    .sort((a, b) => b.fields.length - a.fields.length);
  const total = rows.reduce((n, r) => n + r.fields.length, 0);
  return (
    <div className="flex h-full flex-col text-sm">
      <h3 className="border-b border-neutral-200 p-2 text-xs font-semibold text-neutral-500 uppercase dark:border-neutral-700">
        {t('Unverified fields')} ({total})
      </h3>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 && <p className="p-3 text-xs text-neutral-500">{t('Everything is verified.')}</p>}
        {rows.map(({ m, fields }) => (
          <details key={m.id} className="border-b border-neutral-100 px-2 py-1 dark:border-neutral-800">
            <summary className="cursor-pointer">
              <button
                className="text-left hover:underline"
                onClick={() => uiStore.getState().select({ kind: 'gear-model', id: m.id })}
              >
                {modelLabel(m)}
              </button>{' '}
              <span className="text-xs text-neutral-500">({fields.length})</span>
            </summary>
            <ul className="mt-1 space-y-0.5 text-xs">
              {fields.map((f) => (
                <li key={f.path} title={f.note}>
                  <code>{describePath(m, f.path)}</code> <ProvenanceBadge prov={{ kind: f.kind, note: f.note }} />
                  {f.note && <span className="ml-1 text-neutral-500">{f.note}</span>}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
