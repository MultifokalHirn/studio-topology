// Patch-based undo/redo (spec §2, §6): one entry per user-visible change; drags coalesce under one key.
import { applyPatches, enablePatches, type Patch, produceWithPatches, type Draft } from 'immer';

enablePatches();

export const HISTORY_LIMIT = 500;

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  coalesceKey?: string;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

export interface ChangeOptions {
  label?: string;
  /** Consecutive changes with the same key merge into one undo step (e.g. `drag:<unitId>`). */
  coalesceKey?: string;
}

/** Apply `recipe` to `state` and record it. Returns the same objects when the recipe changed nothing. */
export function record<T>(
  state: T,
  history: History,
  recipe: (draft: Draft<T>) => void,
  opts: ChangeOptions = {},
): { state: T; history: History; changed: boolean } {
  const [next, patches, inverse] = produceWithPatches(state, recipe);
  if (patches.length === 0) return { state, history, changed: false };
  const last = history.past[history.past.length - 1];
  let past: HistoryEntry[];
  if (opts.coalesceKey && last?.coalesceKey === opts.coalesceKey) {
    past = [
      ...history.past.slice(0, -1),
      { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse] },
    ];
  } else {
    past = [...history.past, { label: opts.label ?? 'Edit', patches, inverse, coalesceKey: opts.coalesceKey }];
    if (past.length > HISTORY_LIMIT) past = past.slice(past.length - HISTORY_LIMIT);
  }
  return { state: next as T, history: { past, future: [] }, changed: true };
}

export function undo<T>(state: T, history: History): { state: T; history: History } | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    state: applyPatches(state as object, entry.inverse) as T,
    history: { past: history.past.slice(0, -1), future: [{ ...entry, coalesceKey: undefined }, ...history.future] },
  };
}

export function redo<T>(state: T, history: History): { state: T; history: History } | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    state: applyPatches(state as object, entry.patches) as T,
    history: { past: [...history.past, entry], future: history.future.slice(1) },
  };
}

/** Ends the current coalescing run so the next change starts a new undo step (call on pointer-up). */
export function sealHistory(history: History): History {
  const last = history.past[history.past.length - 1];
  if (!last?.coalesceKey) return history;
  return { ...history, past: [...history.past.slice(0, -1), { ...last, coalesceKey: undefined }] };
}
