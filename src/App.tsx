import { useEffect, useState } from 'react';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceFloppy,
  IconFile,
  IconFolderOpen,
  IconMoon,
  IconSun,
} from '@tabler/icons-react';
import { t } from './i18n';
import { projectStore, uiStore, useProject, useUi } from './store';
import { isDirty } from './store/projectStore';
import type { CanvasTab, SidebarTab } from './store/uiStore';
import { applyLoadedText, newProject, openProject, type PendingLoad, saveProject } from './features/project/actions';
import { LoadErrorDialog } from './features/project/LoadErrorDialog';
import { useAutosave, useRecoverySnapshot } from './features/project/useAutosave';

const SIDEBAR_TABS: [SidebarTab, string][] = [
  ['inventory', 'Inventory'],
  ['library', 'Library'],
  ['setups', 'Setups'],
  ['issues', 'Issues'],
];
const CANVAS_TABS: [CanvasTab, string][] = [
  ['layout', 'Layout'],
  ['patch', 'Patch'],
  ['face', 'Face'],
  ['tables', 'Tables'],
];

function ToolButton(props: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded p-1 hover:bg-neutral-200 disabled:opacity-40 dark:hover:bg-neutral-800"
    >
      {props.children}
    </button>
  );
}

export function App() {
  const dark = useUi((s) => s.darkMode);
  const sidebarTab = useUi((s) => s.sidebarTab);
  const canvasTab = useUi((s) => s.canvasTab);
  const name = useProject((s) => s.project.meta.name);
  const dirty = useProject(isDirty);
  const readOnly = useProject((s) => s.readOnly);
  const canUndo = useProject((s) => s.history.past.length > 0);
  const canRedo = useProject((s) => s.history.future.length > 0);
  const lastAutosaveAt = useProject((s) => s.lastAutosaveAt);
  const lengthUnit = useProject((s) => s.project.settings.units.length);
  const [pending, setPending] = useState<PendingLoad | null>(null);
  const [recovery, dismissRecovery] = useRecoverySnapshot();

  useAutosave();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) projectStore.getState().undo();
      else if (key === 'y' || (key === 'z' && e.shiftKey)) projectStore.getState().redo();
      else if (key === 's') void saveProject(e.shiftKey);
      else if (key === 'o') void openProject().then(setPending);
      else return;
      e.preventDefault();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty(projectStore.getState())) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  const confirmDiscard = () => !isDirty(projectStore.getState()) || window.confirm(t('Discard unsaved changes?'));

  return (
    <div className={dark ? 'dark h-full' : 'h-full'}>
      <div className="flex h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <header className="flex items-center gap-1 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-700">
          <h1 className="mr-2 text-sm font-semibold">{t('Studio Planner')}</h1>
          <span className="text-sm text-neutral-600 dark:text-neutral-300" data-testid="project-name">
            {name}
            {dirty && (
              <span aria-label={t('Unsaved changes')} title={t('Unsaved changes')}>
                {' '}
                •
              </span>
            )}
          </span>
          {readOnly && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
              {t('Read-only')}
            </span>
          )}
          <div className="ml-4 flex items-center gap-0.5">
            <ToolButton label={t('New project')} onClick={() => confirmDiscard() && newProject()}>
              <IconFile size={18} />
            </ToolButton>
            <ToolButton label={t('Open…')} onClick={() => confirmDiscard() && void openProject().then(setPending)}>
              <IconFolderOpen size={18} />
            </ToolButton>
            <ToolButton label={t('Save')} disabled={readOnly} onClick={() => void saveProject()}>
              <IconDeviceFloppy size={18} />
            </ToolButton>
            <button
              type="button"
              className="rounded px-1.5 py-1 text-xs hover:bg-neutral-200 disabled:opacity-40 dark:hover:bg-neutral-800"
              disabled={readOnly}
              onClick={() => void saveProject(true)}
            >
              {t('Save as…')}
            </button>
            <span className="mx-1 h-5 w-px bg-neutral-300 dark:bg-neutral-700" />
            <ToolButton label={t('Undo')} disabled={!canUndo} onClick={() => projectStore.getState().undo()}>
              <IconArrowBackUp size={18} />
            </ToolButton>
            <ToolButton label={t('Redo')} disabled={!canRedo} onClick={() => projectStore.getState().redo()}>
              <IconArrowForwardUp size={18} />
            </ToolButton>
          </div>
          <div className="flex-1" />
          <ToolButton label={t('Toggle theme')} onClick={() => uiStore.getState().setDarkMode(!dark)}>
            {dark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </ToolButton>
        </header>

        {recovery && (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-3 py-1.5 text-xs dark:border-blue-900 dark:bg-blue-950"
          >
            <span>
              {t('An autosaved version of "{name}" from {time} is available.', {
                name: recovery.projectName,
                time: recovery.savedAt.replace('T', ' ').slice(0, 19),
              })}
            </span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => {
                setPending(applyLoadedText(recovery.text, `${recovery.projectName} (recovered)`));
                dismissRecovery();
              }}
            >
              {t('Restore')}
            </button>
            <button type="button" className="underline" onClick={dismissRecovery}>
              {t('Dismiss')}
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className="w-64 border-r border-neutral-200 dark:border-neutral-700" aria-label={t('Sidebar')}>
            <nav className="flex border-b border-neutral-200 text-xs dark:border-neutral-700" role="tablist">
              {SIDEBAR_TABS.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={sidebarTab === id}
                  className={`flex-1 px-2 py-1.5 ${sidebarTab === id ? 'font-semibold' : 'text-neutral-500'}`}
                  onClick={() => uiStore.getState().setSidebarTab(id)}
                >
                  {t(label)}
                </button>
              ))}
            </nav>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <nav className="flex gap-1 border-b border-neutral-200 px-2 text-xs dark:border-neutral-700" role="tablist">
              {CANVAS_TABS.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={canvasTab === id}
                  className={`px-3 py-1.5 ${canvasTab === id ? 'border-b-2 border-current font-semibold' : 'text-neutral-500'}`}
                  onClick={() => uiStore.getState().setCanvasTab(id)}
                >
                  {t(label)}
                </button>
              ))}
            </nav>
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
              {t('{view} view', { view: t(CANVAS_TABS.find(([id]) => id === canvasTab)?.[1] ?? '') })}
            </div>
          </main>
          <aside className="w-72 border-l border-neutral-200 dark:border-neutral-700" aria-label={t('Inspector')} />
        </div>

        <footer className="flex gap-4 border-t border-neutral-200 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-700">
          <span>{lengthUnit}</span>
          <span className="flex-1" />
          {lastAutosaveAt && (
            <span>{t('Autosaved {time}', { time: new Date(lastAutosaveAt).toLocaleTimeString() })}</span>
          )}
        </footer>
      </div>
      {pending && <LoadErrorDialog pending={pending} onClose={() => setPending(null)} />}
    </div>
  );
}
