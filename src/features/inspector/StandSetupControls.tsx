// Stand in the active setup: add/remove, position, per-surface height / tilt / depth offset, tier measure helper.
import { useState } from 'react';
import { Button, Field, Modal, NumberInput, Select } from '@/components/ui';
import { addStandToSetup, removeStandFromSetup, setSurfaceState } from '@/domain/setupOps';
import type { Rotation, Setup, StandModel } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';

export function StandSetupControls({ model, standUnitId }: { model: StandModel; standUnitId: string }) {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId)!;
  const st = setup.stands.find((s) => s.standUnitId === standUnitId);
  const [measuring, setMeasuring] = useState(false);
  const edit = (label: string, recipe: (s: Setup) => void, key?: string) =>
    projectStore.getState().change(
      (p) => {
        const s = p.setups.find((x) => x.id === setup.id);
        if (s) recipe(s);
      },
      { label, ...(key ? { coalesceKey: key } : {}) },
    );

  if (!st)
    return (
      <Button disabled={readOnly} onClick={() => edit('Add stand', (s) => addStandToSetup(s, standUnitId))}>
        {t('Add to setup "{name}"', { name: setup.name })}
      </Button>
    );

  const adjustable = model.surfaces.filter(
    (s) => !s.rack && (s.adjustable.z || s.adjustable.tiltDeg || s.adjustable.y),
  );
  return (
    <section aria-label={t('Stand in setup')} className="space-y-2 text-xs">
      <div className="grid grid-cols-3 gap-1">
        <Field label="x (mm)">
          {(id) => (
            <NumberInput
              id={id}
              value={st.pos.x}
              onChange={(v) =>
                v !== null &&
                edit('Move stand', (s) => void (s.stands.find((x) => x.standUnitId === standUnitId)!.pos.x = v))
              }
            />
          )}
        </Field>
        <Field label="y (mm)">
          {(id) => (
            <NumberInput
              id={id}
              value={st.pos.y}
              onChange={(v) =>
                v !== null &&
                edit('Move stand', (s) => void (s.stands.find((x) => x.standUnitId === standUnitId)!.pos.y = v))
              }
            />
          )}
        </Field>
        <Field label={t('Rotation')}>
          {(id) => (
            <Select
              id={id}
              value={String(st.rotationDeg) as '0' | '90' | '180' | '270'}
              options={['0', '90', '180', '270'] as const}
              onChange={(v) =>
                edit(
                  'Rotate stand',
                  (s) =>
                    void (s.stands.find((x) => x.standUnitId === standUnitId)!.rotationDeg = Number(v) as Rotation),
                )
              }
            />
          )}
        </Field>
      </div>
      {adjustable.length > 0 && (
        <table className="w-full" aria-label={t('Tier settings')}>
          <thead className="text-left text-neutral-500">
            <tr>
              <th>{t('Surface')}</th>
              <th>{t('Height')}</th>
              <th>{t('Tilt °')}</th>
              <th>{t('Offset')}</th>
            </tr>
          </thead>
          <tbody>
            {adjustable.map((sf) => {
              const cur = st.surfaceStates[sf.id] ?? {};
              const cell = (k: 'z' | 'tiltDeg' | 'y', fallback: number | null) =>
                sf.adjustable[k] ? (
                  <NumberInput
                    aria-label={t('{what} of {surface}', {
                      what: { z: 'Height', tiltDeg: 'Tilt', y: 'Depth offset' }[k],
                      surface: sf.label,
                    })}
                    nullable={k === 'y'}
                    value={cur[k] ?? fallback}
                    onChange={(v) => edit('Adjust tier', (s) => setSurfaceState(s, standUnitId, sf, { [k]: v }))}
                  />
                ) : (
                  <span className="text-neutral-400">—</span>
                );
              return (
                <tr key={sf.id}>
                  <td>{sf.label}</td>
                  <td>{cell('z', sf.anchor.z)}</td>
                  <td>{cell('tiltDeg', 0)}</td>
                  <td>{cell('y', null)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap gap-1">
        {adjustable.length > 1 && (
          <Button disabled={readOnly} onClick={() => setMeasuring(true)}>
            {t('Measure tier offsets…')}
          </Button>
        )}
        <Button
          variant="danger"
          disabled={readOnly}
          onClick={() => edit('Remove stand', (s) => removeStandFromSetup(s, standUnitId))}
        >
          {t('Remove from setup')}
        </Button>
      </div>
      {measuring && (
        <MeasureTiersDialog
          model={model}
          onClose={() => setMeasuring(false)}
          apply={(recipe) => edit('Measured tier offsets', recipe)}
          standUnitId={standUnitId}
          setup={setup}
        />
      )}
    </section>
  );
}

/** Spec §5.4 measure helper: horizontal offset and vertical gap between two tiers, as measured on the real stand. */
function MeasureTiersDialog(props: {
  model: StandModel;
  standUnitId: string;
  setup: Setup;
  onClose: () => void;
  apply: (r: (s: Setup) => void) => void;
}) {
  const tiers = props.model.surfaces.filter((s) => !s.rack);
  const [lowerId, setLowerId] = useState(tiers[0]?.id ?? '');
  const [upperId, setUpperId] = useState(tiers[1]?.id ?? '');
  const [offset, setOffset] = useState<number | null>(null);
  const [gap, setGap] = useState<number | null>(null);
  const st = props.setup.stands.find((s) => s.standUnitId === props.standUnitId)!;
  const lower = tiers.find((s) => s.id === lowerId);
  const upper = tiers.find((s) => s.id === upperId);
  const opts = tiers.map((s) => ({ value: s.id, label: s.label }));
  return (
    <Modal
      title={t('Measure tier offsets')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            disabled={!lower || !upper || lower === upper || offset === null || gap === null}
            onClick={() => {
              const lz = st.surfaceStates[lower!.id]?.z ?? lower!.anchor.z;
              const ly = st.surfaceStates[lower!.id]?.y ?? 0;
              props.apply((s) => setSurfaceState(s, props.standUnitId, upper!, { z: lz + gap!, y: ly + offset! }));
              props.onClose();
            }}
          >
            {t('Apply')}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-neutral-500">
        {t(
          "Measure on the real stand: how far the upper tier's front edge sits behind the lower one (horizontal), and the height difference between the two holder tops (vertical).",
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('Lower tier')}>
          {(id) => <Select id={id} value={lowerId} options={opts} onChange={setLowerId} />}
        </Field>
        <Field label={t('Upper tier')}>
          {(id) => <Select id={id} value={upperId} options={opts} onChange={setUpperId} />}
        </Field>
        <Field label={t('Horizontal offset (mm, + = further back)')}>
          {(id) => <NumberInput id={id} nullable value={offset} onChange={setOffset} />}
        </Field>
        <Field label={t('Vertical gap (mm)')}>
          {(id) => <NumberInput id={id} nullable value={gap} onChange={setGap} />}
        </Field>
      </div>
    </Modal>
  );
}
