// Shared power estimates.
import type { GearModel } from '@/domain/types';

/** Estimated mains draw (W) of a model: maxW, else typicalW, else DC draw × voltage; null when unknown. */
export function modelWatts(m: GearModel | undefined): number | null {
  if (!m) return null;
  if (m.power.maxW) return m.power.maxW;
  if (m.power.typicalW) return m.power.typicalW;
  const s = m.power.sources.find((x) => x.drawMa && x.nominalV);
  return s ? (s.drawMa! * s.nominalV!) / 1000 : null;
}
