// Schema migrations (spec §4.1, §5.15). Each step upgrades raw JSON from `from` to `from + 1`
// and reports human-readable changes so the UI can show what happened on open.

export const CURRENT_SCHEMA_VERSION = 1;

export interface Migration {
  from: number;
  /** Mutates `doc` in place and returns a description of each change. */
  up(doc: Record<string, unknown>): string[];
}

/** Registry of migrations, ordered by `from`. Add an entry here whenever `CURRENT_SCHEMA_VERSION` increases. */
export const MIGRATIONS: Migration[] = [];

export type MigrationResult =
  | { status: 'ok'; doc: Record<string, unknown>; fromVersion: number; changes: string[] }
  | { status: 'future'; doc: Record<string, unknown>; fromVersion: number; changes: [] }
  | { status: 'invalid'; reason: string };

export function migrate(
  raw: unknown,
  migrations: Migration[] = MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { status: 'invalid', reason: 'Project file must contain a JSON object.' };
  }
  const doc = structuredClone(raw) as Record<string, unknown>;
  const version = doc.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return {
      status: 'invalid',
      reason: `schemaVersion must be a non-negative integer, got ${JSON.stringify(version)}.`,
    };
  }
  if (version > target) return { status: 'future', doc, fromVersion: version, changes: [] };

  const changes: string[] = [];
  let v = version;
  while (v < target) {
    const step = migrations.find((m) => m.from === v);
    if (!step) return { status: 'invalid', reason: `No migration from schemaVersion ${v} to ${v + 1}.` };
    changes.push(...step.up(doc).map((c) => `v${v}→v${v + 1}: ${c}`));
    v += 1;
    doc.schemaVersion = v;
  }
  return { status: 'ok', doc, fromVersion: version, changes };
}
