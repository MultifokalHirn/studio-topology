// Glyph extents per jack type (mm), shared by glyph drawing and hit areas.
import type { JackType } from '@/domain/types';

/** Approximate outer radius (mm) used for hit areas and label offsets. */
export function glyphRadius(jack: JackType): number {
  if (jack.startsWith('dc-barrel')) return 5;
  switch (jack) {
    case 'jack-3.5':
    case 'jack-3.5-TS':
    case 'jack-3.5-TRS':
      return 3.5;
    case 'jack-6.35':
    case 'jack-6.35-TS':
    case 'jack-6.35-TRS':
      return 6;
    case 'xlr-f':
    case 'xlr-m':
      return 11;
    case 'combo-xlr-trs':
    case 'speakon':
      return 12;
    case 'din5-f':
      return 9.5;
    case 'iec-c14':
      return 13;
    case 'mains-socket':
      return 20;
    case 'rj45':
      return 8;
    default:
      return 5;
  }
}
