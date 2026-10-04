// App-wide store instances and React bindings.
import { useStore } from 'zustand';
import { createProjectStore, type ProjectState } from './projectStore';
import { createUiStore, type UiState } from './uiStore';

const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const projectStore = createProjectStore();
export const uiStore = createUiStore(prefersDark);

export const useProject = <T>(selector: (s: ProjectState) => T): T => useStore(projectStore, selector);
export const useUi = <T>(selector: (s: UiState) => T): T => useStore(uiStore, selector);
