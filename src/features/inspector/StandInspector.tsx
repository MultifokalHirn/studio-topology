// Stand inspector: rack bays (fill a rack or rack case U by U) and stand-on-stand mounting, for the active setup.
// The drag-and-drop layout canvas arrives in M4; this panel already lets racks be configured.
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Button, Field, NumberInput, Select } from '@/components/ui';
import { modelLabel } from '@/domain/libraryOps';
import { firstFreeU, rackFit, rackHeightU, type RackItem } from '@/domain/rack';
import type { GearModel, StandModel, SurfaceDef } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';

export function StandInspector({ model, standUnitId }: { model: StandModel; standUnitId?: string }) {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const unit = standUnitId ? project.inventory.standUnits.find((u) => u.id === standUnitId) : undefined;
  const state = setup?.stands.find((s) => s.standUnitId === standUnitId);

  const change = (label: string, recipe: Parameters<ReturnType<typeof projectStore.getState>['change']>[0]) =>
    projectStore.getState().change(recipe, { label });
  const ensureInSetup = (p: Parameters<Parameters<typeof change>[1]>[0]) => {
    const s = p.setups.find((x) => x.id === setup?.id);
    if (s && standUnitId && !s.stands.some((x) => x.standUnitId === standUnitId))
      s.stands.push({ standUnitId, pos: { x: 0, y: 0 }, rotationDeg: 0, surfaceStates: {} });
    return s;
  };

  const otherSurfaces =
    setup?.stands
      .filter((s) => s.standUnitId !== standUnitId)
      .flatMap((s) => {
        const su = project.inventory.standUnits.find((u) => u.id === s.standUnitId);
        const sm = project.library.standModels.find((m) => m.id === su?.modelId);
        return (sm?.surfaces ?? [])
          .filter((sf) => sf.kind !== 'rack-bay')
          .map((sf) => ({
            value: `${s.standUnitId}|${sf.id}`,
            label: `${su?.nickname ?? s.standUnitId} · ${sf.label}`,
          }));
      }) ?? [];

  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <h2 className="font-semibold">{unit?.nickname ?? model.name}</h2>
        <p className="text-xs text-neutral-500">
          {[model.manufacturer, model.name].filter(Boolean).join(' ')} · {model.type}
        </p>
      </div>
      <ul className="text-xs">
        {model.surfaces.map((s) => (
          <li key={s.id}>
            {s.label}: {s.usable.w} × {s.usable.d} mm{s.loadKg !== null ? `, ${s.loadKg} kg` : ''}
            {s.rack ? `, ${s.rack.u}U ${s.rack.standard === '10in' ? '10"' : '19"'}, ${s.rack.depthMm} mm deep` : ''}
          </li>
        ))}
      </ul>
      {model.notes && <p className="text-xs text-neutral-500">{model.notes}</p>}

      {unit && setup && (
        <>
          <p className="text-xs text-neutral-500">
            {state
              ? t('In setup "{name}".', { name: setup.name })
              : t('Not in setup "{name}" yet.', { name: setup.name })}
          </p>
          {otherSurfaces.length > 0 && (
            <Field label={t('Sits on (e.g. a rack case on a desk)')}>
              {(id) => (
                <Select
                  id={id}
                  allowEmpty
                  value={state?.onSurface ? `${state.onSurface.standUnitId}|${state.onSurface.surfaceId}` : undefined}
                  options={otherSurfaces}
                  onChange={(v) =>
                    change('Mount stand', (p) => {
                      const st = ensureInSetup(p)?.stands.find((x) => x.standUnitId === standUnitId);
                      if (!st) return;
                      if (!v) delete st.onSurface;
                      else {
                        const [parent, surfaceId] = v.split('|') as [string, string];
                        st.onSurface = { standUnitId: parent, surfaceId, x: 0, y: 0 };
                      }
                    })
                  }
                />
              )}
            </Field>
          )}
          {model.surfaces
            .filter((s) => s.rack)
            .map((bay) => (
              <RackBay key={bay.id} bay={bay} standUnitId={unit.id} readOnly={readOnly} onEnsure={ensureInSetup} />
            ))}
        </>
      )}
    </div>
  );
}

function RackBay(props: {
  bay: SurfaceDef;
  standUnitId: string;
  readOnly: boolean;
  onEnsure: (p: Parameters<Parameters<ReturnType<typeof projectStore.getState>['change']>[0]>[0]) => unknown;
}) {
  const { bay, standUnitId } = props;
  const project = useProject((s) => s.project);
  const setup = project.setups.find((s) => s.id === project.activeSetupId)!;
  const models = new Map(project.library.gearModels.map((m) => [m.id, m]));
  const unitModel = (unitId: string) =>
    models.get(project.inventory.gearUnits.find((u) => u.id === unitId)?.modelId ?? '');
  const items: RackItem[] = setup.placements.flatMap((pl) => {
    const m = unitModel(pl.unitId);
    return pl.mount.type === 'rack' && pl.mount.standUnitId === standUnitId && pl.mount.surfaceId === bay.id && m
      ? [{ unitId: pl.unitId, uStart: pl.mount.uStart, model: m }]
      : [];
  });
  const fit = rackFit(bay, items);
  const placed = new Set(setup.placements.filter((p) => p.mount.type === 'rack').map((p) => p.unitId));
  const candidates = project.inventory.gearUnits
    .map((u) => ({ u, m: models.get(u.modelId) }))
    .filter(
      (x): x is { u: (typeof x)['u']; m: GearModel } => !!x.m && x.m.formFactor === 'rack' && !placed.has(x.u.id),
    );
  const [unitToAdd, setUnitToAdd] = useState<string | undefined>(undefined);
  const [uStart, setUStart] = useState<number | null>(null);
  const nick = (id: string) => project.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;
  const addModel = unitToAdd ? unitModel(unitToAdd) : undefined;
  const suggested = addModel ? firstFreeU(bay, items, addModel) : null;

  const place = () => {
    if (!unitToAdd) return;
    const start = uStart ?? suggested ?? 1;
    projectStore.getState().change(
      (p) => {
        const s = props.onEnsure(p) as (typeof p.setups)[number] | undefined;
        if (!s) return;
        s.placements = s.placements.filter((x) => x.unitId !== unitToAdd);
        s.placements.push({
          unitId: unitToAdd,
          mount: { type: 'rack', standUnitId, surfaceId: bay.id, uStart: start },
          rotationDeg: 0,
          locked: false,
          zIndex: 0,
        });
      },
      { label: 'Place in rack' },
    );
    setUnitToAdd(undefined);
    setUStart(null);
  };

  return (
    <section aria-label={t('Rack bay {name}', { name: bay.label })}>
      <h3 className="mb-1 text-xs font-semibold text-neutral-500 uppercase">
        {bay.label}: {t('{used}/{total} U used', { used: fit.usedU, total: fit.totalU })}
      </h3>
      <ol className="rounded border border-neutral-200 font-mono text-[11px] dark:border-neutral-700">
        {fit.occupancy.map((ids, i) => {
          const starts = items.filter((x) => Math.round(x.uStart) === i + 1);
          return (
            <li
              key={i}
              className={`flex items-center gap-1 border-b border-neutral-100 px-1 last:border-0 dark:border-neutral-800 ${ids.length > 1 ? 'bg-red-50 dark:bg-red-950' : ''}`}
            >
              <span className="w-7 text-neutral-400">U{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {starts.length
                  ? starts.map((x) => `${nick(x.unitId)} (${rackHeightU(x.model) ?? '?'}U)`).join(' + ')
                  : ids.length
                    ? '│'
                    : ''}
              </span>
              {starts.map((x) => (
                <button
                  key={x.unitId}
                  aria-label={t('Remove {name} from rack', { name: nick(x.unitId) })}
                  disabled={props.readOnly}
                  className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                  onClick={() =>
                    projectStore.getState().change(
                      (p) => {
                        const s = p.setups.find((y) => y.id === setup.id);
                        if (s) s.placements = s.placements.filter((y) => y.unitId !== x.unitId);
                      },
                      { label: 'Remove from rack' },
                    )
                  }
                >
                  <IconTrash size={12} />
                </button>
              ))}
            </li>
          );
        })}
      </ol>
      {fit.problems.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {fit.problems.map((x, k) => (
            <li
              key={k}
              className={
                x.severity === 'error'
                  ? 'text-red-700 dark:text-red-400'
                  : x.severity === 'warning'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-neutral-500'
              }
            >
              {x.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-[1fr_70px_auto] items-end gap-1">
        <Field label={t('Add rack gear')}>
          {(id) => (
            <Select
              id={id}
              allowEmpty
              value={unitToAdd}
              options={candidates.map(({ u, m }) => ({
                value: u.id,
                label: `${u.nickname} (${rackHeightU(m) ?? '?'}U · ${modelLabel(m)})`,
              }))}
              onChange={(v) => {
                setUnitToAdd(v || undefined);
                setUStart(null);
              }}
            />
          )}
        </Field>
        <Field label={t('At U')}>
          {(id) => <NumberInput id={id} nullable value={uStart ?? suggested} onChange={setUStart} />}
        </Field>
        <Button disabled={props.readOnly || !unitToAdd} onClick={place}>
          {t('Place')}
        </Button>
      </div>
      {candidates.length === 0 && (
        <p className="mt-1 text-xs text-neutral-500">{t('All rack-format gear is placed.')}</p>
      )}
    </section>
  );
}
