// Setups sidebar (spec §5.11): switch, create blank / clone / derive, rename, status, tags, notes, reorder, delete.
import clsx from 'clsx';
import { useState } from 'react';
import { Button, ConfirmModal, Select, TextInput } from '@/components/ui';
import { createSetup } from '@/domain/defaults';
import type { Setup } from '@/domain/types';
import { cloneSetup, deleteSetup, moveSetup, uniqueSetupName } from '@/domain/variants';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject } from '@/store';
import { SetupThumbnail } from './SetupThumbnail';

const STATUSES = ['current', 'planned', 'idea', 'archived'] as const;

const editSetup = (id: string, label: string, recipe: (s: Setup) => void, coalesceKey?: string) =>
  projectStore.getState().change(
    (p) => {
      const s = p.setups.find((x) => x.id === id);
      if (s) recipe(s);
    },
    { label, ...(coalesceKey ? { coalesceKey } : {}) },
  );

export function SetupsPanel() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const change = projectStore.getState().change;
  const [pendingDelete, setPendingDelete] = useState<Setup | null>(null);

  const copy = (src: Setup, derive: boolean) =>
    change(
      (p) => {
        const s = cloneSetup(src, {
          name: uniqueSetupName(p, derive ? `${src.name} (derived)` : `${src.name} (copy)`),
          derive,
        });
        p.setups.splice(p.setups.findIndex((x) => x.id === src.id) + 1, 0, s);
        p.activeSetupId = s.id;
      },
      { label: derive ? 'Derive setup' : 'Clone setup' },
    );

  return (
    <div className="space-y-2 p-2 text-sm">
      <ul aria-label={t('Setups')} className="space-y-1">
        {project.setups.map((s, i) => {
          const active = s.id === project.activeSetupId;
          const parent = s.derivedFromId ? project.setups.find((x) => x.id === s.derivedFromId) : undefined;
          return (
            <li
              key={s.id}
              aria-label={s.name}
              aria-current={active ? 'true' : undefined}
              className={clsx(
                'rounded border p-1.5',
                active ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-200 dark:border-neutral-700',
              )}
            >
              <div className="flex items-start gap-2">
                <SetupThumbnail project={project} setup={s} />
                {active ? (
                  <div className="min-w-0 flex-1 space-y-1">
                    <TextInput
                      aria-label={t('Setup name')}
                      value={s.name}
                      onChange={(v) =>
                        editSetup(s.id, 'Rename setup', (x) => void (x.name = v), `rename-setup:${s.id}`)
                      }
                    />
                    <Select
                      aria-label={t('Status')}
                      value={s.status}
                      options={STATUSES}
                      onChange={(v) => editSetup(s.id, 'Setup status', (x) => void (x.status = v))}
                    />
                  </div>
                ) : (
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => change((p) => void (p.activeSetupId = s.id), { label: 'Switch setup' })}
                  >
                    <span className="block truncate">{s.name}</span>
                    <span className="text-xs text-neutral-500">{s.status}</span>
                    {s.tags.length > 0 && (
                      <span className="block truncate text-xs text-neutral-500">#{s.tags.join(' #')}</span>
                    )}
                  </button>
                )}
              </div>
              {active && (
                <div className="mt-1 space-y-1">
                  <TextInput
                    aria-label={t('Tags (comma separated)')}
                    placeholder={t('Tags (comma separated)')}
                    value={s.tags.join(', ')}
                    onChange={(v) =>
                      editSetup(
                        s.id,
                        'Setup tags',
                        (x) =>
                          void (x.tags = v
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean)),
                        `tags:${s.id}`,
                      )
                    }
                  />
                  <textarea
                    aria-label={t('Notes')}
                    placeholder={t('Notes')}
                    rows={2}
                    className="w-full rounded border border-neutral-300 px-1 text-xs dark:border-neutral-600 dark:bg-neutral-800"
                    value={s.description}
                    onChange={(e) =>
                      editSetup(s.id, 'Setup notes', (x) => void (x.description = e.target.value), `notes:${s.id}`)
                    }
                  />
                  <p className="text-xs text-neutral-500">
                    {t('{p} placements · {c} connections', { p: s.placements.length, c: s.connections.length })}
                    {parent && ` · ${t('derived from {name}', { name: parent.name })}`}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Button disabled={readOnly} onClick={() => copy(s, false)}>
                      {t('Clone')}
                    </Button>
                    <Button disabled={readOnly} onClick={() => copy(s, true)}>
                      {t('Derive')}
                    </Button>
                    <Button
                      disabled={project.setups.length < 2}
                      onClick={() => uiStore.getState().setCanvasTab('compare')}
                    >
                      {t('Compare…')}
                    </Button>
                    <Button
                      aria-label={t('Move {name} up', { name: s.name })}
                      disabled={readOnly || i === 0}
                      onClick={() => change((p) => moveSetup(p, s.id, -1), { label: 'Reorder setups' })}
                    >
                      ↑
                    </Button>
                    <Button
                      aria-label={t('Move {name} down', { name: s.name })}
                      disabled={readOnly || i === project.setups.length - 1}
                      onClick={() => change((p) => moveSetup(p, s.id, 1), { label: 'Reorder setups' })}
                    >
                      ↓
                    </Button>
                    <Button disabled={readOnly || project.setups.length < 2} onClick={() => setPendingDelete(s)}>
                      {t('Delete')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        disabled={readOnly}
        onClick={() =>
          change(
            (p) => {
              const body = p.settings.defaultBodyProfileId ?? p.bodyProfiles[0]?.id ?? 'body-default';
              const s = createSetup(uniqueSetupName(p, t('New setup')), body);
              s.status = 'idea';
              p.setups.push(s);
              p.activeSetupId = s.id;
            },
            { label: 'New setup' },
          )
        }
      >
        {t('New blank setup')}
      </Button>
      <p className="text-xs text-neutral-500">{t('Press \\ to toggle between this and the previous setup.')}</p>
      {pendingDelete && (
        <ConfirmModal
          title={t('Delete {name}?', { name: pendingDelete.name })}
          confirmLabel={t('Delete')}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            change((p) => void deleteSetup(p, pendingDelete.id), { label: 'Delete setup' });
            setPendingDelete(null);
          }}
        >
          {t('Its placements, connections and checklist progress are removed. Undo restores it.')}
        </ConfirmModal>
      )}
    </div>
  );
}
