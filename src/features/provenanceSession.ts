// Provenance kind stamped on edited values, remembered for the browser session (spec §3.3).
import type { Provenance } from '@/domain/types';

const KEY = 'studio-planner:provenance-kind';
const ALLOWED = ['user', 'measured', 'datasheet', 'manufacturer', 'retailer'] as const;

export function readSessionProvenanceKind(): Provenance['kind'] {
  try {
    const v = sessionStorage.getItem(KEY);
    return (ALLOWED as readonly string[]).includes(v ?? '') ? (v as Provenance['kind']) : 'user';
  } catch {
    return 'user';
  }
}

export function writeSessionProvenanceKind(kind: Provenance['kind']): void {
  try {
    sessionStorage.setItem(KEY, kind);
  } catch {
    /* per-session convenience only */
  }
}

export const SESSION_PROVENANCE_OPTIONS = ALLOWED;
