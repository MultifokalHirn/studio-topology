// Open/save via the File System Access API (Chromium), with download/upload fallback (spec §2, §9).
// Atomicity: FileSystemWritableFileStream writes to a swap file and replaces the target only on close().

interface FsFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string | Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
interface FsDirectoryHandle {
  name: string;
  kind: 'directory';
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirectoryHandle>;
  values(): AsyncIterable<FsFileHandle | FsDirectoryHandle>;
}
interface FsWindow {
  showOpenFilePicker?: (opts: unknown) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (opts: unknown) => Promise<FsFileHandle>;
  showDirectoryPicker?: (opts?: unknown) => Promise<FsDirectoryHandle>;
}

const PICKER_TYPES = [{ description: 'Studio Planner project', accept: { 'application/json': ['.json'] } }];

export const hasFileSystemAccess = () => typeof (window as FsWindow).showOpenFilePicker === 'function';

export interface OpenedFile {
  name: string;
  text: string;
  handle: FsFileHandle | null;
}

export async function openProjectFile(): Promise<OpenedFile | null> {
  const w = window as FsWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  return uploadFallback();
}

function uploadFallback(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Save to `handle` (or ask for one). Returns the handle used, or `null` when the download fallback was used. */
export async function saveProjectFile(
  text: string,
  suggestedName: string,
  handle: FsFileHandle | null,
): Promise<FsFileHandle | null> {
  const w = window as FsWindow;
  let target = handle;
  if (!target && w.showSaveFilePicker) {
    try {
      target = await w.showSaveFilePicker({ suggestedName, types: PICKER_TYPES });
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return handle;
      throw e;
    }
  }
  if (!target) {
    downloadText(text, suggestedName);
    return null;
  }
  const writable = await target.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (e) {
    await writable.abort();
    throw e;
  }
  return target;
}

export function downloadText(text: string, fileName: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: mime }), fileName);
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------- folder mode (spec §4.9) ----------

export const hasDirectoryAccess = () => typeof (window as FsWindow).showDirectoryPicker === 'function';

const isAbort = (e: unknown) => (e as DOMException).name === 'AbortError';

async function writeFile(dir: FsDirectoryHandle, path: string, data: string | Blob) {
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const w = await (await d.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
  try {
    await w.write(data);
    await w.close();
  } catch (e) {
    await w.abort();
    throw e;
  }
}

/** Write `<name>` plus asset files into a folder the user picks. Returns the folder name, or null when cancelled. */
export async function saveProjectFolder(
  jsonName: string,
  text: string,
  files: { path: string; blob: Blob }[],
): Promise<string | null> {
  const w = window as FsWindow;
  if (!w.showDirectoryPicker) throw new Error('This browser cannot write folders; use embedded assets.');
  let dir: FsDirectoryHandle;
  try {
    dir = await w.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  for (const f of files) await writeFile(dir, f.path, f.blob);
  await writeFile(dir, jsonName, text);
  return dir.name;
}

/** Pick a project folder: the first `.json` file in it plus a reader for files below it (e.g. `assets/x.webp`). */
export async function openProjectFolder(): Promise<{
  name: string;
  text: string;
  read(path: string): Promise<File | null>;
} | null> {
  const w = window as FsWindow;
  if (!w.showDirectoryPicker) throw new Error('This browser cannot open folders.');
  let dir: FsDirectoryHandle;
  try {
    dir = await w.showDirectoryPicker({ mode: 'read' });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
  let json: FsFileHandle | null = null;
  for await (const h of dir.values())
    if (!('kind' in h && h.kind === 'directory') && h.name.endsWith('.json') && (!json || h.name < json.name))
      json = h as FsFileHandle;
  if (!json) throw new Error(`No project .json file in "${dir.name}".`);
  const file = await json.getFile();
  return {
    name: file.name,
    text: await file.text(),
    async read(path) {
      try {
        const parts = path.split('/');
        let d = dir;
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
        return await (await d.getFileHandle(parts.at(-1)!)).getFile();
      } catch {
        return null;
      }
    },
  };
}

export type { FsFileHandle };
