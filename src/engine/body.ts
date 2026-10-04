// Anthropometric landmarks (spec §5.13 default model; all overridable per BodyProfile).
import type { BodyProfile, Setup } from '@/domain/types';

export interface Landmarks {
  elbowMm: number;
  eyeMm: number;
  /** Spec §5.13 gives these for standing only; seated values are not defined (null). */
  shoulderMm: number | null;
  wristMm: number | null;
  forearmHandMm: number;
  seatMm: number | null;
}

/** Heights above the floor for the given posture. Spec defaults: Drillis–Contini (standing), DIN 33402-type (seated). */
export function landmarks(body: BodyProfile, posture: Setup['posture'], seatHeightMm?: number): Landmarks {
  const H = body.heightMm;
  const o = body.overrides ?? {};
  const forearmHandMm = o.forearmHandMm ?? 0.254 * H;
  if (posture === 'standing') {
    return {
      elbowMm: o.elbowStandingMm ?? 0.63 * H,
      eyeMm: o.eyeStandingMm ?? 0.936 * H,
      shoulderMm: o.shoulderStandingMm ?? 0.818 * H,
      wristMm: 0.485 * H,
      forearmHandMm,
      seatMm: null,
    };
  }
  const seat = seatHeightMm ?? o.seatHeightMm ?? 0.272 * H;
  return {
    elbowMm: seat + (o.elbowSeatedAboveSeatMm ?? 0.139 * H),
    eyeMm: seat + (o.eyeSeatedAboveSeatMm ?? 0.451 * H),
    shoulderMm: null,
    wristMm: null,
    forearmHandMm,
    seatMm: seat,
  };
}
