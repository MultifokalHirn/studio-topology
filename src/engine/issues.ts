// Validation issue shape (spec §5.12). Rules return these; the issues panel renders them.
export interface FixAction {
  label: string;
  /** Machine-readable hint for the UI (e.g. `{ kind: 'set-surface-z', surfaceId, z }`). */
  action: Record<string, string | number>;
}

export interface Issue {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  entityIds: string[];
  message: string;
  details?: Record<string, number | string>;
  fixes?: FixAction[];
}
