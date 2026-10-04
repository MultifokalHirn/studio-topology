// Gear editor form sections (spec §5.3 items 1, 2, 5, 6, 7, 8).
import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Field,
  LengthInput,
  Modal,
  NumberInput,
  ProvenanceBadge,
  Select,
  SuggestInput,
  TextInput,
} from '@/components/ui';
import { provenanceFor } from '@/domain/integrity';
import { applyMeasurement, categorySuggestions, isPowerSupply, modelLabel } from '@/domain/libraryOps';
import {
  ClockFormat,
  ClockSpec as ClockSchema,
  FormFactor,
  Interaction,
  MainsRegion,
  MidiSpec as MidiSchema,
  PowerSource as PowerSourceSchema,
  Usage,
} from '@/domain/schemas';
import type { GearModel, PowerSource } from '@/domain/types';
import { EURORACK_HP_MM, RACK10_PANEL_WIDTH_MM, RACK_PANEL_WIDTH_MM, RACK_UNIT_MM } from '@/domain/units';
import { t } from '@/i18n';
import { useProject } from '@/store';
import type { EditorApi } from './GearEditor';
import { JsonEditor } from './JsonEditor';

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 text-sm font-semibold">{children}</h3>;
const grid = 'grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4';
const csv = (xs: string[]) => xs.join(', ');
const fromCsv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function Badge({ api, path, isNull }: { api: EditorApi; path: string; isNull?: boolean }) {
  return <ProvenanceBadge prov={provenanceFor(api.draft.provenance, path)} isNull={isNull} />;
}

export function IdentitySection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const project = useProject((s) => s.project);
  const categories = useMemo(() => categorySuggestions(project), [project]);
  return (
    <section>
      <H>{t('Identity')}</H>
      <div className={grid}>
        <Field label={t('Manufacturer')}>
          {(id) => (
            <TextInput id={id} value={m.manufacturer} onChange={(v) => update((d) => void (d.manufacturer = v))} />
          )}
        </Field>
        <Field label={t('Name')}>
          {(id) => <TextInput id={id} value={m.name} onChange={(v) => update((d) => void (d.name = v))} />}
        </Field>
        <Field label={t('Variant')}>
          {(id) => (
            <TextInput
              id={id}
              value={m.variant ?? ''}
              onChange={(v) => update((d) => void (v ? (d.variant = v) : delete d.variant))}
            />
          )}
        </Field>
        <Field label={t('Aliases (comma-separated)')}>
          {(id) => (
            <TextInput id={id} value={csv(m.aliases)} onChange={(v) => update((d) => void (d.aliases = fromCsv(v)))} />
          )}
        </Field>
        <Field label={t('Category (free text)')}>
          {(id) => (
            <SuggestInput
              id={id}
              value={m.category}
              suggestions={categories}
              onChange={(v) => update((d) => void (d.category = v))}
              placeholder={t('e.g. monitor-speaker, my nearfields')}
            />
          )}
        </Field>
        <Field label={t('Form factor')}>
          {(id) => (
            <Select
              id={id}
              value={m.formFactor}
              options={FormFactor.options}
              onChange={(v) => update((d) => void (d.formFactor = v))}
            />
          )}
        </Field>
        <Field label={t('Tags (comma-separated)')} className="col-span-2">
          {(id) => (
            <TextInput id={id} value={csv(m.tags)} onChange={(v) => update((d) => void (d.tags = fromCsv(v)))} />
          )}
        </Field>
      </div>
      <Field label={t('Notes')} className="mt-2">
        {(id) => (
          <textarea
            id={id}
            rows={3}
            className="w-full rounded border border-neutral-300 bg-white p-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            value={m.notes}
            onChange={(e) => update((d) => void (d.notes = e.target.value))}
          />
        )}
      </Field>
      <H>{t('Sources')}</H>
      <ul className="space-y-1">
        {m.sources.map((s, i) => (
          <li key={i} className="flex gap-1">
            <TextInput
              aria-label={t('Source label')}
              value={s.label}
              onChange={(v) => update((d) => void (d.sources[i]!.label = v))}
            />
            <TextInput
              aria-label={t('Source URL')}
              value={s.url ?? ''}
              placeholder="https://"
              onChange={(v) => update((d) => void (v ? (d.sources[i]!.url = v) : delete d.sources[i]!.url))}
            />
            <Button onClick={() => update((d) => void d.sources.splice(i, 1))}>{t('Remove')}</Button>
          </li>
        ))}
      </ul>
      <Button className="mt-1" onClick={() => update((d) => void d.sources.push({ label: '' }))}>
        {t('Add source')}
      </Button>
    </section>
  );
}

/** Top, front and side silhouettes at a common scale (spec §5.3 item 2). */
function Silhouettes({ m }: { m: GearModel }) {
  const { w, d, h } = m.dimensions;
  const W = w ?? 200,
    D = d ?? 150,
    Hh = h ?? 60;
  const scale = 150 / Math.max(W, D, Hh);
  const dashed =
    w === null ||
    d === null ||
    h === null ||
    ['estimated', 'unknown'].includes(provenanceFor(m.provenance, 'dimensions.w')?.kind ?? '');
  const box = (label: string, a: number, b: number) => (
    <figure className="text-center text-xs text-neutral-500">
      <svg width={a * scale + 2} height={b * scale + 2} role="img" aria-label={`${label} ${a} × ${b} mm`}>
        <rect
          x={1}
          y={1}
          width={a * scale}
          height={b * scale}
          rx={3}
          fill="none"
          stroke="currentColor"
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
  return (
    <div
      className="flex items-end gap-6 rounded border border-neutral-200 p-3 dark:border-neutral-700"
      aria-label={t('Silhouette preview')}
    >
      {box(t('Top'), W, D)}
      {box(t('Front'), W, Hh)}
      {box(t('Side'), D, Hh)}
      {dashed && <span className="text-xs text-neutral-500">{t('Dashed: unknown or estimated dimensions')}</span>}
    </div>
  );
}

export function DimensionsSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const unit = useProject((s) => s.project.settings.units.length);
  const [measuring, setMeasuring] = useState(false);
  const dim = (k: 'w' | 'd' | 'h', label: string) => (
    <Field label={label} hint={<Badge api={api} path={`dimensions.${k}`} isNull={m.dimensions[k] === null} />}>
      {(id) => (
        <LengthInput
          id={id}
          unit={unit}
          nullable
          valueMm={m.dimensions[k]}
          onChange={(v) => update((d) => void (d.dimensions[k] = v), [`dimensions.${k}`])}
        />
      )}
    </Field>
  );
  return (
    <section>
      <div className="mb-2 flex items-center">
        <H>{t('Dimensions and mounting')}</H>
        <span className="flex-1" />
        <Button onClick={() => setMeasuring(true)}>{t('Measure…')}</Button>
      </div>
      <div className={grid}>
        {dim('w', t('Width (x)'))}
        {dim('d', t('Depth (y)'))}
        {dim('h', t('Height (z)'))}
        <Field
          label={t('Weight (kg)')}
          hint={<Badge api={api} path="dimensions.weightKg" isNull={m.dimensions.weightKg === null} />}
        >
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={m.dimensions.weightKg}
              onChange={(v) => update((d) => void (d.dimensions.weightKg = v), ['dimensions.weightKg'])}
            />
          )}
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        <Checkbox
          checked={m.dimensions.heightIncludesKnobsFeet}
          onChange={(v) => update((d) => void (d.dimensions.heightIncludesKnobsFeet = v))}
          label={t('Height includes knobs and feet')}
        />
        <Checkbox
          checked={!!m.mounting.nonSlipFeet}
          onChange={(v) => update((d) => void (d.mounting.nonSlipFeet = v))}
          label={t('Non-slip feet')}
        />
        <Checkbox
          checked={!!m.mounting.rackEars}
          onChange={(v) => update((d) => void (d.mounting.rackEars = v))}
          label={t('Rack ears')}
        />
      </div>
      <div className={`${grid} mt-3`}>
        <Field label={t('Rack units (U)')}>
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={m.dimensions.rack?.u ?? null}
              onChange={(v) =>
                update(
                  (d) => {
                    if (v === null) delete d.dimensions.rack;
                    else {
                      d.dimensions.rack = { ...(d.dimensions.rack ?? { earsIncluded: true }), u: v };
                      d.dimensions.h = v * RACK_UNIT_MM;
                      d.dimensions.w =
                        d.dimensions.rack.standard === '10in' ? RACK10_PANEL_WIDTH_MM : RACK_PANEL_WIDTH_MM;
                    }
                  },
                  v === null ? [] : ['dimensions.h', 'dimensions.w'],
                )
              }
            />
          )}
        </Field>
        <Field label={t('Rack standard')}>
          {(id) => (
            <Select
              id={id}
              value={m.dimensions.rack ? (m.dimensions.rack.standard ?? '19in') : undefined}
              options={[
                { value: '19in', label: '19"' },
                { value: '10in', label: '10" (half-rack)' },
              ]}
              onChange={(v) =>
                update(
                  (d) => {
                    d.dimensions.rack = { ...(d.dimensions.rack ?? { u: 1, earsIncluded: true }), standard: v };
                    d.dimensions.w = v === '10in' ? RACK10_PANEL_WIDTH_MM : RACK_PANEL_WIDTH_MM;
                  },
                  ['dimensions.w'],
                )
              }
            />
          )}
        </Field>
        <Field label={t('Eurorack HP')}>
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={m.dimensions.eurorack?.hp ?? null}
              onChange={(v) =>
                update(
                  (d) => {
                    if (v === null) delete d.dimensions.eurorack;
                    else {
                      d.dimensions.eurorack = { ...d.dimensions.eurorack, hp: v };
                      if (d.formFactor === 'eurorack') d.dimensions.w = v * EURORACK_HP_MM;
                    }
                  },
                  v !== null && m.formFactor === 'eurorack' ? ['dimensions.w'] : [],
                )
              }
            />
          )}
        </Field>
        <Field label={t('Keys')}>
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={m.dimensions.keyboard?.keys ?? null}
              onChange={(v) =>
                update((d) => {
                  if (v === null) delete d.dimensions.keyboard;
                  else d.dimensions.keyboard = { keyType: d.dimensions.keyboard?.keyType ?? 'full', keys: v };
                })
              }
            />
          )}
        </Field>
        <Field label={t('Key type')}>
          {(id) => (
            <Select
              id={id}
              value={m.dimensions.keyboard?.keyType}
              options={['slim', 'mini', 'full', 'semi-weighted', 'weighted']}
              onChange={(v) =>
                update((d) => void (d.dimensions.keyboard = { keys: d.dimensions.keyboard?.keys ?? 49, keyType: v }))
              }
            />
          )}
        </Field>
        <Field label={t('VESA')}>
          {(id) => (
            <Select
              id={id}
              allowEmpty
              value={m.mounting.vesa ? (String(m.mounting.vesa) as '75' | '100') : undefined}
              options={['75', '100']}
              onChange={(v) =>
                update((d) => void (v ? (d.mounting.vesa = Number(v) as 75 | 100) : delete d.mounting.vesa))
              }
            />
          )}
        </Field>
        <Field label={t('Slip-risk note')} className="col-span-3">
          {(id) => (
            <TextInput
              id={id}
              value={m.mounting.slipRiskNote ?? ''}
              onChange={(v) => update((d) => void (v ? (d.mounting.slipRiskNote = v) : delete d.mounting.slipRiskNote))}
            />
          )}
        </Field>
      </div>
      <div className="mt-4">
        <Silhouettes m={m} />
      </div>
      {measuring && (
        <MeasureDialog
          model={m}
          onClose={() => setMeasuring(false)}
          onApply={(v) => update((d) => applyMeasurement(d, v))}
        />
      )}
    </section>
  );
}

export function MeasureDialog(props: {
  model: GearModel;
  onClose: () => void;
  onApply: (v: Partial<Record<'w' | 'd' | 'h' | 'weightKg', number>>) => void;
}) {
  const unit = useProject((s) => s.project.settings.units.length);
  const [v, setV] = useState<Partial<Record<'w' | 'd' | 'h' | 'weightKg', number>>>({});
  const set = (k: 'w' | 'd' | 'h' | 'weightKg') => (x: number | null) =>
    setV((s) => {
      const next = { ...s };
      if (x === null) delete next[k];
      else next[k] = x;
      return next;
    });
  return (
    <Modal
      title={t('Measure {name}', { name: modelLabel(props.model) })}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            disabled={Object.keys(v).length === 0}
            onClick={() => {
              props.onApply(v);
              props.onClose();
            }}
          >
            {t('Stamp as measured')}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-neutral-500">
        {t('Values are stamped "measured"; the previous value is kept in the provenance note.')}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['w', 'd', 'h'] as const).map((k) => (
          <Field key={k} label={`${k.toUpperCase()} (${t('now')}: ${props.model.dimensions[k] ?? t('unknown')})`}>
            {(id) => <LengthInput id={id} unit={unit} nullable valueMm={v[k] ?? null} onChange={set(k)} />}
          </Field>
        ))}
        <Field label={`${t('Weight (kg)')} (${t('now')}: ${props.model.dimensions.weightKg ?? t('unknown')})`}>
          {(id) => <NumberInput id={id} nullable value={v.weightKg ?? null} onChange={set('weightKg')} />}
        </Field>
      </div>
    </Modal>
  );
}

/** Barrel polarity glyph: centre dot with + or −. */
export function PolarityGlyph({ polarity }: { polarity: 'center-positive' | 'center-negative' | null }) {
  if (!polarity) return <span className="text-xs text-amber-700">{t('polarity unknown')}</span>;
  const pos = polarity === 'center-positive';
  return (
    <svg
      width={64}
      height={18}
      viewBox="0 0 64 18"
      role="img"
      aria-label={pos ? t('Centre positive') : t('Centre negative')}
    >
      <text x={2} y={13} fontSize={11} fill="currentColor">
        {pos ? '−' : '+'}
      </text>
      <path d="M10 9 H20" stroke="currentColor" />
      <path d="M20 3 A6 6 0 1 1 20 15" fill="none" stroke="currentColor" />
      <circle cx={26} cy={9} r={2.2} fill="currentColor" />
      <path d="M28 9 H40" stroke="currentColor" />
      <text x={44} y={13} fontSize={11} fill="currentColor">
        {pos ? '+' : '−'}
      </text>
    </svg>
  );
}

export function PowerSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const gearModels = useProject((s) => s.project.library.gearModels);
  const powerModels = useMemo(() => gearModels.filter(isPowerSupply), [gearModels]);
  const connectorOptions = m.connectors.map((c) => ({ value: c.id, label: `${c.label} (${c.id})` }));
  return (
    <section>
      <H>{t('Power')}</H>
      <div className={grid}>
        <Field label={t('Typical W')}>
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={m.power.typicalW ?? null}
              onChange={(v) => update((d) => void (d.power.typicalW = v), ['power.typicalW'])}
            />
          )}
        </Field>
        <Field label={t('Max W')}>
          {(id) => (
            <NumberInput
              id={id}
              nullable
              value={m.power.maxW ?? null}
              onChange={(v) => update((d) => void (d.power.maxW = v), ['power.maxW'])}
            />
          )}
        </Field>
        <Field label={t('Mains region')}>
          {(id) => (
            <Select
              id={id}
              value={m.power.mainsRegion}
              options={MainsRegion.options}
              onChange={(v) => update((d) => void (d.power.mainsRegion = v), ['power.mainsRegion'])}
            />
          )}
        </Field>
        <Field label={t('Inrush / fuse note')}>
          {(id) => (
            <TextInput
              id={id}
              value={m.power.inrushNote ?? ''}
              onChange={(v) => update((d) => void (v ? (d.power.inrushNote = v) : delete d.power.inrushNote))}
            />
          )}
        </Field>
      </div>
      <div className="mt-4 rounded border border-neutral-200 p-2 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <h4 className="flex-1 text-xs font-semibold text-neutral-500 uppercase">{t('Power strip / distribution')}</h4>
          <Checkbox
            checked={!!m.power.distribution}
            label={t('This unit distributes mains (strip, PDU)')}
            onChange={(on) =>
              update(
                (d) => {
                  if (on) d.power.distribution = { voltage: 230, totalCurrentMaMax: null };
                  else delete d.power.distribution;
                },
                on ? ['power.distribution.totalCurrentMaMax'] : [],
              )
            }
          />
        </div>
        {m.power.distribution && (
          <>
            <div className={`${grid} mt-2`}>
              <Field label={t('Voltage (V)')}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={m.power.distribution!.voltage}
                    onChange={(v) =>
                      update((d) => void (d.power.distribution!.voltage = v), ['power.distribution.voltage'])
                    }
                  />
                )}
              </Field>
              <Field
                label={t('Total rating (mA)')}
                hint={
                  <Badge
                    api={api}
                    path="power.distribution.totalCurrentMaMax"
                    isNull={m.power.distribution.totalCurrentMaMax === null}
                  />
                }
              >
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={m.power.distribution!.totalCurrentMaMax}
                    onChange={(v) =>
                      update(
                        (d) => void (d.power.distribution!.totalCurrentMaMax = v),
                        ['power.distribution.totalCurrentMaMax'],
                      )
                    }
                  />
                )}
              </Field>
              <div className="flex items-end gap-3">
                <Checkbox
                  checked={!!m.power.distribution.switched}
                  onChange={(v) => update((d) => void (d.power.distribution!.switched = v))}
                  label={t('Switched')}
                />
                <Checkbox
                  checked={!!m.power.distribution.surgeProtected}
                  onChange={(v) => update((d) => void (d.power.distribution!.surgeProtected = v))}
                  label={t('Surge protection')}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {t(
                '{n} outlets. Add more from the connector group or a "Mains socket" connector (domain power.ac, direction out, jack mains-socket).',
                {
                  n: m.connectors.filter((c) => c.domain === 'power.ac' && c.direction === 'out').length,
                },
              )}
            </p>
            <Button
              className="mt-1"
              onClick={() =>
                update((d) => {
                  const n = d.connectors.filter((c) => c.domain === 'power.ac' && c.direction === 'out').length + 1;
                  d.connectors.push({
                    id: `outlet-${n}`,
                    label: `Outlet ${n}`,
                    face: 'top',
                    pos: { x: 0, y: 0 },
                    domain: 'power.ac',
                    direction: 'out',
                    jack: 'mains-socket',
                    channel: { role: 'numbered', index: n },
                    psu: {
                      voltage: d.power.distribution?.voltage ?? null,
                      currentMaMax: d.power.distribution?.totalCurrentMaMax ?? null,
                    },
                  });
                })
              }
            >
              {t('Add outlet')}
            </Button>
          </>
        )}
      </div>
      <h4 className="mt-4 mb-1 text-xs font-semibold text-neutral-500 uppercase">{t('Sources')}</h4>
      {m.power.sources.length === 0 && (
        <p className="text-xs text-neutral-500">{t('No power sources (passive, or unknown — see provenance).')}</p>
      )}
      {m.power.sources.map((s, i) => {
        const p = (k: string) => `power.sources.${i}.${k}`;
        const set = (recipe: (x: PowerSource) => void, stamp: string[] = []) =>
          update((d) => recipe(d.power.sources[i]!), stamp);
        const barrel = s.plug?.type === 'barrel' ? s.plug : null;
        return (
          <div key={i} className="mb-3 rounded border border-neutral-200 p-2 dark:border-neutral-700">
            <div className={grid}>
              <Field label={t('Kind')}>
                {(id) => (
                  <Select
                    id={id}
                    value={s.kind}
                    options={PowerSourceSchema.shape.kind.options}
                    onChange={(v) => set((x) => void (x.kind = v))}
                  />
                )}
              </Field>
              <Field label={t('Input connector')}>
                {(id) => (
                  <Select
                    id={id}
                    allowEmpty
                    value={s.inputConnectorId}
                    options={connectorOptions}
                    onChange={(v) => set((x) => void (v ? (x.inputConnectorId = v) : delete x.inputConnectorId))}
                  />
                )}
              </Field>
              <Field label={t('Nominal V')} hint={<Badge api={api} path={p('nominalV')} />}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={s.nominalV ?? null}
                    onChange={(v) =>
                      set((x) => void (v === null ? delete x.nominalV : (x.nominalV = v)), [p('nominalV')])
                    }
                  />
                )}
              </Field>
              <Field label={t('Draw mA')} hint={<Badge api={api} path={p('drawMa')} isNull={s.drawMa === null} />}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={s.drawMa ?? null}
                    onChange={(v) => set((x) => void (x.drawMa = v), [p('drawMa')])}
                  />
                )}
              </Field>
              <Field label={t('Min V')}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={s.voltageMinV ?? null}
                    onChange={(v) =>
                      set((x) => void (v === null ? delete x.voltageMinV : (x.voltageMinV = v)), [p('voltageMinV')])
                    }
                  />
                )}
              </Field>
              <Field label={t('Max V')}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={s.voltageMaxV ?? null}
                    onChange={(v) =>
                      set((x) => void (v === null ? delete x.voltageMaxV : (x.voltageMaxV = v)), [p('voltageMaxV')])
                    }
                  />
                )}
              </Field>
              <Field label={t('Peak mA')}>
                {(id) => (
                  <NumberInput
                    id={id}
                    nullable
                    value={s.peakMa ?? null}
                    onChange={(v) => set((x) => void (x.peakMa = v), [p('peakMa')])}
                  />
                )}
              </Field>
              <Field label={t('Supplied PSU model')}>
                {(id) => (
                  <Select
                    id={id}
                    allowEmpty
                    value={s.suppliedModelId}
                    options={powerModels.map((x) => ({ value: x.id, label: modelLabel(x) }))}
                    onChange={(v) => set((x) => void (v ? (x.suppliedModelId = v) : delete x.suppliedModelId))}
                  />
                )}
              </Field>
              <Field label={t('Plug')}>
                {(id) => (
                  <Select
                    id={id}
                    allowEmpty
                    value={s.plug?.type}
                    options={['barrel', 'iec-c14', 'usb', 'other'] as const}
                    onChange={(v) =>
                      set(
                        (x) => {
                          if (!v) delete x.plug;
                          else if (v === 'barrel') x.plug = { type: 'barrel', odMm: 5.5, idMm: 2.1, polarity: null };
                          else if (v === 'other') x.plug = { type: 'other', note: '' };
                          else x.plug = { type: v };
                        },
                        [p('plug')],
                      )
                    }
                  />
                )}
              </Field>
              {barrel && (
                <>
                  <Field label={t('Barrel OD mm')}>
                    {(id) => (
                      <NumberInput
                        id={id}
                        nullable
                        value={barrel.odMm}
                        onChange={(v) =>
                          set((x) => void (x.plug!.type === 'barrel' && (x.plug!.odMm = v)), [p('plug.odMm')])
                        }
                      />
                    )}
                  </Field>
                  <Field label={t('Barrel ID mm')}>
                    {(id) => (
                      <NumberInput
                        id={id}
                        nullable
                        value={barrel.idMm}
                        onChange={(v) =>
                          set((x) => void (x.plug!.type === 'barrel' && (x.plug!.idMm = v)), [p('plug.idMm')])
                        }
                      />
                    )}
                  </Field>
                  <Field label={t('Polarity')} hint={<PolarityGlyph polarity={barrel.polarity} />}>
                    {(id) => (
                      <Select
                        id={id}
                        allowEmpty
                        value={barrel.polarity ?? undefined}
                        options={['center-positive', 'center-negative'] as const}
                        onChange={(v) =>
                          set(
                            (x) => void (x.plug!.type === 'barrel' && (x.plug!.polarity = v || null)),
                            [p('plug.polarity')],
                          )
                        }
                      />
                    )}
                  </Field>
                </>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Checkbox
                checked={s.included}
                onChange={(v) => set((x) => void (x.included = v))}
                label={t('Supply included')}
              />
              <TextInput
                aria-label={t('Max voltage note')}
                value={s.maxVoltageNote ?? ''}
                placeholder={t('e.g. max 9 V')}
                onChange={(v) => set((x) => void (v ? (x.maxVoltageNote = v) : delete x.maxVoltageNote))}
              />
              <Button variant="danger" onClick={() => update((d) => void d.power.sources.splice(i, 1))}>
                {t('Remove')}
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        onClick={() =>
          update(
            (d) => void d.power.sources.push({ kind: 'external-dc', drawMa: null, included: true }),
            [`power.sources.${m.power.sources.length}.drawMa`],
          )
        }
      >
        {t('Add power source')}
      </Button>
    </section>
  );
}

export function UsbMidiClockSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const usbPorts = m.connectors.filter((c) => c.usb);
  return (
    <section className="space-y-4">
      <div>
        <H>{t('USB ports')}</H>
        {usbPorts.length === 0 ? (
          <p className="text-xs text-neutral-500">{t('No USB connectors.')}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-neutral-500">
              <tr>
                <th>{t('Port')}</th>
                <th>{t('Role')}</th>
                <th>{t('Version')}</th>
                <th>{t('Carries')}</th>
                <th>{t('Audio in/out')}</th>
                <th>{t('Compliance')}</th>
                <th>{t('Bus power')}</th>
              </tr>
            </thead>
            <tbody>
              {usbPorts.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>{c.usb!.role}</td>
                  <td>{c.usb!.version}</td>
                  <td>{c.usb!.carries.join(', ')}</td>
                  <td>
                    {c.usb!.audio ? `${c.usb!.audio.inChannels ?? '?'} / ${c.usb!.audio.outChannels ?? '?'}` : '—'}
                  </td>
                  <td>{c.usb!.audio?.compliance ?? '—'}</td>
                  <td>
                    {c.usb!.busPowered ? t('draws {ma}', { ma: c.usb!.drawsBusPowerMa ?? '?' }) : ''}
                    {c.usb!.suppliesBusPowerMa !== undefined
                      ? t('supplies {ma}', { ma: c.usb!.suppliesBusPowerMa ?? '?' })
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          {t('Edit USB details per connector in the Connectors section (Advanced).')}
        </p>
      </div>
      <div>
        <H>{t('MIDI')}</H>
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <Checkbox
            checked={!!m.midi?.clockIn}
            onChange={(v) => update((d) => void (d.midi = { ...d.midi, clockIn: v }))}
            label={t('Receives MIDI clock')}
          />
          <Checkbox
            checked={!!m.midi?.clockOut}
            onChange={(v) => update((d) => void (d.midi = { ...d.midi, clockOut: v }))}
            label={t('Sends MIDI clock')}
          />
          <Field label={t('Tracks (count)')}>
            {(id) => (
              <NumberInput
                id={id}
                nullable
                value={m.midi?.tracks?.length ?? null}
                onChange={(n) =>
                  update((d) => {
                    d.midi = { ...d.midi };
                    if (!n) delete d.midi.tracks;
                    else
                      d.midi.tracks = Array.from(
                        { length: n },
                        (_, i) => d.midi?.tracks?.[i] ?? { id: `t${i + 1}`, label: `Track ${i + 1}` },
                      );
                  })
                }
              />
            )}
          </Field>
        </div>
        <JsonEditor
          label={t('MIDI spec (advanced)')}
          value={m.midi ?? {}}
          schema={MidiSchema}
          rows={6}
          onApply={(v) => update((d) => void (d.midi = v))}
        />
      </div>
      <div>
        <H>{t('Clock')}</H>
        <div className="mb-2 flex flex-wrap gap-3">
          <Checkbox
            checked={!!m.clock?.canBeMaster}
            onChange={(v) =>
              update((d) => void (d.clock = { canBeSlave: false, formats: [], ...d.clock, canBeMaster: v }))
            }
            label={t('Can be master')}
          />
          <Checkbox
            checked={!!m.clock?.canBeSlave}
            onChange={(v) =>
              update((d) => void (d.clock = { canBeMaster: false, formats: [], ...d.clock, canBeSlave: v }))
            }
            label={t('Can be slave')}
          />
        </div>
        <fieldset className="flex flex-wrap gap-3">
          <legend className="text-xs text-neutral-500">{t('Formats')}</legend>
          {ClockFormat.options.map((f) => (
            <Checkbox
              key={f}
              checked={!!m.clock?.formats.includes(f)}
              onChange={(on) =>
                update((d) => {
                  d.clock ??= { canBeMaster: false, canBeSlave: false, formats: [] };
                  d.clock.formats = on ? [...d.clock.formats, f] : d.clock.formats.filter((x) => x !== f);
                })
              }
              label={f}
            />
          ))}
        </fieldset>
        <div className="mt-2">
          <JsonEditor
            label={t('Clock spec (advanced)')}
            value={m.clock ?? { canBeMaster: false, canBeSlave: false, formats: [] }}
            schema={ClockSchema}
            rows={5}
            onApply={(v) => update((d) => void (d.clock = v))}
          />
        </div>
      </div>
    </section>
  );
}

export function ErgonomicsSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const r = m.controlsRegion;
  const setRegion = (k: 'x' | 'y' | 'w' | 'h') => (v: number | null) =>
    update((d) => {
      if (v === null) delete d.controlsRegion;
      else
        d.controlsRegion = {
          ...(d.controlsRegion ?? { x: 10, y: 10, w: (d.dimensions.w ?? 40) - 20, h: (d.dimensions.d ?? 40) - 20 }),
          [k]: v,
        };
    });
  return (
    <section>
      <H>{t('Ergonomics')}</H>
      <div className={grid}>
        <Field label={t('Interaction')}>
          {(id) => (
            <Select
              id={id}
              value={m.ergonomics.interaction}
              options={Interaction.options}
              onChange={(v) => update((d) => void (d.ergonomics.interaction = v))}
            />
          )}
        </Field>
        <Field label={t('Default usage')}>
          {(id) => (
            <Select
              id={id}
              value={m.ergonomics.defaultUsage}
              options={Usage.options}
              onChange={(v) => update((d) => void (d.ergonomics.defaultUsage = v))}
            />
          )}
        </Field>
      </div>
      <div className="mt-2">
        <Checkbox
          checked={m.ergonomics.needsDisplayVisibility}
          onChange={(v) => update((d) => void (d.ergonomics.needsDisplayVisibility = v))}
          label={t('Display must be visible')}
        />
      </div>
      <h4 className="mt-4 mb-1 text-xs font-semibold text-neutral-500 uppercase">
        {t('Controls region on the top face (mm)')}
      </h4>
      <p className="mb-1 text-xs text-neutral-500">
        {t('Empty = top face minus a 10 mm margin. A draggable rectangle arrives with the face canvas.')}
      </p>
      <div className={grid}>
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <Field key={k} label={k}>
            {(id) => <NumberInput id={id} nullable value={r?.[k] ?? null} onChange={setRegion(k)} />}
          </Field>
        ))}
      </div>
    </section>
  );
}
