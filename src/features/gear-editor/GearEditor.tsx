// Full-screen gear editor (spec §5.3). Edits a draft; Save commits one undoable step.
import { produce, type Draft } from 'immer';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, Modal, Select } from '@/components/ui';
import { checkGearModel, valueAtPath } from '@/domain/integrity';
import { newId } from '@/domain/ids';
import { modelLabel, templateFromModel } from '@/domain/libraryOps';
import { GearModel as GearSchema } from '@/domain/schemas';
import { zodIssuesToLoadIssues } from '@/domain/serialize';
import type { GearModel, Provenance } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject, useUi } from '@/store';
import { ConnectorsSection } from './ConnectorsSection';
import { ProvenanceSection } from './ProvenanceSection';
import { RoutingSection } from './RoutingSection';
import {
  DimensionsSection,
  ErgonomicsSection,
  IdentitySection,
  ImagesSection,
  PowerSection,
  UsbMidiClockSection,
} from './sections';

export interface EditorApi {
  draft: GearModel;
  /** Apply a recipe to the draft. Pass `stamp` paths to record provenance for edited values. */
  update(recipe: (d: Draft<GearModel>) => void, stamp?: string[]): void;
  provenanceKind: Provenance['kind'];
}

const SECTIONS = [
  ['identity', 'Identity'],
  ['dimensions', 'Dimensions and mounting'],
  ['connectors', 'Connectors'],
  ['routing', 'Internal routing'],
  ['power', 'Power'],
  ['usb-midi-clock', 'USB / MIDI / Clock'],
  ['ergonomics', 'Ergonomics'],
  ['images', 'Images'],
  ['provenance', 'Provenance'],
] as const;
type SectionId = (typeof SECTIONS)[number][0];

const PROV_KEY = 'studio-planner:provenance-kind';
function readSessionKind(): Provenance['kind'] {
  try {
    const v = sessionStorage.getItem(PROV_KEY);
    return v === 'measured' || v === 'datasheet' || v === 'manufacturer' || v === 'retailer' ? v : 'user';
  } catch {
    return 'user';
  }
}

export function GearEditorHost() {
  const id = useUi((s) => s.editingGearModelId);
  return id ? <GearEditor key={id} modelId={id} /> : null;
}

export function GearEditor({ modelId }: { modelId: string }) {
  const original = useProject((s) => s.project.library.gearModels.find((m) => m.id === modelId));
  const allModels = useProject((s) => s.project.library.gearModels);
  const readOnly = useProject((s) => s.readOnly);
  const [draft, setDraft] = useState<GearModel | null>(() => (original ? structuredClone(original) : null));
  const [section, setSection] = useState<SectionId>('identity');
  const [provenanceKind, setProvenanceKind] = useState<Provenance['kind']>(readSessionKind);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);

  const issues = useMemo(() => {
    if (!draft) return [];
    const parsed = GearSchema.safeParse(draft);
    const schemaIssues = parsed.success
      ? []
      : zodIssuesToLoadIssues(draft, parsed.error).map((i) => ({
          level: 'error' as const,
          path: i.path,
          message: i.message,
        }));
    return [...schemaIssues, ...checkGearModel(draft, new Set(allModels.map((m) => m.id)))];
  }, [draft, allModels]);

  if (!original || !draft) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const close = () => uiStore.getState().editGearModel(null);
  const api: EditorApi = {
    draft,
    provenanceKind,
    update(recipe, stamp) {
      setDraft(
        (d) =>
          d &&
          produce(d, (x) => {
            recipe(x);
            // A cleared value is unknown, never "user" (spec §1.4: unknown is first-class).
            for (const path of stamp ?? [])
              x.provenance[path] = valueAtPath(x, path) === null ? { kind: 'unknown' } : { kind: provenanceKind };
          }),
      );
    },
  };
  const save = () => {
    projectStore.getState().change(
      (p) => {
        const i = p.library.gearModels.findIndex((m) => m.id === modelId);
        if (i >= 0) p.library.gearModels[i] = structuredClone(draft);
      },
      { label: `Edit ${modelLabel(draft)}` },
    );
    close();
  };
  const errors = issues.filter((i) => i.level === 'error');

  return (
    <Modal
      full
      title={t('Edit gear: {name}', { name: modelLabel(draft) || t('(unnamed)') })}
      onClose={() => (dirty ? setConfirmDiscard(true) : close())}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-neutral-500">
            {errors.length > 0
              ? t('{n} problems — see below', { n: errors.length })
              : dirty
                ? t('Unsaved changes')
                : t('No changes')}
          </span>
          <Button
            disabled={readOnly || errors.length > 0}
            title={t('Store this model as a reusable template (My templates)')}
            onClick={() => {
              const tpl = templateFromModel(draft, newId());
              projectStore.getState().change((p) => void p.library.templates.push(tpl), { label: 'Save as template' });
              setSavedTemplate(tpl.name);
            }}
          >
            {savedTemplate ? t('Saved as template ✓') : t('Save as template')}
          </Button>
          <Button onClick={() => (dirty ? setConfirmDiscard(true) : close())}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={readOnly || !dirty || errors.length > 0} onClick={save}>
            {t('Save model')}
          </Button>
        </>
      }
    >
      <div className="flex h-full gap-4">
        <nav className="w-48 shrink-0" aria-label={t('Editor sections')}>
          <ul>
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <button
                  aria-current={section === id}
                  onClick={() => setSection(id)}
                  className={clsx(
                    'w-full rounded px-2 py-1 text-left text-sm',
                    section === id
                      ? 'bg-neutral-200 font-semibold dark:bg-neutral-700'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  )}
                >
                  {t(label)}
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-4 block text-xs text-neutral-500">
            {t('New values are')}
            <Select
              value={provenanceKind}
              options={['user', 'measured', 'datasheet', 'manufacturer', 'retailer']}
              onChange={(v) => {
                setProvenanceKind(v);
                try {
                  sessionStorage.setItem(PROV_KEY, v);
                } catch {
                  /* per-session convenience only */
                }
              }}
            />
          </label>
        </nav>
        <div className="min-w-0 flex-1 overflow-auto">
          <ErrorBoundary key={section} label={t('This section')}>
            {section === 'identity' && <IdentitySection api={api} />}
            {section === 'dimensions' && <DimensionsSection api={api} />}
            {section === 'connectors' && <ConnectorsSection api={api} />}
            {section === 'routing' && <RoutingSection api={api} />}
            {section === 'power' && <PowerSection api={api} />}
            {section === 'usb-midi-clock' && <UsbMidiClockSection api={api} />}
            {section === 'ergonomics' && <ErgonomicsSection api={api} />}
            {section === 'images' && <ImagesSection />}
            {section === 'provenance' && <ProvenanceSection api={api} />}
          </ErrorBoundary>
          {issues.length > 0 && (
            <section
              aria-label={t('Validation')}
              className="mt-6 rounded border border-neutral-200 p-2 dark:border-neutral-700"
            >
              <h4 className="mb-1 text-xs font-semibold text-neutral-500 uppercase">{t('Validation')}</h4>
              <ul className="space-y-0.5 text-xs">
                {issues.map((i, k) => (
                  <li
                    key={k}
                    className={
                      i.level === 'error' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                    }
                  >
                    <code>{i.path}</code>: {i.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      {confirmDiscard && (
        <Modal
          title={t('Discard changes?')}
          onClose={() => setConfirmDiscard(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDiscard(false)}>{t('Keep editing')}</Button>
              <Button variant="danger" onClick={close}>
                {t('Discard')}
              </Button>
            </>
          }
        >
          {t('Your edits to this model have not been saved.')}
        </Modal>
      )}
    </Modal>
  );
}
