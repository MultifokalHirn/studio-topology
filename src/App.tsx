import { useEffect, useState } from 'react';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCommand,
  IconDeviceFloppy,
  IconFile,
  IconFileExport,
  IconFolderOpen,
  IconKeyboard,
  IconMoon,
  IconSettings,
  IconSparkles,
  IconSun,
} from '@tabler/icons-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { listArrowNav } from './components/listNav';
import { t } from './i18n';
import { projectStore, uiStore, useProject, useUi } from './store';
import { isDirty } from './store/projectStore';
import { GearEditorHost } from './features/gear-editor/GearEditor';
import { Inspector } from './features/inspector/Inspector';
import { TablesView } from './features/tables/TablesView';
import { CompareView } from './features/setups/CompareView';
import { FaceView } from './features/face/FaceView';
import { LayoutView } from './features/layout/LayoutView';
import { PatchView } from './features/patch/PatchView';
import { SetupsPanel } from './features/setups/SetupsPanel';
import { InventoryPanel } from './features/library/InventoryPanel';
import { LibraryPanel } from './features/library/LibraryPanel';
import { IssuesPanel, ValidationBadge } from './features/issues/IssuesPanel';
import {
  applyLoadedText,
  loadSample,
  newProject,
  openProject,
  type PendingLoad,
  saveProject,
} from './features/project/actions';
import { LoadErrorDialog } from './features/project/LoadErrorDialog';
import { useAutosave, useRecoverySnapshot } from './features/project/useAutosave';
import { CommandPalette, ShortcutSheet } from './features/commands/CommandPalette';
import { CANVAS_TABS, duplicateSelectedUnit, SIDEBAR_TABS, toggleAB } from './features/commands/commands';
import { ExportDialog } from './features/reports/ExportDialog';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { StatusBar } from './features/project/StatusBar';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement ||
  t instanceof HTMLTextAreaElement ||
  t instanceof HTMLSelectElement ||
  (t instanceof HTMLElement && t.isContentEditable);

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
  const theme = useProject((s) => s.project.settings.theme);
  const dialog = useUi((s) => s.dialog);
  const setups = useProject((s) => s.project.setups);
  const activeSetupId = useProject((s) => s.project.activeSetupId);
  const [pending, setPending] = useState<PendingLoad | null>(null);
  // Remember the previously active setup for the A/B toggle.
  const [lastActive, setLastActive] = useState(activeSetupId);
  if (lastActive !== activeSetupId) {
    if (lastActive) uiStore.getState().setPreviousSetupId(lastActive);
    setLastActive(activeSetupId);
  }
  const [recovery, dismissRecovery, snapshotsChecked] = useRecoverySnapshot();

  useAutosave();

  // The project's theme setting applies on load and when changed; the top-bar toggle overrides it for the session.
  useEffect(() => {
    if (theme !== 'system') uiStore.getState().setDarkMode(theme === 'dark');
    else uiStore.getState().setDarkMode(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  }, [theme]);

  // First launch (nothing autosaved): start with the sample studio built from the gear reference.
  useEffect(() => {
    if (snapshotsChecked && !recovery && projectStore.getState().revision === 0 && !projectStore.getState().fileName)
      void loadSample().then((p) => p && setPending(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotsChecked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = uiStore.getState();
      const dialogOpen = !!document.querySelector('[role="dialog"]');
      if (!mod && !e.altKey && !isTyping(e.target) && !dialogOpen) {
        const tab = CANVAS_TABS[Number(e.key) - 1];
        if (e.key === '\\') toggleAB();
        else if (e.key === '?') ui.setDialog('shortcuts');
        else if ((e.key === 'l' || e.key === 'L') && !e.shiftKey) ui.setLegend(!ui.legend);
        else if (tab && /^[1-5]$/.test(e.key)) ui.setCanvasTab(tab[0]);
        else return;
        e.preventDefault();
        return;
      }
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'k') ui.setDialog(ui.dialog === 'palette' ? null : 'palette');
      else if (dialogOpen) return;
      else if (key === 'z' && !e.shiftKey) projectStore.getState().undo();
      else if (key === 'y' || (key === 'z' && e.shiftKey)) projectStore.getState().redo();
      else if (key === 's') void saveProject(e.shiftKey);
      else if (key === 'o') void openProject().then(setPending);
      else if (key === 'e') ui.setDialog('export');
      else if (key === ',') ui.setDialog('settings');
      else if (key === 'd' && !isTyping(e.target) && ui.selection?.kind === 'gear-unit') duplicateSelectedUnit();
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
            <ToolButton
              label={t('Load sample studio')}
              onClick={() => confirmDiscard() && void loadSample().then((p) => p && setPending(p))}
            >
              <IconSparkles size={18} />
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
            <ToolButton label={t('Export…')} onClick={() => uiStore.getState().setDialog('export')}>
              <IconFileExport size={18} />
            </ToolButton>
            <span className="mx-1 h-5 w-px bg-neutral-300 dark:bg-neutral-700" />
            <ToolButton label={t('Undo')} disabled={!canUndo} onClick={() => projectStore.getState().undo()}>
              <IconArrowBackUp size={18} />
            </ToolButton>
            <ToolButton label={t('Redo')} disabled={!canRedo} onClick={() => projectStore.getState().redo()}>
              <IconArrowForwardUp size={18} />
            </ToolButton>
          </div>
          <div className="flex-1" />
          <ValidationBadge />
          {setups.length > 0 && (
            <label className="mr-2 flex items-center gap-1 text-xs text-neutral-500">
              {t('Setup')}
              <select
                aria-label={t('Active setup')}
                className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                value={activeSetupId ?? ''}
                onChange={(e) =>
                  projectStore
                    .getState()
                    .change((p) => void (p.activeSetupId = e.target.value), { label: 'Switch setup' })
                }
              >
                {setups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ToolButton label={t('Command palette (Ctrl+K)')} onClick={() => uiStore.getState().setDialog('palette')}>
            <IconCommand size={18} />
          </ToolButton>
          <ToolButton label={t('Keyboard shortcuts (?)')} onClick={() => uiStore.getState().setDialog('shortcuts')}>
            <IconKeyboard size={18} />
          </ToolButton>
          <ToolButton label={t('Settings…')} onClick={() => uiStore.getState().setDialog('settings')}>
            <IconSettings size={18} />
          </ToolButton>
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
          <aside
            className="flex w-72 flex-col border-r border-neutral-200 dark:border-neutral-700"
            aria-label={t('Sidebar')}
          >
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
            <div className="min-h-0 flex-1" onKeyDown={listArrowNav}>
              <ErrorBoundary label={t('Sidebar')}>
                {sidebarTab === 'inventory' && <InventoryPanel />}
                {sidebarTab === 'library' && <LibraryPanel />}
                {sidebarTab === 'setups' && <SetupsPanel />}
                {sidebarTab === 'issues' && <IssuesPanel />}
              </ErrorBoundary>
            </div>
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
            <div className="min-h-0 flex-1">
              <ErrorBoundary label={t('Canvas')}>
                {canvasTab === 'tables' ? (
                  <TablesView />
                ) : canvasTab === 'face' ? (
                  <FaceView />
                ) : canvasTab === 'patch' ? (
                  <PatchView />
                ) : canvasTab === 'compare' ? (
                  <CompareView />
                ) : (
                  <LayoutView />
                )}
              </ErrorBoundary>
            </div>
          </main>
          <aside
            className="w-80 overflow-auto border-l border-neutral-200 dark:border-neutral-700"
            aria-label={t('Inspector')}
          >
            <ErrorBoundary label={t('Inspector')}>
              <Inspector />
            </ErrorBoundary>
          </aside>
        </div>

        <StatusBar />
      </div>
      <ErrorBoundary label={t('Gear editor')}>
        <GearEditorHost />
      </ErrorBoundary>
      {pending && <LoadErrorDialog pending={pending} onClose={() => setPending(null)} />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'settings' && <SettingsDialog />}
      {dialog === 'palette' && <CommandPalette onPending={setPending} />}
      {dialog === 'shortcuts' && <ShortcutSheet />}
    </div>
  );
}
