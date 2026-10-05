// Every app action as a command (spec §5.1 command palette, §5.16 shortcuts). The palette lists these; the global
// key handler and the shortcut sheet use the same `keys`.
import { duplicateGearUnit } from '@/domain/libraryOps';
import { t } from '@/i18n';
import { projectStore, uiStore } from '@/store';
import type { CanvasTab, SidebarTab } from '@/store/uiStore';
import { isDirty } from '@/store/projectStore';
import { hasDirectoryAccess } from '@/store/fileIO';
import {
  loadSample,
  newProject,
  openProject,
  openProjectFolder,
  type PendingLoad,
  saveProject,
} from '../project/actions';

export interface Command {
  id: string;
  group: string;
  label: string;
  /** Display form of the shortcut (`Ctrl+K`, `?`, `1`). */
  keys?: string;
  run(): void;
  enabled?: () => boolean;
}

export const CANVAS_TABS: [CanvasTab, string][] = [
  ['layout', 'Layout'],
  ['patch', 'Patch'],
  ['face', 'Face'],
  ['tables', 'Tables'],
  ['compare', 'Compare'],
];
export const SIDEBAR_TABS: [SidebarTab, string][] = [
  ['inventory', 'Inventory'],
  ['library', 'Library'],
  ['setups', 'Setups'],
  ['issues', 'Issues'],
];

const confirmDiscard = () => !isDirty(projectStore.getState()) || window.confirm(t('Discard unsaved changes?'));
const editable = () => !projectStore.getState().readOnly;

/** A/B toggle (spec §5.11): swap to the previously active setup (else the one this was derived from). */
export function toggleAB() {
  const { project } = projectStore.getState();
  const prev = uiStore.getState().previousSetupId;
  const active = project.setups.find((s) => s.id === project.activeSetupId);
  const target = [prev, active?.derivedFromId].find(
    (id) => id && id !== active?.id && project.setups.some((s) => s.id === id),
  );
  if (target) projectStore.getState().change((p) => void (p.activeSetupId = target), { label: 'A/B toggle' });
}

export function duplicateSelectedUnit() {
  const sel = uiStore.getState().selection;
  if (sel?.kind !== 'gear-unit') return;
  let id = '';
  projectStore.getState().change((p) => void (id = duplicateGearUnit(p, sel.id).id), { label: 'Duplicate unit' });
  if (id) uiStore.getState().select({ kind: 'gear-unit', id });
}

export function buildCommands(onPending: (p: PendingLoad | null) => void): Command[] {
  const ui = uiStore.getState();
  const { project } = projectStore.getState();
  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+';
  return [
    { id: 'file.new', group: 'File', label: 'New project', run: () => confirmDiscard() && newProject() },
    {
      id: 'file.sample',
      group: 'File',
      label: 'Load sample studio',
      run: () => confirmDiscard() && void loadSample().then(onPending),
    },
    {
      id: 'file.open',
      group: 'File',
      label: 'Open…',
      keys: `${mod}O`,
      run: () => confirmDiscard() && void openProject().then(onPending),
    },
    {
      id: 'file.open-folder',
      group: 'File',
      label: 'Open folder (project with assets/)…',
      enabled: hasDirectoryAccess,
      run: () => confirmDiscard() && void openProjectFolder().then(onPending),
    },
    {
      id: 'file.save',
      group: 'File',
      label: 'Save',
      keys: `${mod}S`,
      enabled: editable,
      run: () => void saveProject(),
    },
    {
      id: 'file.save-as',
      group: 'File',
      label: 'Save as…',
      keys: `${mod}Shift+S`,
      enabled: editable,
      run: () => void saveProject(true),
    },
    { id: 'file.export', group: 'File', label: 'Export…', keys: `${mod}E`, run: () => ui.setDialog('export') },
    { id: 'file.settings', group: 'File', label: 'Settings…', keys: `${mod},`, run: () => ui.setDialog('settings') },
    {
      id: 'edit.undo',
      group: 'Edit',
      label: 'Undo',
      keys: `${mod}Z`,
      enabled: () => projectStore.getState().history.past.length > 0,
      run: () => projectStore.getState().undo(),
    },
    {
      id: 'edit.redo',
      group: 'Edit',
      label: 'Redo',
      keys: `${mod}Y`,
      enabled: () => projectStore.getState().history.future.length > 0,
      run: () => projectStore.getState().redo(),
    },
    {
      id: 'edit.duplicate',
      group: 'Edit',
      label: 'Duplicate selected unit',
      keys: `${mod}D`,
      enabled: () => editable() && uiStore.getState().selection?.kind === 'gear-unit',
      run: duplicateSelectedUnit,
    },
    ...CANVAS_TABS.map(([id, label], i): Command => ({
      id: `view.${id}`,
      group: 'View',
      label: `Show ${label}`,
      keys: String(i + 1),
      run: () => ui.setCanvasTab(id),
    })),
    ...(['front', 'side', 'plan'] as const).map((v): Command => ({
      id: `view.layout-${v}`,
      group: 'View',
      label: `Layout: ${{ front: 'front elevation', side: 'side elevation', plan: 'plan' }[v]}`,
      run: () => {
        ui.setCanvasTab('layout');
        ui.setLayoutView(v);
      },
    })),
    ...SIDEBAR_TABS.map(([id, label]): Command => ({
      id: `sidebar.${id}`,
      group: 'View',
      label: `Sidebar: ${label}`,
      run: () => ui.setSidebarTab(id),
    })),
    {
      id: 'view.legend',
      group: 'View',
      label: 'Toggle legend',
      keys: 'L',
      run: () => ui.setLegend(!uiStore.getState().legend),
    },
    {
      id: 'view.theme',
      group: 'View',
      label: 'Toggle dark mode',
      run: () => ui.setDarkMode(!uiStore.getState().darkMode),
    },
    {
      id: 'help.shortcuts',
      group: 'Help',
      label: 'Keyboard shortcuts',
      keys: '?',
      run: () => ui.setDialog('shortcuts'),
    },
    {
      id: 'help.palette',
      group: 'Help',
      label: 'Command palette',
      keys: `${mod}K`,
      run: () => ui.setDialog('palette'),
    },
    { id: 'setup.ab', group: 'Setups', label: 'A/B toggle (previous setup)', keys: '\\', run: toggleAB },
    ...project.setups.map((s): Command => ({
      id: `setup.switch.${s.id}`,
      group: 'Setups',
      label: `Switch to setup "${s.name}"`,
      enabled: () => projectStore.getState().project.activeSetupId !== s.id,
      run: () => projectStore.getState().change((p) => void (p.activeSetupId = s.id), { label: 'Switch setup' }),
    })),
  ];
}

/** Shortcuts handled inside the canvases (listed on the shortcut sheet only). */
export const CANVAS_SHORTCUTS: [string, string][] = [
  ['F', 'Fit all (canvas focused)'],
  ['Wheel / pinch', 'Zoom at the cursor'],
  ['Shift+wheel', 'Scroll sideways'],
  ['Space+drag, middle mouse', 'Pan'],
  ['Arrows (Shift ×10)', 'Nudge the selection 1 mm'],
  ['R / Shift+R', 'Rotate the selected unit'],
  ['Del / Backspace', 'Remove the selected unit or connection'],
  ['Shift+drag (patch)', 'Connect a stereo pair'],
  ['Alt+drag', 'Move without snapping'],
  ['Esc', 'Close dialogs and menus'],
];

/** Every word of the query must appear in the label or group (case-insensitive). */
export function matches(query: string, text: string): boolean {
  const hay = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
