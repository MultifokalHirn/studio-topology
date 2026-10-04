import { describe, expect, it } from 'vitest';
import {
  EURORACK_HP_MM, EURORACK_PANEL_HEIGHT_MM, formatLength, hpToMm, mmToHp, parseLength, RACK_INNER_WIDTH_MM,
  RACK_PANEL_WIDTH_MM, RACK_UNIT_MM, rackUnitsToMm,
} from '@/domain/units'; // prettier-ignore

describe('constants (spec §3.1)', () => {
  it('rack and Eurorack maths', () => {
    expect(RACK_UNIT_MM).toBe(44.45);
    expect(RACK_PANEL_WIDTH_MM).toBe(482.6);
    expect(RACK_INNER_WIDTH_MM).toBe(450);
    expect(EURORACK_HP_MM).toBe(5.08);
    expect(EURORACK_PANEL_HEIGHT_MM).toBe(128.5);
    expect(rackUnitsToMm(2)).toBeCloseTo(88.9);
    expect(hpToMm(84)).toBeCloseTo(426.72);
    expect(mmToHp(426.72)).toBe(84);
    expect(mmToHp(430)).toBe(84);
  });
});

describe('parseLength', () => {
  it.each([
    ['12 cm', 120],
    ['4.5"', 114.3],
    ['4.5 in', 114.3],
    ['0.5 U', 22.225],
    ['1U', 44.45],
    ['3 HP', 15.24],
    ['1,5 cm', 15],
    ['  250  ', 250],
    ['-30mm', -30],
    ['2 m', 2000],
  ])('%s → %f mm', (input, mm) => {
    expect(parseLength(input)).toBeCloseTo(mm, 6);
  });

  it('uses the default unit for bare numbers', () => {
    expect(parseLength('2', 'in')).toBeCloseTo(50.8);
    expect(parseLength('2', 'cm')).toBe(20);
  });

  it.each(['', 'abc', '12 furlongs', '1.2.3 mm'])('rejects %j', (input) => {
    expect(parseLength(input)).toBeNull();
  });
});

describe('formatLength', () => {
  it('formats per display unit and never invents a value for unknown', () => {
    expect(formatLength(215, 'mm')).toBe('215 mm');
    expect(formatLength(215, 'cm', 1)).toBe('21.5 cm');
    expect(formatLength(25.4, 'in', 2)).toBe('1.00"');
    expect(formatLength(null, 'mm')).toBe('—');
  });
});
