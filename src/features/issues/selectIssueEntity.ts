// Select the first unit or connection an issue refers to.
import type { Issue } from '@/engine/issues';
import { projectStore, uiStore } from '@/store';

export function selectIssueEntity(i: Issue) {
  const p = projectStore.getState().project;
  const setup = p.setups.find((s) => s.id === p.activeSetupId);
  for (const id of i.entityIds) {
    if (setup?.connections.some((c) => c.id === id)) return uiStore.getState().select({ kind: 'connection', id });
    if (p.inventory.gearUnits.some((u) => u.id === id)) return uiStore.getState().select({ kind: 'gear-unit', id });
  }
}
