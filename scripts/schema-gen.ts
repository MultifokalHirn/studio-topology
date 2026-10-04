// Emit schema/project.schema.json from the Zod schemas. `--check` fails when the committed file is stale (CI drift check).
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { CURRENT_SCHEMA_VERSION } from '../src/domain/migrations.ts';
import { Project } from '../src/domain/schemas.ts';
import { toCanonicalJson } from '../src/domain/serialize.ts';

const OUT = new URL('../schema/project.schema.json', import.meta.url);

const schema = {
  ...z.toJSONSchema(Project, { target: 'draft-2020-12', reused: 'ref' }),
  $id: 'https://studio-planner.local/schema/project.schema.json',
  title: `Studio Planner project (schemaVersion ${CURRENT_SCHEMA_VERSION})`,
};
const text = toCanonicalJson(schema);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    /* missing counts as stale */
  }
  if (current !== text) {
    console.error('schema/project.schema.json is out of date. Run `npm run schema:gen`.');
    process.exit(1);
  }
  console.log('schema/project.schema.json is up to date.');
} else {
  writeFileSync(OUT, text);
  console.log(`Wrote ${OUT.pathname}`);
}
