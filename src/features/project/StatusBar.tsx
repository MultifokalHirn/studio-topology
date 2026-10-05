// Status bar (spec §5.1): units, grid/snap, selection and its dimensions, last autosave.
import { formatLength } from '@/domain/units';
import { effectiveModel, unitSize } from '@/engine/placement';
import { t } from '@/i18n';
import { useProject, useUi } from '@/store';

export function StatusBar() {
  const settings = useProject((s) => s.project.settings);
  const project = useProject((s) => s.project);
  const lastAutosaveAt = useProject((s) => s.lastAutosaveAt);
  const selection = useUi((s) => s.selection);
  const { length, decimals } = settings.units;

  let selected = '';
  if (selection?.kind === 'gear-unit' || selection?.kind === 'gear-model') {
    const unit = selection.kind === 'gear-unit' ? project.inventory.gearUnits.find((u) => u.id === selection.id) : null;
    const raw = project.library.gearModels.find((m) => m.id === (unit?.modelId ?? selection.id));
    if (raw) {
      const size = unitSize(effectiveModel(raw, unit ?? undefined));
      const f = (v: number) => formatLength(v, length, decimals);
      selected = `${unit?.nickname ?? raw.name} · ${f(size.w)} × ${f(size.d)} × ${f(size.h)}${size.estimated ? ` (${t('estimated')})` : ''}`;
    }
  } else if (selection?.kind === 'stand-unit')
    selected = project.inventory.standUnits.find((u) => u.id === selection.id)?.nickname ?? '';
  else if (selection) selected = t(selection.kind.replace('-', ' '));

  return (
    <footer
      className="flex gap-4 border-t border-neutral-200 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-700"
      aria-label={t('Status bar')}
    >
      <span title={t('Display unit (Settings)')}>{length}</span>
      <span>
        {settings.snap.enabled
          ? t('Snap {grid} mm (Shift {fine} mm, Alt off)', { grid: settings.snap.gridMm, fine: settings.snap.fineMm })
          : t('Snap off')}
      </span>
      <span data-testid="status-selection" aria-live="polite" aria-label={t('Selection')}>
        {selected}
      </span>
      <span className="flex-1" />
      <span>{t('Ctrl+K commands · ? shortcuts')}</span>
      {lastAutosaveAt && <span>{t('Autosaved {time}', { time: new Date(lastAutosaveAt).toLocaleTimeString() })}</span>}
    </footer>
  );
}
