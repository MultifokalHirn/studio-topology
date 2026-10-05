// Project-level commands shared by the top bar, shortcuts and the command palette.
import { embedFolderAssets, toFolderMode } from '@/domain/assets';
import { createEmptyProject } from '@/domain/defaults';
import { loadProject, type LoadResult, serializeProject } from '@/domain/serialize';
import type { Project } from '@/domain/types';
import { projectStore } from '@/store';
import {
  type FsFileHandle,
  openProjectFile,
  openProjectFolder as pickProjectFolder,
  saveProjectFile,
  saveProjectFolder as writeProjectFolder,
} from '@/store/fileIO';
import { loadSampleProject } from '../library/catalog';

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

/** Load the bundled sample studio (seed/studio.sample.json). Returns a PendingLoad only if it fails validation. */
export async function loadSample(): Promise<PendingLoad | null> {
  const result = await loadSampleProject();
  if (!result.ok) return { fileName: 'studio.sample.json', result };
  currentHandle = null;
  projectStore.getState().load(result.project);
  return null;
}

/**
 * "Save with asset folder" (spec §4.9): write the project JSON with `assets/…` paths and the images as files into a
 * folder. The open project stays embedded in memory, so ordinary saves keep working as before.
 */
export async function saveProjectFolder(): Promise<string | null> {
  const s = projectStore.getState();
  const project: Project = { ...s.project, meta: { ...s.project.meta, updatedAt: new Date().toISOString() } };
  const { project: folder, files } = toFolderMode(project);
  const blobs = await Promise.all(
    files.map(async (f) => ({ path: f.path, blob: await (await fetch(f.dataUri)).blob() })),
  );
  const name = `${project.meta.name.replace(/[^\w.-]+/g, '-') || 'studio'}.json`;
  return writeProjectFolder(name, serializeProject(folder), blobs);
}

/** Open a folder-mode project: the JSON plus its `assets/` files, embedded in memory. */
export async function openProjectFolder(): Promise<PendingLoad | null> {
  const dir = await pickProjectFolder();
  if (!dir) return null;
  const result = loadProject(dir.text);
  if (!result.ok) return { fileName: dir.name, result };
  const data = new Map<string, string>();
  for (const item of Object.values(result.project.assets.items)) {
    if (item.dataUri || !item.path) continue;
    const file = await dir.read(item.path);
    if (file) data.set(item.path, await blobToDataUri(file));
  }
  embedFolderAssets(result.project, (path) => data.get(path));
  currentHandle = null;
  projectStore.getState().load(result.project, { fileName: dir.name });
  return null;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
