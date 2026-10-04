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
      if (ref && !p.assets.items[ref.id]) out.push({ modelId: m.id, slot, assetId: ref.id });
  return out;
}
