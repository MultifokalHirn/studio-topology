// Cable bill of materials (spec §5.8): group needed cables by model and length; compare with owned stock.
import type { CableModel, CableUnit, Connection } from '@/domain/types';

export interface BomRow {
  cableModelId: string | null;
  name: string;
  /** null = length unknown (an end is not placed). */
  lengthMm: number | null;
  needed: number;
  owned: number;
  missing: number;
  connectionIds: string[];
}

export function cableBom(connections: Connection[], models: CableModel[], owned: CableUnit[]): BomRow[] {
  const byKey = new Map<string, BomRow>();
  const nameOf = (id: string | null) => (id ? (models.find((m) => m.id === id)?.name ?? id) : '— no cable chosen');
  const add = (modelId: string | null, lengthMm: number | null, connectionId: string) => {
    const key = `${modelId ?? ''}|${lengthMm ?? ''}`;
    const row = byKey.get(key) ?? {
      cableModelId: modelId,
      name: nameOf(modelId),
      lengthMm,
      needed: 0,
      owned: 0,
      missing: 0,
      connectionIds: [],
    };
    row.needed++;
    row.connectionIds.push(connectionId);
    byKey.set(key, row);
  };
  for (const c of connections.filter((x) => x.enabled)) {
    // Captive leads (PSUs, wall adapters) and wireless links need no cable.
    if (!c.cable.modelId && c.cable.autoLength === false && !c.cable.lengthMm) continue;
    add(c.cable.modelId ?? null, c.cable.lengthMm ?? null, c.id);
    for (const a of c.cable.adapters) add(a, null, c.id);
  }
  for (const row of byKey.values()) {
    const isAdapter = models.find((m) => m.id === row.cableModelId)?.kind === 'adapter';
    row.owned = owned.filter(
      (u) =>
        u.inStock &&
        u.modelId === row.cableModelId &&
        (isAdapter || row.lengthMm === null || u.lengthMm === row.lengthMm),
    ).length;
    row.missing = Math.max(0, row.needed - row.owned);
  }
  return [...byKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || (a.lengthMm ?? Infinity) - (b.lengthMm ?? Infinity),
  );
}

export function bomCsv(rows: BomRow[]): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['cable', 'length_mm', 'needed', 'owned_in_stock', 'missing'].join(',')];
  for (const r of rows) lines.push([r.name, r.lengthMm, r.needed, r.owned, r.missing].map(esc).join(','));
  return lines.join('\n') + '\n';
}
