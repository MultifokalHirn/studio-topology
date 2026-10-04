// Connections of the active setup (Tables tab): label, colour and assign cables (spec §5.7 item 4, §5.14 cable list).
import { useMemo, useState } from 'react';
import { Button, Checkbox, ColorInput, inputCls, LengthInput, Select } from '@/components/ui';
import { autoLabels, connectionDomain, domainPaletteKey, resolveCableColor } from '@/domain/cables';
import type { Connection, SignalDomain } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, useProject } from '@/store';

const FAMILIES: [string, (d: SignalDomain) => boolean][] = [
  ['All', () => true],
  ['Audio', (d) => d.startsWith('audio.')],
  ['MIDI', (d) => d.startsWith('midi.')],
  ['USB / network', (d) => d === 'usb.data' || d === 'ethernet'],
  ['CV / clock', (d) => d === 'cv' || d === 'gate' || d.startsWith('clock.')],
  ['Power', (d) => d.startsWith('power.')],
];

export function ConnectionsTable() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const [family, setFamily] = useState('All');

  const lookups = useMemo(() => {
    const units = new Map(project.inventory.gearUnits.map((u) => [u.id, u]));
    const models = new Map(project.library.gearModels.map((m) => [m.id, m]));
    return {
      units,
      cableModels: new Map(project.library.cableModels.map((c) => [c.id, c])),
      cableUnits: new Map(project.inventory.cables.map((c) => [c.id, c])),
      ends: {
        unitOf: (id: string) => units.get(id),
        modelOf: (id: string) => models.get(units.get(id)?.modelId ?? ''),
      },
    };
  }, [project.inventory, project.library]);

  if (!setup) return <p className="p-4 text-sm text-neutral-500">{t('No active setup.')}</p>;

  const { units, cableModels, cableUnits, ends } = lookups;
  const connector = (unitId: string, connectorId: string) =>
    ends.modelOf(unitId)?.connectors.find((c) => c.id === connectorId);
  const endLabel = (e: Connection['a']) =>
    `${units.get(e.unitId)?.nickname ?? e.unitId} · ${connector(e.unitId, e.connectorId)?.label ?? e.connectorId}`;
  const pred = FAMILIES.find(([f]) => f === family)?.[1] ?? (() => true);
  const rows = setup.connections.filter((c) => pred(connectionDomain(c, ends) ?? 'other'));
  const usedCables = new Map<string, number>();
  for (const c of setup.connections)
    if (c.cable.unitId) usedCables.set(c.cable.unitId, (usedCables.get(c.cable.unitId) ?? 0) + 1);

  const edit = (id: string, recipe: (c: Connection) => void, key?: string) =>
    projectStore.getState().change(
      (p) => {
        const c = p.setups.find((s) => s.id === setup.id)?.connections.find((x) => x.id === id);
        if (c) recipe(c);
      },
      { label: 'Edit connection', ...(key ? { coalesceKey: `${key}:${id}` } : {}) },
    );

  const applyAutoLabels = () => {
    const labels = autoLabels(setup.connections, ends);
    projectStore.getState().change(
      (p) => {
        for (const c of p.setups.find((s) => s.id === setup.id)?.connections ?? []) {
          const l = labels.get(c.id);
          if (l) c.label = l;
        }
      },
      { label: 'Auto-label cables' },
    );
  };

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 p-2 dark:border-neutral-700">
        <h2 className="font-semibold">
          {t('Connections')} · {setup.name}
        </h2>
        <span className="text-xs text-neutral-500">
          {rows.length}/{setup.connections.length}
        </span>
        <div className="w-40">
          <Select
            aria-label={t('Signal filter')}
            value={family}
            options={FAMILIES.map(([f]) => ({ value: f, label: t(f) }))}
            onChange={setFamily}
          />
        </div>
        <span className="flex-1" />
        <Button
          disabled={readOnly}
          onClick={applyAutoLabels}
          title={t('Number unlabelled cables per signal family (A01, M01, P01 …); stereo pairs share a number')}
        >
          {t('Auto-label unlabelled')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1200px] text-xs" aria-label={t('Connections')}>
          <thead className="sticky top-0 bg-neutral-100 text-left text-neutral-500 dark:bg-neutral-800">
            <tr>
              {['Label', 'Colour', 'From', 'To', 'Signal', 'Cable type', 'Owned cable', 'Length', 'On'].map((h) => (
                <th key={h} className="px-1.5 py-1 font-medium">
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const domain = connectionDomain(c, ends) ?? 'other';
              const role = connector(c.a.unitId, c.a.connectorId)?.channel?.role;
              const cableUnit = c.cable.unitId ? cableUnits.get(c.cable.unitId) : undefined;
              const cableModel = c.cable.modelId ? cableModels.get(c.cable.modelId) : undefined;
              const color = resolveCableColor(c, { cableUnit, cableModel, domain, role, settings: project.settings });
              const ownedOptions = project.inventory.cables
                // Matching cable type first; others stay selectable and switch the connection's cable type.
                .map((u) => ({ u, match: !c.cable.modelId || u.modelId === c.cable.modelId }))
                .sort((x, y) => Number(y.match) - Number(x.match))
                .map(({ u, match }) => ({
                  value: u.id,
                  label: `${u.label ? `${u.label} · ` : ''}${cableModels.get(u.modelId)?.name ?? ''} ${u.lengthMm / 1000} m${(usedCables.get(u.id) ?? 0) > 0 && u.id !== c.cable.unitId ? ` (${t('in use')})` : ''}${match ? '' : ` (${t('other type')})`}`,
                }));
              return (
                <tr
                  key={c.id}
                  className={`border-t border-neutral-100 dark:border-neutral-800 ${c.enabled ? '' : 'opacity-40'}`}
                >
                  <td className="w-28 px-1.5">
                    <input
                      aria-label={t('Label for {from}', { from: endLabel(c.a) })}
                      className={inputCls}
                      value={c.label ?? ''}
                      disabled={readOnly}
                      onChange={(e) =>
                        edit(c.id, (x) => void (e.target.value ? (x.label = e.target.value) : delete x.label), 'label')
                      }
                      onBlur={() => projectStore.getState().seal()}
                    />
                  </td>
                  <td className="px-1.5">
                    <span
                      className="inline-flex items-center gap-1"
                      title={
                        c.color ? t('Custom colour') : t('Default: {key}', { key: domainPaletteKey(domain, role) })
                      }
                    >
                      <ColorInput
                        label={t('Colour for {from}', { from: endLabel(c.a) })}
                        value={c.color}
                        fallback={color}
                        onChange={(v) => edit(c.id, (x) => void (v ? (x.color = v) : delete x.color), 'color')}
                      />
                    </span>
                  </td>
                  <td className="px-1.5 whitespace-nowrap">{endLabel(c.a)}</td>
                  <td className="px-1.5 whitespace-nowrap">{endLabel(c.b)}</td>
                  <td className="px-1.5 whitespace-nowrap">
                    <span className="mr-1 inline-block h-2 w-4 rounded-sm align-middle" style={{ background: color }} />
                    {domain}
                  </td>
                  <td className="w-48 px-1.5">
                    <Select
                      aria-label={t('Cable type')}
                      allowEmpty
                      value={c.cable.modelId}
                      options={project.library.cableModels.map((m) => ({
                        value: m.id,
                        label: `${m.name}${m.carries.includes(domain) ? '' : ' ⚠'}`,
                      }))}
                      onChange={(v) =>
                        edit(c.id, (x) => {
                          if (v) x.cable.modelId = v;
                          else delete x.cable.modelId;
                          const u = x.cable.unitId ? cableUnits.get(x.cable.unitId) : undefined;
                          if (u && u.modelId !== v) delete x.cable.unitId;
                        })
                      }
                    />
                  </td>
                  <td className="w-56 px-1.5">
                    <Select
                      aria-label={t('Owned cable')}
                      allowEmpty
                      value={c.cable.unitId}
                      options={ownedOptions}
                      onChange={(v) =>
                        edit(c.id, (x) => {
                          if (!v) return void delete x.cable.unitId;
                          const u = cableUnits.get(v);
                          x.cable.unitId = v;
                          if (u) {
                            x.cable.modelId = u.modelId;
                            x.cable.lengthMm = u.lengthMm;
                            x.cable.autoLength = false;
                            if (!x.label && u.label) x.label = u.label;
                          }
                        })
                      }
                    />
                  </td>
                  <td className="w-24 px-1.5">
                    <LengthInput
                      aria-label={t('Cable length')}
                      unit={project.settings.units.length}
                      nullable
                      valueMm={c.cable.lengthMm ?? null}
                      onChange={(v) =>
                        edit(c.id, (x) => {
                          if (v === null) {
                            delete x.cable.lengthMm;
                            x.cable.autoLength = true;
                          } else {
                            x.cable.lengthMm = v;
                            x.cable.autoLength = false;
                          }
                        })
                      }
                    />
                  </td>
                  <td className="px-1.5">
                    <Checkbox label="" checked={c.enabled} onChange={(v) => edit(c.id, (x) => void (x.enabled = v))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-700">
        {t(
          'Colour precedence: this connection → owned cable → cable type → signal colour. Empty length = computed from the layout (later milestone). ⚠ = cable type does not list this signal.',
        )}
      </p>
    </div>
  );
}
