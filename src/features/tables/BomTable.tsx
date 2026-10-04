// Cable list / BOM (spec §5.8, §5.14): grouped totals, stock vs need, CSV export.
import { Button } from '@/components/ui';
import { bomCsv, cableBom } from '@/engine/bom';
import { t } from '@/i18n';
import { useProject } from '@/store';
import { downloadText } from '@/store/fileIO';

export function BomTable() {
  const project = useProject((s) => s.project);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  if (!setup) return null;
  const rows = cableBom(setup.connections, project.library.cableModels, project.inventory.cables);
  const totals = rows.reduce((a, r) => ({ needed: a.needed + r.needed, missing: a.missing + r.missing }), {
    needed: 0,
    missing: 0,
  });
  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex items-center gap-2 border-b border-neutral-200 p-2 dark:border-neutral-700">
        <h2 className="font-semibold">
          {t('Cable BOM')} · {setup.name}
        </h2>
        <span className="text-xs text-neutral-500">
          {t('{n} cables and adapters needed, {m} missing', { n: totals.needed, m: totals.missing })}
        </span>
        <span className="flex-1" />
        <Button
          onClick={() =>
            downloadText(bomCsv(rows), `${setup.name.replace(/[^\w.-]+/g, '-')}-cable-bom.csv`, 'text/csv')
          }
        >
          {t('Export CSV')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs" aria-label={t('Cable BOM')}>
          <thead className="sticky top-0 bg-neutral-100 text-left text-neutral-500 dark:bg-neutral-800">
            <tr>
              <th className="px-2 py-1">{t('Cable / adapter')}</th>
              <th className="px-2">{t('Length')}</th>
              <th className="px-2">{t('Needed')}</th>
              <th className="px-2">{t('Owned (in stock)')}</th>
              <th className="px-2">{t('Missing')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.cableModelId}|${r.lengthMm}`}
                className="border-t border-neutral-100 dark:border-neutral-800"
              >
                <td className="px-2 py-0.5">{r.name}</td>
                <td className="px-2">
                  {r.lengthMm === null ? (
                    <span className="text-amber-700">{t('unknown')}</span>
                  ) : (
                    `${r.lengthMm / 1000} m`
                  )}
                </td>
                <td className="px-2">{r.needed}</td>
                <td className="px-2">{r.owned}</td>
                <td className={`px-2 ${r.missing ? 'font-semibold text-red-700 dark:text-red-400' : ''}`}>
                  {r.missing}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">
        {t(
          'Unknown lengths: place both ends in the layout, then pick the suggested cable in the connection inspector to compute them.',
        )}
      </p>
    </div>
  );
}
