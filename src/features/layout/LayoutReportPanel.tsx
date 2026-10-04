// Layout report under the canvas (spec §5.6 / scenario 2): tiers, pitch, occlusion, issues.
import { useState } from 'react';
import type { Project, Setup } from '@/domain/types';
import type { LayoutReport } from '@/engine/layout';
import { t } from '@/i18n';
import { uiStore } from '@/store';

export function LayoutReportPanel({ project, report }: { project: Project; setup: Setup; report: LayoutReport }) {
  const [open, setOpen] = useState(true);
  const nick = (id: string) => project.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;
  const standName = (id: string) => project.inventory.standUnits.find((u) => u.id === id)?.nickname ?? id;
  const tiers = report.surfaces.filter((s) => s.unitIds.length > 0 || s.kind === 'tier');
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of report.issues) counts[i.severity]++;
  return (
    <section
      aria-label={t('Layout report')}
      className="max-h-[40%] overflow-auto border-t border-neutral-200 text-xs dark:border-neutral-700"
    >
      <button
        className="sticky top-0 flex w-full items-center gap-3 bg-neutral-100 px-2 py-1 text-left font-semibold dark:bg-neutral-800"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} {t('Layout report')}
        <span className="font-normal text-red-700 dark:text-red-400">{t('{n} errors', { n: counts.error })}</span>
        <span className="font-normal text-amber-700 dark:text-amber-400">
          {t('{n} warnings', { n: counts.warning })}
        </span>
        <span className="font-normal text-neutral-500">{t('{n} info', { n: counts.info })}</span>
      </button>
      {open && (
        <div className="grid gap-3 p-2 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <table className="w-full" aria-label={t('Surfaces')}>
              <thead className="text-left text-neutral-500">
                <tr>
                  <th>{t('Surface')}</th>
                  <th>{t('Tray z')}</th>
                  <th>{t('Plane z')}</th>
                  <th>{t('Tilt')}</th>
                  <th>{t('Depth offset')}</th>
                  <th>{t('Load')}</th>
                  <th>{t('Width')}</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((r) => (
                  <tr key={`${r.standUnitId}/${r.surfaceId}`} data-surface={r.surfaceId}>
                    <td>
                      {standName(r.standUnitId)} · {r.label}
                    </td>
                    <td>{Math.round(r.trayZ)}</td>
                    <td>{r.planeZ === null ? '—' : Math.round(r.planeZ)}</td>
                    <td>{r.tiltDeg}°</td>
                    <td>{r.yOffset}</td>
                    <td className={r.capacityKg !== null && r.loadKg > r.capacityKg ? 'text-red-700' : ''}>
                      {r.loadKg.toFixed(1)}
                      {r.loadComplete ? '' : '+'} / {r.capacityKg ?? '?'} kg
                    </td>
                    <td className={r.kind === 'tier' && r.widthUsedMm > r.widthAvailMm ? 'text-red-700' : ''}>
                      {r.kind === 'tier' ? `${Math.round(r.widthUsedMm)} / ${r.widthAvailMm} mm` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.pitches.length > 0 && (
              <table className="w-full" aria-label={t('Row pitch')}>
                <thead className="text-left text-neutral-500">
                  <tr>
                    <th>{t('Rows')}</th>
                    <th>{t('Pitch')}</th>
                    <th>{t('Minimum')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pitches.map((p) => (
                    <tr key={`${p.lower.surfaceId}-${p.upper.surfaceId}`}>
                      <td>
                        {p.lower.label} → {p.upper.label}
                      </td>
                      <td className={p.pitchMm < p.minPitchMm ? 'text-amber-700' : ''}>{Math.round(p.pitchMm)} mm</td>
                      <td>
                        {Math.round(p.minPitchMm)} mm {p.overhang ? t('(overhang)') : t('(staggered)')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.occlusions.some((o) => o.hiddenFraction > 0) && (
              <table className="w-full" aria-label={t('Occlusion')}>
                <thead className="text-left text-neutral-500">
                  <tr>
                    <th>{t('Upper')}</th>
                    <th>{t('Hides from')}</th>
                    <th>{t('Hidden')}</th>
                    <th>{t('Hand room')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.occlusions
                    .filter((o) => o.hiddenFraction > 0)
                    .sort((a, b) => b.hiddenFraction - a.hiddenFraction)
                    .map((o) => (
                      <tr key={`${o.upperUnitId}/${o.lowerUnitId}`}>
                        <td>{nick(o.upperUnitId)}</td>
                        <td>{nick(o.lowerUnitId)}</td>
                        <td
                          className={o.hiddenFraction > 0.15 ? 'text-amber-700' : ''}
                          data-testid={`occlusion-${o.upperUnitId}-${o.lowerUnitId}`}
                        >
                          {(o.hiddenFraction * 100).toFixed(1)}%
                        </td>
                        <td>{o.gapMm === null ? '—' : `${Math.round(o.gapMm)} mm`}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
          <ul aria-label={t('Layout issues')} className="space-y-1">
            {report.issues.length === 0 && <li className="text-neutral-500">{t('No layout issues.')}</li>}
            {report.issues.map((i, k) => (
              <li key={k}>
                <button
                  className="text-left"
                  onClick={() => {
                    const unit = i.entityIds.find(
                      (id) => id.startsWith('unit-') || project.inventory.gearUnits.some((u) => u.id === id),
                    );
                    if (unit) uiStore.getState().select({ kind: 'gear-unit', id: unit });
                  }}
                >
                  <span
                    className={
                      i.severity === 'error'
                        ? 'text-red-700 dark:text-red-400'
                        : i.severity === 'warning'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-neutral-500'
                    }
                  >
                    {i.ruleId}
                  </span>{' '}
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
