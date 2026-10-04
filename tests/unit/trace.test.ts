import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadProject } from '@/domain/serialize';
import { instantiateGearTemplate } from '@/domain/templates';
import { Template as TemplateSchema } from '@/domain/schemas';
import type { Connection, Project } from '@/domain/types';
import { buildSignalGraph } from '@/engine/graph';
import { buildContext, runRules } from '@/engine/rules';
import { breadcrumb, continuityBreaks, traceFrom } from '@/engine/trace';
import { clockMasters, clockTree, powerForest, usbForest } from '@/engine/trees';

const sample = (): Project => {
  const r = loadProject(readFileSync(new URL('../../seed/studio.sample.json', import.meta.url), 'utf8'));
  if (!r.ok) throw new Error(r.message);
  return r.project;
};
const wire = (id: string, a: [string, string], b: [string, string]): Connection => ({
  id,
  a: { unitId: a[0], connectorId: a[1] },
  b: { unitId: b[0], connectorId: b[1] },
  cable: { adapters: [], autoLength: true },
  enabled: true,
});
const nick = (p: Project) => (id: string) => p.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;

describe('scenario 6: signal trace (spec §11)', () => {
  it('Octatrack Main L: breadcrumb to the interface, destinations include monitor L', () => {
    const p = sample();
    const s = p.setups[0]!;
    // Add a pair of monitors on the SSL 12 line outs.
    const tpl = TemplateSchema.parse(
      JSON.parse(readFileSync(new URL('../../seed/templates/tpl-monitor-speaker.json', import.meta.url), 'utf8')),
    );
    p.library.gearModels.push(instantiateGearTemplate(tpl, {}, 'gear-monitor'));
    p.inventory.gearUnits.push(
      { id: 'unit-mon-l', modelId: 'gear-monitor', nickname: 'Monitor L' },
      { id: 'unit-mon-r', modelId: 'gear-monitor', nickname: 'Monitor R' },
    );
    s.connections.push(
      wire('m1', ['unit-ssl12', 'out-1'], ['unit-mon-l', 'in']),
      wire('m2', ['unit-ssl12', 'out-2'], ['unit-mon-r', 'in']),
    );
    const g = buildSignalGraph(p, s);
    const t = traceFrom(g, 'unit-ot/out-main-l');
    expect(breadcrumb(g, t, nick(p))).toMatch(
      /^Octatrack MKII · Main L → MixWizard WZ3 16:2 · CH 1 Line → MixWizard WZ3 16:2 · Main Out L → SSL 12 · Input 1/,
    );
    const dest = t.terminals.filter((x) => x.kind === 'destination').map((x) => x.node);
    expect(dest).toContain('unit-mon-l/in');
    expect(dest).toContain('unit-mon-r/in'); // the mixer sums to both sides
    // Upstream from the monitor finds the Octatrack among the sources.
    expect(traceFrom(g, 'unit-mon-l/in', 'up').nodes.has('unit-ot/out-main-l')).toBe(true);
  });

  it('an output with nothing connected is a dead end', () => {
    const p = sample();
    const t = traceFrom(buildSignalGraph(p, p.setups[0]!), 'unit-a4/out-voice-1');
    expect(t.terminals).toEqual([{ node: 'unit-a4/out-voice-1', kind: 'dead-end' }]);
  });

  it('a deliberate L→R swap triggers SIG-006 (direct and through an internal path)', () => {
    const p = sample();
    const s = p.setups[0]!;
    const c = s.connections.find((x) => x.a.unitId === 'unit-dt2' && x.a.connectorId === 'out-main-l')!;
    c.b.connectorId = 'in-r';
    const issues = runRules(buildContext(p, s), { only: ['SIG-006'] }).issues;
    expect(issues.some((i) => i.entityIds.includes(c.id))).toBe(true);

    // Internal swap: the Heat's own routing maps In L to Out R.
    const q = sample();
    const heat = q.library.gearModels.find((m) => m.id === 'gear-elektron-analog-heat-mkii')!;
    heat.internalPaths = [
      {
        id: 'swap',
        from: ['in-l'],
        to: ['out-main-r'],
        mode: 'process',
        channelMap: [{ from: 'in-l', to: 'out-main-r' }],
      },
    ];
    const g = buildSignalGraph(q, q.setups[0]!);
    expect(continuityBreaks(g, 'unit-dt2/out-main-l')[0]).toMatchObject({ from: 'L', to: 'R' });
    expect(runRules(buildContext(q, q.setups[0]!), { only: ['SIG-006'] }).issues.length).toBeGreaterThan(0);
  });
});

describe('scenario 7: clock tree (spec §11)', () => {
  it('Pyramid is master: MIDI clock to the Elektrons, DIN sync where wired; a second master raises CLK-001', () => {
    const p = sample();
    const s = p.setups[0]!;
    s.unitConfigs['unit-pyramid']!.activeAlternates = { 'midi-out-b': 'dinsync24' };
    s.connections.push(wire('din', ['unit-pyramid', 'midi-out-b'], ['unit-rd8', 'clock-in']));
    const g = buildSignalGraph(p, s);
    expect(clockMasters(p, s)).toEqual(['unit-pyramid']);
    const t = clockTree(g, s, 'unit-pyramid');
    for (const u of ['unit-dt2', 'unit-a4', 'unit-ot', 'unit-heat']) expect(t.reached.has(u), u).toBe(true);
    expect(t.links.find((l) => l.to === 'unit-dt2')?.format).toBe('midi');
    expect(t.links.find((l) => l.connection.id === 'din')).toMatchObject({ format: 'dinsync24', hops: 1 });
    expect(runRules(buildContext(p, s), { only: ['CLK-001'] }).issues).toEqual([]);

    s.unitConfigs['unit-a4'] = { ...s.unitConfigs['unit-a4']!, clockMaster: true };
    const clk = runRules(buildContext(p, s), { only: ['CLK-001'] }).issues;
    expect(clk[0]?.entityIds.sort()).toEqual(['unit-a4', 'unit-pyramid']);
  });
});

describe('USB and power trees', () => {
  it('USB: iPad hosts the SSL 12; the mioXL hosts USB-MIDI synths', () => {
    const p = sample();
    const forest = usbForest(buildSignalGraph(p, p.setups[0]!), p.setups[0]!);
    const ipad = forest.find((n) => n.unitId === 'unit-ipad')!;
    expect(ipad.children.map((c) => c.unitId)).toEqual(['unit-ssl12']);
    expect(ipad.children[0]).toMatchObject({ audio: true, busPoweredDrawMa: null });
    expect(
      forest
        .find((n) => n.unitId === 'unit-mioxl')!
        .children.map((c) => c.unitId)
        .sort(),
    ).toEqual(['unit-2xm', 'unit-nifty']);
  });

  it('power: strips → adapters → units', () => {
    const p = sample();
    const forest = powerForest(buildSignalGraph(p, p.setups[0]!), p.setups[0]!);
    const stand = forest.find((n) => n.unitId === 'unit-strip-stand')!;
    const psu = stand.children.find((c) => c.unitId === 'unit-psu-dt2')!;
    expect(psu.children.map((c) => c.unitId)).toEqual(['unit-dt2']);
    expect(forest.map((n) => n.unitId).sort()).toEqual(['unit-pdu', 'unit-strip-desk', 'unit-strip-stand']);
  });
});
