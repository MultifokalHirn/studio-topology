// Stand editor (spec §5.4): surfaces with usable size, anchor, adjustment ranges, holders, load, rack bays;
// side and front preview at default and at the min/max of each adjustment (ghosted).
import { produce } from 'immer';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Field, Modal, NumberInput, Select, TextInput } from '@/components/ui';
import { StandModel as StandSchema, StandType, SurfaceDef as SurfaceSchema } from '@/domain/schemas';
import { checkStandModel } from '@/domain/integrity';
import type { StandModel, SurfaceDef } from '@/domain/types';
import { RACK10_INNER_WIDTH_MM, RACK_INNER_WIDTH_MM, RACK_UNIT_MM } from '@/domain/units';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';
import { JsonEditor } from '../gear-editor/JsonEditor';

const KINDS = SurfaceSchema.shape.kind.options;
type Range = { min: number; max: number; step: number };

export function StandEditor({ modelId, onClose }: { modelId: string; onClose: () => void }) {
  const original = useProject((s) => s.project.library.standModels.find((m) => m.id === modelId));
  const readOnly = useProject((s) => s.readOnly);
  const [draft, setDraft] = useState<StandModel | null>(() => (original ? structuredClone(original) : null));
  const issues = useMemo(() => {
    if (!draft) return [];
    const parsed = StandSchema.safeParse(draft);
    const schema = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return [...schema, ...checkStandModel(draft).map((i) => i.message)];
  }, [draft]);
  if (!draft || !original) return null;
  const update = (recipe: (d: StandModel) => void) => setDraft((d) => d && produce(d, recipe));
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  return (
    <Modal
      full
      title={t('Edit stand: {name}', { name: [draft.manufacturer, draft.name].filter(Boolean).join(' ') })}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-red-700">{issues[0]}</span>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            disabled={readOnly || !dirty || issues.length > 0}
            onClick={() => {
              projectStore.getState().change(
                (p) => {
                  const i = p.library.standModels.findIndex((m) => m.id === modelId);
                  if (i >= 0) p.library.standModels[i] = structuredClone(draft);
                },
                { label: 'Edit stand' },
              );
              onClose();
            }}
          >
            {t('Save stand')}
          </Button>
        </>
      }
    >
      <div className="grid h-full grid-cols-[1fr_380px] gap-4">
        <div className="min-w-0 space-y-4 overflow-auto">
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Field label={t('Manufacturer')}>
              {(id) => (
                <TextInput
                  id={id}
                  value={draft.manufacturer}
                  onChange={(v) => update((d) => void (d.manufacturer = v))}
                />
              )}
            </Field>
            <Field label={t('Name')}>
              {(id) => <TextInput id={id} value={draft.name} onChange={(v) => update((d) => void (d.name = v))} />}
            </Field>
            <Field label={t('Type')}>
              {(id) => (
                <Select
                  id={id}
                  value={draft.type}
                  options={StandType.options}
                  onChange={(v) => update((d) => void (d.type = v))}
                />
              )}
            </Field>
            <Field label={t('Inner span (mm)')}>
              {(id) => (
                <NumberInput
                  id={id}
                  nullable
                  value={draft.dimensions.innerSpanMm ?? null}
                  onChange={(v) => update((d) => void (d.dimensions.innerSpanMm = v))}
                />
              )}
            </Field>
            {(['w', 'd', 'h'] as const).map((k) => (
              <Field key={k} label={`${k.toUpperCase()} (mm)`}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={draft.dimensions[k]}
                    onChange={(v) => update((d) => void (d.dimensions[k] = v))}
                  />
                )}
              </Field>
            ))}
            <Field label={t('Weight (kg)')}>
              {(id) => (
                <NumberInput
                  id={id}
                  nullable
                  value={draft.dimensions.weightKg ?? null}
                  onChange={(v) => update((d) => void (d.dimensions.weightKg = v))}
                />
              )}
            </Field>
          </section>
          <section>
            <div className="mb-2 flex items-center">
              <h3 className="flex-1 text-sm font-semibold">
                {t('Surfaces')} ({draft.surfaces.length})
              </h3>
              <Button
                onClick={() =>
                  update(
                    (d) =>
                      void d.surfaces.push({
                        id: `surface-${d.surfaces.length + 1}`,
                        label: t('New surface'),
                        kind: 'shelf',
                        usable: { w: 600, d: 300 },
                        anchor: { x: 0, y: 0, z: 800 },
                        adjustable: {},
                        loadKg: null,
                      }),
                  )
                }
              >
                {t('Add surface')}
              </Button>
            </div>
            <div className="space-y-2">
              {draft.surfaces.map((s, i) => (
                <SurfaceCard
                  key={i}
                  s={s}
                  onChange={(next) => update((d) => void (d.surfaces[i] = next))}
                  onRemove={() => update((d) => void d.surfaces.splice(i, 1))}
                />
              ))}
            </div>
          </section>
          <JsonEditor
            label={t('Whole stand as JSON (structure, frame lines, provenance)')}
            value={draft}
            schema={StandSchema}
            rows={8}
            onApply={(v) => setDraft(v)}
          />
        </div>
        <StandPreview model={draft} />
      </div>
    </Modal>
  );
}

function RangeEditor(props: { label: string; value?: Range; onChange: (v?: Range) => void; defaults: Range }) {
  const v = props.value;
  return (
    <div className="flex items-end gap-1">
      <Checkbox checked={!!v} onChange={(on) => props.onChange(on ? props.defaults : undefined)} label={props.label} />
      {v &&
        (['min', 'max', 'step'] as const).map((k) => (
          <label key={k} className="w-16 text-[10px] text-neutral-500">
            {k}
            <NumberInput
              aria-label={`${props.label} ${k}`}
              value={v[k]}
              onChange={(n) => n !== null && props.onChange({ ...v, [k]: n })}
            />
          </label>
        ))}
    </div>
  );
}

function SurfaceCard({
  s,
  onChange,
  onRemove,
}: {
  s: SurfaceDef;
  onChange: (s: SurfaceDef) => void;
  onRemove: () => void;
}) {
  const set = (recipe: (x: SurfaceDef) => void) => onChange(produce(s, recipe));
  const num = (
    label: string,
    value: number | null | undefined,
    apply: (v: number | null) => void,
    nullable = false,
  ) => (
    <Field label={label}>
      {(id) => <NumberInput id={id} nullable={nullable} value={value ?? null} onChange={apply} />}
    </Field>
  );
  return (
    <div
      className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-700"
      role="group"
      aria-label={t('Surface {label}', { label: s.label })}
    >
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        <Field label={t('Id')}>
          {(id) => <TextInput id={id} value={s.id} onChange={(v) => set((x) => void (x.id = v))} />}
        </Field>
        <Field label={t('Label')} className="col-span-2">
          {(id) => <TextInput id={id} value={s.label} onChange={(v) => set((x) => void (x.label = v))} />}
        </Field>
        <Field label={t('Kind')}>
          {(id) => <Select id={id} value={s.kind} options={KINDS} onChange={(v) => set((x) => void (x.kind = v))} />}
        </Field>
        {num(t('Usable W'), s.usable.w, (v) => v !== null && set((x) => void (x.usable.w = v)))}
        {num(t('Usable D'), s.usable.d, (v) => v !== null && set((x) => void (x.usable.d = v)))}
        {num(t('Anchor x'), s.anchor.x, (v) => v !== null && set((x) => void (x.anchor.x = v)))}
        {num(t('Anchor y'), s.anchor.y, (v) => v !== null && set((x) => void (x.anchor.y = v)))}
        {num(t('Anchor z (default height)'), s.anchor.z, (v) => v !== null && set((x) => void (x.anchor.z = v)))}
        {num(t('Load (kg)'), s.loadKg, (v) => set((x) => void (x.loadKg = v)), true)}
        {num(
          t('Front lip (mm)'),
          s.lipFrontMm,
          (v) => set((x) => void (v === null ? delete x.lipFrontMm : (x.lipFrontMm = v))),
          true,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <RangeEditor
          label={t('Height')}
          value={s.adjustable.z}
          defaults={{ min: 300, max: 1400, step: 5 }}
          onChange={(v) => set((x) => void (v ? (x.adjustable.z = v) : delete x.adjustable.z))}
        />
        <RangeEditor
          label={t('Tilt °')}
          value={s.adjustable.tiltDeg}
          defaults={{ min: 0, max: 30, step: 1 }}
          onChange={(v) => set((x) => void (v ? (x.adjustable.tiltDeg = v) : delete x.adjustable.tiltDeg))}
        />
        <RangeEditor
          label={t('Depth offset')}
          value={s.adjustable.y}
          defaults={{ min: -300, max: 300, step: 5 }}
          onChange={(v) => set((x) => void (v ? (x.adjustable.y = v) : delete x.adjustable.y))}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
        <Checkbox
          checked={!!s.holders}
          label={t('Holder pair')}
          onChange={(on) =>
            set(
              (x) =>
                void (on
                  ? (x.holders = {
                      lengthMm: x.usable.d,
                      thicknessMm: 30,
                      pairMinSpacingMm: 150,
                      protrusionAdjustable: false,
                    })
                  : delete x.holders),
            )
          }
        />
        {s.holders && (
          <>
            {num(
              t('Holder length'),
              s.holders.lengthMm,
              (v) => v !== null && set((x) => void (x.holders!.lengthMm = v)),
            )}
            {num(
              t('Holder thickness'),
              s.holders.thicknessMm,
              (v) => v !== null && set((x) => void (x.holders!.thicknessMm = v)),
            )}
            {num(
              t('Min. holder spacing'),
              s.holders.pairMinSpacingMm,
              (v) => v !== null && set((x) => void (x.holders!.pairMinSpacingMm = v)),
            )}
          </>
        )}
        <Checkbox
          checked={!!s.rack}
          label={t('Rack bay')}
          onChange={(on) =>
            set((x) => {
              if (on) {
                x.kind = 'rack-bay';
                x.rack = { u: 4, innerWidthMm: RACK_INNER_WIDTH_MM, depthMm: x.usable.d, standard: '19in' };
              } else delete x.rack;
            })
          }
        />
        {s.rack && (
          <>
            {num(t('Rack U'), s.rack.u, (v) => v !== null && set((x) => void (x.rack!.u = Math.max(1, Math.round(v)))))}
            {num(t('Rack depth'), s.rack.depthMm, (v) => v !== null && set((x) => void (x.rack!.depthMm = v)))}
            <Field label={t('Rack standard')}>
              {(id) => (
                <Select
                  id={id}
                  value={s.rack!.standard ?? '19in'}
                  options={['19in', '10in'] as const}
                  onChange={(v) =>
                    set(
                      (x) =>
                        void (x.rack = {
                          ...x.rack!,
                          standard: v,
                          innerWidthMm: v === '10in' ? RACK10_INNER_WIDTH_MM : RACK_INNER_WIDTH_MM,
                        }),
                    )
                  }
                />
              )}
            </Field>
          </>
        )}
        <div className="flex items-end justify-end">
          <Button variant="danger" onClick={onRemove}>
            {t('Remove surface')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Side (y–z) and front (x–z) preview with ghosts at the min/max of height and the max tilt. */
function StandPreview({ model }: { model: StandModel }) {
  const maxZ =
    Math.max(
      model.dimensions.h ?? 0,
      ...model.surfaces.map((s) =>
        Math.max(s.adjustable.z?.max ?? 0, s.anchor.z + (s.rack ? s.rack.u * RACK_UNIT_MM : 0)),
      ),
    ) + 100;
  const maxD =
    Math.max(400, ...model.surfaces.map((s) => s.anchor.y + s.usable.d + Math.max(0, s.adjustable.y?.max ?? 0))) + 100;
  const maxW = Math.max(400, model.dimensions.w ?? 0, ...model.surfaces.map((s) => s.anchor.x + s.usable.w)) + 100;
  const line = (s: SurfaceDef, z: number, tilt: number, y: number, ghost: boolean, key: string) => {
    const len = s.holders?.lengthMm ?? s.usable.d;
    const r = (tilt * Math.PI) / 180;
    return (
      <line
        key={key}
        x1={s.anchor.y + y}
        y1={-z}
        x2={s.anchor.y + y + len * Math.cos(r)}
        y2={-(z + len * Math.sin(r))}
        stroke={ghost ? '#93c5fd' : '#404040'}
        strokeWidth={ghost ? 1 : 2}
        strokeDasharray={ghost ? '6 4' : undefined}
        vectorEffect="non-scaling-stroke"
      />
    );
  };
  return (
    <div className="space-y-3 text-xs text-neutral-500">
      <figure>
        <figcaption>{t('Side (ghosts: min/max height, max tilt, offset range)')}</figcaption>
        <svg
          viewBox={`-50 ${-maxZ} ${maxD + 50} ${maxZ + 50}`}
          className="h-64 w-full rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          role="img"
          aria-label={t('Stand side preview')}
        >
          <line x1={-50} y1={0} x2={maxD} y2={0} stroke="#737373" vectorEffect="non-scaling-stroke" />
          {model.surfaces.map((s, i) =>
            s.rack ? (
              <rect
                key={i}
                x={s.anchor.y}
                y={-(s.anchor.z + s.rack.u * RACK_UNIT_MM)}
                width={s.rack.depthMm}
                height={s.rack.u * RACK_UNIT_MM}
                fill="none"
                stroke="#404040"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <g key={i}>
                {s.adjustable.z && line(s, s.adjustable.z.min, 0, 0, true, 'min')}
                {s.adjustable.z && line(s, s.adjustable.z.max, 0, 0, true, 'max')}
                {s.adjustable.tiltDeg && line(s, s.anchor.z, s.adjustable.tiltDeg.max, 0, true, 'tilt')}
                {s.adjustable.y && line(s, s.anchor.z, 0, s.adjustable.y.min, true, 'ymin')}
                {s.adjustable.y && line(s, s.anchor.z, 0, s.adjustable.y.max, true, 'ymax')}
                {line(s, s.anchor.z, 0, 0, false, 'default')}
              </g>
            ),
          )}
        </svg>
      </figure>
      <figure>
        <figcaption>{t('Front')}</figcaption>
        <svg
          viewBox={`-50 ${-maxZ} ${maxW + 50} ${maxZ + 50}`}
          className="h-48 w-full rounded border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
          role="img"
          aria-label={t('Stand front preview')}
        >
          <line x1={-50} y1={0} x2={maxW} y2={0} stroke="#737373" vectorEffect="non-scaling-stroke" />
          {model.dimensions.w && model.dimensions.h && (
            <rect
              x={0}
              y={-model.dimensions.h}
              width={model.dimensions.w}
              height={model.dimensions.h}
              fill="none"
              stroke="#d4d4d4"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {model.surfaces.map((s, i) =>
            s.rack ? (
              <rect
                key={i}
                x={s.anchor.x}
                y={-(s.anchor.z + s.rack.u * RACK_UNIT_MM)}
                width={s.usable.w}
                height={s.rack.u * RACK_UNIT_MM}
                fill="none"
                stroke="#404040"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <line
                key={i}
                x1={s.anchor.x}
                y1={-s.anchor.z}
                x2={s.anchor.x + s.usable.w}
                y2={-s.anchor.z}
                stroke="#404040"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>
      </figure>
    </div>
  );
}
