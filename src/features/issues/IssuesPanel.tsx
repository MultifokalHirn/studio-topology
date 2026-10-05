// Issues tab (spec §5.12): grouped by severity, filter by family and entity, suppress with a reason.
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button, Checkbox, Select, TextInput } from '@/components/ui';
import { checkProject } from '@/domain/integrity';
import type { Issue } from '@/engine/issues';
import { ruleById } from '@/engine/rules';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject } from '@/store';
import { UnverifiedList } from '../library/UnverifiedList';
import { selectIssueEntity } from './selectIssueEntity';
import { useValidation } from './useValidation';

const FAMILIES = ['PHYS', 'DIR', 'SIG', 'MIDI', 'CLK', 'USB', 'PWR', 'PLC', 'ERG', 'DATA'];
const SEV_CLS = {
  error: 'text-red-700 dark:text-red-400',
  warning: 'text-amber-700 dark:text-amber-400',
  info: 'text-blue-700 dark:text-blue-300',
};

export function IssuesPanel() {
  const [tab, setTab] = useState<'issues' | 'project' | 'unverified'>('issues');
  return (
    <div className="flex h-full flex-col text-sm">
      <div
        role="tablist"
        aria-label={t('Issues view')}
        className="flex border-b border-neutral-200 text-xs dark:border-neutral-700"
      >
        {(
          [
            ['issues', 'Setup issues'],
            ['project', 'Project'],
            ['unverified', 'Unverified fields'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx('flex-1 px-2 py-1', tab === id ? 'font-semibold' : 'text-neutral-500')}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'issues' ? <SetupIssues /> : tab === 'project' ? <ProjectIntegrity /> : <UnverifiedList />}
      </div>
    </div>
  );
}

function SetupIssues() {
  const { issues, suppressed } = useValidation();
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setupId = project.activeSetupId;
  const [family, setFamily] = useState('');
  const [query, setQuery] = useState('');
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [suppressing, setSuppressing] = useState<Issue | null>(null);
  const [reason, setReason] = useState('');
  const q = query.trim().toLowerCase();
  const visible = issues.filter(
    (i) => (!family || i.ruleId.startsWith(family)) && (!q || `${i.ruleId} ${i.message}`.toLowerCase().includes(q)),
  );
  const groups = (['error', 'warning', 'info'] as const).map(
    (sev) => [sev, visible.filter((i) => i.severity === sev)] as const,
  );

  const suppress = () => {
    if (!suppressing || !reason.trim() || !setupId) return;
    const i = suppressing;
    projectStore
      .getState()
      .change(
        (p) =>
          void p.setups
            .find((s) => s.id === setupId)
            ?.suppressedIssues.push({ ruleId: i.ruleId, entityIds: i.entityIds, reason: reason.trim() }),
        { label: 'Suppress issue' },
      );
    setSuppressing(null);
    setReason('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 border-b border-neutral-200 p-2 dark:border-neutral-700">
        <div className="grid grid-cols-2 gap-1">
          <Select aria-label={t('Rule family')} allowEmpty value={family} options={FAMILIES} onChange={setFamily} />
          <TextInput aria-label={t('Filter issues')} value={query} onChange={setQuery} placeholder={t('Filter…')} />
        </div>
        <Checkbox
          checked={showSuppressed}
          onChange={setShowSuppressed}
          label={t('Show suppressed ({n})', { n: suppressed.length })}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {visible.length === 0 && <p className="text-xs text-neutral-500">{t('No issues.')}</p>}
        {groups.map(([sev, list]) =>
          list.length === 0 ? null : (
            <section key={sev} aria-label={t('{sev} issues', { sev })} className="mb-3">
              <h3 className={clsx('mb-1 text-xs font-semibold uppercase', SEV_CLS[sev])}>
                {t(sev === 'error' ? 'Errors' : sev === 'warning' ? 'Warnings' : 'Info')} ({list.length})
              </h3>
              <ul className="space-y-1">
                {list.map((i, k) => (
                  <li
                    key={k}
                    className="group rounded border border-neutral-200 p-1.5 text-xs dark:border-neutral-700"
                    data-rule={i.ruleId}
                  >
                    <button
                      className="block w-full text-left"
                      onClick={() => selectIssueEntity(i)}
                      title={ruleById.get(i.ruleId)?.rationale}
                    >
                      <span className={clsx('font-mono font-semibold', SEV_CLS[i.severity])}>{i.ruleId}</span>{' '}
                      {i.message}
                    </button>
                    {i.fixes?.length ? (
                      <p className="mt-0.5 text-neutral-500">→ {i.fixes.map((f) => f.label).join('; ')}</p>
                    ) : null}
                    {!readOnly && (
                      <button
                        className="mt-0.5 text-[11px] text-neutral-500 underline"
                        onClick={() => setSuppressing(i)}
                      >
                        {t('Suppress…')}
                      </button>
                    )}
                    {suppressing === i && (
                      <div className="mt-1 flex gap-1">
                        <TextInput
                          aria-label={t('Reason')}
                          value={reason}
                          onChange={setReason}
                          placeholder={t('Why is this fine?')}
                        />
                        <Button variant="primary" disabled={!reason.trim()} onClick={suppress}>
                          {t('Suppress')}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
        {showSuppressed && suppressed.length > 0 && (
          <section aria-label={t('Suppressed issues')}>
            <h3 className="mb-1 text-xs font-semibold text-neutral-500 uppercase">{t('Suppressed')}</h3>
            <ul className="space-y-1">
              {suppressed.map((i, k) => (
                <li
                  key={k}
                  className="rounded border border-dashed border-neutral-300 p-1.5 text-xs text-neutral-500 dark:border-neutral-600"
                >
                  <span className="font-mono">{i.ruleId}</span> {i.message}
                  <p>
                    {t('Reason')}: {i.reason}{' '}
                    {!readOnly && (
                      <button
                        className="underline"
                        onClick={() =>
                          projectStore.getState().change(
                            (p) => {
                              const s = p.setups.find((x) => x.id === setupId);
                              if (s)
                                s.suppressedIssues = s.suppressedIssues.filter(
                                  (x) =>
                                    !(
                                      x.ruleId === i.ruleId &&
                                      [...x.entityIds].sort().join() === [...i.entityIds].sort().join()
                                    ),
                                );
                            },
                            { label: 'Unsuppress issue' },
                          )
                        }
                      >
                        {t('Restore')}
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** Issues that mention an entity (unit or connection), for inspectors. */
export function IssueList({ entityId }: { entityId: string }) {
  const { issues } = useValidation();
  const mine = issues.filter((i) => i.entityIds.includes(entityId));
  if (!mine.length) return null;
  return (
    <ul aria-label={t('Issues')} className="space-y-0.5 text-xs">
      {mine.map((i, k) => (
        <li key={k} className={SEV_CLS[i.severity]} title={ruleById.get(i.ruleId)?.rationale}>
          <span className="font-mono font-semibold">{i.ruleId}</span> {i.message}
        </li>
      ))}
    </ul>
  );
}

export function ValidationBadge() {
  const { issues } = useValidation();
  const n = { error: 0, warning: 0, info: 0 };
  for (const i of issues) n[i.severity]++;
  return (
    <button
      aria-label={t('Validation: {e} errors, {w} warnings, {i} info', { e: n.error, w: n.warning, i: n.info })}
      className="mr-2 flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-neutral-200 dark:hover:bg-neutral-800"
      onClick={() => uiStore.getState().setSidebarTab('issues')}
    >
      <span className="font-semibold text-red-700 dark:text-red-400">● {n.error}</span>
      <span className="font-semibold text-amber-700 dark:text-amber-400">▲ {n.warning}</span>
      <span className="text-blue-700 dark:text-blue-300">ⓘ {n.info}</span>
    </button>
  );
}

/** Project-wide integrity (dangling references, missing images …), independent of the active setup. */
function ProjectIntegrity() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const issues = useMemo(() => {
    try {
      return checkProject(project);
    } catch (e) {
      // Read-only documents may not match the schema; report instead of crashing.
      return [{ level: 'error' as const, path: '', message: (e as Error).message }];
    }
  }, [project]);
  return (
    <div className="h-full overflow-auto p-2 text-xs" aria-label={t('Project integrity')} role="region">
      {readOnly && <p className="mb-2 text-amber-700">{t('Read-only document: checks may be incomplete.')}</p>}
      {issues.length === 0 && <p className="text-neutral-500">{t('No project problems.')}</p>}
      <ul className="space-y-1">
        {issues.map((i, k) => (
          <li key={k}>
            <span className={SEV_CLS[i.level]}>{t(i.level)}</span> {i.message}
            {i.path && <code className="ml-1 text-neutral-500">{i.path}</code>}
          </li>
        ))}
      </ul>
    </div>
  );
}
