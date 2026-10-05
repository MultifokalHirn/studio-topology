// Command palette (Ctrl/Cmd+K, spec §5.1) and the shortcut sheet (`?`, spec §5.16).
import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { t } from '@/i18n';
import { uiStore } from '@/store';
import type { PendingLoad } from '../project/actions';
import { buildCommands, CANVAS_SHORTCUTS, matches } from './commands';

export function CommandPalette({ onPending }: { onPending: (p: PendingLoad | null) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const all = useMemo(() => buildCommands(onPending), [onPending]);
  const list = all.filter((c) => matches(query, `${c.group} ${c.label}`) && (c.enabled?.() ?? true));
  const close = () => uiStore.getState().setDialog(null);
  const run = (i: number) => {
    const c = list[i];
    if (!c) return;
    close();
    c.run();
  };
  return (
    <Dialog.Root open onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-24 left-1/2 z-50 w-[560px] -translate-x-1/2 overflow-hidden rounded-lg bg-white text-sm text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100"
        >
          <Dialog.Title className="sr-only">{t('Command palette')}</Dialog.Title>
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={list[active] ? `cmd-${list[active].id}` : undefined}
            aria-label={t('Search commands')}
            placeholder={t('Type a command…')}
            className="w-full border-b border-neutral-200 bg-transparent px-4 py-3 outline-none dark:border-neutral-700"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, list.length - 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              else if (e.key === 'Enter') run(active);
              else return;
              e.preventDefault();
            }}
          />
          <ul id="command-list" role="listbox" aria-label={t('Commands')} className="max-h-96 overflow-auto py-1">
            {list.length === 0 && <li className="px-4 py-2 text-neutral-500">{t('No matching command.')}</li>}
            {list.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                className={clsx(
                  'flex cursor-pointer items-center gap-2 px-4 py-1.5',
                  i === active && 'bg-neutral-100 dark:bg-neutral-800',
                )}
                onMouseMove={() => setActive(i)}
                onClick={() => run(i)}
              >
                <span className="w-16 text-xs text-neutral-500">{t(c.group)}</span>
                <span className="flex-1">{t(c.label)}</span>
                {c.keys && (
                  <kbd className="rounded border border-neutral-300 px-1 text-xs dark:border-neutral-600">{c.keys}</kbd>
                )}
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ShortcutSheet() {
  const close = () => uiStore.getState().setDialog(null);
  const global = buildCommands(() => undefined).filter((c) => c.keys);
  return (
    <Modal title={t('Keyboard shortcuts')} wide onClose={close} footer={<Button onClick={close}>{t('Close')}</Button>}>
      <div className="grid grid-cols-2 gap-6 text-sm">
        <table aria-label={t('Global shortcuts')}>
          <caption className="mb-1 text-left text-xs font-semibold text-neutral-500 uppercase">{t('Global')}</caption>
          <tbody>
            {global.map((c) => (
              <tr key={c.id}>
                <td className="py-0.5 pr-3">
                  <kbd className="rounded border border-neutral-300 px-1 text-xs dark:border-neutral-600">{c.keys}</kbd>
                </td>
                <td>{t(c.label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table aria-label={t('Canvas shortcuts')}>
          <caption className="mb-1 text-left text-xs font-semibold text-neutral-500 uppercase">{t('Canvas')}</caption>
          <tbody>
            {CANVAS_SHORTCUTS.map(([k, label]) => (
              <tr key={k}>
                <td className="py-0.5 pr-3">
                  <kbd className="rounded border border-neutral-300 px-1 text-xs dark:border-neutral-600">{k}</kbd>
                </td>
                <td>{t(label)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
