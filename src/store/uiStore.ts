// Transient UI state (not persisted in the project file, not undoable).
import { createStore } from 'zustand/vanilla';

export type SidebarTab = 'inventory' | 'library' | 'setups' | 'issues';
export type CanvasTab = 'layout' | 'patch' | 'face' | 'tables';
export type SelectionKind =
  'gear-unit' | 'gear-model' | 'stand-unit' | 'stand-model' | 'cable-model' | 'connection' | 'port';
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
    setTrace: (trace) => set({ trace }),
    setFollow: (follow) => set({ follow }),
    setSidebarTab: (sidebarTab) => set({ sidebarTab }),
    setCanvasTab: (canvasTab) => set({ canvasTab }),
    select: (selection) => set({ selection }),
    editGearModel: (editingGearModelId) => set({ editingGearModelId }),
    setDarkMode: (darkMode) => set({ darkMode }),
  }));
}
