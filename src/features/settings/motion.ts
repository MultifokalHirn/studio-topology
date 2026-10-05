// Reduced motion (spec §5.16): the project setting overrides the system preference when set.
import { useEffect, useState } from 'react';
import { useProject } from '@/store';

const query = () => window.matchMedia?.('(prefers-reduced-motion: reduce)');

export function useReducedMotion(): boolean {
  const pref = useProject((s) => s.project.settings.animation.reducedMotion);
  const [system, setSystem] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const on = () => setSystem(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'reduce' || (pref === 'system' && system);
}
