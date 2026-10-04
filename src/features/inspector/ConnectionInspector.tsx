// Connection inspector (spec §5.7 items 4 and "Port-level inspection").
import { useMemo } from 'react';
import { Button, Checkbox, ColorInput, Field, Select, TextInput } from '@/components/ui';
import { resolveCableColor } from '@/domain/cables';
import type { Connection } from '@/domain/types';
import { compatibility, effectiveConnector, requiredLength, suggestCable } from '@/engine/connections';
import { resolveLayout } from '@/engine/placement';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject } from '@/store';

export function ConnectionInspector({ id }: { id: string }) {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const c = setup?.connections.find((x) => x.id === id);
  const units = useMemo(() => {
    const active = project.setups.find((s) => s.id === project.activeSetupId);
    return active ? resolveLayout(project, active).units : new Map();
  }, [project]);
  if (!setup || !c) return <p className="p-3 text-xs text-neutral-500">{t('Connection not in the active setup.')}</p>;

  const unitOf = (unitId: string) => project.inventory.gearUnits.find((u) => u.id === unitId);
  const modelOf = (unitId: string) => project.library.gearModels.find((m) => m.id === unitOf(unitId)?.modelId);
  const end = (e: Connection['a']) => {
    const raw = modelOf(e.unitId)?.connectors.find((x) => x.id === e.connectorId);
    return raw ? effectiveConnector(raw, setup.unitConfigs[e.unitId]) : undefined;
  };
  const ca = end(c.a);
  const cb = end(c.b);
  if (!ca || !cb)
    return <p className="p-3 text-xs text-red-700">{t('This connection references a missing connector.')}</p>;
  const compat = compatibility(ca, cb);
  const [src, dst] = compat.flow.from === 'a' ? [c.a, c.b] : [c.b, c.a];
  const need = requiredLength(c, units, modelOf, project.settings.cables);
  const options = suggestCable(ca, cb, need, project.library.cableModels);
  const cableModel = project.library.cableModels.find((m) => m.id === c.cable.modelId);
  const cableUnit = project.inventory.cables.find((u) => u.id === c.cable.unitId);
  const color = resolveCableColor(c, {
    cableModel,
    cableUnit,
    domain: ca.domain,
    role: ca.channel?.role,
    settings: project.settings,
  });
  const edit = (label: string, recipe: (x: Connection) => void, key?: string) =>
    projectStore.getState().change(
      (p) => {
        const x = p.setups.find((s) => s.id === setup.id)?.connections.find((y) => y.id === id);
        if (x) recipe(x);
      },
      { label, ...(key ? { coalesceKey: `${key}:${id}` } : {}) },
    );
  const label = (e: Connection['a']) => `${unitOf(e.unitId)?.nickname ?? e.unitId} · ${end(e)?.label ?? e.connectorId}`;
  const usbEnds = [c.a, c.b].filter((e) => end(e)?.usb);

  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <h2 className="font-semibold">
          {c.label ? `${c.label} · ` : ''}
          {t('Connection')}
        </h2>
        <p className="text-xs">
          {label(src)} {compat.flow.kind === 'bidir' ? '↔' : '→'} {label(dst)}
        </p>
        <p className="text-xs text-neutral-500">
          {ca.domain}
          {ca.domain !== cb.domain ? ` → ${cb.domain}` : ''} · {ca.jack} ↔ {cb.jack}
        </p>
        {compat.reasons.length > 0 && (
          <ul
            className={`mt-1 text-xs ${compat.blocked ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
          >
            {compat.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <section className="space-y-1 text-xs">
        <h3 className="font-semibold text-neutral-500 uppercase">{t('Cable')}</h3>
        <p className="text-neutral-500">
          {need === null
            ? t('Length unknown: place both units in the layout.')
            : t('Needs ≈ {mm} mm (Manhattan + {slack}% slack + 2 × {loop} mm loops).', {
                mm: Math.round(need),
                slack: Math.round(project.settings.cables.slack * 100),
                loop: project.settings.cables.serviceLoopMm,
              })}
        </p>
        <Field label={t('Suggested')}>
          {(fid) => (
            <Select
              id={fid}
              allowEmpty
              value={
                options.find((o) => o.cableModelId === c.cable.modelId && o.adapters.join() === c.cable.adapters.join())
                  ? `${c.cable.modelId}|${c.cable.adapters.join(',')}`
                  : undefined
              }
              options={options
                .filter((o) => o.cableModelId)
                .map((o) => ({
                  value: `${o.cableModelId}|${o.adapters.join(',')}`,
                  label: `${project.library.cableModels.find((m) => m.id === o.cableModelId)?.name}${o.adapters.length ? ` + ${o.adapters.map((a) => project.library.cableModels.find((m) => m.id === a)?.name).join(', ')}` : ''}${o.lengthMm ? ` · ${o.lengthMm / 1000} m` : ''}${o.noStockedLength ? ' ⚠' : ''}`,
                }))}
              onChange={(v) => {
                const o = options.find((x) => `${x.cableModelId}|${x.adapters.join(',')}` === v);
                if (!o) return;
                edit('Choose cable', (x) => {
                  x.cable.modelId = o.cableModelId;
                  x.cable.adapters = o.adapters;
                  if (o.lengthMm) x.cable.lengthMm = o.lengthMm;
                  x.cable.autoLength = true;
                  delete x.cable.unitId;
                });
              }}
            />
          )}
        </Field>
        {options[0] && options[0].kind !== 'cable' && options[0].kind !== 'cable+adapter' && (
          <p className={options[0].score === 0 ? 'text-red-700' : 'text-neutral-500'}>
            {[
              t(
                options[0].kind === 'captive'
                  ? 'Direct plug-in (captive lead)'
                  : options[0].kind === 'wireless'
                    ? 'Wireless'
                    : 'Unverified fit',
              ),
              ...options[0].notes,
            ].join(' · ')}
          </p>
        )}
        {options.length === 0 && (
          <p className="text-red-700">
            {t('No cable or adapter in the library mates {a} with {b} (PHYS-001).', { a: ca.jack, b: cb.jack })}
          </p>
        )}
        <p>
          {cableModel ? cableModel.name : t('No cable chosen')}
          {c.cable.adapters.length
            ? ` + ${c.cable.adapters.map((a) => project.library.cableModels.find((m) => m.id === a)?.name ?? a).join(', ')}`
            : ''}
          {c.cable.lengthMm ? ` · ${c.cable.lengthMm / 1000} m` : ''}
        </p>
        <Field label={t('Owned cable')}>
          {(fid) => (
            <Select
              id={fid}
              allowEmpty
              value={c.cable.unitId}
              options={project.inventory.cables.map((u) => ({
                value: u.id,
                label: `${u.label ? `${u.label} · ` : ''}${project.library.cableModels.find((m) => m.id === u.modelId)?.name ?? ''} ${u.lengthMm / 1000} m`,
              }))}
              onChange={(v) =>
                edit('Assign cable', (x) => {
                  const u = project.inventory.cables.find((y) => y.id === v);
                  if (!u) return void delete x.cable.unitId;
                  x.cable.unitId = u.id;
                  x.cable.modelId = u.modelId;
                  x.cable.lengthMm = u.lengthMm;
                  x.cable.autoLength = false;
                })
              }
            />
          )}
        </Field>
      </section>

      <section className="grid grid-cols-[1fr_auto] items-end gap-2 text-xs">
        <Field label={t('Label')}>
          {(fid) => (
            <TextInput
              id={fid}
              value={c.label ?? ''}
              onChange={(v) => edit('Label', (x) => void (v ? (x.label = v) : delete x.label), 'label')}
            />
          )}
        </Field>
        <ColorInput
          label={t('Cable colour')}
          value={c.color}
          fallback={color}
          onChange={(v) => edit('Colour', (x) => void (v ? (x.color = v) : delete x.color))}
        />
      </section>

      {c.midi && (
        <section className="space-y-1 text-xs">
          <h3 className="font-semibold text-neutral-500 uppercase">MIDI</h3>
          <Field label={t('Channels (1–16, comma-separated, or omni / per-track)')}>
            {(fid) => (
              <TextInput
                id={fid}
                value={Array.isArray(c.midi!.channels) ? c.midi!.channels.join(', ') : c.midi!.channels}
                onChange={(v) =>
                  edit(
                    'MIDI channels',
                    (x) => {
                      const s = v.trim().toLowerCase();
                      if (s === 'omni' || s === 'per-track') x.midi!.channels = s;
                      else {
                        const n = s.split(/[ ,]+/).filter(Boolean).map(Number);
                        if (n.every((k) => Number.isInteger(k))) x.midi!.channels = n;
                      }
                    },
                    'midi',
                  )
                }
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            {(['notes', 'cc', 'pc', 'clock', 'transport', 'sysex'] as const).map((p) => (
              <Checkbox
                key={p}
                label={p}
                checked={c.midi!.purposes.includes(p)}
                onChange={(on) =>
                  edit(
                    'MIDI purposes',
                    (x) =>
                      void (x.midi!.purposes = on ? [...x.midi!.purposes, p] : x.midi!.purposes.filter((q) => q !== p)),
                  )
                }
              />
            ))}
          </div>
        </section>
      )}
      {usbEnds.length === 2 && (
        <Field label={t('USB host')}>
          {(fid) => (
            <Select
              id={fid}
              allowEmpty
              value={c.usb?.hostUnitId}
              options={usbEnds.map((e) => ({ value: e.unitId, label: unitOf(e.unitId)?.nickname ?? e.unitId }))}
              onChange={(v) => edit('USB host', (x) => void (v ? (x.usb = { hostUnitId: v }) : delete x.usb))}
            />
          )}
        </Field>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={c.enabled}
          onChange={(v) => edit('Enable connection', (x) => void (x.enabled = v))}
          label={t('Enabled')}
        />
        <span className="flex-1" />
        <Button
          variant="danger"
          disabled={readOnly}
          onClick={() => {
            projectStore.getState().change(
              (p) => {
                const s = p.setups.find((x) => x.id === setup.id);
                if (s) s.connections = s.connections.filter((x) => x.id !== id);
              },
              { label: 'Delete connection' },
            );
            uiStore.getState().select(null);
          }}
        >
          {t('Delete')}
        </Button>
      </div>
    </div>
  );
}
