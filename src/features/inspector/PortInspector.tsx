// Port-level inspection (spec §5.7): specs, verification status and connections of one connector.
import { ProvenanceBadge } from '@/components/ui';
import { isConnectorPlaced } from '@/domain/faces';
import { provenanceFor } from '@/domain/integrity';
import { effectiveConnector } from '@/engine/connections';
import { t } from '@/i18n';
import { uiStore, useProject } from '@/store';
import { TraceBlock } from './TraceBlock';

export function PortInspector({ id }: { id: string }) {
  const project = useProject((s) => s.project);
  const [unitId, connectorId] = id.split('/') as [string, string];
  const unit = project.inventory.gearUnits.find((u) => u.id === unitId);
  const model = project.library.gearModels.find((m) => m.id === unit?.modelId);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const index = model?.connectors.findIndex((c) => c.id === connectorId) ?? -1;
  const raw = model?.connectors[index];
  if (!unit || !model || !raw) return null;
  const c = effectiveConnector(raw, setup?.unitConfigs[unitId]);
  const conns =
    setup?.connections.filter(
      (x) =>
        (x.a.unitId === unitId && x.a.connectorId === connectorId) ||
        (x.b.unitId === unitId && x.b.connectorId === connectorId),
    ) ?? [];
  const other = (x: (typeof conns)[number]) => (x.a.unitId === unitId && x.a.connectorId === connectorId ? x.b : x.a);
  const nick = (uid: string) => project.inventory.gearUnits.find((u) => u.id === uid)?.nickname ?? uid;
  const row = (k: string, v: React.ReactNode) =>
    v === undefined || v === '' ? null : (
      <>
        <dt className="text-neutral-500">{k}</dt>
        <dd>{v}</dd>
      </>
    );
  return (
    <div className="space-y-3 p-3 text-sm">
      <div>
        <h2 className="font-semibold">
          {unit.nickname} · {c.label}
        </h2>
        <p className="text-xs text-neutral-500">
          {c.domain} · {c.direction} · {c.jack}{' '}
          <ProvenanceBadge prov={provenanceFor(model.provenance, `connectors.${index}.jack`)} />
        </p>
      </div>
      <dl className="grid grid-cols-[90px_1fr] gap-y-0.5 text-xs">
        {row(
          t('Face'),
          `${c.face} · ${isConnectorPlaced(model, index) ? `${c.pos.x}, ${c.pos.y} mm` : t('position not placed')}`,
        )}
        {row(
          t('Signal'),
          c.signal
            ? [c.signal.balance, c.signal.level, c.signal.maxDbu !== undefined ? `${c.signal.maxDbu} dBu max` : '']
                .filter(Boolean)
                .join(' · ')
            : undefined,
        )}
        {row(
          t('Channel'),
          c.channel
            ? [c.channel.role, c.channel.group, c.channel.index].filter((v) => v !== undefined).join(' · ')
            : undefined,
        )}
        {row('MIDI', c.midi ? [c.midi.carries.join(', '), c.midi.thruMode].filter(Boolean).join(' · ') : undefined)}
        {row(
          'USB',
          c.usb
            ? [
                c.usb.role,
                c.usb.version,
                c.usb.carries.join('+'),
                c.usb.audio
                  ? `${c.usb.audio.inChannels ?? '?'}/${c.usb.audio.outChannels ?? '?'} ch ${c.usb.audio.compliance}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined,
        )}
        {row(
          t('Clock'),
          c.clock
            ? [c.clock.format, c.clock.ppqn ? `${c.clock.ppqn} ppqn` : '', c.clock.note].filter(Boolean).join(' · ')
            : undefined,
        )}
        {row(
          t('Supply'),
          c.psu
            ? `${c.psu.voltage ?? '?'} V · ${c.psu.currentMaMax ?? '?'} mA${c.psu.polarity ? ` · ${c.psu.polarity}` : ''}`
            : undefined,
        )}
        {row(t('Alternates'), c.alternates?.map((a) => a.label).join(', '))}
        {row(t('Notes'), c.notes)}
      </dl>
      <TraceBlock nodeKey={id} />
      <section>
        <h3 className="mb-1 text-xs font-semibold text-neutral-500 uppercase">
          {t('Connections')} ({conns.length})
        </h3>
        <ul className="space-y-0.5 text-xs">
          {conns.map((x) => (
            <li key={x.id}>
              <button
                className="text-left underline"
                onClick={() => uiStore.getState().select({ kind: 'connection', id: x.id })}
              >
                {x.label ? `${x.label}: ` : ''}
                {nick(other(x).unitId)} · {other(x).connectorId}
                {x.cable.lengthMm ? ` · ${x.cable.lengthMm / 1000} m` : ''}
                {x.cable.adapters.length ? ` + ${x.cable.adapters.length} adapter` : ''}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
