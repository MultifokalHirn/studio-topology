// Inspector block: where a unit sits in the active setup, and quick placement actions (spec §5.6).
import { useMemo } from 'react';
import { Button, Checkbox, Select } from '@/components/ui';
import { nextFreeX, placeOnSurface, removeFromSetup } from '@/domain/setupOps';
import { analyzeLayout } from '@/engine/layout';
import { unitSize } from '@/engine/placement';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';
import { IssueList } from '../issues/IssuesPanel';

export function PlacementBlock({ unitId }: { unitId: string }) {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const report = useMemo(() => (setup ? analyzeLayout(project, setup) : null), [project, setup]);
  if (!setup || !report) return null;
  const placement = setup.placements.find((p) => p.unitId === unitId);
  const r = report.layout.units.get(unitId);
  const unit = project.inventory.gearUnits.find((u) => u.id === unitId);
  const model = project.library.gearModels.find((m) => m.id === unit?.modelId);
  const edit = (label: string, recipe: (s: (typeof project.setups)[number]) => void) =>
    projectStore.getState().change(
      (p) => {
        const s = p.setups.find((x) => x.id === setup.id);
        if (s) recipe(s);
      },
      { label },
    );

  const targets = report.layout.surfaces
    .filter((s) => !s.surface.rack && s.surface.kind !== 'floor')
    .map((s) => ({
      value: `${s.standUnitId}|${s.surface.id}`,
      label: `${project.inventory.standUnits.find((u) => u.id === s.standUnitId)?.nickname} · ${s.surface.label}`,
    }));

  const placeOn = (value: string) => {
    const [standUnitId, surfaceId] = value.split('|') as [string, string];
    const s = report.layout.surfaceOf(standUnitId, surfaceId);
    if (!s || !model) return;
    const occupied = [...report.layout.units.values()]
      .filter(
        (u) =>
          u.unitId !== unitId &&
          u.standUnitId === standUnitId &&
          u.surfaceId === surfaceId &&
          u.placement.mount.type === 'surface',
      )
      .map((u) => ({ x: u.local.x, w: u.local.w }));
    const x = nextFreeX(occupied, unitSize(model).w, s.surface.usable.w) ?? 0;
    edit('Place unit', (st) => placeOnSurface(st, unitId, standUnitId, surfaceId, x, 0));
  };

  return (
    <section
      aria-label={t('Placement')}
      className="rounded border border-neutral-200 p-2 text-xs dark:border-neutral-700"
    >
      <h3 className="mb-1 font-semibold text-neutral-500 uppercase">
        {t('In setup')} “{setup.name}”
      </h3>
      {!placement || !r ? (
        <p className="mb-1 text-neutral-500">{t('Not placed. Drag it onto the layout, or:')}</p>
      ) : (
        <dl className="mb-2 grid grid-cols-[80px_1fr] gap-y-0.5">
          <dt className="text-neutral-500">{t('Mount')}</dt>
          <dd>
            {placement.mount.type === 'surface' || placement.mount.type === 'rack'
              ? `${project.inventory.standUnits.find((u) => u.id === r.standUnitId)?.nickname ?? '?'} · ${report.layout.surfaceOf(r.standUnitId!, r.surfaceId!)?.surface.label ?? '?'}`
              : placement.mount.type === 'stacked'
                ? t('on {name}', {
                    name:
                      project.inventory.gearUnits.find(
                        (u) => u.id === (placement.mount as { parentUnitId: string }).parentUnitId,
                      )?.nickname ?? '?',
                  })
                : t('floor')}
            {placement.mount.type === 'rack' ? ` · U${placement.mount.uStart}` : ''}
          </dd>
          {(placement.mount.type === 'surface' || placement.mount.type === 'stacked') && (
            <>
              <dt className="text-neutral-500">x / y</dt>
              <dd data-testid="placement-xy">
                {placement.mount.x} / {placement.mount.y} mm
              </dd>
            </>
          )}
          <dt className="text-neutral-500">{t('Tray / plane')}</dt>
          <dd>
            {Math.round(r.trayZ)} / {Math.round(r.controlPlaneZ)} mm{r.tiltDeg ? ` · ${r.tiltDeg}°` : ''}
          </dd>
          <dt className="text-neutral-500">{t('Rotation')}</dt>
          <dd>{placement.rotationDeg}°</dd>
        </dl>
      )}
      <div className="mb-1 flex flex-wrap items-center gap-1">
        <div className="min-w-40 flex-1">
          <Select
            aria-label={t('Place on surface')}
            allowEmpty
            value={undefined}
            options={targets}
            onChange={(v) => v && placeOn(v)}
          />
        </div>
        {placement && (
          <Button disabled={readOnly} onClick={() => edit('Remove from setup', (s) => removeFromSetup(s, unitId))}>
            {t('Remove from setup')}
          </Button>
        )}
      </div>
      {placement && (
        <Checkbox
          checked={placement.locked}
          label={t('Locked')}
          onChange={(v) =>
            edit('Lock', (s) => {
              const p = s.placements.find((x) => x.unitId === unitId);
              if (p) p.locked = v;
            })
          }
        />
      )}
      <div className="mt-1">
        <IssueList entityId={unitId} />
      </div>
    </section>
  );
}
