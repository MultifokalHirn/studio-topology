// Connector table (spec §5.3 item 3): templates, L/R pair helper, duplicate with offset, reorder, advanced JSON.
import { IconArrowDown, IconArrowUp, IconCopy, IconTrash } from '@tabler/icons-react';
import clsx from 'clsx';
import { useState } from 'react';
import { Button, inputCls, NumberInput, Select } from '@/components/ui';
import {
  Connector as ConnectorSchema,
  Direction,
  FaceId,
  FixedJackType,
  SignalDomain,
  SignalLevel,
} from '@/domain/schemas';
import { instantiateConnectorTemplate } from '@/domain/templates';
import type { Connector } from '@/domain/types';
import { t } from '@/i18n';
import { builtInTemplates } from '../library/catalog';
import type { EditorApi } from './GearEditor';
import { JsonEditor } from './JsonEditor';

const connectorTemplates = builtInTemplates.filter((x) => x.target === 'connectors');
const BALANCE = ['balanced', 'imp-balanced', 'unbalanced', 'n/a'] as const;
const ROLES = ['mono', 'L', 'R', 'numbered', 'stereo'] as const;
const JACK_LIST_ID = 'jack-types';

function uniqueId(base: string, taken: Set<string>) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function ConnectorsSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const [sel, setSel] = useState<number | null>(m.connectors.length ? 0 : null);
  const [tplId, setTplId] = useState(connectorTemplates[0]?.id ?? '');
  const ids = new Set(m.connectors.map((c) => c.id));
  const dupIds = new Set(m.connectors.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i));
  const selected = sel !== null ? m.connectors[sel] : undefined;

  const set = (i: number, recipe: (c: Connector) => void, stampKey?: string) =>
    update((d) => recipe(d.connectors[i]!), stampKey ? [`connectors.${i}.${stampKey}`] : undefined);

  const add = (list: Connector[]) => {
    update((d) => void d.connectors.push(...list));
    setSel(m.connectors.length);
  };

  const makePair = (i: number) => {
    const c = m.connectors[i]!;
    const base = c.id.replace(/-(l|r|mono)$/, '');
    const group = c.channel?.group ?? base;
    const mk = (role: 'L' | 'R'): Connector => ({
      ...structuredClone(c),
      id: uniqueId(`${base}-${role.toLowerCase()}`, new Set([...ids].filter((x) => x !== c.id))),
      label: `${c.label.replace(/\s+(L|R|mono)$/i, '')} ${role}`,
      channel: { ...c.channel, role, group },
    });
    const l = mk('L');
    const r = { ...mk('R'), pos: { x: c.pos.x + 20, y: c.pos.y } };
    if (r.id === l.id) r.id = uniqueId(r.id, new Set([l.id]));
    update((d) => void d.connectors.splice(i, 1, l, r));
  };

  const duplicate = (i: number) => {
    const c = m.connectors[i]!;
    const copy: Connector = { ...structuredClone(c), id: uniqueId(c.id, ids), pos: { x: c.pos.x + 20, y: c.pos.y } };
    update((d) => void d.connectors.splice(i + 1, 0, copy));
    setSel(i + 1);
  };

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= m.connectors.length) return;
    update((d) => {
      const [c] = d.connectors.splice(i, 1);
      d.connectors.splice(j, 0, c!);
    });
    setSel(j);
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">
        {t('Connectors')} ({m.connectors.length})
      </h3>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <Button
          onClick={() =>
            add([
              {
                id: uniqueId('conn', ids),
                label: t('New connector'),
                face: 'back',
                pos: { x: 0, y: 0 },
                domain: 'audio.analog',
                direction: 'out',
                jack: 'jack-6.35-TRS',
              },
            ])
          }
        >
          {t('Add connector')}
        </Button>
        <span className="ml-2 text-xs text-neutral-500">{t('From template')}</span>
        <div className="w-64">
          <Select
            aria-label={t('Connector template')}
            value={tplId}
            options={connectorTemplates.map((x) => ({ value: x.id, label: x.name }))}
            onChange={setTplId}
          />
        </div>
        <Button
          onClick={() => {
            const tpl = connectorTemplates.find((x) => x.id === tplId);
            if (tpl) add(instantiateConnectorTemplate(tpl, ids));
          }}
        >
          {t('Add group')}
        </Button>
      </div>

      <datalist id={JACK_LIST_ID}>
        {[...FixedJackType.options, 'dc-barrel-5.5x2.5', 'dc-barrel-5.5x2.1', 'dc-barrel-3.5x1.3'].map((j) => (
          <option key={j} value={j} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-700">
        <table className="w-full min-w-[1500px] text-xs" aria-label={t('Connectors')}>
          <thead className="bg-neutral-100 text-left text-neutral-500 dark:bg-neutral-800">
            <tr>
              {[
                'ID',
                'Label',
                'Face',
                'Domain',
                'Dir',
                'Jack',
                'Balance',
                'Level',
                'Role',
                'Group',
                'x mm',
                'y mm',
                '',
              ].map((h) => (
                <th key={h} className="px-1 py-1 font-medium">
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.connectors.map((c, i) => (
              <tr
                key={i}
                onFocus={() => setSel(i)}
                onClick={() => setSel(i)}
                className={clsx(
                  'border-t border-neutral-100 dark:border-neutral-800',
                  sel === i && 'bg-blue-50 dark:bg-blue-950',
                )}
              >
                <td className="w-28 px-1">
                  <input
                    aria-label={t('Connector id')}
                    className={clsx(inputCls, dupIds.has(c.id) && 'border-red-500')}
                    value={c.id}
                    onChange={(e) => set(i, (x) => void (x.id = e.target.value))}
                  />
                </td>
                <td className="w-36 px-1">
                  <input
                    aria-label={t('Connector label')}
                    className={inputCls}
                    value={c.label}
                    onChange={(e) => set(i, (x) => void (x.label = e.target.value))}
                  />
                </td>
                <td className="px-1">
                  <Select
                    aria-label={t('Face')}
                    value={c.face}
                    options={FaceId.options}
                    onChange={(v) => set(i, (x) => void (x.face = v))}
                  />
                </td>
                <td className="px-1">
                  <Select
                    aria-label={t('Domain')}
                    value={c.domain}
                    options={SignalDomain.options}
                    onChange={(v) => set(i, (x) => void (x.domain = v))}
                  />
                </td>
                <td className="px-1">
                  <Select
                    aria-label={t('Direction')}
                    value={c.direction}
                    options={Direction.options}
                    onChange={(v) => set(i, (x) => void (x.direction = v))}
                  />
                </td>
                <td className="w-32 px-1">
                  <input
                    aria-label={t('Jack')}
                    list={JACK_LIST_ID}
                    className={clsx(
                      inputCls,
                      !ConnectorSchema.shape.jack.safeParse(c.jack).success && 'border-red-500',
                    )}
                    value={c.jack}
                    onChange={(e) => set(i, (x) => void (x.jack = e.target.value as Connector['jack']))}
                  />
                </td>
                <td className="px-1">
                  <Select
                    aria-label={t('Balance')}
                    allowEmpty
                    value={c.signal?.balance}
                    options={BALANCE}
                    onChange={(v) =>
                      set(i, (x) => void (v ? (x.signal = { ...x.signal, balance: v }) : delete x.signal))
                    }
                  />
                </td>
                <td className="px-1">
                  <Select
                    aria-label={t('Level')}
                    allowEmpty
                    value={c.signal?.level}
                    options={SignalLevel.options}
                    onChange={(v) =>
                      set(i, (x) => {
                        x.signal = { balance: x.signal?.balance ?? 'n/a', ...x.signal };
                        if (v) x.signal.level = v;
                        else delete x.signal.level;
                      })
                    }
                  />
                </td>
                <td className="px-1">
                  <Select
                    aria-label={t('Channel role')}
                    allowEmpty
                    value={c.channel?.role}
                    options={ROLES}
                    onChange={(v) =>
                      set(i, (x) => void (v ? (x.channel = { ...x.channel, role: v }) : delete x.channel))
                    }
                  />
                </td>
                <td className="w-20 px-1">
                  <input
                    aria-label={t('Stereo group')}
                    className={inputCls}
                    value={c.channel?.group ?? ''}
                    onChange={(e) =>
                      set(i, (x) => {
                        x.channel = { role: x.channel?.role ?? 'mono', ...x.channel };
                        if (e.target.value) x.channel.group = e.target.value;
                        else delete x.channel.group;
                      })
                    }
                  />
                </td>
                <td className="w-16 px-1">
                  <NumberInput
                    aria-label={t('x mm')}
                    value={c.pos.x}
                    onChange={(v) => set(i, (x) => void (x.pos.x = v ?? 0), 'pos')}
                  />
                </td>
                <td className="w-16 px-1">
                  <NumberInput
                    aria-label={t('y mm')}
                    value={c.pos.y}
                    onChange={(v) => set(i, (x) => void (x.pos.y = v ?? 0), 'pos')}
                  />
                </td>
                <td className="px-1 whitespace-nowrap">
                  <button aria-label={t('Move up')} className="p-0.5" onClick={() => move(i, -1)}>
                    <IconArrowUp size={13} />
                  </button>
                  <button aria-label={t('Move down')} className="p-0.5" onClick={() => move(i, 1)}>
                    <IconArrowDown size={13} />
                  </button>
                  <button aria-label={t('Duplicate connector')} className="p-0.5" onClick={() => duplicate(i)}>
                    <IconCopy size={13} />
                  </button>
                  <button
                    aria-label={t('Delete connector')}
                    className="p-0.5 text-red-700"
                    onClick={() => {
                      update((d) => void d.connectors.splice(i, 1));
                      setSel(null);
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && sel !== null && (
        <div className="mt-3 grid grid-cols-[1fr_220px] gap-3">
          <JsonEditor
            key={sel}
            label={t('Advanced: {id} (MIDI, USB, clock, CV, PSU rating, insert, alternates, exclusiveWith, notes)', {
              id: selected.id,
            })}
            value={selected}
            schema={ConnectorSchema}
            rows={14}
            onApply={(v) => update((d) => void (d.connectors[sel] = v))}
          />
          <div className="space-y-1">
            <Button className="w-full" onClick={() => makePair(sel)}>
              {t('Make L/R pair')}
            </Button>
            <Button className="w-full" onClick={() => duplicate(sel)}>
              {t('Duplicate with offset')}
            </Button>
            <p className="text-xs text-neutral-500">
              {t(
                'Positions are mm, face-local: origin top-left of the face as seen from outside. The back face is mirrored relative to the front.',
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
