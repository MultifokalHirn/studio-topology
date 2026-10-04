// Per-setup device settings that drive validation (spec §4.10 UnitConfig): clock role and port modes.
import { Checkbox, Field, Select } from '@/components/ui';
import { defaultUnitConfig } from '@/domain/defaults';
import type { UnitConfig } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';

export function ClockBlock({ unitId }: { unitId: string }) {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const unit = project.inventory.gearUnits.find((u) => u.id === unitId);
  const model = project.library.gearModels.find((m) => m.id === unit?.modelId);
  if (!setup || !model) return null;
  const cfg = setup.unitConfigs[unitId];
  const clockInputs = model.connectors
    .filter((c) => c.direction === 'in' && (c.domain.startsWith('midi.') || c.domain.startsWith('clock.')))
    .concat(model.connectors.filter((c) => c.usb?.carries.includes('midi')));
  const withAlternates = model.connectors.filter((c) => c.alternates?.length);
  const edit = (label: string, recipe: (c: UnitConfig) => void) =>
    projectStore.getState().change(
      (p) => {
        const s = p.setups.find((x) => x.id === setup.id);
        if (!s) return;
        s.unitConfigs[unitId] ??= defaultUnitConfig(model.ergonomics.defaultUsage);
        recipe(s.unitConfigs[unitId]!);
      },
      { label },
    );
  if (!model.clock && !withAlternates.length) return null;
  return (
    <section
      aria-label={t('Setup settings')}
      className="space-y-2 rounded border border-neutral-200 p-2 text-xs dark:border-neutral-700"
    >
      <h3 className="font-semibold text-neutral-500 uppercase">{t('Clock and port modes')}</h3>
      {model.clock && (
        <>
          <Checkbox
            checked={!!cfg?.clockMaster}
            label={t('Clock master')}
            onChange={(v) =>
              !readOnly &&
              edit('Clock master', (c) => {
                c.clockMaster = v;
                if (v) c.clockSource = 'internal';
              })
            }
          />
          <Field label={t('Clock source')}>
            {(id) => (
              <Select
                id={id}
                allowEmpty
                value={cfg?.clockSource === 'internal' ? 'internal' : cfg?.clockSource?.connectorId}
                options={[
                  { value: 'internal', label: t('Internal') },
                  ...clockInputs.map((c) => ({ value: c.id, label: c.label })),
                ]}
                onChange={(v) =>
                  edit('Clock source', (c) => {
                    if (!v) delete c.clockSource;
                    else c.clockSource = v === 'internal' ? 'internal' : { connectorId: v };
                  })
                }
              />
            )}
          </Field>
          <p className="text-neutral-500">{t('Formats: {f}', { f: model.clock.formats.join(', ') || '—' })}</p>
        </>
      )}
      {withAlternates.map((c) => (
        <Field key={c.id} label={t('{port} mode', { port: c.label })}>
          {(id) => (
            <Select
              id={id}
              value={cfg?.activeAlternates[c.id] ?? ''}
              options={[
                { value: '', label: t('Default') },
                ...c.alternates!.map((a) => ({ value: a.id, label: a.label })),
              ]}
              onChange={(v) =>
                edit('Port mode', (x) => {
                  if (v) x.activeAlternates[c.id] = v;
                  else delete x.activeAlternates[c.id];
                })
              }
            />
          )}
        </Field>
      ))}
    </section>
  );
}
