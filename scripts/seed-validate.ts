// Validate every /seed file against the schema plus integrity rules; report connector positions still to place.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { checkGearModel, checkProject, checkStandModel, unplacedConnectorCount } from '../src/domain/integrity.ts';
import { CableModel, GearModel, StandModel, Template } from '../src/domain/schemas.ts';
import { loadProject, zodIssuesToLoadIssues } from '../src/domain/serialize.ts';

const ROOT = new URL('../seed/', import.meta.url).pathname;
let errors = 0;
const fail = (file: string, msg: string) => {
  errors++;
  console.error(`✗ ${file}: ${msg}`);
};

function validateDir<T extends z.ZodType>(dir: string, schema: T): z.infer<T>[] {
  const out: z.infer<T>[] = [];
  for (const name of readdirSync(join(ROOT, dir))
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const file = `${dir}/${name}`;
    const raw: unknown = JSON.parse(readFileSync(join(ROOT, dir, name), 'utf8'));
    const r = schema.safeParse(raw);
    if (!r.success) {
      for (const i of zodIssuesToLoadIssues(raw, r.error)) fail(file, `${i.path}: ${i.message}`);
      continue;
    }
    if ((r.data as { id: string }).id !== name.replace(/\.json$/, '')) fail(file, 'file name must equal the id');
    out.push(r.data);
  }
  return out;
}

const gear = validateDir('gear', GearModel);
const stands = validateDir('stands', StandModel);
validateDir('cables', CableModel);
validateDir('templates', Template);

const gearIds = new Set(gear.map((g) => g.id));
for (const g of gear)
  for (const i of checkGearModel(g, gearIds))
    if (i.level === 'error') fail(`gear/${g.id}.json`, `${i.path}: ${i.message}`);
for (const s of stands)
  for (const i of checkStandModel(s)) if (i.level === 'error') fail(`stands/${s.id}.json`, `${i.path}: ${i.message}`);

const sample = loadProject(readFileSync(join(ROOT, 'studio.sample.json'), 'utf8'));
if (!sample.ok) {
  fail('studio.sample.json', sample.message);
  for (const i of sample.issues) fail('studio.sample.json', `${i.path}: ${i.message}`);
} else {
  for (const i of checkProject(sample.project))
    if (i.level === 'error') fail('studio.sample.json', `${i.path}: ${i.message}`);
}

console.log('\nConnector positions still to place (from panel images):');
let total = 0;
for (const g of gear.filter((m) => m.category !== 'power')) {
  const n = unplacedConnectorCount(g);
  if (n) console.log(`  ${String(n).padStart(3)}  ${g.manufacturer} ${g.name}${g.variant ? ' ' + g.variant : ''}`);
  total += n;
}
console.log(`  ${total} connectors on ${gear.length} models.\n`);

if (errors) {
  console.error(`${errors} error(s).`);
  process.exit(1);
}
console.log(`Seed OK: ${gear.length} gear models, ${stands.length} stands, sample project valid.`);
