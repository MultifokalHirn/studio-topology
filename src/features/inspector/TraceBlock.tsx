// "Where does it end?" and "Follow signal" for a port (spec §5.10).
import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { buildSignalGraph } from '@/engine/graph';
import { nodeLabel, traceFrom } from '@/engine/trace';
import { t } from '@/i18n';
import { uiStore, useProject } from '@/store';

export function TraceBlock({ nodeKey }: { nodeKey: string }) {
  const project = useProject((s) => s.project);
  const trace = useMemo(() => {
    const setup = project.setups.find((s) => s.id === project.activeSetupId);
    if (!setup) return null;
    const g = buildSignalGraph(project, setup);
    return { g, down: traceFrom(g, nodeKey, 'down'), up: traceFrom(g, nodeKey, 'up') };
  }, [project, nodeKey]);
  if (!trace) return null;
  const nick = (id: string) => project.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;
  const label = (k: string) => nodeLabel(trace.g, k, nick);
  const dest = trace.down.terminals.filter((x) => x.kind === 'destination');
  const dead = trace.down.terminals.filter((x) => x.kind === 'dead-end');
  const sources = trace.up.terminals;
  return (
    <section aria-label={t('Signal trace')} className="space-y-2 text-xs">
      <div className="flex gap-1">
        <Button onClick={() => uiStore.getState().setTrace({ start: nodeKey, pinned: true })}>{t('Show trace')}</Button>
        <Button
          disabled={!trace.down.paths[0]}
          onClick={() => uiStore.getState().setFollow({ path: trace.down.paths[0] ?? [nodeKey], step: 0 })}
        >
          {t('Follow signal ▶')}
        </Button>
      </div>
      <div>
        <h3 className="font-semibold text-neutral-500 uppercase">{t('Where does it end?')}</h3>
        {dest.length === 0 && (
          <p className="text-amber-700 dark:text-amber-400">{t('No destination: the signal goes nowhere.')}</p>
        )}
        <ul aria-label={t('Destinations')}>
          {dest.map((x) => (
            <li key={x.node}>→ {label(x.node)}</li>
          ))}
        </ul>
        {dead.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer text-neutral-500">
              {t('Unconnected outputs reached ({n})', { n: dead.length })}
            </summary>
            <ul>
              {dead.map((x) => (
                <li key={x.node} className="text-neutral-500">
                  ⊘ {label(x.node)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {sources.length > 0 && (
        <div>
          <h3 className="font-semibold text-neutral-500 uppercase">{t('Comes from')}</h3>
          <ul aria-label={t('Sources')}>
            {sources.map((x) => (
              <li key={x.node}>← {label(x.node)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
