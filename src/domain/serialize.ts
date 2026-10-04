// Project file (de)serialisation (spec §1.4 "Reproducible files", §5.15, §6 error handling).
import type { z } from 'zod';
import { CURRENT_SCHEMA_VERSION, migrate, type Migration, MIGRATIONS } from './migrations';
import { Project as ProjectSchema } from './schemas';
import type { Project } from './types';

/** Recursively sort object keys so output is independent of construction order. Arrays keep their order. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

/** Stable, pretty-printed JSON with a trailing newline. */
export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2) + '\n';
}

export function serializeProject(project: Project): string {
  return toCanonicalJson(project);
}

export interface LoadIssue {
  path: string;
  message: string;
  value?: unknown;
  expected?: string;
}

export type LoadResult =
  | { ok: true; project: Project; readOnly: false; migrationChanges: string[] }
  | {
      ok: false;
      /** Raw document for a "load anyway (read-only)" option; absent when the file is not even a JSON object. */
      raw?: unknown;
      reason: 'parse' | 'migration' | 'future-version' | 'schema';
      message: string;
      issues: LoadIssue[];
    };

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg)),
    '',
  );
}

function getAt(doc: unknown, path: PropertyKey[]): unknown {
  let cur: unknown = doc;
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<PropertyKey, unknown>)[seg];
  }
  return cur;
}

export function zodIssuesToLoadIssues(doc: unknown, error: z.ZodError): LoadIssue[] {
  return error.issues.map((issue) => {
    const expected = 'expected' in issue && typeof issue.expected === 'string' ? issue.expected : undefined;
    return { path: formatPath(issue.path), message: issue.message, value: getAt(doc, issue.path), expected };
  });
}

/** Parse, migrate and validate a project file. Never throws and never silently drops data. */
export function loadProject(text: string, migrations: Migration[] = MIGRATIONS): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'parse', message: `Not valid JSON: ${(e as Error).message}`, issues: [] };
  }
  const migrated = migrate(raw, migrations, CURRENT_SCHEMA_VERSION);
  if (migrated.status === 'invalid') {
    return { ok: false, raw, reason: 'migration', message: migrated.reason, issues: [] };
  }
  if (migrated.status === 'future') {
    return {
      ok: false,
      raw: migrated.doc,
      reason: 'future-version',
      message: `This file uses schemaVersion ${migrated.fromVersion}, newer than this app supports (${CURRENT_SCHEMA_VERSION}). It can be opened read-only.`,
      issues: [],
    };
  }
  const parsed = ProjectSchema.safeParse(migrated.doc);
  if (!parsed.success) {
    return {
      ok: false,
      raw: migrated.doc,
      reason: 'schema',
      message: 'The project file does not match the schema.',
      issues: zodIssuesToLoadIssues(migrated.doc, parsed.error),
    };
  }
  const unknownKeys = findUnknownKeys(migrated.doc, parsed.data);
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      raw: migrated.doc,
      reason: 'schema',
      message: 'The project file contains fields this app does not know; saving would drop them.',
      issues: unknownKeys.map((path) => ({ path, message: 'Unknown field' })),
    };
  }
  return { ok: true, project: parsed.data, readOnly: false, migrationChanges: migrated.changes };
}

/** Paths present in `raw` but stripped by schema parsing (Zod strips unknown keys by default). */
function findUnknownKeys(raw: unknown, parsed: unknown, path = ''): string[] {
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    return raw.flatMap((item, i) => findUnknownKeys(item, parsed[i], `${path}[${i}]`));
  }
  if (raw && parsed && typeof raw === 'object' && typeof parsed === 'object') {
    const out: string[] = [];
    for (const key of Object.keys(raw)) {
      const sub = path ? `${path}.${key}` : key;
      if (!(key in parsed)) {
        if ((raw as Record<string, unknown>)[key] !== undefined) out.push(sub);
      } else
        out.push(
          ...findUnknownKeys((raw as Record<string, unknown>)[key], (parsed as Record<string, unknown>)[key], sub),
        );
    }
    return out;
  }
  return [];
}
