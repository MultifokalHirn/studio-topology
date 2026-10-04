// Built-in catalogue shipped in /seed: templates (eager, small) and the sample studio (lazy, ~650 KB).
import { Template as TemplateSchema } from '@/domain/schemas';
import { loadProject, type LoadResult } from '@/domain/serialize';
import type { Template } from '@/domain/types';

const templateFiles = import.meta.glob<unknown>('/seed/templates/*.json', { eager: true, import: 'default' });

export const builtInTemplates: Template[] = Object.values(templateFiles)
  .map((raw) => TemplateSchema.parse(raw))
  .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

export async function loadSampleProject(): Promise<LoadResult> {
  const text = (await import('/seed/studio.sample.json?raw')).default;
  return loadProject(text);
}
