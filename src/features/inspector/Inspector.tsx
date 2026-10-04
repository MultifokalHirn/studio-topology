// Right inspector (spec §5.1): properties of the selection, with provenance badges and verification status.
import { useState } from 'react';
import { Button, Field, ProvenanceBadge, TextInput } from '@/components/ui';
import { provenanceFor } from '@/domain/integrity';
import { applyMeasurement, describePath, gearUnitUsage, modelLabel, unverifiedFields } from '@/domain/libraryOps';
import type { GearModel } from '@/domain/types';
import { formatLength } from '@/domain/units';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject, useUi } from '@/store';
import { MeasureDialog } from '../gear-editor/sections';
import { StandInspector } from './StandInspector';

export function Inspector() {
  const sel = useUi((s) => s.selection);
  const project = useProject((s) => s.project);
  if (!sel) return <p className="p-3 text-xs text-neutral-500">{t('Select something to inspect it.')}</p>;

  if (sel.kind === 'gear-unit' || sel.kind === 'gear-model') {
    const unit = sel.kind === 'gear-unit' ? project.inventory.gearUnits.find((u) => u.id === sel.id) : undefined;
    const model = project.library.gearModels.find((m) => m.id === (unit ? unit.modelId : sel.id));
    if (!model) return null;
    return <GearInspector model={model} unitId={unit?.id} />;
  }
  if (sel.kind === 'stand-unit' || sel.kind === 'stand-model') {
    const unit = sel.kind === 'stand-unit' ? project.inventory.standUnits.find((u) => u.id === sel.id) : undefined;
    const model = project.library.standModels.find((m) => m.id === (unit ? unit.modelId : sel.id));
    if (!model) return null;
    return <StandInspector model={model} standUnitId={unit?.id} />;
  }
  return null;
}

const DOMAIN_GROUPS: [string, (d: string) => boolean][] = [
  ['Audio', (d) => d.startsWith('audio.')],
  ['MIDI', (d) => d.startsWith('midi.')],
  ['CV/Gate', (d) => d === 'cv' || d === 'gate'],
  ['Clock', (d) => d.startsWith('clock.')],
  ['USB/Network', (d) => d === 'usb.data' || d === 'ethernet'],
  ['Power', (d) => d.startsWith('power.')],
  ['Control', (d) => d === 'expression' || d === 'footswitch'],
];

function GearInspector({ model: m, unitId }: { model: GearModel; unitId?: string }) {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const unit = unitId ? project.inventory.gearUnits.find((u) => u.id === unitId) : undefined;
  const lengthUnit = project.settings.units.length;
  const [measuring, setMeasuring] = useState(false);
  const unverified = unverifiedFields(m);
  const usage = unit ? gearUnitUsage(project, unit.id) : null;
  const dim = (k: 'w' | 'd' | 'h') => (
    <span>
      {formatLength(m.dimensions[k], lengthUnit, lengthUnit === 'mm' ? 1 : 2)}{' '}
      <ProvenanceBadge prov={provenanceFor(m.provenance, `dimensions.${k}`)} isNull={m.dimensions[k] === null} />
    </span>
  );
  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <h2 className="font-semibold">{unit?.nickname ?? modelLabel(m)}</h2>
        <p className="text-xs text-neutral-500">
          {modelLabel(m)} · {m.category} · {m.formFactor}
        </p>
      </div>
      {unit && (
        <Field label={t('Nickname')}>
          {(id) => (
            <TextInput
              id={id}
              value={unit.nickname}
              onChange={(v) =>
                projectStore
                  .getState()
                  .change((p) => void (p.inventory.gearUnits.find((u) => u.id === unit.id)!.nickname = v), {
                    label: 'Rename unit',
                    coalesceKey: `rename:${unit.id}`,
                  })
              }
            />
          )}
        </Field>
      )}
      <dl className="grid grid-cols-[70px_1fr] gap-y-1 text-xs">
        <dt className="text-neutral-500">{t('W × D × H')}</dt>
        <dd className="space-y-0.5">
          <div>{dim('w')}</div>
          <div>{dim('d')}</div>
          <div>{dim('h')}</div>
        </dd>
        <dt className="text-neutral-500">{t('Weight')}</dt>
        <dd>
          {m.dimensions.weightKg ?? '—'} kg{' '}
          <ProvenanceBadge
            prov={provenanceFor(m.provenance, 'dimensions.weightKg')}
            isNull={m.dimensions.weightKg === null}
          />
        </dd>
        {m.dimensions.rack && (
          <>
            <dt className="text-neutral-500">{t('Rack')}</dt>
            <dd>{m.dimensions.rack.u}U</dd>
          </>
        )}
        {m.dimensions.eurorack && (
          <>
            <dt className="text-neutral-500">{t('Eurorack')}</dt>
            <dd>{m.dimensions.eurorack.hp} HP</dd>
          </>
        )}
        <dt className="text-neutral-500">{t('Power')}</dt>
        <dd>
          {m.power.sources.length === 0
            ? t('none / unknown')
            : m.power.sources
                .map((s) =>
                  [
                    s.kind,
                    s.nominalV ? `${s.nominalV} V` : '',
                    s.drawMa ? `${s.drawMa} mA` : '',
                    s.plug?.type === 'barrel' && s.plug.polarity ? s.plug.polarity : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                )
                .join('; ')}
        </dd>
      </dl>
      <div>
        <h3 className="mb-1 text-xs font-semibold text-neutral-500 uppercase">
          {t('Connectors')} ({m.connectors.length})
        </h3>
        <ul className="text-xs">
          {DOMAIN_GROUPS.map(([label, pred]) => {
            const list = m.connectors.filter((c) => pred(c.domain));
            if (!list.length) return null;
            const ins = list.filter((c) => c.direction === 'in').length;
            const outs = list.filter((c) => c.direction === 'out' || c.direction === 'thru').length;
            const bi = list.length - ins - outs;
            return (
              <li key={label}>
                {t(label)}: {ins} {t('in')} · {outs} {t('out')}
                {bi ? ` · ${bi} ${t('bidir')}` : ''}
              </li>
            );
          })}
        </ul>
      </div>
      {usage && (
        <p className="text-xs text-neutral-500">
          {t('Used in {n} placements and {c} connections.', {
            n: usage.placements.length,
            c: usage.connections.length,
          })}
        </p>
      )}
      {unverified.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold text-amber-700 uppercase dark:text-amber-400">
            {t('Unverified')} ({unverified.length})
          </h3>
          <ul className="max-h-40 overflow-auto text-xs">
            {unverified.map((u) => (
              <li key={u.path} title={u.note}>
                <code>{describePath(m, u.path)}</code> <ProvenanceBadge prov={{ kind: u.kind, note: u.note }} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.notes && <p className="text-xs whitespace-pre-wrap text-neutral-600 dark:text-neutral-300">{m.notes}</p>}
      <div className="flex gap-1">
        <Button onClick={() => uiStore.getState().editGearModel(m.id)}>{t('Edit model')}</Button>
        <Button disabled={readOnly} onClick={() => setMeasuring(true)}>
          {t('Measure…')}
        </Button>
      </div>
      {measuring && (
        <MeasureDialog
          model={m}
          onClose={() => setMeasuring(false)}
          onApply={(v) =>
            projectStore.getState().change(
              (p) => {
                const target = p.library.gearModels.find((x) => x.id === m.id);
                if (target) applyMeasurement(target, v);
              },
              { label: `Measure ${modelLabel(m)}` },
            )
          }
        />
      )}
    </div>
  );
}
