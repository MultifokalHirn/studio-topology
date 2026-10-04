import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/domain/defaults';
import { CURRENT_SCHEMA_VERSION, migrate, type Migration } from '@/domain/migrations';
import { Project as ProjectSchema } from '@/domain/schemas';
import { canonicalize, loadProject, serializeProject, toCanonicalJson } from '@/domain/serialize';
import { sampleProject } from '../fixtures/sampleProject';

const GOLDEN = new URL('../fixtures/golden-project.json', import.meta.url);
if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, serializeProject(sampleProject()));
const golden = readFileSync(GOLDEN, 'utf8');

describe('golden round trip', () => {
  it('the fixture is schema-valid', () => {
    expect(ProjectSchema.safeParse(sampleProject()).success).toBe(true);
  });

  it('serialising the fixture matches the golden file', () => {
    expect(serializeProject(sampleProject())).toBe(golden);
  });

  it('load → save is byte-identical', () => {
    const r = loadProject(golden);
    if (!r.ok) throw new Error(`${r.message}\n${JSON.stringify(r.issues, null, 2)}`);
    expect(serializeProject(r.project)).toBe(golden);
  });

  it('a new empty project round-trips', () => {
    const text = serializeProject(createEmptyProject('X', '2026-01-01T00:00:00.000Z'));
    const r = loadProject(text);
    expect(r.ok && serializeProject(r.project)).toBe(text);
  });
});

describe('canonical JSON', () => {
  it('sorts keys recursively, keeps array order, drops undefined, ends with a newline', () => {
    expect(toCanonicalJson({ b: 1, a: { d: [3, 1], c: undefined } })).toBe(
      '{\n  "a": {\n    "d": [\n      3,\n      1\n    ]\n  },\n  "b": 1\n}\n',
    );
    expect(canonicalize([{ y: 1, x: 2 }])).toEqual([{ x: 2, y: 1 }]);
    expect(Object.keys(canonicalize({ y: 1, x: 2 }) as object)).toEqual(['x', 'y']);
  });
});

describe('load errors (spec §6, scenario 10)', () => {
  const base = () => JSON.parse(golden) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('rejects non-JSON', () => {
    const r = loadProject('{ nope');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('parse');
  });

  it('flags a future schemaVersion and offers the raw document read-only', () => {
    const doc = base();
    doc.schemaVersion = CURRENT_SCHEMA_VERSION + 1;
    const r = loadProject(JSON.stringify(doc));
    expect(!r.ok && r.reason).toBe('future-version');
    expect(!r.ok && r.raw).toBeTruthy();
  });

  it('reports a malformed connector with path, value and expected type', () => {
    const doc = base();
    doc.library.gearModels[0].connectors[2].direction = 'sideways';
    doc.library.gearModels[0].connectors[3].pos.x = 'left';
    const r = loadProject(JSON.stringify(doc));
    if (r.ok) throw new Error('expected failure');
    expect(r.reason).toBe('schema');
    const byPath = Object.fromEntries(r.issues.map((i) => [i.path, i]));
    expect(byPath['library.gearModels[0].connectors[2].direction']?.value).toBe('sideways');
    expect(byPath['library.gearModels[0].connectors[3].pos.x']).toMatchObject({ value: 'left', expected: 'number' });
  });

  it('refuses to silently drop unknown fields', () => {
    const doc = base();
    doc.library.gearModels[0].futureField = 42;
    const r = loadProject(JSON.stringify(doc));
    expect(!r.ok && r.issues.map((i) => i.path)).toEqual(['library.gearModels[0].futureField']);
  });
});

describe('migrations', () => {
  const v0to1: Migration = {
    from: 0,
    up(doc) {
      doc.bodyProfiles ??= [];
      return ['added empty bodyProfiles'];
    },
  };

  it('runs steps in order and reports changes', () => {
    const r = migrate({ schemaVersion: 0 }, [v0to1], 1);
    expect(r).toMatchObject({ status: 'ok', fromVersion: 0, changes: ['v0→v1: added empty bodyProfiles'] });
    expect(r.status === 'ok' && r.doc).toEqual({ schemaVersion: 1, bodyProfiles: [] });
  });

  it('does not mutate the input', () => {
    const input = { schemaVersion: 0 };
    migrate(input, [v0to1], 1);
    expect(input).toEqual({ schemaVersion: 0 });
  });

  it('fails clearly when a step is missing or the version is bad', () => {
    expect(migrate({ schemaVersion: 0 }, [], 1)).toMatchObject({ status: 'invalid' });
    expect(migrate({ schemaVersion: 'x' })).toMatchObject({ status: 'invalid' });
    expect(migrate([])).toMatchObject({ status: 'invalid' });
  });

  it('current files need no migration', () => {
    expect(migrate({ schemaVersion: CURRENT_SCHEMA_VERSION })).toMatchObject({ status: 'ok', changes: [] });
  });
});
