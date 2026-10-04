// Internal routing (spec §5.3 item 4): table view of internal paths with presets and groups.
// The visual path editor arrives with the face/patch canvases.
import { Button, inputCls, Select } from '@/components/ui';
import { InternalPath as PathSchema } from '@/domain/schemas';
import type { InternalPath } from '@/domain/types';
import { t } from '@/i18n';
import type { EditorApi } from './GearEditor';
import { JsonEditor } from './JsonEditor';

const MODES = PathSchema.shape.mode.options;

function IdList(props: { value: string[]; options: string[]; label: string; onChange: (v: string[]) => void }) {
  return (
    <select
      multiple
      aria-label={props.label}
      className={`${inputCls} h-24`}
      value={props.value}
      onChange={(e) => props.onChange([...e.target.selectedOptions].map((o) => o.value))}
    >
      {[...new Set([...props.options, ...props.value])].map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );
}

export function RoutingSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const ids = m.connectors.map((c) => c.id);
  const set = (i: number, recipe: (p: InternalPath) => void) => update((d) => recipe(d.internalPaths[i]!));
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">
        {t('Internal routing')} ({m.internalPaths.length})
      </h3>
      <p className="mb-2 text-xs text-neutral-500">
        {t(
          'Paths feed tracing and loop detection. Paths with a preset are active only when that preset is selected for the setup; a group switches presets independently (e.g. one patchbay channel).',
        )}
      </p>
      <div className="space-y-2">
        {m.internalPaths.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-[110px_120px_1fr_1fr_120px_90px_auto] items-start gap-1 rounded border border-neutral-200 p-1.5 text-xs dark:border-neutral-700"
          >
            <input
              aria-label={t('Path id')}
              className={inputCls}
              value={p.id}
              onChange={(e) => set(i, (x) => void (x.id = e.target.value))}
            />
            <Select
              aria-label={t('Mode')}
              value={p.mode}
              options={MODES}
              onChange={(v) => set(i, (x) => void (x.mode = v))}
            />
            <IdList label={t('From')} value={p.from} options={ids} onChange={(v) => set(i, (x) => void (x.from = v))} />
            <IdList label={t('To')} value={p.to} options={ids} onChange={(v) => set(i, (x) => void (x.to = v))} />
            <input
              aria-label={t('Preset')}
              placeholder={t('preset')}
              className={inputCls}
              value={p.presetId ?? ''}
              onChange={(e) => set(i, (x) => void (e.target.value ? (x.presetId = e.target.value) : delete x.presetId))}
            />
            <input
              aria-label={t('Group')}
              placeholder={t('group')}
              className={inputCls}
              value={p.group ?? ''}
              onChange={(e) => set(i, (x) => void (e.target.value ? (x.group = e.target.value) : delete x.group))}
            />
            <Button variant="danger" onClick={() => update((d) => void d.internalPaths.splice(i, 1))}>
              {t('Remove')}
            </Button>
            <input
              aria-label={t('Condition')}
              placeholder={t('condition, e.g. "ADAT input feeds line outputs"')}
              className={`${inputCls} col-span-7`}
              value={p.condition ?? ''}
              onChange={(e) =>
                set(i, (x) => void (e.target.value ? (x.condition = e.target.value) : delete x.condition))
              }
            />
          </div>
        ))}
      </div>
      <Button
        className="mt-2"
        onClick={() =>
          update(
            (d) =>
              void d.internalPaths.push({
                id: `path-${d.internalPaths.length + 1}`,
                from: [],
                to: [],
                mode: 'process',
              }),
          )
        }
      >
        {t('Add path')}
      </Button>
      <div className="mt-4">
        <JsonEditor
          label={t('All paths as JSON (channel maps, bulk edits)')}
          value={m.internalPaths}
          schema={PathSchema.array()}
          rows={10}
          onApply={(v) => update((d) => void (d.internalPaths = v))}
        />
      </div>
    </section>
  );
}
