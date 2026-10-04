// Referential-integrity and data-truthfulness checks beyond what the Zod schema can express.
// Used by `seed:validate`, tests, and (later) the DATA rules.
import type { GearModel, Project, Provenance, StandModel } from './types';

export interface IntegrityIssue {
  level: 'error' | 'warning' | 'info';
  path: string;
  message: string;
}

/** Provenance lookup honouring `*` wildcards in keys (`connectors.*.pos`). Walks up to parent paths. */
export function provenanceFor(map: Record<string, Provenance>, path: string): Provenance | undefined {
  const segs = path.split('.');
  for (let n = segs.length; n > 0; n--) {
    const prefix = segs.slice(0, n);
    const exact = map[prefix.join('.')];
    if (exact) return exact;
    for (const [key, value] of Object.entries(map)) {
      const ks = key.split('.');
      if (ks.length === n && ks.every((k, i) => k === '*' || k === prefix[i])) return value;
    }
  }
  return undefined;
}

function nullPaths(obj: unknown, path: string, out: string[]) {
  if (obj === null) out.push(path);
  else if (Array.isArray(obj)) obj.forEach((v, i) => nullPaths(v, `${path}.${i}`, out));
  else if (obj && typeof obj === 'object')
    for (const [k, v] of Object.entries(obj)) nullPaths(v, path ? `${path}.${k}` : k, out);
}

/** Give every `null` in dimensions, power and connectors an `unknown` provenance entry unless one applies already. */
export function ensureUnknownProvenance(m: GearModel, note = 'Not known yet.'): void {
  const nulls: string[] = [];
  nullPaths({ dimensions: m.dimensions, power: m.power, connectors: m.connectors }, '', nulls);
  for (const p of nulls) if (!provenanceFor(m.provenance, p)) m.provenance[p] = { kind: 'unknown', note };
}

/** Value at a dotted path (`dimensions.w`, `power.sources.0.drawMa`). */
export function valueAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Connector ids referenced by internal paths may carry a channel suffix (`adat-out:3`). */
const baseConnectorId = (ref: string) => ref.split(':')[0]!;

export function checkGearModel(m: GearModel, gearIds?: Set<string>): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const at = (p: string) => `gear[${m.id}]${p ? '.' + p : ''}`;
  const ids = new Set<string>();
  m.connectors.forEach((c, i) => {
    if (ids.has(c.id))
      issues.push({ level: 'error', path: at(`connectors.${i}`), message: `Duplicate connector id "${c.id}"` });
    ids.add(c.id);
    if (c.usb && c.domain !== 'usb.data')
      issues.push({ level: 'warning', path: at(`connectors.${i}`), message: 'usb block on a non-USB connector' });
    if (c.domain === 'usb.data' && c.signal && c.signal.balance !== 'n/a')
      issues.push({ level: 'error', path: at(`connectors.${i}`), message: 'USB connector with an analog balance' });
  });
  for (const c of m.connectors) {
    for (const x of c.exclusiveWith ?? [])
      if (!ids.has(x))
        issues.push({
          level: 'error',
          path: at(`connectors[${c.id}]`),
          message: `exclusiveWith references unknown "${x}"`,
        });
  }
  m.internalPaths.forEach((ip, i) => {
    for (const ref of [...ip.from, ...ip.to, ...(ip.channelMap ?? []).flatMap((x) => [x.from, x.to])]) {
      if (!ids.has(baseConnectorId(ref)))
        issues.push({
          level: 'error',
          path: at(`internalPaths.${i}`),
          message: `Path "${ip.id}" references unknown connector "${ref}"`,
        });
    }
  });
  m.power.sources.forEach((s, i) => {
    if (s.inputConnectorId && !ids.has(s.inputConnectorId))
      issues.push({
        level: 'error',
        path: at(`power.sources.${i}`),
        message: `Unknown input connector "${s.inputConnectorId}"`,
      });
    if (s.suppliedModelId && gearIds && !gearIds.has(s.suppliedModelId))
      issues.push({
        level: 'error',
        path: at(`power.sources.${i}`),
        message: `Unknown supplied model "${s.suppliedModelId}"`,
      });
  });
  const nulls: string[] = [];
  nullPaths({ dimensions: m.dimensions, power: m.power, connectors: m.connectors }, '', nulls);
  for (const p of nulls) {
    if (!provenanceFor(m.provenance, p))
      issues.push({ level: 'error', path: at(p), message: 'Null value without provenance (expected `unknown`)' });
  }
  return issues;
}

export function checkStandModel(s: StandModel): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const ids = new Set<string>();
  s.surfaces.forEach((sf, i) => {
    if (ids.has(sf.id))
      issues.push({ level: 'error', path: `stand[${s.id}].surfaces.${i}`, message: `Duplicate surface id "${sf.id}"` });
    ids.add(sf.id);
  });
  return issues;
}

/** Placeholder connector positions (0,0) per model, for the "positions to place" report. */
export function unplacedConnectorCount(m: GearModel): number {
  return m.connectors.filter((c) => c.pos.x === 0 && c.pos.y === 0).length;
}

export function checkProject(p: Project): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const dup = (kind: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) issues.push({ level: 'error', path: kind, message: `Duplicate id "${x.id}"` });
      seen.add(x.id);
    }
  };
  const { gearModels, standModels, cableModels } = p.library;
  dup('library.gearModels', gearModels);
  dup('library.standModels', standModels);
  dup('library.cableModels', cableModels);
  dup('inventory.gearUnits', p.inventory.gearUnits);
  dup('inventory.standUnits', p.inventory.standUnits);
  dup('setups', p.setups);

  const gearIds = new Set(gearModels.map((m) => m.id));
  gearModels.forEach((m) => issues.push(...checkGearModel(m, gearIds)));
  standModels.forEach((s) => issues.push(...checkStandModel(s)));

  const gearById = new Map(gearModels.map((m) => [m.id, m]));
  const standById = new Map(standModels.map((m) => [m.id, m]));
  const cableIds = new Set(cableModels.map((c) => c.id));
  const unitModel = new Map<string, GearModel>();
  p.inventory.gearUnits.forEach((u, i) => {
    const m = gearById.get(u.modelId);
    if (!m) issues.push({ level: 'error', path: `inventory.gearUnits.${i}`, message: `Unknown model "${u.modelId}"` });
    else unitModel.set(u.id, m);
  });
  const standUnitModel = new Map<string, StandModel>();
  p.inventory.standUnits.forEach((u, i) => {
    const m = standById.get(u.modelId);
    if (!m)
      issues.push({ level: 'error', path: `inventory.standUnits.${i}`, message: `Unknown stand model "${u.modelId}"` });
    else standUnitModel.set(u.id, m);
  });
  if (p.activeSetupId && !p.setups.some((s) => s.id === p.activeSetupId))
    issues.push({ level: 'error', path: 'activeSetupId', message: 'Active setup does not exist' });

  p.setups.forEach((s, si) => {
    const at = (x: string) => `setups.${si}.${x}`;
    if (!p.bodyProfiles.some((b) => b.id === s.bodyProfileId))
      issues.push({ level: 'error', path: at('bodyProfileId'), message: `Unknown body profile "${s.bodyProfileId}"` });
    const standsInSetup = new Set(s.stands.map((st) => st.standUnitId));
    s.stands.forEach((st, i) => {
      if (!standUnitModel.has(st.standUnitId))
        issues.push({ level: 'error', path: at(`stands.${i}`), message: `Unknown stand unit "${st.standUnitId}"` });
    });
    const placed = new Set<string>();
    s.placements.forEach((pl, i) => {
      if (!unitModel.has(pl.unitId))
        issues.push({ level: 'error', path: at(`placements.${i}`), message: `Unknown unit "${pl.unitId}"` });
      if (placed.has(pl.unitId))
        issues.push({ level: 'error', path: at(`placements.${i}`), message: `Unit "${pl.unitId}" placed twice` });
      placed.add(pl.unitId);
      const m = pl.mount;
      if (m.type === 'surface' || m.type === 'rack') {
        const sm = standUnitModel.get(m.standUnitId);
        if (!standsInSetup.has(m.standUnitId))
          issues.push({
            level: 'error',
            path: at(`placements.${i}`),
            message: `Stand "${m.standUnitId}" is not in this setup`,
          });
        const surface = sm?.surfaces.find((x) => x.id === m.surfaceId);
        if (sm && !surface)
          issues.push({ level: 'error', path: at(`placements.${i}`), message: `Unknown surface "${m.surfaceId}"` });
        if (m.type === 'rack' && surface && !surface.rack)
          issues.push({
            level: 'error',
            path: at(`placements.${i}`),
            message: `Surface "${m.surfaceId}" is not a rack bay`,
          });
      }
      if (m.type === 'stacked' && !s.placements.some((q) => q.unitId === m.parentUnitId))
        issues.push({
          level: 'error',
          path: at(`placements.${i}`),
          message: `Stacked on unplaced unit "${m.parentUnitId}"`,
        });
    });
    s.connections.forEach((c, i) => {
      for (const end of [c.a, c.b]) {
        const m = unitModel.get(end.unitId);
        if (!m) issues.push({ level: 'error', path: at(`connections.${i}`), message: `Unknown unit "${end.unitId}"` });
        else if (!m.connectors.some((x) => x.id === end.connectorId))
          issues.push({
            level: 'error',
            path: at(`connections.${i}`),
            message: `${m.name} has no connector "${end.connectorId}"`,
          });
      }
      if (c.cable.modelId && !cableIds.has(c.cable.modelId))
        issues.push({
          level: 'error',
          path: at(`connections.${i}`),
          message: `Unknown cable model "${c.cable.modelId}"`,
        });
      for (const a of c.cable.adapters)
        if (!cableIds.has(a))
          issues.push({ level: 'error', path: at(`connections.${i}`), message: `Unknown adapter "${a}"` });
    });
    for (const [unitId, cfg] of Object.entries(s.unitConfigs)) {
      const m = unitModel.get(unitId);
      if (!m) {
        issues.push({ level: 'error', path: at(`unitConfigs.${unitId}`), message: 'Config for unknown unit' });
        continue;
      }
      for (const [connId, alt] of Object.entries(cfg.activeAlternates)) {
        const conn = m.connectors.find((x) => x.id === connId);
        if (!conn?.alternates?.some((a) => a.id === alt))
          issues.push({
            level: 'error',
            path: at(`unitConfigs.${unitId}`),
            message: `Unknown alternate ${connId}=${alt}`,
          });
      }
      if (
        cfg.clockSource &&
        cfg.clockSource !== 'internal' &&
        !m.connectors.some((x) => x.id === (cfg.clockSource as { connectorId: string }).connectorId)
      )
        issues.push({
          level: 'error',
          path: at(`unitConfigs.${unitId}.clockSource`),
          message: 'Unknown clock source connector',
        });
    }
  });
  return issues;
}
