// Transient UI state (not persisted in the project file, not undoable).
import { createStore } from 'zustand/vanilla';

export type SidebarTab = 'inventory' | 'library' | 'setups' | 'issues';
export type CanvasTab = 'layout' | 'patch' | 'face' | 'tables' | 'compare';
export type SelectionKind =
  'gear-unit' | 'gear-model' | 'stand-unit' | 'stand-model' | 'cable-model' | 'connection' | 'port';
export type LayoutView = 'front' | 'side' | 'plan';
export type DialogId = 'export' | 'settings' | 'palette' | 'shortcuts';
export interface Selection {
  kind: SelectionKind;
  id: string;
}

export interface UiState {
  sidebarTab: SidebarTab;
  canvasTab: CanvasTab;
  selection: Selection | null;
  /** Gear model open in the full-screen editor. */
  editingGearModelId: string | null;
  darkMode: boolean;
  /** Signal trace shown in the patch (spec §5.10): a port node key, hovered or pinned. */
  trace: { start: string; pinned: boolean } | null;
  /** Follow-signal playback: the path being stepped through and the current hop. */
  follow: { path: string[]; step: number } | null;
  /** Setup active before the current one (A/B toggle, spec §5.11). */
  previousSetupId: string | null;
  /** Setup whose unit positions are drawn as ghosts on the layout canvas (compare overlay). */
  ghostsFrom: string | null;
  /** Layout canvas projection (front/side elevation, plan); exports default to it. */
  layoutView: LayoutView;
  /** Top-level dialog that is open (export, settings, command palette, shortcut sheet). */
  dialog: DialogId | null;
  /** Patch legend visibility (`L`). */
  legend: boolean;
  setLayoutView(v: LayoutView): void;
  setDialog(d: DialogId | null): void;
  setLegend(v: boolean): void;
  setPreviousSetupId(id: string | null): void;
  setGhostsFrom(id: string | null): void;
  setTrace(t: { start: string; pinned: boolean } | null): void;
  setFollow(f: { path: string[]; step: number } | null): void;
  setSidebarTab(tab: SidebarTab): void;
  setCanvasTab(tab: CanvasTab): void;
  select(sel: Selection | null): void;
  editGearModel(id: string | null): void;
  setDarkMode(dark: boolean): void;
}

export function createUiStore(initialDark = false) {
  return createStore<UiState>()((set) => ({
    sidebarTab: 'inventory',
    canvasTab: 'layout',
    selection: null,
    editingGearModelId: null,
    darkMode: initialDark,
    trace: null,
    follow: null,
    previousSetupId: null,
    ghostsFrom: null,
    layoutView: 'front',
    dialog: null,
    legend: true,
    setLayoutView: (layoutView) => set({ layoutView }),
    setDialog: (dialog) => set({ dialog }),
    setLegend: (legend) => set({ legend }),
    setPreviousSetupId: (previousSetupId) => set({ previousSetupId }),
    setGhostsFrom: (ghostsFrom) => set({ ghostsFrom }),
    setTrace: (trace) => set({ trace }),
    setFollow: (follow) => set({ follow }),
    setSidebarTab: (sidebarTab) => set({ sidebarTab }),
    setCanvasTab: (canvasTab) => set({ canvasTab }),
    select: (selection) => set({ selection }),
    editGearModel: (editingGearModelId) => set({ editingGearModelId }),
    setDarkMode: (darkMode) => set({ darkMode }),
  }));
}
