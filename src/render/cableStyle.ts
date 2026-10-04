// Cable encodings (spec §5.9): colour + dash pattern + badge, so meaning never depends on colour alone.
import { domainPaletteKey } from '@/domain/cables';
import type { Connection, Connector, Settings } from '@/domain/types';
import { domainFamily, type DomainFamily } from '@/engine/connections';

export interface CableStyle {
  family: DomainFamily | 'headphone';
  /** Legend key, e.g. 'audio-L', 'midi', 'gate'. */
  key: string;
  legend: string;
  dash?: string;
  width: number;
  badge: string;
  badgeColor?: string;
  /** CSS class for the flow animation overlay. */
  anim: 'flow-audio' | 'flow-midi' | 'flow-power' | 'flow-data';
  balancedTicks: boolean;
}

export function cableStyle(c: Connection, src: Connector, dst: Connector, settings: Settings): CableStyle {
  const d = src.domain;
  const fam = domainFamily(d);
  const role = src.channel?.role === 'L' || src.channel?.role === 'R' ? src.channel.role : dst.channel?.role;
  const balancedTicks = src.signal?.balance === 'balanced' && dst.signal?.balance === 'balanced';
  if (d === 'audio.headphone' || dst.domain === 'audio.headphone')
    return {
      family: 'headphone',
      key: 'headphone',
      legend: 'Headphone',
      dash: '2 4',
      width: 1.5,
      badge: 'HP',
      anim: 'flow-audio',
      balancedTicks: false,
    };
  switch (fam) {
    case 'audio': {
      if (role === 'L' || role === 'R')
        return {
          family: fam,
          key: `audio-${role}`,
          legend: `Audio ${role}`,
          width: 1.75,
          badge: role,
          anim: 'flow-audio',
          balancedTicks,
        };
      const n =
        src.channel?.role === 'numbered'
          ? src.channel.index
          : dst.channel?.role === 'numbered'
            ? dst.channel.index
            : undefined;
      if (src.channel?.role === 'stereo')
        return {
          family: fam,
          key: 'audio-stereo',
          legend: 'Audio (stereo jack)',
          width: 2.5,
          badge: 'ST',
          anim: 'flow-audio',
          balancedTicks,
        };
      return {
        family: fam,
        key: n ? 'audio-numbered' : 'audio-mono',
        legend: n ? 'Audio, numbered channel' : 'Audio mono',
        width: 1.5,
        badge: n ? String(n) : 'M',
        anim: 'flow-audio',
        balancedTicks,
      };
    }
    case 'digital-audio':
      return {
        family: fam,
        key: 'digital',
        legend: 'Digital audio (ADAT/S/PDIF)',
        dash: '1 3',
        width: 2,
        badge: d === 'audio.adat' ? 'ADAT' : d === 'audio.spdif' ? 'SPDIF' : 'AES',
        anim: 'flow-data',
        balancedTicks: false,
      };
    case 'midi': {
      const ch = c.midi?.channels;
      const badge = ch === 'omni' ? 'ALL' : ch === 'per-track' ? 'T' : ch?.length ? ch.join(',') : '?';
      const first = Array.isArray(ch) ? ch[0] : undefined;
      return {
        family: fam,
        key: 'midi',
        legend: 'MIDI',
        width: 1.5,
        badge,
        badgeColor: first ? settings.palette.midiChannels[(first - 1) % 16] : undefined,
        anim: 'flow-midi',
        balancedTicks: false,
      };
    }
    case 'clock':
      return {
        family: fam,
        key: 'clock',
        legend: 'Clock / sync',
        dash: '6 3 1 3',
        width: 1.5,
        badge: src.clock?.format === 'po-sync' ? 'PO' : (src.clock?.format ?? 'CLK').toUpperCase(),
        anim: 'flow-midi',
        balancedTicks: false,
      };
    case 'cv':
      return d === 'gate' || dst.domain === 'gate'
        ? {
            family: fam,
            key: 'gate',
            legend: 'Gate / trigger',
            dash: '6 4',
            width: 1.5,
            badge: 'G',
            anim: 'flow-midi',
            balancedTicks: false,
          }
        : {
            family: fam,
            key: 'cv',
            legend: 'CV',
            width: 1.5,
            badge: src.cv?.standard === '1V/oct' ? '1V/oct' : 'CV',
            anim: 'flow-audio',
            balancedTicks: false,
          };
    case 'control':
      return {
        family: fam,
        key: 'control',
        legend: 'Expression / footswitch',
        width: 1,
        badge: d === 'footswitch' ? 'FS' : 'EXP',
        anim: 'flow-data',
        balancedTicks: false,
      };
    case 'data': {
      if (d === 'ethernet')
        return {
          family: fam,
          key: 'ethernet',
          legend: 'Ethernet',
          width: 1.5,
          badge: 'NET',
          anim: 'flow-data',
          balancedTicks: false,
        };
      const carriesAudio = !!(src.usb?.audio || dst.usb?.audio);
      const carriesMidi = !!(src.usb?.carries.includes('midi') && dst.usb?.carries.includes('midi'));
      return {
        family: fam,
        key: 'usb',
        legend: 'USB',
        width: 2,
        badge: carriesAudio && carriesMidi ? 'A+M' : carriesAudio ? 'AUDIO' : carriesMidi ? 'MIDI' : 'USB',
        anim: 'flow-data',
        balancedTicks: false,
      };
    }
    case 'power.dc':
    case 'power.ac':
    case 'power.usb': {
      const v = src.psu?.voltage ?? dst.psu?.voltage;
      return {
        family: fam,
        key: 'power',
        legend: 'Power',
        dash: '3 3',
        width: 1,
        badge: v ? `${v} V` : d === 'power.ac' ? 'AC' : 'DC',
        anim: 'flow-power',
        balancedTicks: false,
      };
    }
    default:
      return {
        family: fam,
        key: 'other',
        legend: 'Other',
        width: 1,
        badge: '·',
        anim: 'flow-data',
        balancedTicks: false,
      };
  }
}

/** Palette key used for the legend swatch of a style key. */
export function paletteKeyFor(style: CableStyle, src: Connector): string {
  return domainPaletteKey(src.domain, style.key === 'audio-L' ? 'L' : style.key === 'audio-R' ? 'R' : undefined);
}
