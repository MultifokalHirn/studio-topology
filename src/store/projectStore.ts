// The project store: one Zustand store holding the document, its undo history and file status (spec §2).
import type { Draft } from 'immer';
import { createStore } from 'zustand/vanilla';
import { createEmptyProject } from '@/domain/defaults';
import type { Project } from '@/domain/types';
import { type ChangeOptions, emptyHistory, type History, record, redo, sealHistory, undo } from './history';

export interface ProjectState {
  project: Project;
  history: History;
  /** Set when the file could not be validated or is from a newer app version; edits are refused. */
  readOnly: boolean;
  /** Increments on every change; compared with `savedRevision` for the dirty indicator. */
  revision: number;
  savedRevision: number;
  fileName: string | null;
  lastSavedAt: string | null;
  lastAutosaveAt: string | null;

  change(recipe: (draft: Draft<Project>) => void, opts?: ChangeOptions): void;
  seal(): void;
  undo(): void;
  redo(): void;
  load(project: Project, opts?: { fileName?: string | null; readOnly?: boolean }): void;
  markSaved(fileName?: string | null): void;
  markAutosaved(at: string): void;
}

export const isDirty = (s: Pick<ProjectState, 'revision' | 'savedRevision'>) => s.revision !== s.savedRevision;

export function createProjectStore(initial: Project = createEmptyProject()) {
  return createStore<ProjectState>()((set, get) => ({
    project: initial,
    history: emptyHistory(),
    readOnly: false,
    revision: 0,
    savedRevision: 0,
    fileName: null,
    lastSavedAt: null,
    lastAutosaveAt: null,

    change(recipe, opts) {
      const s = get();
      if (s.readOnly) return;
      const r = record(s.project, s.history, recipe, opts);
      if (r.changed) set({ project: r.state, history: r.history, revision: s.revision + 1 });
    },
    seal() {
      set({ history: sealHistory(get().history) });
    },
    undo() {
      const s = get();
      const r = undo(s.project, s.history);
      if (r) set({ project: r.state, history: r.history, revision: s.revision + 1 });
    },
    redo() {
      const s = get();
      const r = redo(s.project, s.history);
      if (r) set({ project: r.state, history: r.history, revision: s.revision + 1 });
    },
    load(project, opts = {}) {
      set({
        project,
        history: emptyHistory(),
        readOnly: opts.readOnly ?? false,
        revision: 0,
        savedRevision: 0,
        fileName: opts.fileName ?? null,
        lastSavedAt: null,
      });
    },
    markSaved(fileName) {
      const s = get();
      set({
        savedRevision: s.revision,
        lastSavedAt: new Date().toISOString(),
        fileName: fileName === undefined ? s.fileName : fileName,
      });
    },
    markAutosaved(at) {
      set({ lastAutosaveAt: at });
    },
  }));
}

export type ProjectStore = ReturnType<typeof createProjectStore>;
