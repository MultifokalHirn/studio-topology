// Transient UI state (not persisted in the project file, not undoable).
import { createStore } from 'zustand/vanilla';

export type SidebarTab = 'inventory' | 'library' | 'setups' | 'issues';
export type CanvasTab = 'layout' | 'patch' | 'face' | 'tables';

export interface UiState {
  sidebarTab: SidebarTab;
  canvasTab: CanvasTab;
  selection: string[];
  darkMode: boolean;
  setSidebarTab(tab: SidebarTab): void;
  setCanvasTab(tab: CanvasTab): void;
  select(ids: string[]): void;
  setDarkMode(dark: boolean): void;
}

export function createUiStore(initialDark = false) {
  return createStore<UiState>()((set) => ({
    sidebarTab: 'inventory',
    canvasTab: 'layout',
    selection: [],
    darkMode: initialDark,
    setSidebarTab: (sidebarTab) => set({ sidebarTab }),
    setCanvasTab: (canvasTab) => set({ canvasTab }),
    select: (selection) => set({ selection }),
    setDarkMode: (darkMode) => set({ darkMode }),
  }));
}
