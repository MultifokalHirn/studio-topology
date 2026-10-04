// Ergonomics drawer (spec §5.13): body profile and posture, per-unit comfort, tier optimiser, assignment advisor.
import { useMemo, useState } from 'react';
import { Button, LengthInput, Select } from '@/components/ui';
import { defaultUnitConfig } from '@/domain/defaults';
import { newId } from '@/domain/ids';
import { placeOnSurface } from '@/domain/setupOps';
import type { Project, Setup, Usage } from '@/domain/types';
import { formatLength } from '@/domain/units';
import {
  adviseAssignment,
  applyTierRecommendations,
  bodyFor,
  ergonomicsReport,
  optimizeTiers,
  type AssignmentResult,
  type OptimizerResult,
} from '@/engine/ergonomics';
import type { LayoutReport } from '@/engine/layout';
import { t } from '@/i18n';
import { projectStore, uiStore } from '@/store';

const USAGES = ['primary', 'secondary', 'rare'] as const;

function editSetup(setupId: string, label: string, recipe: (s: Setup, p: Project) => void, coalesceKey?: string) {
  projectStore.getState().change(
    (p) => {
      const s = p.setups.find((x) => x.id === setupId);
      if (s) recipe(s as Setup, p as Project);
    },
    { label, ...(coalesceKey ? { coalesceKey } : {}) },
  );
}

export function ErgonomicsPanel({
  project,
  setup,
  report,
  readOnly,
}: {
  project: Project;
  setup: Setup;
  report: LayoutReport;
  readOnly: boolean;
}) {
  const unit = project.settings.units.length;
  const fmt = (v: number) => formatLength(v, unit);
  const body = bodyFor(project, setup);
  const ergo = useMemo(() => ergonomicsReport(project, setup, report.layout), [project, setup, report]);
  const [opt, setOpt] = useState<{ setupId: string; result: OptimizerResult } | null>(null);
  const [assign, setAssign] = useState<{ setupId: string; result: AssignmentResult } | null>(null);
  const tiered = report.surfaces.filter((s) => s.kind === 'tier');
  const multiTier = [...new Set(tiered.map((s) => s.standUnitId))].filter(
    (id) => tiered.filter((s) => s.standUnitId === id).length > 1,
  );
  const [standId, setStandId] = useState<string | undefined>(undefined);
  const advisorStand = standId && multiTier.includes(standId) ? standId : multiTier[0];
  const nick = (id: string) => project.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;
  const standName = (id: string) => project.inventory.standUnits.find((u) => u.id === id)?.nickname ?? id;
  const optResult = opt?.setupId === setup.id ? opt.result : null;
  const assignResult = assign?.setupId === setup.id ? assign.result : null;

  const editBody = (label: string, recipe: (b: NonNullable<typeof body>) => void) =>
    body &&
    projectStore.getState().change(
      (p) => {
        const b = p.bodyProfiles.find((x) => x.id === body.id);
        if (b) recipe(b);
      },
      { label, coalesceKey: `body:${body.id}:${label}` },
    );

  return (
    <aside
      aria-label={t('Ergonomics')}
      className="w-[26rem] shrink-0 space-y-3 overflow-auto border-l border-neutral-200 p-2 text-xs dark:border-neutral-700"
    >
      <section aria-label={t('Body and posture')} className="space-y-1">
        <h3 className="font-semibold text-neutral-500 uppercase">{t('Body and posture')}</h3>
        <div className="grid grid-cols-[8rem_1fr] items-center gap-1">
          <span>{t('Body profile')}</span>
          <div className="flex gap-1">
            <Select
              aria-label={t('Body profile')}
              value={body?.id}
              options={project.bodyProfiles.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(v) => editSetup(setup.id, 'Body profile', (s) => void (s.bodyProfileId = v))}
            />
            <Button
              disabled={readOnly}
              onClick={() =>
                projectStore.getState().change(
                  (p) => {
                    const id = newId();
                    p.bodyProfiles.push({
                      id,
                      name: t('New profile'),
                      heightMm: body?.heightMm ?? 1730,
                      handedness: 'right',
                    });
                    const s = p.setups.find((x) => x.id === setup.id);
                    if (s) s.bodyProfileId = id;
                  },
                  { label: 'New body profile' },
                )
              }
            >
              {t('New')}
            </Button>
          </div>
          {body && (
            <>
              <span>{t('Profile name')}</span>
              <input
                aria-label={t('Profile name')}
                className="rounded border border-neutral-300 px-1 dark:border-neutral-600 dark:bg-neutral-800"
                value={body.name}
                onChange={(e) => editBody('Rename body profile', (b) => void (b.name = e.target.value))}
              />
              <span>{t('Body height')}</span>
              <LengthInput
                aria-label={t('Body height')}
                valueMm={body.heightMm}
                unit={unit}
                onChange={(v) => v && v > 500 && v < 2600 && editBody('Body height', (b) => void (b.heightMm = v))}
              />
              <span>{t('Handedness')}</span>
              <Select
                aria-label={t('Handedness')}
                value={body.handedness}
                options={['right', 'left'] as const}
                onChange={(v) => editBody('Handedness', (b) => void (b.handedness = v))}
              />
            </>
          )}
          <span>{t('Posture')}</span>
          <Select
            aria-label={t('Posture')}
            value={setup.posture}
            options={['standing', 'seated'] as const}
            onChange={(v) => editSetup(setup.id, 'Posture', (s) => void (s.posture = v))}
          />
          {setup.posture === 'seated' && (
            <>
              <span>{t('Seat height')}</span>
              <LengthInput
                aria-label={t('Seat height')}
                valueMm={setup.seatHeightMm ?? ergo?.lm.seatMm ?? null}
                unit={unit}
                nullable
                onChange={(v) =>
                  editSetup(setup.id, 'Seat height', (s) => {
                    if (v === null) delete s.seatHeightMm;
                    else s.seatHeightMm = v;
                  })
                }
              />
            </>
          )}
        </div>
        {ergo && (
          <p className="text-neutral-500" data-testid="landmarks">
            {t('Elbow {e} · eye {y} · forearm+hand {f}', {
              e: fmt(ergo.lm.elbowMm),
              y: fmt(ergo.lm.eyeMm),
              f: fmt(ergo.lm.forearmHandMm),
            })}
          </p>
        )}
      </section>

      {ergo && (
        <section aria-label={t('Comfort')}>
          <h3 className="font-semibold text-neutral-500 uppercase">
            {t('Comfort')}{' '}
            <span
              className="text-sm font-semibold text-neutral-900 normal-case dark:text-neutral-100"
              data-testid="setup-score"
            >
              {ergo.score === null ? '—' : Math.round(ergo.score)}
            </span>
            <span className="font-normal normal-case"> / 100</span>
          </h3>
          <table className="w-full text-left">
            <thead className="text-neutral-500">
              <tr>
                <th className="font-normal">{t('Unit')}</th>
                <th className="font-normal">{t('Usage')}</th>
                <th className="font-normal" title={t('Control plane height')}>
                  {t('Plane')}
                </th>
                <th className="font-normal">Δ</th>
                <th className="font-normal">{t('Score')}</th>
                <th className="font-normal" title={t('Line of sight below horizontal / tilt (recommended)')}>
                  {t('LoS / tilt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...ergo.units]
                .sort((a, b) => b.plane - a.plane)
                .map((u) => (
                  <tr key={u.unitId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td>
                      <button
                        className="text-left underline"
                        onClick={() => uiStore.getState().select({ kind: 'gear-unit', id: u.unitId })}
                      >
                        {nick(u.unitId)}
                      </button>
                    </td>
                    <td>
                      <select
                        aria-label={t('Usage of {name}', { name: nick(u.unitId) })}
                        className="bg-transparent"
                        disabled={readOnly}
                        value={u.usage}
                        onChange={(e) =>
                          editSetup(setup.id, 'Usage', (s, p) => {
                            const m = p.library.gearModels.find(
                              (x) => x.id === p.inventory.gearUnits.find((g) => g.id === u.unitId)?.modelId,
                            );
                            s.unitConfigs[u.unitId] ??= defaultUnitConfig(m?.ergonomics.defaultUsage);
                            s.unitConfigs[u.unitId]!.usage = e.target.value as Usage;
                          })
                        }
                      >
                        {USAGES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </td>
                    <td>{Math.round(u.plane)}</td>
                    <td className={Math.abs(u.plane - u.target) > 100 ? 'text-amber-700 dark:text-amber-400' : ''}>
                      {u.plane - u.target > 0 ? '+' : ''}
                      {Math.round(u.plane - u.target)}
                    </td>
                    <td>{Math.round(u.score)}</td>
                    <td>
                      {Math.round(u.losDeg)}° / {u.tiltDeg}° ({Math.round(u.recommendedTiltDeg)}°)
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-1 text-neutral-500">
            {t('Δ = plane − target (elbow for keys/faders, −50 knobs, −100 rare).')}
          </p>
        </section>
      )}

      <section aria-label={t('Tier optimiser')} className="space-y-1">
        <h3 className="font-semibold text-neutral-500 uppercase">{t('Tier optimiser')}</h3>
        <Button onClick={() => setOpt({ setupId: setup.id, result: optimizeTiers(project, setup) })}>
          {t('Optimise tier heights')}
        </Button>
        {optResult && (
          <div className="space-y-1">
            <table className="w-full text-left" aria-label={t('Recommended tiers')}>
              <thead className="text-neutral-500">
                <tr>
                  <th className="font-normal">{t('Tier')}</th>
                  <th className="font-normal">{t('Height')}</th>
                  <th className="font-normal">{t('Tilt')}</th>
                  <th className="font-normal">{t('Plane')}</th>
                </tr>
              </thead>
              <tbody>
                {optResult.recommendations.map((r) => (
                  <tr
                    key={r.standUnitId + r.surfaceId}
                    data-surface={r.surfaceId}
                    className="border-t border-neutral-100 dark:border-neutral-800"
                  >
                    <td>{r.label}</td>
                    <td>
                      {Math.round(r.from.z)} → <strong>{Math.round(r.to.z)}</strong>
                    </td>
                    <td>
                      {r.from.tiltDeg}° → <strong>{r.to.tiltDeg}°</strong>
                    </td>
                    <td data-plane>{r.to.planeZ === null ? '—' : Math.round(r.to.planeZ)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              {t('Comfort {a} → {b}', {
                a: optResult.scoreBefore === null ? '—' : Math.round(optResult.scoreBefore),
                b: optResult.scoreAfter === null ? '—' : Math.round(optResult.scoreAfter),
              })}
            </p>
            {optResult.notes.map((n) => (
              <p key={n} className="text-amber-700 dark:text-amber-400">
                {n}
              </p>
            ))}
            <Button
              disabled={readOnly || optResult.recommendations.length === 0}
              onClick={() => {
                editSetup(setup.id, 'Apply tier optimiser', (s, p) =>
                  applyTierRecommendations(p, s, optResult.recommendations),
                );
                setOpt(null);
              }}
            >
              {t('Apply to setup')}
            </Button>
          </div>
        )}
      </section>

      <section aria-label={t('Assignment advisor')} className="space-y-1">
        <h3 className="font-semibold text-neutral-500 uppercase">{t('Assignment advisor')}</h3>
        {multiTier.length === 0 ? (
          <p className="text-neutral-500">{t('Needs a stand with at least two tiers in this setup.')}</p>
        ) : (
          <div className="flex items-center gap-1">
            <Select
              aria-label={t('Stand to advise')}
              value={advisorStand}
              options={multiTier.map((id) => ({ value: id, label: standName(id) }))}
              onChange={setStandId}
            />
            <Button
              onClick={() =>
                advisorStand && setAssign({ setupId: setup.id, result: adviseAssignment(project, setup, advisorStand) })
              }
            >
              {t('Suggest assignment')}
            </Button>
          </div>
        )}
        {assignResult && (
          <div className="space-y-1">
            {assignResult.moves.filter((m) => m.fromSurfaceId !== m.toSurfaceId).length === 0 ? (
              <p>{t('The current assignment is already the best found.')}</p>
            ) : (
              <ul aria-label={t('Suggested moves')}>
                {assignResult.moves
                  .filter((m) => m.fromSurfaceId !== m.toSurfaceId)
                  .map((m) => (
                    <li key={m.unitId}>
                      {nick(m.unitId)}: {tiered.find((s) => s.surfaceId === m.fromSurfaceId)?.label} →{' '}
                      <strong>{tiered.find((s) => s.surfaceId === m.toSurfaceId)?.label}</strong>
                    </li>
                  ))}
              </ul>
            )}
            <p>
              {t('Comfort on these tiers {a} → {b}', {
                a: assignResult.scoreBefore === null ? '—' : Math.round(assignResult.scoreBefore),
                b: assignResult.scoreAfter === null ? '—' : Math.round(assignResult.scoreAfter),
              })}
            </p>
            {assignResult.notes.map((n) => (
              <p key={n} className="text-neutral-500">
                {n}
              </p>
            ))}
            <Button
              disabled={readOnly || assignResult.moves.length === 0}
              onClick={() => {
                editSetup(setup.id, 'Apply assignment', (s) => {
                  for (const m of assignResult.moves)
                    placeOnSurface(s, m.unitId, assignResult.standUnitId, m.toSurfaceId, m.x, m.y);
                });
                setAssign(null);
              }}
            >
              {t('Apply assignment')}
            </Button>
          </div>
        )}
      </section>
    </aside>
  );
}
