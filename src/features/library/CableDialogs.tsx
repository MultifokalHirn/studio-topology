// Cable types (library) and owned cables (inventory): model, label and colour cables.
import { useState } from 'react';
import {
  Button,
  Checkbox,
  ColorInput,
  Field,
  LengthInput,
  Modal,
  NumberInput,
  Select,
  TextInput,
} from '@/components/ui';
import { newId } from '@/domain/ids';
import { CableModel as CableSchema, PlugType, SignalDomain } from '@/domain/schemas';
import type { CableModel, CableUnit } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';

const KIND = ['cable', 'adapter'] as const;
const SWAP = ['none', 'tip-ring-for-L-R', 'trs-a-to-b'] as const;

export function CableModelDialog({ model, onClose }: { model?: CableModel; onClose: () => void }) {
  const [draft, setDraft] = useState<CableModel>(
    () =>
      structuredClone(model) ?? {
        id: newId(),
        name: '',
        kind: 'cable',
        endA: 'TRS-6.35',
        endB: 'TRS-6.35',
        carries: ['audio.analog'],
        lengthsMm: [1000, 2000, 3000],
      },
  );
  const [lengths, setLengths] = useState(draft.lengthsMm.map((l) => l / 1000).join(', '));
  const set = (patch: Partial<CableModel>) => setDraft((d) => ({ ...d, ...patch }));
  const parsedLengths = lengths
    .split(',')
    .map((x) => Number(x.trim().replace(',', '.')))
    .filter((x) => Number.isFinite(x) && x >= 0)
    .map((m) => Math.round(m * 1000));
  const result = CableSchema.safeParse({ ...draft, lengthsMm: parsedLengths });
  const save = () => {
    if (!result.success) return;
    projectStore.getState().change(
      (p) => {
        const i = p.library.cableModels.findIndex((c) => c.id === draft.id);
        if (i >= 0) p.library.cableModels[i] = result.data;
        else p.library.cableModels.push(result.data);
      },
      { label: model ? 'Edit cable type' : 'New cable type' },
    );
    onClose();
  };
  return (
    <Modal
      title={model ? t('Edit cable type') : t('New cable type')}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-red-700">
            {!result.success &&
              result.error.issues[0] &&
              `${result.error.issues[0].path.join('.')}: ${result.error.issues[0].message}`}
          </span>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={!result.success || !draft.name.trim()} onClick={save}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('Name')} className="col-span-2">
          {(id) => (
            <TextInput
              id={id}
              value={draft.name}
              onChange={(name) => set({ name })}
              placeholder={t('e.g. Mogami ¼" TRS, red')}
            />
          )}
        </Field>
        <Field label={t('Kind')}>
          {(id) => <Select id={id} value={draft.kind} options={KIND} onChange={(kind) => set({ kind })} />}
        </Field>
        <Field label={t('End A (plug)')}>
          {(id) => <Select id={id} value={draft.endA} options={PlugType.options} onChange={(endA) => set({ endA })} />}
        </Field>
        <Field label={t('End B (plug)')}>
          {(id) => <Select id={id} value={draft.endB} options={PlugType.options} onChange={(endB) => set({ endB })} />}
        </Field>
        <Field label={t('Manufacturer')}>
          {(id) => (
            <TextInput
              id={id}
              value={draft.manufacturer ?? ''}
              onChange={(v) => set({ manufacturer: v || undefined })}
            />
          )}
        </Field>
        <Field label={t('Stocked lengths (m, comma-separated)')} className="col-span-2">
          {(id) => <TextInput id={id} value={lengths} onChange={setLengths} />}
        </Field>
        <Field label={t('Max length (m)')}>
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={draft.maxLengthMm === undefined ? null : draft.maxLengthMm / 1000}
              onChange={(v) => set({ maxLengthMm: v === null ? undefined : Math.round(v * 1000) })}
            />
          )}
        </Field>
        <Field label={t('Wiring')}>
          {(id) => <Select id={id} value={draft.swap ?? 'none'} options={SWAP} onChange={(swap) => set({ swap })} />}
        </Field>
        <Field label={t('Default colour')}>
          {() => <ColorInput label={t('Default colour')} value={draft.color} onChange={(color) => set({ color })} />}
        </Field>
        <div className="flex items-end">
          <Checkbox checked={!!draft.balanced} onChange={(balanced) => set({ balanced })} label={t('Balanced')} />
        </div>
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1 text-xs text-neutral-500">{t('Carries')}</legend>
        <div className="grid grid-cols-4 gap-x-3">
          {SignalDomain.options.map((d) => (
            <Checkbox
              key={d}
              label={d}
              checked={draft.carries.includes(d)}
              onChange={(on) => set({ carries: on ? [...draft.carries, d] : draft.carries.filter((x) => x !== d) })}
            />
          ))}
        </div>
      </fieldset>
      <Field label={t('Notes')} className="mt-3">
        {(id) => <TextInput id={id} value={draft.notes ?? ''} onChange={(v) => set({ notes: v || undefined })} />}
      </Field>
    </Modal>
  );
}

/** Add (with a quantity) or edit an owned cable. */
export function CableUnitDialog({ unit, onClose }: { unit?: CableUnit; onClose: () => void }) {
  const cableModels = useProject((s) => s.project.library.cableModels);
  const lengthUnit = useProject((s) => s.project.settings.units.length);
  const [draft, setDraft] = useState<CableUnit>(
    () =>
      structuredClone(unit) ?? {
        id: newId(),
        modelId: cableModels[0]?.id ?? '',
        lengthMm: cableModels[0]?.lengthsMm.find((l) => l > 0) ?? 1000,
        inStock: true,
      },
  );
  const [count, setCount] = useState(1);
  const model = cableModels.find((c) => c.id === draft.modelId);
  const set = (patch: Partial<CableUnit>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => {
    projectStore.getState().change(
      (p) => {
        if (unit) {
          const i = p.inventory.cables.findIndex((c) => c.id === unit.id);
          if (i >= 0) p.inventory.cables[i] = draft;
          return;
        }
        for (let k = 0; k < count; k++)
          p.inventory.cables.push({ ...structuredClone(draft), id: k === 0 ? draft.id : newId() });
      },
      { label: unit ? 'Edit cable' : 'Add cables' },
    );
    onClose();
  };
  return (
    <Modal
      title={unit ? t('Edit cable') : t('Add owned cables')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={!model} onClick={save}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Cable type')} className="col-span-2">
          {(id) => (
            <Select
              id={id}
              value={draft.modelId}
              options={cableModels.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(modelId) => set({ modelId })}
            />
          )}
        </Field>
        <Field label={t('Length')}>
          {(id) => (
            <LengthInput
              id={id}
              unit={lengthUnit}
              valueMm={draft.lengthMm}
              onChange={(v) => v !== null && set({ lengthMm: v })}
            />
          )}
        </Field>
        {!unit && (
          <Field label={t('Quantity')}>
            {(id) => <NumberInput id={id} value={count} onChange={(v) => setCount(Math.max(1, Math.round(v ?? 1)))} />}
          </Field>
        )}
        <Field label={t('Label')}>
          {(id) => (
            <TextInput
              id={id}
              value={draft.label ?? ''}
              onChange={(v) => set({ label: v || undefined })}
              placeholder="A07"
            />
          )}
        </Field>
        <Field label={t('Colour')}>
          {() => (
            <ColorInput
              label={t('Cable colour')}
              value={draft.color}
              fallback={model?.color}
              onChange={(color) => set({ color })}
            />
          )}
        </Field>
        <Field label={t('End A label')}>
          {(id) => (
            <TextInput
              id={id}
              value={draft.endLabels?.a ?? ''}
              onChange={(a) => set({ endLabels: { ...draft.endLabels, a: a || undefined } })}
            />
          )}
        </Field>
        <Field label={t('End B label')}>
          {(id) => (
            <TextInput
              id={id}
              value={draft.endLabels?.b ?? ''}
              onChange={(b) => set({ endLabels: { ...draft.endLabels, b: b || undefined } })}
            />
          )}
        </Field>
        <Field label={t('Notes')} className="col-span-2">
          {(id) => <TextInput id={id} value={draft.notes ?? ''} onChange={(v) => set({ notes: v || undefined })} />}
        </Field>
        <Checkbox
          checked={draft.inStock}
          onChange={(inStock) => set({ inStock })}
          label={t('In stock (not lent out or broken)')}
        />
      </div>
    </Modal>
  );
}
