import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autoLabels, resolveCableColor } from '@/domain/cables';
import { defaultSettings } from '@/domain/defaults';
import { standBase, surfaceFrame } from '@/domain/geometry';
import { checkProject } from '@/domain/integrity';
import { categorySuggestions, isPowerSupply, templateFromModel } from '@/domain/libraryOps';
import { firstFreeU, rackFit, type RackItem } from '@/domain/rack';
import { GearModel as GearSchema, Template as TemplateSchema } from '@/domain/schemas';
import { loadProject } from '@/domain/serialize';
import { rackStand } from '@/domain/stands';
import { instantiateGearTemplate, instantiateStandTemplate } from '@/domain/templates';
import type { Connection, GearModel, Project, StandState } from '@/domain/types';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const tpl = (id: string) =>
  TemplateSchema.parse(JSON.parse(readFileSync(new URL(`../../seed/templates/${id}.json`, import.meta.url), 'utf8')));

describe('free-text categories (ADR 0002)', () => {
  it('accepts any non-empty category and suggests the ones in use', () => {
    const p = sample();
    const m = { ...p.library.gearModels[0]!, category: 'my nearfields' };
    expect(GearSchema.safeParse(m).success).toBe(true);
    expect(GearSchema.safeParse({ ...m, category: '  ' }).success).toBe(false);
    p.library.gearModels.push(m);
    expect(categorySuggestions(p)).toContain('my nearfields');
    expect(categorySuggestions(p)).toContain('monitor-controller');
  });

  it('power supplies are recognised by their rated outputs, not their category', () => {
    const p = sample();
    const psu = structuredClone(p.library.gearModels.find((m) => m.id === 'gear-elektron-psu-3c')!);
    psu.category = 'whatever';
    expect(isPowerSupply(psu)).toBe(true);
    expect(isPowerSupply(p.library.gearModels.find((m) => m.id === 'gear-generic-power-strip-8')!)).toBe(true);
    expect(isPowerSupply(p.library.gearModels.find((m) => m.id === 'gear-elektron-digitone-ii')!)).toBe(false);
  });

  it('a model can be saved as a reusable template', () => {
    const p = sample();
    const dt = p.library.gearModels.find((m) => m.id === 'gear-elektron-digitone-ii')!;
    const t = templateFromModel(dt, 'tpl-mine');
    expect(TemplateSchema.safeParse(t).success).toBe(true);
    const copy = instantiateGearTemplate(t, {}, 'copy');
    expect(copy.connectors.map((c) => c.id)).toEqual(dt.connectors.map((c) => c.id));
    expect(copy.dimensions.w).toBe(215);
  });
});

describe('monitoring and power templates', () => {
  it('monitor controller repeats speaker sets and headphone outs', () => {
    const m = instantiateGearTemplate(tpl('tpl-monitor-controller'), { speakerSets: 3, phones: 2 });
    expect(m.connectors.filter((c) => /^out-\d-(l|r)$/.test(c.id))).toHaveLength(6);
    expect(m.connectors.find((c) => c.id === 'out-3-r')?.channel).toEqual({ role: 'R', group: 'out-3' });
    expect(m.connectors.filter((c) => c.domain === 'audio.headphone')).toHaveLength(2);
  });

  it('power strips carry outlets with ratings and a shared distribution rating', () => {
    const m = instantiateGearTemplate(tpl('tpl-power-strip'), { outlets: 4 });
    expect(m.connectors.filter((c) => c.jack === 'mains-socket')).toHaveLength(4);
    expect(m.power.distribution).toEqual({ voltage: 230, totalCurrentMaMax: 16000, switched: true });
    const pdu = instantiateGearTemplate(tpl('tpl-rack-pdu'), { outlets: 8, u: 1 });
    expect(pdu.dimensions).toMatchObject({ h: 44.45, rack: { u: 1 } });
  });

  it('rack shelf height follows its U', () => {
    expect(instantiateGearTemplate(tpl('tpl-rack-shelf'), { u: 2 }).dimensions.h).toBeCloseTo(88.9);
  });
});

describe('rack fit', () => {
  const p = sample();
  const models = new Map(p.library.gearModels.map((m) => [m.id, m]));
  const unitModel = (unitId: string) => models.get(p.inventory.gearUnits.find((u) => u.id === unitId)!.modelId)!;
  const bay = p.library.standModels.find((m) => m.id === 'stand-generic-rack-12u')!.surfaces[0]!;
  const items: RackItem[] = p.setups[0]!.placements.flatMap((pl) =>
    pl.mount.type === 'rack' ? [{ unitId: pl.unitId, uStart: pl.mount.uStart, model: unitModel(pl.unitId) }] : [],
  );

  it('the sample rack holds the reference rack gear plus the PDU without errors', () => {
    const fit = rackFit(bay, items);
    expect(fit.problems.filter((x) => x.severity === 'error')).toEqual([]);
    // The SX 2 rack height is unknown in the reference: reported as a warning and counted as 1U.
    expect(fit.problems.find((x) => x.unitId === 'unit-sx2')).toMatchObject({
      kind: 'unknown-height',
      severity: 'warning',
    });
    expect(fit.usedU).toBe(9); // eight 1U units + the PDU at U12
    expect(firstFreeU(bay, items, unitModel('unit-dbx'))).toBe(9);
  });

  it('detects overlap, out-of-range and depth overflow', () => {
    const dbx = unitModel('unit-dbx');
    const deep: GearModel = { ...dbx, dimensions: { ...dbx.dimensions, d: 500 } };
    const fit = rackFit(bay, [
      { unitId: 'a', uStart: 1, model: dbx },
      { unitId: 'b', uStart: 1, model: dbx },
      { unitId: 'c', uStart: 12, model: unitModel('unit-wz3') },
      { unitId: 'd', uStart: 5, model: deep },
    ]);
    const kinds = fit.problems.map((x) => `${x.unitId}:${x.kind}`);
    expect(kinds).toEqual(expect.arrayContaining(['b:overlap', 'c:out-of-range', 'd:too-deep']));
  });

  it('a 10U MixWizard fits a 12U case but not at U4', () => {
    const wz = unitModel('unit-wz3');
    const caseBay = rackStand({ id: 'c', name: 'Case', u: 12, depthMm: 400, kind: 'rack-case' }).surfaces[0]!;
    expect(
      rackFit(caseBay, [{ unitId: 'wz', uStart: 1, model: wz }]).problems.filter((x) => x.severity === 'error'),
    ).toEqual([]);
    expect(rackFit(caseBay, [{ unitId: 'wz', uStart: 4, model: wz }]).problems.map((x) => x.kind)).toContain(
      'out-of-range',
    );
  });

  it('19" gear does not fit a 10" rack; 10" gear in a 19" rack needs an adapter', () => {
    const dbx = unitModel('unit-dbx');
    const half = instantiateStandTemplate(tpl('tpl-stand-rack-case'), { u: 4, depthMm: 300, inches: 10 }).surfaces[0]!;
    expect(half.rack).toMatchObject({ standard: '10in', innerWidthMm: 222.25 });
    expect(rackFit(half, [{ unitId: 'x', uStart: 1, model: dbx }]).problems.map((x) => x.kind)).toContain('too-wide');
    const tenInch: GearModel = {
      ...dbx,
      dimensions: { ...dbx.dimensions, rack: { u: 1, earsIncluded: true, standard: '10in' } },
    };
    expect(rackFit(bay, [{ unitId: 'y', uStart: 1, model: tenInch }]).problems.map((x) => x.kind)).toContain(
      'needs-adapter',
    );
  });

  it('rejects non-rack gear', () => {
    expect(rackFit(bay, [{ unitId: 'z', uStart: 1, model: unitModel('unit-dt2') }]).problems[0]?.kind).toBe('not-rack');
  });
});

describe('stands on stands', () => {
  it('a rack case on a desk inherits the desk height', () => {
    const p = sample();
    const deskModel = p.library.standModels.find((m) => m.id === 'stand-generic-desk')!;
    const caseModel = rackStand({ id: 'case', name: 'Case', u: 4, depthMm: 300, kind: 'rack-case' });
    const stands: StandState[] = [
      { standUnitId: 'desk', pos: { x: 100, y: 50 }, rotationDeg: 0, surfaceStates: {} },
      {
        standUnitId: 'case',
        pos: { x: 0, y: 0 },
        rotationDeg: 0,
        surfaceStates: {},
        onSurface: { standUnitId: 'desk', surfaceId: 'top', x: 200, y: 10 },
      },
    ];
    const surfaceOf = (unit: string, surface: string) =>
      (unit === 'desk' ? deskModel : caseModel).surfaces.find((s) => s.id === surface);
    const base = standBase('case', stands, surfaceOf);
    expect(base).toEqual({ x: 300, y: 60, z: 740 });
    const bayFrame = surfaceFrame(caseModel.surfaces[0]!, stands[1]!, base);
    expect(bayFrame.origin.z).toBe(740 + 25);
  });

  it('integrity check flags cycles and unknown parents', () => {
    const p = sample();
    const s = p.setups[0]!;
    s.stands[0]!.onSurface = { standUnitId: 'stand-unit-desk', surfaceId: 'top', x: 0, y: 0 };
    s.stands[1]!.onSurface = { standUnitId: 'stand-unit-jaspers', surfaceId: 'tier-top', x: 0, y: 0 };
    expect(checkProject(p).map((i) => i.message)).toContain('Stands are stacked in a cycle');
  });
});

describe('cables', () => {
  const p = sample();
  const s = p.setups[0]!;
  const units = new Map(p.inventory.gearUnits.map((u) => [u.id, u]));
  const models = new Map(p.library.gearModels.map((m) => [m.id, m]));
  const ends = {
    unitOf: (id: string) => units.get(id),
    modelOf: (id: string) => models.get(units.get(id)?.modelId ?? ''),
  };

  it('auto-labels number per signal family; stereo bundles share a number', () => {
    const labels = autoLabels(s.connections, ends);
    expect(labels.get('setup-current-conn-001')).toBe('A01 L');
    expect(labels.get('setup-current-conn-002')).toBe('A01 R');
    expect([...labels.values()].some((l) => l.startsWith('M'))).toBe(true);
    // Sidekick stereo out split by a Y cable: sides come from the KeyMix inputs.
    const yIds = s.connections
      .filter((c) => c.bundleId === 'setup-current-sidekick-keymix')
      .map((c) => labels.get(c.id));
    expect(yIds.map((l) => l?.slice(-1))).toEqual(['L', 'R']);
    expect([...labels.values()].some((l) => l.startsWith('P'))).toBe(true);
  });

  it('continues numbering after existing labels and leaves them alone', () => {
    const conns: Connection[] = structuredClone(s.connections.slice(0, 4));
    conns[0]!.label = 'A07 custom';
    const labels = autoLabels(conns, ends);
    expect(labels.has(conns[0]!.id)).toBe(false);
    expect(labels.get(conns[1]!.id)).toBe('A07 R');
    expect(labels.get(conns[2]!.id)).toBe('A08 L');
  });

  it('colour precedence: connection → owned cable → cable type → domain palette', () => {
    const settings = defaultSettings();
    const c = structuredClone(s.connections[0]!);
    const base = { domain: 'audio.analog' as const, role: 'L', settings };
    expect(resolveCableColor(c, base)).toBe('#2563EB');
    expect(resolveCableColor(c, { ...base, cableModel: { ...p.library.cableModels[0]!, color: '#111111' } })).toBe(
      '#111111',
    );
    expect(
      resolveCableColor(c, {
        ...base,
        cableUnit: { id: 'x', modelId: 'm', lengthMm: 1, inStock: true, color: '#222222' },
      }),
    ).toBe('#222222');
    expect(resolveCableColor({ ...c, color: '#333333' }, base)).toBe('#333333');
  });

  it('owned cables assigned to connections are checked', () => {
    const q = sample();
    q.inventory.cables.push({
      id: 'cab-1',
      modelId: 'cable-trs-6.35',
      lengthMm: 1000,
      inStock: true,
      label: 'A01',
      color: '#ff0000',
    });
    q.setups[0]!.connections[0]!.cable.unitId = 'cab-1';
    q.setups[0]!.connections[1]!.cable.unitId = 'cab-1';
    q.setups[0]!.connections[2]!.cable.unitId = 'missing';
    const msgs = checkProject(q).map((i) => i.message);
    expect(msgs).toContain('Owned cable "cab-1" is used 2 times');
    expect(msgs).toContain('Unknown owned cable "missing"');
  });
});

describe('sample mains wiring', () => {
  it('every mains-powered unit and every wall adapter is plugged into a strip or the PDU', () => {
    const p = sample();
    const models = new Map(p.library.gearModels.map((m) => [m.id, m]));
    for (const s of p.setups) {
      const powered = new Set(
        s.connections.flatMap((c) => [`${c.a.unitId}/${c.a.connectorId}`, `${c.b.unitId}/${c.b.connectorId}`]),
      );
      for (const u of p.inventory.gearUnits) {
        const m = models.get(u.modelId)!;
        for (const c of m.connectors) {
          const needsMains =
            c.domain === 'power.ac' &&
            c.direction === 'in' &&
            (c.jack === 'iec-c14' || (c.jack === 'mains-plug' && isPowerSupply(m) && !m.power.distribution));
          if (needsMains) expect(powered.has(`${u.id}/${c.id}`), `${s.name}: ${u.nickname} ${c.id}`).toBe(true);
        }
      }
    }
  });
});
