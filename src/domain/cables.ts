// Cable presentation: colour precedence and studio-style numbering labels.
import type { CableModel, CableUnit, Connection, GearModel, GearUnit, Settings, SignalDomain } from './types';

/** Palette key (Appendix G) for a signal domain and channel role. */
export function domainPaletteKey(domain: SignalDomain, role?: string): string {
  if (domain === 'audio.adat' || domain === 'audio.spdif' || domain === 'audio.aes') return 'digital';
  if (domain.startsWith('audio.')) return role === 'L' ? 'audio.L' : role === 'R' ? 'audio.R' : 'audio.mono';
  if (domain.startsWith('midi.')) return 'midi';
  if (domain === 'usb.data' || domain === 'ethernet') return 'usb';
  if (domain === 'cv' || domain === 'gate') return 'cv';
  if (domain.startsWith('clock.')) return 'clock';
  if (domain.startsWith('power.')) return 'power';
  if (domain === 'expression' || domain === 'footswitch') return 'expression';
  return 'audio.mono';
}

/** Colour of a drawn cable: connection override → owned cable → cable type → domain palette. */
export function resolveCableColor(
  c: Connection,
  ctx: { cableUnit?: CableUnit; cableModel?: CableModel; domain: SignalDomain; role?: string; settings: Settings },
): string {
  return (
    c.color ??
    ctx.cableUnit?.color ??
    ctx.cableModel?.color ??
    ctx.settings.palette.domains[domainPaletteKey(ctx.domain, ctx.role)] ??
    '#374151'
  );
}

/** Numbering prefix per domain family: A(udio), D(igital), M(IDI), U(SB/network), C(V/clock), P(ower), X(control). */
export function labelPrefix(domain: SignalDomain): string {
  const key = domainPaletteKey(domain);
  return (
    (
      {
        'audio.mono': 'A',
        digital: 'D',
        midi: 'M',
        usb: 'U',
        cv: 'C',
        clock: 'C',
        power: 'P',
        expression: 'X',
      } as Record<string, string>
    )[key] ?? 'A'
  );
}

export interface Endpoints {
  unitOf(unitId: string): GearUnit | undefined;
  modelOf(unitId: string): GearModel | undefined;
}

/** Domain of a connection, taken from its first end's connector. */
export function connectionDomain(c: Connection, e: Endpoints): SignalDomain | undefined {
  return e.modelOf(c.a.unitId)?.connectors.find((x) => x.id === c.a.connectorId)?.domain;
}

/**
 * Number unlabelled connections per domain family, continuing after the highest existing number:
 * A01, A02 … M01 … Bundles (stereo pairs) share a number with an L/R suffix.
 */
export function autoLabels(connections: Connection[], e: Endpoints): Map<string, string> {
  const next = new Map<string, number>();
  const bundleLabel = new Map<string, string>();
  for (const c of connections) {
    const m = c.label && /^([A-Z])(\d+)/.exec(c.label);
    if (!m) continue;
    next.set(m[1]!, Math.max(next.get(m[1]!) ?? 0, Number(m[2])));
    // Unlabelled members of a bundle reuse the number of an already labelled member.
    if (c.bundleId && !bundleLabel.has(c.bundleId)) bundleLabel.set(c.bundleId, `${m[1]}${m[2]}`);
  }
  const out = new Map<string, string>();
  for (const c of connections) {
    if (c.label) continue;
    const domain = connectionDomain(c, e) ?? 'other';
    const prefix = labelPrefix(domain);
    // L/R from the source; a stereo jack split by a Y cable takes the side from the destination.
    const roleOf = (end: Connection['a']) =>
      e.modelOf(end.unitId)?.connectors.find((x) => x.id === end.connectorId)?.channel?.role;
    const aRole = roleOf(c.a);
    const role = aRole === 'L' || aRole === 'R' ? aRole : roleOf(c.b);
    const suffix = role === 'L' || role === 'R' ? ` ${role}` : '';
    let base = c.bundleId ? bundleLabel.get(c.bundleId) : undefined;
    if (!base) {
      const n = (next.get(prefix) ?? 0) + 1;
      next.set(prefix, n);
      base = `${prefix}${String(n).padStart(2, '0')}`;
      if (c.bundleId) bundleLabel.set(c.bundleId, base);
    }
    out.set(c.id, `${base}${suffix}`);
  }
  return out;
}
