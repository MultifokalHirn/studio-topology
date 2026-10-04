import { useState } from 'react';
import { Button, Field, Modal, NumberInput, Select, TextInput } from '@/components/ui';
import { newId } from '@/domain/ids';
import { addStandUnit } from '@/domain/libraryOps';
import { defaultParams, instantiateStandTemplate } from '@/domain/templates';
import { t } from '@/i18n';
import { projectStore, uiStore } from '@/store';
import { builtInTemplates } from './catalog';

const standTemplates = builtInTemplates.filter((x) => x.target === 'stand');

export function NewStandDialog({ onClose }: { onClose: () => void }) {
  const [tplId, setTplId] = useState(standTemplates[0]?.id ?? '');
  const tpl = standTemplates.find((x) => x.id === tplId);
  const [params, setParams] = useState<Record<string, number>>(tpl ? defaultParams(tpl) : {});
  const [name, setName] = useState('');
  const create = () => {
    if (!tpl) return;
    const id = newId();
    projectStore.getState().change(
      (p) => {
        const m = instantiateStandTemplate(tpl, params, id);
        m.name = name.trim() || m.name;
        p.library.standModels.push(m);
        addStandUnit(p, id);
      },
      { label: 'New stand' },
    );
    uiStore.getState().select({ kind: 'stand-model', id });
    onClose();
  };
  return (
    <Modal
      title={t('New stand')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={create}>
            {t('Create')}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Field label={t('Template')}>
          {(id) => (
            <Select
              id={id}
              value={tplId}
              options={standTemplates.map((x) => ({ value: x.id, label: x.name }))}
              onChange={(v) => {
                setTplId(v);
                const next = standTemplates.find((x) => x.id === v);
                if (next) setParams(defaultParams(next));
              }}
            />
          )}
        </Field>
        <Field label={t('Name')}>
          {(id) => <TextInput id={id} value={name} onChange={setName} placeholder={tpl?.name} />}
        </Field>
        {tpl?.params?.map((prm) => (
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
        <p className="text-xs text-neutral-500">
          {t('Full stand editing (tiers, tilt, holders) arrives with the layout milestone.')}
        </p>
      </div>
    </Modal>
  );
}
