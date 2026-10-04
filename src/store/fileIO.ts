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
interface FsWindow {
  showOpenFilePicker?: (opts: unknown) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (opts: unknown) => Promise<FsFileHandle>;
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
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type { FsFileHandle };
