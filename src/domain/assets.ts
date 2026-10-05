// Project assets (spec §4.9): image index, references from models, pruning.
import type { AssetIndex, GearModel, Project, StandModel } from './types';

export type AssetItem = AssetIndex['items'][string];

/** Every asset id referenced by gear and stand models. */
export function referencedAssetIds(p: Pick<Project, 'library'>): Set<string> {
  const ids = new Set<string>();
  const add = (images: GearModel['images'] | StandModel['images']) => {
    for (const ref of Object.values(images)) if (ref) ids.add(ref.id);
  };
  p.library.gearModels.forEach((m) => add(m.images));
  p.library.standModels.forEach((m) => add(m.images));
  return ids;
}

/** Drop assets nobody references (after remove/replace). Returns the removed ids. */
export function pruneUnusedAssets(p: Pick<Project, 'library' | 'assets'>): string[] {
  const used = referencedAssetIds(p);
  const removed = Object.keys(p.assets.items).filter((id) => !used.has(id));
  for (const id of removed) delete p.assets.items[id];
  return removed;
}

/** URL to draw an asset, or null when it is missing (shown as a placeholder, spec §11 scenario 10). */
export function assetUrl(index: AssetIndex, id: string | undefined): string | null {
  if (!id) return null;
  const item = index.items[id];
  if (!item) return null;
  return item.dataUri ?? null;
}

/** References to assets that are not in the index, for the integrity report. */
export function missingAssetRefs(
  p: Pick<Project, 'library' | 'assets'>,
): { modelId: string; slot: string; assetId: string }[] {
  const out: { modelId: string; slot: string; assetId: string }[] = [];
  for (const m of [...p.library.gearModels, ...p.library.standModels])
    for (const [slot, ref] of Object.entries(m.images))
      if (ref && !p.assets.items[ref.id]?.dataUri) out.push({ modelId: m.id, slot, assetId: ref.id });
  return out;
}

const EXT: Record<AssetItem['mime'], string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

/**
 * Folder mode (spec §4.9, ADR 0003): the project JSON references `assets/<id>.<ext>` and the images are written as
 * files next to it. Returns the converted project and the files to write; items without data keep their old path.
 */
export function toFolderMode<P extends Pick<Project, 'assets'>>(
  project: P,
): { project: P; files: { path: string; dataUri: string }[] } {
  const files: { path: string; dataUri: string }[] = [];
  const items: AssetIndex['items'] = {};
  for (const [id, item] of Object.entries(project.assets.items)) {
    const path = item.dataUri ? `assets/${id.replace(/[^\w.-]+/g, '_')}.${EXT[item.mime]}` : item.path;
    if (item.dataUri && path) files.push({ path, dataUri: item.dataUri });
    const rest = { ...item };
    delete rest.dataUri;
    items[id] = path ? { ...rest, path } : rest;
  }
  return { project: { ...project, assets: { mode: 'folder', items } }, files };
}

/**
 * Opening a folder-mode project together with its folder: fill each item's `dataUri` from the files read. The project
 * becomes embedded in memory (a later save writes one self-contained file; "Save with asset folder" converts back).
 * Returns the paths that could not be read (shown as placeholders).
 */
export function embedFolderAssets(
  project: Pick<Project, 'assets'>,
  read: (path: string) => string | undefined,
): string[] {
  const missing: string[] = [];
  for (const item of Object.values(project.assets.items)) {
    if (item.dataUri || !item.path) continue;
    const data = read(item.path);
    if (data) {
      item.dataUri = data;
      delete item.path;
    } else missing.push(item.path);
  }
  if (!missing.length) project.assets.mode = 'embedded';
  return missing;
}
