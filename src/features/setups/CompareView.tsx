// Compare two setups and walk the migration checklist (spec §5.11).
import { useMemo, useState } from 'react';
import { Button, Checkbox, Select } from '@/components/ui';
import { formatLength } from '@/domain/units';
import {
  checklistFromDiff,
  checklistMarkdown,
  diffSetups,
  SECTION_TITLES,
  type ChecklistSection,
  type Metrics,
} from '@/engine/variants';
import { t } from '@/i18n';
import { downloadText } from '@/store/fileIO';
import { projectStore, uiStore, useProject, useUi } from '@/store';

const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '');

export function CompareView() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const previous = useUi((s) => s.previousSetupId);
  const ghostsFrom = useUi((s) => s.ghostsFrom);
  const active = project.setups.find((s) => s.id === project.activeSetupId);
  const fallbackA =
    (previous && previous !== active?.id && project.setups.some((s) => s.id === previous) ? previous : undefined) ??
    active?.derivedFromId ??
    project.setups.find((s) => s.id !== active?.id)?.id;
  const [pick, setPick] = useState<{ a?: string; b?: string }>({});
  const aId = pick.a && project.setups.some((s) => s.id === pick.a) ? pick.a : fallbackA;
  const bId = pick.b && project.setups.some((s) => s.id === pick.b) ? pick.b : active?.id;
  const a = project.setups.find((s) => s.id === aId);
  const b = project.setups.find((s) => s.id === bId);

  const result = useMemo(() => {
    if (!a || !b) return null;
    const { ctxA, ctxB, ...diff } = diffSetups(project, a, b);
    return { diff, items: checklistFromDiff(ctxA, ctxB, diff) };
  }, [project, a, b]);

  if (project.setups.length < 2)
    return <p className="p-4 text-sm text-neutral-500">{t('Create a second setup (clone or derive) to compare.')}</p>;
  const options = project.setups.map((s) => ({ value: s.id, label: s.name }));
  const checked = new Set((b && a && b.migrationChecks?.[a.id]) ?? []);
  const toggle = (id: string, on: boolean) =>
    a &&
    b &&
    projectStore.getState().change(
      (p) => {
        const s = p.setups.find((x) => x.id === b.id);
        if (!s) return;
        s.migrationChecks ??= {};
        const cur = new Set(s.migrationChecks[a.id] ?? []);
        if (on) cur.add(id);
        else cur.delete(id);
        s.migrationChecks[a.id] = [...cur].sort();
      },
      { label: on ? 'Check migration step' : 'Uncheck migration step' },
    );
  const markdown = () =>
    a && b && result ? checklistMarkdown({ from: a.name, to: b.name }, result.items, checked) : '';

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700">
        <label className="flex items-center gap-1">
          {t('From (A)')}
          <Select
            aria-label={t('From setup')}
            value={aId}
            options={options}
            onChange={(v) => setPick({ ...pick, a: v, b: bId })}
          />
        </label>
        <Button aria-label={t('Swap A and B')} onClick={() => setPick({ a: bId, b: aId })}>
          ⇄
        </Button>
        <label className="flex items-center gap-1">
          {t('To (B)')}
          <Select
            aria-label={t('To setup')}
            value={bId}
            options={options}
            onChange={(v) => setPick({ ...pick, a: aId, b: v })}
          />
        </label>
        <Checkbox
          checked={!!a && ghostsFrom === a.id}
          label={t('Show A as ghosts on the layout')}
          onChange={(v) => uiStore.getState().setGhostsFrom(v && a ? a.id : null)}
        />
        <span className="ml-auto flex gap-1">
          <Button
            disabled={!result}
            onClick={() =>
              a &&
              b &&
              downloadText(markdown(), `migration-${fileSafe(a.name)}-to-${fileSafe(b.name)}.md`, 'text/markdown')
            }
          >
            {t('Export Markdown')}
          </Button>
          <Button disabled={!result} onClick={() => printMarkdown(markdown())}>
            {t('Print / PDF')}
          </Button>
        </span>
      </div>
      {a && b && a.id === b.id && <p className="p-3 text-neutral-500">{t('Pick two different setups.')}</p>}
      {result && a && b && a.id !== b.id && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-3 lg:grid-cols-2">
          <div className="space-y-4">
            <MetricsTable
              a={result.diff.metrics.a}
              b={result.diff.metrics.b}
              names={[a.name, b.name]}
              lengthUnit={project.settings.units.length}
            />
            <section aria-label={t('Layout diff')}>
              <h3 className="mb-1 font-semibold">{t('Layout')}</h3>
              {result.diff.units.length + result.diff.stands.length + result.diff.surfaces.length === 0 && (
                <p className="text-neutral-500">{t('No layout changes.')}</p>
              )}
              <ul className="space-y-0.5">
                {result.diff.stands.map((s) => (
                  <li key={s.standUnitId}>
                    <Tag kind={s.kind} /> {s.name} {s.from && <span className="text-neutral-500">{s.from}</span>}
                    {s.from && s.to && ' → '}
                    {s.to && <span>{s.to}</span>}
                  </li>
                ))}
                {result.diff.units.map((u) => (
                  <li key={u.unitId} data-unit-change={u.unitId}>
                    <Tag kind={u.kind} /> <strong>{u.name}</strong>{' '}
                    {u.within && <span>{t('on {where}:', { where: u.within })} </span>}
                    {u.from && <span className="text-neutral-500">{u.from}</span>}
                    {u.from && u.to && ' → '}
                    {u.to}
                    {u.kind === 'moved' && u.distanceMm !== null && (
                      <span className="text-xs text-neutral-500">
                        {' '}
                        · {formatLength(u.distanceMm, project.settings.units.length)}
                      </span>
                    )}
                  </li>
                ))}
                {result.diff.surfaces.map((s) => (
                  <li key={`${s.standUnitId}/${s.surfaceId}/${s.field}`}>
                    <Tag kind="adjusted" /> {s.label}: {s.field}{' '}
                    {s.field === 'tilt'
                      ? `${s.from.toFixed(1)}° → ${s.to.toFixed(1)}°`
                      : `${formatLength(s.from, project.settings.units.length)} → ${formatLength(s.to, project.settings.units.length)}`}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label={t('Connection diff')}>
              <h3 className="mb-1 font-semibold">{t('Connections')}</h3>
              {result.diff.connections.added.length +
                result.diff.connections.removed.length +
                result.diff.connections.changed.length ===
                0 && <p className="text-neutral-500">{t('No connection changes.')}</p>}
              {result.diff.connections.rerouted.length > 0 && (
                <ul className="mb-1 space-y-0.5">
                  {result.diff.connections.rerouted.map((r) => (
                    <li key={r.from.key + r.to.key}>
                      <Tag kind="re-routed" /> {r.from.label} <span className="text-neutral-500">⇒</span> {r.to.label}
                    </li>
                  ))}
                </ul>
              )}
              <ul className="space-y-0.5">
                {result.diff.connections.removed.map((c) => (
                  <li key={c.key}>
                    <Tag kind="removed" /> {c.label}
                  </li>
                ))}
                {result.diff.connections.added.map((c) => (
                  <li key={c.key}>
                    <Tag kind="added" /> {c.label}
                  </li>
                ))}
                {result.diff.connections.changed.map((c) => (
                  <li key={c.key}>
                    <Tag kind="changed" /> {c.label}{' '}
                    <span className="text-xs text-neutral-500">({c.changes!.join(', ')})</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section aria-label={t('Migration checklist')}>
            <h3 className="mb-1 font-semibold">
              {t('Migration checklist')}{' '}
              <span className="text-xs font-normal text-neutral-500">
                {t('{done} of {n} done', {
                  done: result.items.filter((i) => checked.has(i.id)).length,
                  n: result.items.length,
                })}
              </span>
            </h3>
            {result.items.length === 0 && (
              <p className="text-neutral-500">{t('Nothing to do: the setups are identical.')}</p>
            )}
            {(Object.keys(SECTION_TITLES) as ChecklistSection[]).map((section) => {
              const xs = result.items.filter((i) => i.section === section);
              if (!xs.length) return null;
              return (
                <div key={section} className="mb-3">
                  <h4 className="text-xs font-semibold text-neutral-500 uppercase">{t(SECTION_TITLES[section])}</h4>
                  <ul>
                    {xs.map((i, k) => (
                      <li key={i.id}>
                        {i.group && i.group !== xs[k - 1]?.group && (
                          <p className="mt-1 text-xs font-semibold">{i.group}</p>
                        )}
                        <label className="flex items-start gap-2 py-0.5">
                          <input
                            type="checkbox"
                            className="mt-1"
                            disabled={readOnly}
                            checked={checked.has(i.id)}
                            onChange={(e) => toggle(i.id, e.target.checked)}
                          />
                          <span className={checked.has(i.id) ? 'text-neutral-400 line-through' : ''}>
                            {i.text}
                            {i.detail && <span className="block text-xs text-neutral-500">{i.detail}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}

function Tag({ kind }: { kind: string }) {
  const tone: Record<string, string> = {
    added: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
    removed: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
    moved: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  };
  return (
    <span
      className={`rounded px-1 text-[10px] uppercase ${tone[kind] ?? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}
    >
      {t(kind)}
    </span>
  );
}

function MetricsTable({
  a,
  b,
  names,
  lengthUnit,
}: {
  a: Metrics;
  b: Metrics;
  names: [string, string];
  lengthUnit: 'mm' | 'cm' | 'in';
}) {
  const unknown = (n: number) => (n ? ` + ${n} ${t('unknown')}` : '');
  const rows: [string, string, string, number | null][] = [
    [t('Errors'), String(a.issues.error), String(b.issues.error), b.issues.error - a.issues.error],
    [t('Warnings'), String(a.issues.warning), String(b.issues.warning), b.issues.warning - a.issues.warning],
    [t('Infos'), String(a.issues.info), String(b.issues.info), b.issues.info - a.issues.info],
    [
      t('Ergonomic score'),
      a.ergonomicScore === null ? '—' : String(a.ergonomicScore),
      b.ergonomicScore === null ? '—' : String(b.ergonomicScore),
      null,
    ],
    [t('Rack U used'), String(a.rackU), String(b.rackU), b.rackU - a.rackU],
    [
      t('Mains draw (W)'),
      `${Math.round(a.mainsW)}${unknown(a.mainsUnknown)}`,
      `${Math.round(b.mainsW)}${unknown(b.mainsUnknown)}`,
      Math.round(b.mainsW - a.mainsW),
    ],
    [
      t('Cable length'),
      `${formatLength(a.cableLengthMm, lengthUnit)}${unknown(a.cableUnknown)}`,
      `${formatLength(b.cableLengthMm, lengthUnit)}${unknown(b.cableUnknown)}`,
      null,
    ],
    [
      t('Stand load (kg)'),
      a.standLoadKg.toFixed(1),
      b.standLoadKg.toFixed(1),
      Math.round((b.standLoadKg - a.standLoadKg) * 10) / 10,
    ],
    [
      t('Fullest surface'),
      a.maxLoadShare === null ? '—' : `${Math.round(a.maxLoadShare * 100)}%`,
      b.maxLoadShare === null ? '—' : `${Math.round(b.maxLoadShare * 100)}%`,
      null,
    ],
  ];
  return (
    <table aria-label={t('Metrics')} className="w-full text-left text-xs">
      <thead>
        <tr className="text-neutral-500">
          <th className="font-normal">{t('Metric')}</th>
          <th className="font-normal">A · {names[0]}</th>
          <th className="font-normal">B · {names[1]}</th>
          <th className="font-normal">Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, x, y, d]) => (
          <tr key={label} className="border-t border-neutral-100 dark:border-neutral-800">
            <td>{label}</td>
            <td>{x}</td>
            <td>{y}</td>
            <td
              className={d ? (d > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400') : ''}
            >
              {d === null || d === 0 ? '' : d > 0 ? `+${d}` : d}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Print the checklist (the browser's print dialog saves PDF). */
function printMarkdown(md: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = md
    .split('\n')
    .map((l) =>
      l.startsWith('### ')
        ? `<h3>${esc(l.slice(4))}</h3>`
        : l.startsWith('## ')
          ? `<h2>${esc(l.slice(3))}</h2>`
          : l.startsWith('# ')
            ? `<h1>${esc(l.slice(2))}</h1>`
            : l.startsWith('- [')
              ? `<p>${l[3] === 'x' ? '☑' : '☐'} ${esc(l.slice(6))}</p>`
              : '',
    )
    .join('');
  w.document.write(
    `<!doctype html><meta charset="utf-8"><title>Migration checklist</title><style>body{font:12pt system-ui;margin:2cm}h2{margin-top:1.2em}p{margin:.2em 0}</style>${html}`,
  );
  w.document.close();
  w.focus();
  w.print();
}
