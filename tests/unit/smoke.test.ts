import { describe, expect, it } from 'vitest';
import { t } from '@/i18n';

describe('t()', () => {
  it('interpolates variables', () => {
    expect(t('{view} view', { view: 'Layout' })).toBe('Layout view');
  });
});
