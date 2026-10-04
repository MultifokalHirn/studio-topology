// Transient UI state (not persisted in the project file, not undoable).
import { createStore } from 'zustand/vanilla';

export type SidebarTab = 'inventory' | 'library' | 'setups' | 'issues';
export type CanvasTab = 'layout' | 'patch' | 'face' | 'tables';
export type SelectionKind = 'gear-unit' | 'gear-model' | 'stand-unit' | 'stand-model' | 'cable-model';
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
    setSidebarTab: (sidebarTab) => set({ sidebarTab }),
    setCanvasTab: (canvasTab) => set({ canvasTab }),
    select: (selection) => set({ selection }),
    editGearModel: (editingGearModelId) => set({ editingGearModelId }),
    setDarkMode: (darkMode) => set({ darkMode }),
  }));
}
