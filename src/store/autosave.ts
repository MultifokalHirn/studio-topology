// IndexedDB autosave with a rolling window of snapshots, for crash recovery (spec §5.16).
import { get, set, type UseStore } from 'idb-keyval';

export const AUTOSAVE_KEY = 'studio-planner:autosave';
export const MAX_SNAPSHOTS = 20;

export interface Snapshot {
  savedAt: string;
  projectName: string;
  text: string;
}

export async function readSnapshots(store?: UseStore): Promise<Snapshot[]> {
  return (await get<Snapshot[]>(AUTOSAVE_KEY, store)) ?? [];
}

/** Push a snapshot, skipping it when identical to the newest one, and keep the latest `MAX_SNAPSHOTS`. */
export async function pushSnapshot(snapshot: Snapshot, store?: UseStore): Promise<void> {
  const list = await readSnapshots(store);
  if (list[0]?.text === snapshot.text) return;
  await set(AUTOSAVE_KEY, [snapshot, ...list].slice(0, MAX_SNAPSHOTS), store);
}

export async function clearSnapshots(store?: UseStore): Promise<void> {
  await set(AUTOSAVE_KEY, [], store);
}
