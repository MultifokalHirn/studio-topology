// Thin translation helper (spec §9). English only for now; keys are the English strings.
export function t(key: string, vars?: Record<string, string | number>): string {
  if (!vars) return key;
  return key.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}
