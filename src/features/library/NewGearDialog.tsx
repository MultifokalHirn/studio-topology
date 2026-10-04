// "New gear" (spec §5.2, §6 add flow): pick a template, set its parameters, then open the gear editor.
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Field, Modal, NumberInput, TextInput } from '@/components/ui';
import { newId } from '@/domain/ids';
import { addGearUnit } from '@/domain/libraryOps';
import { defaultParams, instantiateGearTemplate } from '@/domain/templates';
import type { Template } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject } from '@/store';
import { builtInTemplates } from './catalog';

export function NewGearDialog({ onClose }: { onClose: () => void }) {
  const userTemplates = useProject((s) => s.project.library.templates);
  const templates = useMemo(
    () => [...builtInTemplates, ...userTemplates].filter((x) => x.target === 'gear'),
    [userTemplates],
  );
  const groups = [...new Set(templates.map((x) => x.group))];
  const [selected, setSelected] = useState<Template | null>(null);
  const [params, setParams] = useState<Record<string, number>>({});
  const [manufacturer, setManufacturer] = useState('');
  const [name, setName] = useState('');
  const [addUnit, setAddUnit] = useState(true);

  const pick = (tpl: Template) => {
    setSelected(tpl);
    setParams(defaultParams(tpl));
    if (!name) setName(tpl.name);
  };

  const create = () => {
    if (!selected) return;
    const id = newId();
    projectStore.getState().change(
      (p) => {
        const model = instantiateGearTemplate(selected, params, id);
        model.manufacturer = manufacturer.trim();
        model.name = name.trim() || selected.name;
        p.library.gearModels.push(model);
        if (addUnit) addGearUnit(p, id);
      },
      { label: 'New gear' },
    );
    uiStore.getState().select({ kind: 'gear-model', id });
    uiStore.getState().editGearModel(id);
    onClose();
  };

  return (
    <Modal
      title={t('New gear')}
      wide
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={!selected} onClick={create}>
            {t('Create and edit')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_260px] gap-4">
        <div role="listbox" aria-label={t('Templates')} className="max-h-[55vh] overflow-auto pr-2">
          {groups.map((g) => (
            <section key={g} className="mb-3">
              <h4 className="mb-1 text-xs font-semibold text-neutral-500 uppercase">{t(g)}</h4>
              <div className="grid grid-cols-2 gap-1">
                {templates
                  .filter((x) => x.group === g)
                  .map((x) => (
                    <button
                      key={x.id}
                      role="option"
                      aria-selected={selected?.id === x.id}
                      onClick={() => pick(x)}
                      className={clsx(
                        'rounded border px-2 py-1 text-left text-sm',
                        selected?.id === x.id
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                          : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800',
                      )}
                    >
                      {x.name}
                      <span className="block text-xs text-neutral-500">
                        {t('{n} connectors', {
                          n: (x.gear?.connectors?.length ?? 0) + (x.connectorGroups?.length ? '+' : ''),
                        })}
                      </span>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <div className="space-y-2">
          <Field label={t('Manufacturer')}>
            {(id) => <TextInput id={id} value={manufacturer} onChange={setManufacturer} />}
          </Field>
          <Field label={t('Name')}>{(id) => <TextInput id={id} value={name} onChange={setName} />}</Field>
          {selected?.params?.map((prm) => (
            <Field key={prm.key} label={`${prm.label}${prm.unit ? ` (${prm.unit})` : ''}`}>
              {(id) => (
                <NumberInput
                  id={id}
                  value={params[prm.key] ?? prm.default}
                  onChange={(v) => setParams((s) => ({ ...s, [prm.key]: v ?? prm.default }))}
                />
              )}
            </Field>
          ))}
          {selected?.description && <p className="text-xs text-neutral-500">{selected.description}</p>}
          <Checkbox checked={addUnit} onChange={setAddUnit} label={t('Add a unit to my inventory')} />
          <p className="text-xs text-neutral-500">
            {t(
              'Dimensions start unknown. Every step after this is optional; unknown values are flagged, never guessed.',
            )}
          </p>
        </div>
      </div>
    </Modal>
  );
}
