import { useEffect, useState } from 'react';
import { serializeProject } from '@/domain/serialize';
import { isDirty } from '@/store/projectStore';
import { projectStore } from '@/store';
import { pushSnapshot, readSnapshots, type Snapshot } from '@/store/autosave';

/** Autosave to IndexedDB every `settings.autosaveIntervalS` while dirty (spec §5.16). */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let lastRevision = -1;
    const tick = async () => {
      const s = projectStore.getState();
      if (!s.readOnly && isDirty(s) && s.revision !== lastRevision) {
        lastRevision = s.revision;
        const savedAt = new Date().toISOString();
        try {
          await pushSnapshot({ savedAt, projectName: s.project.meta.name, text: serializeProject(s.project) });
          s.markAutosaved(savedAt);
        } catch (e) {
          console.warn('Autosave failed', e);
        }
      }
      timer = setTimeout(tick, projectStore.getState().project.settings.autosaveIntervalS * 1000);
    };
    timer = setTimeout(tick, projectStore.getState().project.settings.autosaveIntervalS * 1000);
    return () => clearTimeout(timer);
  }, []);
}

/** The newest autosave snapshot, offered for crash recovery on start-up. */
export function useRecoverySnapshot(): [Snapshot | null, () => void, boolean] {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    readSnapshots()
      .then((list) => setSnapshot(list[0] ?? null))
      .catch(() => setSnapshot(null))
      .finally(() => setChecked(true));
  }, []);
  return [snapshot, () => setSnapshot(null), checked];
}
