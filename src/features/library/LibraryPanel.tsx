// Library tab (spec §5.2): models with search/filters, one-click "add unit", bulk operations, bundles.
import { IconCopy, IconDownload, IconEdit, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button, Checkbox, ConfirmModal, inputCls, Modal, Select, TextInput } from '@/components/ui';
import {
  addGearUnit,
  addStandUnit,
  type ConflictMode,
  deleteGearModel,
  duplicateGearModel,
  exportBundle,
  gearModelUsage,
  importBundle,
  isUnverified,
  markVerified,
  mergeGearModels,
  modelLabel,
} from '@/domain/libraryOps';
import { FormFactor, GearCategory, LibraryBundle as BundleSchema } from '@/domain/schemas';
import { toCanonicalJson } from '@/domain/serialize';
import type { GearModel } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject, useUi } from '@/store';
import { downloadText } from '@/store/fileIO';
import { NewGearDialog } from './NewGearDialog';
import { NewStandDialog } from './NewStandDialog';

const NO_FILTER = '';

export function LibraryPanel() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const selection = useUi((s) => s.selection);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(NO_FILTER);
  const [formFactor, setFormFactor] = useState<string>(NO_FILTER);
  const [tag, setTag] = useState<string>(NO_FILTER);
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<
    null | 'new-gear' | 'new-stand' | 'import' | 'bulk-tag' | 'bulk-category' | 'merge' | 'delete'
  >(null);

  const { gearModels, standModels, cableModels } = project.library;
  const unitCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of project.inventory.gearUnits) m.set(u.modelId, (m.get(u.modelId) ?? 0) + 1);
    for (const u of project.inventory.standUnits) m.set(u.modelId, (m.get(u.modelId) ?? 0) + 1);
    return m;
  }, [project.inventory]);
  const allTags = useMemo(() => [...new Set(gearModels.flatMap((m) => m.tags))].sort(), [gearModels]);

  const q = query.trim().toLowerCase();
  const filtered = gearModels
    .filter((m) => !q || [modelLabel(m), ...m.aliases, ...m.tags, m.category].join(' ').toLowerCase().includes(q))
    .filter((m) => !category || m.category === category)
    .filter((m) => !formFactor || m.formFactor === formFactor)
    .filter((m) => !tag || m.tags.includes(tag))
    .filter((m) => !unverifiedOnly || isUnverified(m))
    .sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const change = projectStore.getState().change;
  const checkedModels = gearModels.filter((m) => checked.has(m.id));

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="space-y-1.5 border-b border-neutral-200 p-2 dark:border-neutral-700">
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder={t('Search models…')}
          aria-label={t('Search models')}
        />
        <div className="grid grid-cols-3 gap-1">
          <Select
            aria-label={t('Category')}
            value={category}
            allowEmpty
            options={GearCategory.options}
            onChange={setCategory}
          />
          <Select
            aria-label={t('Form factor')}
            value={formFactor}
            allowEmpty
            options={FormFactor.options}
            onChange={setFormFactor}
          />
          <Select aria-label={t('Tag')} value={tag} allowEmpty options={allTags} onChange={setTag} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Checkbox checked={unverifiedOnly} onChange={setUnverifiedOnly} label={t('Unverified only')} />
          <span className="flex-1" />
          <Button disabled={readOnly} onClick={() => setDialog('new-gear')}>
            <IconPlus size={14} /> {t('New gear')}
          </Button>
          <Button disabled={readOnly} onClick={() => setDialog('import')} title={t('Import library bundle')}>
            <IconUpload size={14} />
          </Button>
        </div>
      </div>

      {checked.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-100 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          role="toolbar"
          aria-label={t('Bulk actions')}
        >
          <span className="mr-1">{t('{n} selected', { n: checked.size })}</span>
          <Button disabled={readOnly} onClick={() => setDialog('bulk-tag')}>
            {t('Tag…')}
          </Button>
          <Button disabled={readOnly} onClick={() => setDialog('bulk-category')}>
            {t('Category…')}
          </Button>
          <Button
            disabled={readOnly}
            onClick={() =>
              change(
                (p) => {
                  for (const m of p.library.gearModels) if (checked.has(m.id)) markVerified(m);
                },
                { label: 'Mark verified' },
              )
            }
          >
            {t('Mark verified')}
          </Button>
          <Button
            onClick={() =>
              downloadText(toCanonicalJson(exportBundle(project, checked)), `library-bundle-${checked.size}.json`)
            }
          >
            <IconDownload size={14} /> {t('Export')}
          </Button>
          {checked.size === 2 && (
            <Button disabled={readOnly} onClick={() => setDialog('merge')}>
              {t('Merge…')}
            </Button>
          )}
          <Button variant="danger" disabled={readOnly} onClick={() => setDialog('delete')}>
            <IconTrash size={14} />
          </Button>
          <Button onClick={() => setChecked(new Set())}>{t('Clear')}</Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <h3 className="px-2 pt-2 text-xs font-semibold text-neutral-500 uppercase">
          {t('Gear models')} ({filtered.length}/{gearModels.length})
        </h3>
        <ul aria-label={t('Gear models')}>
          {filtered.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              units={unitCount.get(m.id) ?? 0}
              checked={checked.has(m.id)}
              selected={selection?.kind === 'gear-model' && selection.id === m.id}
              readOnly={readOnly}
              onToggle={() => toggle(m.id)}
            />
          ))}
        </ul>

        <h3 className="flex items-center px-2 pt-3 text-xs font-semibold text-neutral-500 uppercase">
          <span className="flex-1">
            {t('Stand models')} ({standModels.length})
          </span>
          <Button disabled={readOnly} onClick={() => setDialog('new-stand')} title={t('New stand')}>
            <IconPlus size={12} />
          </Button>
        </h3>
        <ul aria-label={t('Stand models')}>
          {standModels.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-1 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <button
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => uiStore.getState().select({ kind: 'stand-model', id: m.id })}
              >
                {[m.manufacturer, m.name].filter(Boolean).join(' ')}
                <span className="ml-1 text-xs text-neutral-500">{` ${m.type}`}</span>
              </button>
              <span className="text-xs text-neutral-500">{unitCount.get(m.id) ?? 0}×</span>
              <button
                aria-label={t('Add stand unit: {name}', { name: m.name })}
                disabled={readOnly}
                className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                onClick={() => change((p) => void addStandUnit(p, m.id), { label: 'Add stand unit' })}
              >
                <IconPlus size={14} />
              </button>
            </li>
          ))}
        </ul>

        <h3 className="px-2 pt-3 text-xs font-semibold text-neutral-500 uppercase">
          {t('Cables and adapters')} ({cableModels.length})
        </h3>
        <ul aria-label={t('Cables and adapters')} className="pb-2">
          {cableModels.map((c) => (
            <li key={c.id} className="truncate px-2 py-0.5 text-xs" title={c.notes}>
              {c.name}{' '}
              <span className="text-neutral-500">
                ·{' '}
                {c.lengthsMm
                  .filter(Boolean)
                  .map((l) => `${l / 1000} m`)
                  .join(', ') || c.kind}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {dialog === 'new-gear' && <NewGearDialog onClose={() => setDialog(null)} />}
      {dialog === 'new-stand' && <NewStandDialog onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportBundleDialog onClose={() => setDialog(null)} />}
      {dialog === 'bulk-tag' && (
        <PromptDialog
          title={t('Add tag to {n} models', { n: checked.size })}
          label={t('Tag')}
          onClose={() => setDialog(null)}
          onSubmit={(tagName) =>
            change(
              (p) => {
                for (const m of p.library.gearModels)
                  if (checked.has(m.id) && !m.tags.includes(tagName)) m.tags.push(tagName);
              },
              { label: 'Tag models' },
            )
          }
        />
      )}
      {dialog === 'bulk-category' && (
        <PromptDialog
          title={t('Set category of {n} models', { n: checked.size })}
          label={t('Category')}
          options={GearCategory.options}
          onClose={() => setDialog(null)}
          onSubmit={(cat) =>
            change(
              (p) => {
                for (const m of p.library.gearModels) if (checked.has(m.id)) m.category = cat as GearModel['category'];
              },
              { label: 'Set category' },
            )
          }
        />
      )}
      {dialog === 'merge' && checkedModels.length === 2 && (
        <MergeDialog
          models={checkedModels as [GearModel, GearModel]}
          onClose={() => setDialog(null)}
          onDone={() => setChecked(new Set())}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmModal
          title={t('Delete {n} models?', { n: checked.size })}
          confirmLabel={t('Delete')}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            change((p) => checked.forEach((id) => deleteGearModel(p, id)), { label: 'Delete models' });
            setChecked(new Set());
          }}
        >
          <UsageSummary modelIds={[...checked]} />
        </ConfirmModal>
      )}
    </div>
  );
}

function ModelRow(props: {
  model: GearModel;
  units: number;
  checked: boolean;
  selected: boolean;
  readOnly: boolean;
  onToggle: () => void;
}) {
  const { model: m } = props;
  const change = projectStore.getState().change;
  const unverified = isUnverified(m);
  return (
    <li
      className={clsx(
        'group flex items-center gap-1 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800',
        props.selected && 'bg-blue-50 dark:bg-blue-950',
      )}
    >
      <input
        type="checkbox"
        aria-label={t('Select {name}', { name: modelLabel(m) })}
        checked={props.checked}
        onChange={props.onToggle}
      />
      <button
        className="min-w-0 flex-1 truncate text-left"
        onClick={() => uiStore.getState().select({ kind: 'gear-model', id: m.id })}
        onDoubleClick={() => uiStore.getState().editGearModel(m.id)}
        title={modelLabel(m)}
      >
        {modelLabel(m)}
        {unverified && (
          <span
            className="ml-1 text-[10px] text-amber-700 dark:text-amber-400"
            title={t('Has unknown or estimated fields')}
          >
            ◩
          </span>
        )}
      </button>
      <span className="text-xs text-neutral-500" title={t('Owned units')}>
        {props.units}×
      </span>
      <button
        aria-label={t('Add unit: {name}', { name: modelLabel(m) })}
        title={t('Add unit to inventory')}
        disabled={props.readOnly}
        className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        onClick={() => change((p) => void addGearUnit(p, m.id), { label: 'Add unit' })}
      >
        <IconPlus size={14} />
      </button>
      <button
        aria-label={t('Edit {name}', { name: modelLabel(m) })}
        className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        onClick={() => uiStore.getState().editGearModel(m.id)}
      >
        <IconEdit size={14} />
      </button>
      <button
        aria-label={t('Duplicate {name}', { name: modelLabel(m) })}
        disabled={props.readOnly}
        className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        onClick={() => change((p) => void duplicateGearModel(p, m.id), { label: 'Duplicate model' })}
      >
        <IconCopy size={14} />
      </button>
    </li>
  );
}

export function UsageSummary({ modelIds }: { modelIds: string[] }) {
  const project = useProject((s) => s.project);
  let units = 0,
    placements = 0,
    connections = 0;
  for (const id of modelIds) {
    const u = gearModelUsage(project, id);
    units += u.units.length;
    placements += u.placements.length;
    connections += u.connections.length;
  }
  return (
    <p>
      {units === 0
        ? t('No units use these models.')
        : t(
            'This also removes {units} owned units, {placements} placements and {connections} connections across all setups.',
            {
              units,
              placements,
              connections,
            },
          )}
    </p>
  );
}

function PromptDialog(props: {
  title: string;
  label: string;
  options?: readonly string[];
  onSubmit: (v: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(props.options?.[0] ?? '');
  const submit = () => {
    if (value.trim()) props.onSubmit(value.trim());
    props.onClose();
  };
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={submit}>
            {t('Apply')}
          </Button>
        </>
      }
    >
      <label className="text-xs text-neutral-500">
        {props.label}
        {props.options ? (
          <Select value={value} options={props.options} onChange={setValue} />
        ) : (
          <input
            autoFocus
            className={inputCls}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        )}
      </label>
    </Modal>
  );
}

function MergeDialog(props: { models: [GearModel, GearModel]; onClose: () => void; onDone: () => void }) {
  const [keep, setKeep] = useState(props.models[0].id);
  const drop = props.models.find((m) => m.id !== keep)!;
  return (
    <Modal
      title={t('Merge duplicate models')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              projectStore.getState().change((p) => mergeGearModels(p, keep, drop.id), { label: 'Merge models' });
              props.onDone();
              props.onClose();
            }}
          >
            {t('Merge')}
          </Button>
        </>
      }
    >
      <p className="mb-2">{t('Keep which model? Units of the other move to it; its name becomes an alias.')}</p>
      {props.models.map((m) => (
        <label key={m.id} className="block">
          <input type="radio" name="keep" checked={keep === m.id} onChange={() => setKeep(m.id)} /> {modelLabel(m)}
        </label>
      ))}
    </Modal>
  );
}

function ImportBundleDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<ConflictMode>('skip');
  const [message, setMessage] = useState<string | null>(null);
  const onFile = async (file: File) => {
    try {
      const parsed = BundleSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        setMessage(t('Not a valid library bundle: {msg}', { msg: parsed.error.issues[0]?.message ?? '' }));
        return;
      }
      let report = { added: 0, replaced: 0, skipped: 0, renamed: 0 };
      projectStore
        .getState()
        .change((p) => void (report = importBundle(p, parsed.data, mode)), { label: 'Import library bundle' });
      setMessage(t('Added {added}, replaced {replaced}, skipped {skipped}, kept both {renamed}.', report));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <Modal
      title={t('Import library bundle')}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('Close')}</Button>}
    >
      <fieldset className="mb-3">
        <legend className="text-xs text-neutral-500">{t('When an id already exists')}</legend>
        {(['skip', 'replace', 'keep-both'] as const).map((m) => (
          <label key={m} className="mr-3 text-sm">
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {t(m)}
          </label>
        ))}
      </fieldset>
      <input
        type="file"
        accept=".json,application/json"
        aria-label={t('Bundle file')}
        onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
      />
      {message && <p className="mt-3 text-sm">{message}</p>}
    </Modal>
  );
}
