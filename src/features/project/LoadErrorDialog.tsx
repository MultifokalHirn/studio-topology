import * as Dialog from '@radix-ui/react-dialog';
import { t } from '@/i18n';
import { loadReadOnly, type PendingLoad } from './actions';

export function LoadErrorDialog({ pending, onClose }: { pending: PendingLoad; onClose: () => void }) {
  const { result, fileName } = pending;
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[80vh] w-[640px] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg bg-white p-5 text-sm text-neutral-900 shadow-xl dark:bg-neutral-800 dark:text-neutral-100">
          <Dialog.Title className="mb-1 text-base font-semibold">
            {t('Could not open {file}', { file: fileName })}
          </Dialog.Title>
          <Dialog.Description className="mb-3">{result.message}</Dialog.Description>
          {result.issues.length > 0 && (
            <table className="mb-4 w-full font-mono text-xs">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pr-2">{t('Path')}</th>
                  <th className="pr-2">{t('Value')}</th>
                  <th>{t('Problem')}</th>
                </tr>
              </thead>
              <tbody>
                {result.issues.slice(0, 50).map((issue) => (
                  <tr key={issue.path + issue.message} className="align-top">
                    <td className="pr-2 break-all">{issue.path}</td>
                    <td className="pr-2 break-all">{issue.value === undefined ? '' : JSON.stringify(issue.value)}</td>
                    <td>{issue.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-3 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={onClose}
            >
              {t('Cancel')}
            </button>
            {result.raw !== undefined && (
              <button
                type="button"
                className="rounded bg-neutral-900 px-3 py-1.5 text-white dark:bg-neutral-100 dark:text-neutral-900"
                onClick={() => {
                  loadReadOnly(pending);
                  onClose();
                }}
              >
                {t('Load anyway (read-only)')}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
