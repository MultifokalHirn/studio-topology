// Compile the hand-authored seed sources (scripts/seed/*.ts) into /seed JSON.
// `--check` fails when the committed JSON differs from what the sources produce (CI drift check).
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toCanonicalJson } from '../src/domain/serialize.ts';
import { cableModels, standModels, templates } from './seed/catalog.ts';
import { instrumentModels } from './seed/gear-instruments.ts';
import { psuModels, studioModels } from './seed/gear-studio.ts';
import { sampleProject } from './seed/sample.ts';

const ROOT = new URL('../seed/', import.meta.url).pathname;
const gearModels = [...instrumentModels, ...studioModels, ...psuModels];

const files = new Map<string, string>();
const put = (dir: string, list: { id: string }[]) =>
  list.forEach((x) => files.set(join(dir, `${x.id}.json`), toCanonicalJson(x)));
put('gear', gearModels);
put('stands', standModels);
put('cables', cableModels);
put('templates', templates);
files.set('studio.sample.json', toCanonicalJson(sampleProject(gearModels, standModels, cableModels)));

const DIRS = ['gear', 'stands', 'cables', 'templates'];
const existing = new Map<string, string>();
for (const d of DIRS) {
  let names: string[] = [];
  try {
    names = readdirSync(join(ROOT, d));
  } catch {
    /* new dir */
  }
  for (const n of names) existing.set(join(d, n), readFileSync(join(ROOT, d, n), 'utf8'));
}
try {
  existing.set('studio.sample.json', readFileSync(join(ROOT, 'studio.sample.json'), 'utf8'));
} catch {
  /* new */
}

if (process.argv.includes('--check')) {
  const stale = [...files].filter(([k, v]) => existing.get(k) !== v).map(([k]) => k);
  const extra = [...existing.keys()].filter((k) => !files.has(k));
  if (stale.length || extra.length) {
    console.error(`Seed JSON is out of date (${[...stale, ...extra].join(', ')}). Run \`npm run seed:build\`.`);
    process.exit(1);
  }
  console.log(`Seed JSON is up to date (${files.size} files).`);
} else {
  for (const d of DIRS) {
    rmSync(join(ROOT, d), { recursive: true, force: true });
    mkdirSync(join(ROOT, d), { recursive: true });
  }
  for (const [k, v] of files) writeFileSync(join(ROOT, k), v);
  console.log(
    `Wrote ${files.size} seed files (${gearModels.length} gear, ${standModels.length} stands, ${cableModels.length} cables, ${templates.length} templates, sample project).`,
  );
}
