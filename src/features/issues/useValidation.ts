// Validation of the active setup, recomputed when the project changes (full pass ≈ 10–30 ms for the sample).
import { useMemo } from 'react';
import { validateSetup, type RuleRun } from '@/engine/rules';
import { useProject } from '@/store';

const EMPTY: RuleRun = { issues: [], suppressed: [], timings: {} };

export function useValidation(): RuleRun {
  const project = useProject((s) => s.project);
  return useMemo(() => {
    const setup = project.setups.find((s) => s.id === project.activeSetupId);
    return setup ? validateSetup(project, setup) : EMPTY;
  }, [project]);
}
