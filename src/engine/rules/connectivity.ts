// PHYS, DIR and SIG rules (spec §5.12).
import type { Connection, Connector } from '@/domain/types';
import { connectionFlow, domainFamily, suggestCable } from '../connections';
import type { Issue } from '../issues';
import { endLabel, type Rule, type SetupContext } from './context';

const enabled = (ctx: SetupContext) => ctx.setup.connections.filter((c) => c.enabled);
const oriented = (ctx: SetupContext, c: Connection) => {
  const e = ctx.ends(c);
  if (!e) return undefined;
  const flow = connectionFlow(e.a, e.b);
  return flow.from === 'a'
    ? { src: e.a, dst: e.b, s: c.a, d: c.b, flow }
    : { src: e.b, dst: e.a, s: c.b, d: c.a, flow };
};

const levelGroup = (c: Connector): 'mic' | 'line' | 'instrument' | 'headphone' | 'speaker' | 'cv' | 'gate' | null => {
  if (c.domain === 'audio.headphone') return 'headphone';
  const l = c.signal?.level;
  if (!l) return null;
  if (l === 'mic') return 'mic';
  if (l === 'instrument' || l === 'hi-z') return 'instrument';
  if (l === 'headphone') return 'headphone';
  if (l === 'speaker') return 'speaker';
  if (l.startsWith('cv')) return 'cv';
  if (l.startsWith('gate')) return 'gate';
  return 'line';
};

export const connectivityRules: Rule[] = [
  {
    id: 'PHYS-001',
    family: 'PHYS',
    severity: 'error',
    title: 'Plug cannot mate the jack',
    rationale: 'No cable or adapter in the library fits both connectors, or the supply plug does not fit the jack.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      const out: Issue[] = [];
      for (const c of enabled(ctx)) {
        const e = ctx.ends(c);
        if (!e || e.a.jack === 'unknown' || e.b.jack === 'unknown') continue;
        const opts = suggestCable(e.a, e.b, null, ctx.project.library.cableModels);
        const best = opts[0];
        const chosen = c.cable.modelId
          ? ctx.project.library.cableModels.find((m) => m.id === c.cable.modelId)
          : undefined;
        const chosenFits =
          !chosen ||
          opts.some((o) => o.cableModelId === chosen.id && c.cable.adapters.every((a) => o.adapters.includes(a)));
        if (!best || best.score === 0)
          out.push({
            ruleId: 'PHYS-001',
            severity: 'error',
            entityIds: [c.id],
            message: `${endLabel(ctx, c.a)} (${e.a.jack}) cannot mate ${endLabel(ctx, c.b)} (${e.b.jack})${best?.notes[0] ? `: ${best.notes[0]}` : ''}.`,
            details: { jackA: e.a.jack, jackB: e.b.jack },
          });
        else if (!chosenFits)
          out.push({
            ruleId: 'PHYS-001',
            severity: 'error',
            entityIds: [c.id],
            message: `The chosen cable (${chosen.name}) does not fit ${e.a.jack} ↔ ${e.b.jack}.`,
            fixes: best.cableModelId
              ? [
                  {
                    label: 'Use the suggested cable',
                    action: { kind: 'set-cable', connectionId: c.id, cableModelId: best.cableModelId },
                  },
                ]
              : undefined,
          });
      }
      return out;
    },
  },
  {
    id: 'PHYS-002',
    family: 'PHYS',
    severity: 'info',
    title: 'Mating needs an adapter',
    rationale: 'Only a cable plus an adapter fits these connectors.',
    dependsOn: ['connections', 'library'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const e = ctx.ends(c);
        if (!e) return [];
        const best = suggestCable(e.a, e.b, null, ctx.project.library.cableModels)[0];
        if (best?.kind !== 'cable+adapter') return [];
        const names = best.adapters.map((a) => ctx.project.library.cableModels.find((m) => m.id === a)?.name ?? a);
        return [
          {
            ruleId: 'PHYS-002',
            severity: 'info',
            entityIds: [c.id],
            message: `${endLabel(ctx, c.a)} → ${endLabel(ctx, c.b)} needs an adapter: ${names.join(', ')}.`,
          },
        ];
      });
    },
  },
  {
    id: 'PHYS-003',
    family: 'PHYS',
    severity: 'warning',
    title: 'Connector blocked',
    rationale: 'Cables need about 80 mm behind the panel to bend.',
    dependsOn: ['placements', 'connections', 'stands'],
    run(ctx) {
      const out: Issue[] = [];
      const units = ctx.layout.layout.units;
      for (const [unitId, u] of units) {
        const backConns = ctx.setup.connections.filter(
          (c) =>
            c.enabled &&
            [c.a, c.b].some((e) => e.unitId === unitId && ctx.connector(unitId, e.connectorId)?.face === 'back'),
        );
        if (!backConns.length || u.placement.mount.type === 'rack') continue;
        // Clear zone: 80 mm behind the unit's back edge, same height band.
        const zone = { minX: u.min.x, maxX: u.max.x, minY: u.max.y, maxY: u.max.y + 80, minZ: u.min.z, maxZ: u.max.z };
        for (const [otherId, o] of units) {
          if (otherId === unitId || o.placement.mount.type === 'stacked') continue;
          const hit =
            o.min.x < zone.maxX &&
            o.max.x > zone.minX &&
            o.min.y < zone.maxY &&
            o.max.y > zone.minY &&
            o.min.z < zone.maxZ &&
            o.max.z > zone.minZ;
          if (hit) {
            out.push({
              ruleId: 'PHYS-003',
              severity: 'warning',
              entityIds: [unitId, otherId],
              message: `${ctx.nick(unitId)}: less than 80 mm free behind its rear connectors (${ctx.nick(otherId)} is in the way).`,
            });
            break;
          }
        }
      }
      return out;
    },
  },
  {
    id: 'DIR-001',
    family: 'DIR',
    severity: 'error',
    title: 'Output to output or input to input',
    rationale: 'Signal direction must run from an output (or thru) to an input.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const e = ctx.ends(c);
        if (!e) return [];
        const f = connectionFlow(e.a, e.b);
        return f.kind === 'invalid'
          ? [
              {
                ruleId: 'DIR-001',
                severity: 'error',
                entityIds: [c.id],
                message: `${f.reason}: ${endLabel(ctx, c.a)} ↔ ${endLabel(ctx, c.b)}.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'DIR-002',
    family: 'DIR',
    severity: 'error',
    title: 'Two outputs into one input',
    rationale: 'Outputs must not be joined without a mixer.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      const byInput = new Map<string, Connection[]>();
      for (const c of enabled(ctx)) {
        const o = oriented(ctx, c);
        if (!o || o.flow.kind !== 'directed' || o.dst.direction !== 'in' || o.dst.insert) continue;
        const k = `${o.d.unitId}/${o.d.connectorId}`;
        byInput.set(k, [...(byInput.get(k) ?? []), c]);
      }
      return [...byInput.values()]
        .filter((list) => list.length > 1)
        .map((list) => ({
          ruleId: 'DIR-002',
          severity: 'error' as const,
          entityIds: list.map((c) => c.id),
          message: `${list.length} sources feed ${endLabel(ctx, oriented(ctx, list[0]!)!.d)}.`,
        }));
    },
  },
  {
    id: 'DIR-003',
    family: 'DIR',
    severity: 'warning',
    title: 'Analog output fanned out',
    rationale: 'One analog output into several inputs needs a splitter or mult.',
    dependsOn: ['connections'],
    run(ctx) {
      const bySrc = new Map<string, Connection[]>();
      for (const c of enabled(ctx)) {
        const o = oriented(ctx, c);
        if (
          !o ||
          o.flow.kind !== 'directed' ||
          o.src.insert ||
          domainFamily(o.src.domain) !== 'audio' ||
          o.src.channel?.role === 'stereo'
        )
          continue;
        const k = `${o.s.unitId}/${o.s.connectorId}`;
        bySrc.set(k, [...(bySrc.get(k) ?? []), c]);
      }
      return [...bySrc.entries()]
        .filter(([, list]) => list.length > 1)
        .map(([k, list]) => ({
          ruleId: 'DIR-003',
          severity: 'warning' as const,
          entityIds: list.map((c) => c.id),
          message: `${endLabel(ctx, { unitId: k.split('/')[0]!, connectorId: k.split('/').slice(1).join('/') })} feeds ${list.length} inputs; use a splitter or a mult.`,
        }));
    },
  },
  {
    id: 'DIR-004',
    family: 'DIR',
    severity: 'warning',
    title: 'MIDI Out fanned out without a hub',
    rationale: 'A MIDI output drives one input; use Thru or a MIDI hub to fan out.',
    dependsOn: ['connections'],
    run(ctx) {
      const bySrc = new Map<string, Connection[]>();
      for (const c of enabled(ctx)) {
        const o = oriented(ctx, c);
        if (!o || o.flow.kind !== 'directed' || (o.src.domain !== 'midi.din' && !o.src.domain.startsWith('midi.trs')))
          continue;
        const k = `${o.s.unitId}/${o.s.connectorId}`;
        bySrc.set(k, [...(bySrc.get(k) ?? []), c]);
      }
      return [...bySrc.values()]
        .filter((l) => l.length > 1)
        .map((list) => ({
          ruleId: 'DIR-004',
          severity: 'warning' as const,
          entityIds: list.map((c) => c.id),
          message: `A MIDI output drives ${list.length} inputs; use Thru or a MIDI hub.`,
        }));
    },
  },
  {
    id: 'SIG-001',
    family: 'SIG',
    severity: 'warning',
    title: 'Level mismatch',
    rationale: 'Mic, instrument, line and headphone levels differ by tens of dB.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const o = oriented(ctx, c);
        if (!o || o.flow.kind !== 'directed') return [];
        const a = levelGroup(o.src);
        const b = levelGroup(o.dst);
        if (!a || !b || a === b || a === 'headphone') return [];
        // Line into an instrument (hi-z) input and mic into line are common but worth flagging.
        if ((a === 'cv' || a === 'gate') && (b === 'cv' || b === 'gate')) return [];
        // Combo/line-switchable inputs: a mic-level input with a "line" alternate accepts line.
        if (b === 'mic' && o.dst.alternates?.some((x) => /line/i.test(x.label))) return [];
        return [
          {
            ruleId: 'SIG-001',
            severity: 'warning',
            entityIds: [c.id],
            message: `${a} level from ${endLabel(ctx, o.s)} into a ${b}-level input (${endLabel(ctx, o.d)}).`,
            details: { from: a, to: b },
          },
        ];
      });
    },
  },
  {
    id: 'SIG-002',
    family: 'SIG',
    severity: 'warning',
    title: 'CV/audio domain confusion',
    rationale: 'Cross-family links (CV into audio, audio into clock) are allowed but unusual.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const e = ctx.ends(c);
        if (!e) return [];
        const fa = domainFamily(e.a.domain);
        const fb = domainFamily(e.b.domain);
        if (fa === fb || fa.startsWith('power') || fb.startsWith('power')) return [];
        return [
          {
            ruleId: 'SIG-002',
            severity: 'warning',
            entityIds: [c.id],
            message: `${e.a.domain} ↔ ${e.b.domain}: ${endLabel(ctx, c.a)} and ${endLabel(ctx, c.b)} carry different signal types.`,
          },
        ];
      });
    },
  },
  {
    id: 'SIG-003',
    family: 'SIG',
    severity: 'info',
    title: 'Balanced to unbalanced',
    rationale: 'The link runs unbalanced; keep it short.',
    dependsOn: ['connections'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const o = oriented(ctx, c);
        if (!o) return [];
        const bal = (x: Connector) => x.signal?.balance === 'balanced' || x.signal?.balance === 'imp-balanced';
        const unb = (x: Connector) => x.signal?.balance === 'unbalanced';
        return (bal(o.src) && unb(o.dst)) || (unb(o.src) && bal(o.dst))
          ? [
              {
                ruleId: 'SIG-003',
                severity: 'info',
                entityIds: [c.id],
                message: `${endLabel(ctx, o.s)} (${o.src.signal?.balance}) → ${endLabel(ctx, o.d)} (${o.dst.signal?.balance}): the link is unbalanced.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'SIG-004',
    family: 'SIG',
    severity: 'info',
    title: 'Mono into stereo / stereo summed to mono',
    rationale: 'A single cable carries one channel; the other side of a pair stays silent or is summed.',
    dependsOn: ['connections'],
    run(ctx) {
      const out: Issue[] = [];
      for (const c of enabled(ctx)) {
        const o = oriented(ctx, c);
        if (!o || domainFamily(o.src.domain) !== 'audio') continue;
        const sr = o.src.channel?.role;
        const dr = o.dst.channel?.role;
        const bundled = !!c.bundleId;
        if ((sr === 'L' || sr === 'R') && dr === 'mono' && !bundled)
          out.push({
            ruleId: 'SIG-004',
            severity: 'info',
            entityIds: [c.id],
            message: `Only ${sr} of a stereo pair reaches the mono input ${endLabel(ctx, o.d)}.`,
          });
        if (sr === 'stereo' && (dr === 'mono' || dr === 'numbered') && !bundled)
          out.push({
            ruleId: 'SIG-004',
            severity: 'info',
            entityIds: [c.id],
            message: `Stereo jack ${endLabel(ctx, o.s)} into mono input ${endLabel(ctx, o.d)}: one side is lost or summed.`,
          });
        if (
          sr === 'mono' &&
          (dr === 'L' || dr === 'R') &&
          !ctx.connectionsAt(
            o.d.unitId,
            ctx
              .model(o.d.unitId)
              ?.connectors.find((x) => x.channel?.group === o.dst.channel?.group && x.channel?.role !== dr)?.id ?? '',
          ).length
        )
          out.push({
            ruleId: 'SIG-004',
            severity: 'info',
            entityIds: [c.id],
            message: `Mono source into ${dr} only of the stereo pair at ${endLabel(ctx, o.d)}.`,
          });
      }
      return out;
    },
  },
  {
    id: 'SIG-005',
    family: 'SIG',
    severity: 'warning',
    title: 'Headphone output into a line input',
    rationale: 'Headphone amps are noisy and level-dependent; prefer a line output.',
    dependsOn: ['connections', 'unitConfigs'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const o = oriented(ctx, c);
        if (
          !o ||
          o.src.domain !== 'audio.headphone' ||
          o.dst.domain === 'audio.headphone' ||
          o.dst.jack === 'captive-cable'
        )
          return [];
        return [
          {
            ruleId: 'SIG-005',
            severity: 'warning',
            entityIds: [c.id],
            message: `Headphone output ${endLabel(ctx, o.s)} feeds ${endLabel(ctx, o.d)}.`,
          },
        ];
      });
    },
  },
  {
    id: 'SIG-006',
    family: 'SIG',
    severity: 'warning',
    title: 'L/R continuity break',
    rationale: 'A left output arriving at a right input (or the reverse) swaps the stereo image.',
    dependsOn: ['connections'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const o = oriented(ctx, c);
        if (!o) return [];
        const sr = o.src.channel?.role;
        const dr = o.dst.channel?.role;
        const mapped = c.mapping?.some((m) => m.fromChannel !== m.toChannel);
        return (sr === 'L' && dr === 'R') || (sr === 'R' && dr === 'L') || mapped
          ? [
              {
                ruleId: 'SIG-006',
                severity: 'warning',
                entityIds: [c.id],
                message: `L/R swap: ${endLabel(ctx, o.s)} → ${endLabel(ctx, o.d)}.`,
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'SIG-007',
    family: 'SIG',
    severity: 'warning',
    title: 'Signal above the input maximum',
    rationale: 'The source can drive more than the destination accepts.',
    dependsOn: ['connections'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const o = oriented(ctx, c);
        const a = o?.src.signal?.maxDbu;
        const b = o?.dst.signal?.maxDbu;
        return o && a !== undefined && b !== undefined && a > b
          ? [
              {
                ruleId: 'SIG-007',
                severity: 'warning',
                entityIds: [c.id],
                message: `${endLabel(ctx, o.s)} reaches +${a} dBu; ${endLabel(ctx, o.d)} accepts +${b} dBu.`,
                details: { sourceDbu: a, inputDbu: b },
              },
            ]
          : [];
      });
    },
  },
  {
    id: 'SIG-008',
    family: 'SIG',
    severity: 'info',
    title: 'Phantom power concerns',
    rationale: 'Phantom power on an input fed by an unbalanced source can damage or add noise.',
    dependsOn: ['connections'],
    run(ctx) {
      return enabled(ctx).flatMap((c): Issue[] => {
        const o = oriented(ctx, c);
        const ph = o?.dst.signal?.phantom;
        return o && ph && ph !== 'none' && o.src.signal?.balance === 'unbalanced'
          ? [
              {
                ruleId: 'SIG-008',
                severity: 'info',
                entityIds: [c.id],
                message: `${endLabel(ctx, o.d)} has ${ph} phantom power; keep it off for the unbalanced ${endLabel(ctx, o.s)}.`,
              },
            ]
          : [];
      });
    },
  },
];
