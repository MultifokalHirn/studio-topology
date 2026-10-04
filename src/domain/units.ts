// Units and derived constants (spec §3.1). Lengths are millimetres internally.
import type { LengthUnit } from './types';

export const MM_PER_INCH = 25.4;
export const MM_PER_CM = 10;
/** 1 rack unit (EIA-310). */
export const RACK_UNIT_MM = 44.45;
/** 19" rack panel width, ears included. */
export const RACK_PANEL_WIDTH_MM = 482.6;
/** Inner opening between rack rails. */
export const RACK_INNER_WIDTH_MM = 450;
/** 1 Eurorack HP. */
export const EURORACK_HP_MM = 5.08;
/** Eurorack 3U panel height. */
export const EURORACK_PANEL_HEIGHT_MM = 128.5;

export const rackUnitsToMm = (u: number) => u * RACK_UNIT_MM;
export const hpToMm = (hp: number) => hp * EURORACK_HP_MM;
/** Number of whole HP that fit in a width. */
export const mmToHp = (mm: number) => Math.floor(mm / EURORACK_HP_MM + 1e-9);

const UNIT_FACTORS: Record<string, number> = {
  mm: 1,
  cm: MM_PER_CM,
  m: 1000,
  in: MM_PER_INCH,
  '"': MM_PER_INCH,
  inch: MM_PER_INCH,
  inches: MM_PER_INCH,
  u: RACK_UNIT_MM,
  ru: RACK_UNIT_MM,
  hp: EURORACK_HP_MM,
};

/**
 * Parse a user-entered length into mm: `12 cm`, `4.5"`, `0.5 U`, `3 HP`, `1,5 cm`.
 * A bare number is read in `defaultUnit`. Returns `null` for unparseable input.
 */
export function parseLength(input: string, defaultUnit: LengthUnit = 'mm'): number | null {
  const m = /^\s*([-+]?\d*[.,]?\d+(?:e[-+]?\d+)?)\s*(mm|cm|m|in|inch|inches|"|u|ru|hp)?\s*$/i.exec(input);
  if (!m || m[1] === undefined) return null;
  const value = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? defaultUnit).toLowerCase();
  const factor = UNIT_FACTORS[unit];
  return factor === undefined ? null : value * factor;
}

export function mmTo(mm: number, unit: LengthUnit): number {
  return unit === 'mm' ? mm : unit === 'cm' ? mm / MM_PER_CM : mm / MM_PER_INCH;
}

/** Format a length for display. `null` renders as an em dash (unknown is never silently replaced). */
export function formatLength(mm: number | null | undefined, unit: LengthUnit, decimals = 0): string {
  if (mm === null || mm === undefined || !Number.isFinite(mm)) return '—';
  const v = mmTo(mm, unit);
  const s = v.toFixed(decimals);
  return unit === 'in' ? `${s}"` : `${s} ${unit}`;
}

export const degToRad = (deg: number) => (deg * Math.PI) / 180;
export const radToDeg = (rad: number) => (rad * 180) / Math.PI;
