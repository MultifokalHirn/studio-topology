// Inventory tab (spec §5.1/5.2): owned gear and stand units, grouped by category.
import { IconCopy, IconTrash } from '@tabler/icons-react';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { ConfirmModal, TextInput } from '@/components/ui';
import { deleteGearUnit, deleteStandUnit, duplicateGearUnit, gearUnitUsage, modelLabel } from '@/domain/libraryOps';
import type { GearModel, GearUnit } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject, useUi } from '@/store';

export function InventoryPanel() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const selection = useUi((s) => s.selection);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<GearUnit | null>(null);
  const models = useMemo(() => new Map(project.library.gearModels.map((m) => [m.id, m])), [project.library.gearModels]);
  const standModels = useMemo(
    () => new Map(project.library.standModels.map((m) => [m.id, m])),
    [project.library.standModels],
  );
  const q = query.trim().toLowerCase();

  const groups = new Map<string, { unit: GearUnit; model: GearModel | undefined }[]>();
  for (const unit of project.inventory.gearUnits) {
    const model = models.get(unit.modelId);
    if (q && ![unit.nickname, model ? modelLabel(model) : ''].join(' ').toLowerCase().includes(q)) continue;
    const key = model?.category ?? 'other';
    groups.set(key, [...(groups.get(key) ?? []), { unit, model }]);
  }
  const change = projectStore.getState().change;

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="border-b border-neutral-200 p-2 dark:border-neutral-700">
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder={t('Search inventory…')}
          aria-label={t('Search inventory')}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {project.inventory.gearUnits.length === 0 && (
          <p className="p-3 text-xs text-neutral-500">
            {t('No gear yet. Open the Library tab and add your first gear.')}
          </p>
        )}
        {[...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, items]) => (
            <section key={category}>
              <h3 className="px-2 pt-2 text-xs font-semibold text-neutral-500 uppercase">
                {category} ({items.length})
              </h3>
              <ul>
                {items.map(({ unit, model }) => (
                  <li
                    key={unit.id}
                    className={clsx(
                      'group flex items-center gap-1 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                      selection?.kind === 'gear-unit' && selection.id === unit.id && 'bg-blue-50 dark:bg-blue-950',
                    )}
                  >
                    <button
                      className="min-w-0 flex-1 truncate text-left"
                      onClick={() => uiStore.getState().select({ kind: 'gear-unit', id: unit.id })}
                      onDoubleClick={() => model && uiStore.getState().editGearModel(model.id)}
                      title={model ? modelLabel(model) : unit.modelId}
                    >
                      {unit.nickname}
                      {model && model.manufacturer && (
                        <span className="ml-1 text-xs text-neutral-500">{` ${model.manufacturer}`}</span>
                      )}
                    </button>
                    <button
                      aria-label={t('Duplicate {name}', { name: unit.nickname })}
                      disabled={readOnly}
                      className="rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      onClick={() => change((p) => void duplicateGearUnit(p, unit.id), { label: 'Duplicate unit' })}
                    >
                      <IconCopy size={14} />
                    </button>
                    <button
                      aria-label={t('Delete {name}', { name: unit.nickname })}
                      disabled={readOnly}
                      className="rounded p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                      onClick={() => setPendingDelete(unit)}
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        <h3 className="px-2 pt-3 text-xs font-semibold text-neutral-500 uppercase">
          {t('Stands')} ({project.inventory.standUnits.length})
        </h3>
        <ul>
          {project.inventory.standUnits.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <button
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => uiStore.getState().select({ kind: 'stand-unit', id: s.id })}
              >
                {s.nickname}
                <span className="ml-1 text-xs text-neutral-500">{` ${standModels.get(s.modelId)?.type ?? ''}`}</span>
              </button>
              <button
                aria-label={t('Delete {name}', { name: s.nickname })}
                disabled={readOnly}
                className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                onClick={() => change((p) => deleteStandUnit(p, s.id), { label: 'Delete stand unit' })}
              >
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {pendingDelete && (
        <ConfirmModal
          title={t('Delete {name}?', { name: pendingDelete.nickname })}
          confirmLabel={t('Delete')}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => change((p) => deleteGearUnit(p, pendingDelete.id), { label: 'Delete unit' })}
        >
          <DeleteUnitUsage unitId={pendingDelete.id} />
        </ConfirmModal>
      )}
    </div>
  );
}

function DeleteUnitUsage({ unitId }: { unitId: string }) {
  const project = useProject((s) => s.project);
  const u = gearUnitUsage(project, unitId);
  const setups = new Set([...u.placements, ...u.connections].map((x) => x.setupId)).size;
  return (
    <p>
      {u.placements.length + u.connections.length === 0
        ? t('This unit is not used in any setup.')
        : t(
            'Used in {setups} setups: {placements} placements and {connections} connections will be removed. Undo restores them.',
            {
              setups,
              placements: u.placements.length,
              connections: u.connections.length,
            },
          )}
    </p>
  );
}
