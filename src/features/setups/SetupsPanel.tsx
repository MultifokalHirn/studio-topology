// Setups sidebar (spec §5.11, minimal until M8): switch, create blank, rename, status.
import clsx from 'clsx';
import { Button, Select, TextInput } from '@/components/ui';
import { createSetup } from '@/domain/defaults';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';

const STATUSES = ['current', 'planned', 'idea', 'archived'] as const;

export function SetupsPanel() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const change = projectStore.getState().change;
  return (
    <div className="space-y-2 p-2 text-sm">
      <ul aria-label={t('Setups')} className="space-y-1">
        {project.setups.map((s) => {
          const active = s.id === project.activeSetupId;
          return (
            <li
              key={s.id}
              className={clsx(
                'rounded border p-1.5',
                active ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-200 dark:border-neutral-700',
              )}
            >
              {active ? (
                <div className="space-y-1">
                  <TextInput
                    aria-label={t('Setup name')}
                    value={s.name}
                    onChange={(v) =>
                      change((p) => void (p.setups.find((x) => x.id === s.id)!.name = v), {
                        label: 'Rename setup',
                        coalesceKey: `rename-setup:${s.id}`,
                      })
                    }
                  />
                  <Select
                    aria-label={t('Status')}
                    value={s.status}
                    options={STATUSES}
                    onChange={(v) =>
                      change((p) => void (p.setups.find((x) => x.id === s.id)!.status = v), { label: 'Setup status' })
                    }
                  />
                  <p className="text-xs text-neutral-500">
                    {t('{p} placements · {c} connections', { p: s.placements.length, c: s.connections.length })}
                  </p>
                </div>
              ) : (
                <button
                  className="w-full text-left"
                  onClick={() => change((p) => void (p.activeSetupId = s.id), { label: 'Switch setup' })}
                >
                  {s.name} <span className="text-xs text-neutral-500">· {s.status}</span>
                </button>
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
              const s = createSetup(t('New setup'), body);
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
      <p className="text-xs text-neutral-500">
        {t('Clone, derive, compare and migration checklists arrive with the variants milestone.')}
      </p>
    </div>
  );
}
