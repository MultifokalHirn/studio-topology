// MIDI/clock tree, USB tree and power tree (spec §5.14).
import { useMemo } from 'react';
import { buildSignalGraph } from '@/engine/graph';
import { modelWatts } from '@/engine/power';
import { clockMasters, clockTree, powerForest, usbForest, type PowerNode, type UsbNode } from '@/engine/trees';
import { usbBudgetMa } from '@/engine/rules/midiUsbPower';
import { t } from '@/i18n';
import { useProject } from '@/store';

export function TreesView({ kind }: { kind: 'clock' | 'usb' | 'power' }) {
  const project = useProject((s) => s.project);
  const data = useMemo(() => {
    const setup = project.setups.find((s) => s.id === project.activeSetupId);
    if (!setup) return null;
    const g = buildSignalGraph(project, setup);
    return { setup, g };
  }, [project]);
  if (!data) return null;
  const { setup, g } = data;
  const nick = (id: string) => project.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;
  const modelOf = (id: string) =>
    project.library.gearModels.find((m) => m.id === project.inventory.gearUnits.find((u) => u.id === id)?.modelId);

  if (kind === 'clock') {
    const masters = clockMasters(project, setup);
    return (
      <div className="h-full overflow-auto p-3 text-sm" aria-label={t('Clock tree')}>
        {masters.length === 0 && (
          <p className="text-neutral-500">{t('No clock master. Mark one in the unit inspector (Clock master).')}</p>
        )}
        {masters.map((m) => {
          const tree = clockTree(g, setup, m);
          const children = (u: string, depth: number, seen: Set<string>): React.ReactNode => {
            const links = tree.links.filter((l) => l.from === u && !seen.has(l.to));
            return links.length ? (
              <ul className="ml-4 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                {links.map((l) => (
                  <li key={l.connection.id} data-clock-link={`${l.from}>${l.to}`}>
                    <span className="mr-1 rounded bg-fuchsia-100 px-1 text-[10px] text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200">
                      {l.format.toUpperCase()}
                    </span>
                    {nick(l.to)} <span className="text-xs text-neutral-500">· {t('hop {n}', { n: l.hops })}</span>
                    {depth < 12 && children(l.to, depth + 1, new Set([...seen, l.to]))}
                  </li>
                ))}
              </ul>
            ) : null;
          };
          return (
            <section key={m} className="mb-4">
              <h3 className="font-semibold">
                ⏱ {nick(m)}{' '}
                <span className="text-xs font-normal text-neutral-500">
                  {t('master · reaches {n} units', { n: tree.reached.size - 1 })}
                </span>
              </h3>
              {children(m, 0, new Set([m]))}
            </section>
          );
        })}
      </div>
    );
  }

  if (kind === 'usb') {
    const draw = (n: UsbNode): number | null => {
      const own = n.busPoweredDrawMa;
      const kids = n.children.map(draw);
      if (own === null || kids.some((k) => k === null)) return null;
      return own + kids.reduce<number>((a, b) => a + (b ?? 0), 0);
    };
    const render = (n: UsbNode): React.ReactNode => {
      const port = g.connectorOf(`${n.unitId}/${n.connectorId}`);
      const sum = n.children.length ? n.children.map(draw) : [];
      const total = sum.some((x) => x === null) ? null : sum.reduce<number>((a, b) => a + (b ?? 0), 0);
      return (
        <li key={`${n.unitId}/${n.connectorId}`}>
          {nick(n.unitId)}{' '}
          {n.audio && (
            <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-900 dark:bg-violet-950 dark:text-violet-200">
              AUDIO
            </span>
          )}{' '}
          {n.busPoweredDrawMa !== 0 && (
            <span className="text-xs text-neutral-500">
              {t('bus-powered {ma}', { ma: n.busPoweredDrawMa === null ? '? mA' : `${n.busPoweredDrawMa} mA` })}
            </span>
          )}
          {n.children.length > 0 && (
            <>
              <span className="ml-1 text-xs text-neutral-500">
                {t('supplies {budget} mA · downstream draw {draw}', {
                  budget: port ? usbBudgetMa(port) : '?',
                  draw: total === null ? t('unknown') : `${total} mA`,
                })}
              </span>
              <ul className="ml-4 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                {n.children.map(render)}
              </ul>
            </>
          )}
        </li>
      );
    };
    const forest = usbForest(g, setup);
    const audio = (n: UsbNode): string[] => [...(n.audio ? [nick(n.unitId)] : []), ...n.children.flatMap(audio)];
    return (
      <div className="h-full overflow-auto p-3 text-sm" aria-label={t('USB tree')}>
        {forest.length === 0 && <p className="text-neutral-500">{t('No USB connections.')}</p>}
        {forest.map((root) => (
          <section key={root.unitId} className="mb-4">
            <h3 className="font-semibold">🖧 {nick(root.unitId)}</h3>
            <ul className="ml-4">{root.children.map(render)}</ul>
            {audio(root).length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                {t('USB audio devices on this host: {list}', { list: audio(root).join(', ') })}
              </p>
            )}
          </section>
        ))}
      </div>
    );
  }

  const watts = (id: string): number | null => modelWatts(modelOf(id));
  const total = (n: PowerNode): { w: number; unknown: number } =>
    n.children.length
      ? n.children.map(total).reduce((a, b) => ({ w: a.w + b.w, unknown: a.unknown + b.unknown }), { w: 0, unknown: 0 })
      : watts(n.unitId) === null
        ? { w: 0, unknown: 1 }
        : { w: watts(n.unitId)!, unknown: 0 };
  const render = (n: PowerNode): React.ReactNode => {
    const supply = n.via
      ? g.connectorOf(
          `${n.via.connection.a.unitId === n.unitId ? n.via.connection.b.unitId : n.via.connection.a.unitId}/${n.via.supplyConnector}`,
        )
      : undefined;
    const tot = total(n);
    return (
      <li key={n.unitId + (n.via?.connection.id ?? '')}>
        {nick(n.unitId)}
        {supply?.psu && <span className="ml-1 text-xs text-neutral-500">← {supply.label}</span>}
        <span className="ml-1 text-xs text-neutral-500">
          ≈{Math.round(tot.w)} W{tot.unknown ? ` + ${tot.unknown} ${t('unknown')}` : ''}
        </span>
        {n.children.length > 0 && (
          <ul className="ml-4 border-l border-neutral-200 pl-2 dark:border-neutral-700">{n.children.map(render)}</ul>
        )}
      </li>
    );
  };
  return (
    <div className="h-full overflow-auto p-3 text-sm" aria-label={t('Power tree')}>
      {powerForest(g, setup).map((root) => {
        const dist = modelOf(root.unitId)?.power.distribution;
        const tot = total(root);
        return (
          <section key={root.unitId} className="mb-4">
            <h3 className="font-semibold">
              ⚡ {nick(root.unitId)}{' '}
              <span className="text-xs font-normal text-neutral-500">
                ≈{Math.round(tot.w)} W{tot.unknown ? ` + ${tot.unknown} ${t('unknown')}` : ''}
                {dist?.voltage && dist.totalCurrentMaMax
                  ? ` / ${Math.round((dist.voltage * dist.totalCurrentMaMax) / 1000)} W ${t('rated')}`
                  : ''}
              </span>
            </h3>
            <ul className="ml-4">{root.children.map(render)}</ul>
          </section>
        );
      })}
    </div>
  );
}
