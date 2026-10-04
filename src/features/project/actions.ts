// Project-level commands shared by the top bar, shortcuts and the command palette.
import { createEmptyProject } from '@/domain/defaults';
import { loadProject, type LoadResult, serializeProject } from '@/domain/serialize';
import type { Project } from '@/domain/types';
import { projectStore } from '@/store';
import { type FsFileHandle, openProjectFile, saveProjectFile } from '@/store/fileIO';

let currentHandle: FsFileHandle | null = null;

/** Pending load that failed validation; the UI shows it and may offer "load anyway (read-only)". */
export type PendingLoad = { fileName: string; result: Extract<LoadResult, { ok: false }> };

export function newProject(): void {
  currentHandle = null;
  projectStore.getState().load(createEmptyProject());
}

/** Returns a `PendingLoad` when the file needs the user's attention, otherwise loads it. */
export async function openProject(): Promise<PendingLoad | null> {
  const file = await openProjectFile();
  if (!file) return null;
  return applyLoadedText(file.text, file.name, file.handle);
}

export function applyLoadedText(
  text: string,
  fileName: string,
  handle: FsFileHandle | null = null,
): PendingLoad | null {
  const result = loadProject(text);
  if (!result.ok) return { fileName, result };
  currentHandle = handle;
  projectStore.getState().load(result.project, { fileName });
  return null;
}

/** "Load anyway": open the unvalidated document read-only so nothing can be overwritten by accident. */
export function loadReadOnly(pending: PendingLoad): void {
  currentHandle = null;
  projectStore.getState().load(pending.result.raw as Project, { fileName: pending.fileName, readOnly: true });
}

export async function saveProject(saveAs = false): Promise<void> {
  const s = projectStore.getState();
  if (s.readOnly) return;
  const project: Project = { ...s.project, meta: { ...s.project.meta, updatedAt: new Date().toISOString() } };
  const name = s.fileName ?? `${project.meta.name.replace(/[^\w.-]+/g, '-') || 'studio'}.json`;
  const handle = await saveProjectFile(serializeProject(project), name, saveAs ? null : currentHandle);
  currentHandle = handle;
  s.markSaved(handle?.name ?? name);
}
