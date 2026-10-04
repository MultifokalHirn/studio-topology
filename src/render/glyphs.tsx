// Port glyphs per jack type (spec §5.9 "Port glyphs"), drawn in mm at approximate real panel size so an
// incompatible mate is visible before the rule engine complains. Origin = connector centre.
import type { JackType } from '@/domain/types';
import { glyphRadius } from './glyphSize';

const S = { fill: 'none', stroke: 'currentColor', vectorEffect: 'non-scaling-stroke' as const };

export function JackGlyph({ jack, color = 'currentColor' }: { jack: JackType; color?: string }) {
  const r = glyphRadius(jack);
  const common = { ...S, stroke: color };
  const dot = (cx: number, cy: number, rr = 0.7) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={rr} fill={color} />;
  if (jack.startsWith('dc-barrel'))
    return (
      <g>
        <circle r={r} {...common} />
        <circle r={1.2} fill={color} />
      </g>
    );
  switch (jack) {
    case 'jack-6.35':
    case 'jack-6.35-TS':
    case 'jack-6.35-TRS':
    case 'jack-3.5':
    case 'jack-3.5-TS':
    case 'jack-3.5-TRS':
      return (
        <g>
          <circle r={r} {...common} />
          <circle r={r * 0.55} {...common} />
          {jack.endsWith('TRS') && <circle r={r * 0.8} {...common} strokeDasharray="1 1" />}
        </g>
      );
    case 'xlr-f':
    case 'xlr-m':
      return (
        <g>
          <circle r={r} {...common} />
          {[
            dot(-4, -2, jack === 'xlr-m' ? 1.2 : 0.9),
            dot(4, -2, jack === 'xlr-m' ? 1.2 : 0.9),
            dot(0, 4, jack === 'xlr-m' ? 1.2 : 0.9),
          ]}
          {jack === 'xlr-f' && <rect x={-1.5} y={-r} width={3} height={2.5} fill={color} />}
        </g>
      );
    case 'combo-xlr-trs':
      return (
        <g>
          <circle r={r} {...common} />
          <circle r={4} {...common} />
          {[dot(-6, -3), dot(6, -3), dot(0, 7)]}
        </g>
      );
    case 'din5-f':
      return (
        <g>
          <circle r={r} {...common} />
          {/* Five pins on the upper half circle (180°…360°, y down). */}
          {[180, 225, 270, 315, 360].map((deg) =>
            dot(5.5 * Math.cos((deg * Math.PI) / 180), 5.5 * Math.sin((deg * Math.PI) / 180)),
          )}
          <rect x={-1} y={r - 2.2} width={2} height={2.2} fill={color} />
        </g>
      );
    case 'rca-f':
      return (
        <g>
          <circle r={4.2} {...common} />
          <circle r={1.3} fill={color} />
        </g>
      );
    case 'bnc-f':
      return (
        <g>
          <circle r={5} {...common} />
          <circle r={1} fill={color} />
          <rect x={4.6} y={-0.7} width={1.6} height={1.4} fill={color} />
        </g>
      );
    case 'toslink-f':
      return <rect x={-4} y={-3.5} width={8} height={7} rx={1} {...common} />;
    case 'usb-a-f':
      return <rect x={-6} y={-2.25} width={12} height={4.5} {...common} />;
    case 'usb-b-f':
      return <path d="M-4 3.6 V-1.6 L-2.4 -3.6 H2.4 L4 -1.6 V3.6 Z" {...common} />;
    case 'usb-c-f':
      return <rect x={-4.2} y={-1.3} width={8.4} height={2.6} rx={1.3} {...common} />;
    case 'usb-micro-b-f':
      return <path d="M-3.5 1 H3.5 L2.8 -1 H-2.8 Z" {...common} />;
    case 'usb-mini-b-f':
      return <path d="M-3.5 1.5 H3.5 V-0.5 L2.5 -1.5 H-2.5 L-3.5 -0.5 Z" {...common} />;
    case 'rj45':
      return <path d="M-6 5 V-4 H-2 V-5.5 H2 V-4 H6 V5 Z" {...common} />;
    case 'iec-c14':
      return (
        <g>
          <path d="M-12 -7 H12 V3 L7 8 H-7 L-12 3 Z" {...common} />
          {[dot(-5, 0, 1), dot(5, 0, 1), dot(0, 4, 1)]}
        </g>
      );
    case 'speakon':
      return (
        <g>
          <circle r={r} {...common} />
          <circle r={6} {...common} />
        </g>
      );
    case 'mains-socket':
      return (
        <g>
          <circle r={r} {...common} />
          {[dot(-9.5, 0, 2), dot(9.5, 0, 2)]}
        </g>
      );
    case 'wireless':
      return (
        <g {...common}>
          <path d="M-4 0 A4 4 0 0 1 4 0" {...common} />
          <path d="M-2 1.5 A2 2 0 0 1 2 1.5" {...common} />
          <circle cy={3} r={0.6} fill={color} />
        </g>
      );
    case 'mains-plug':
    case 'captive-cable':
      return <path d="M-4 0 H4 M0 -4 V4" {...common} />;
    default:
      return (
        <g>
          <circle r={r} {...common} strokeDasharray="1.5 1.5" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={6} fill={color}>
            ?
          </text>
        </g>
      );
  }
}
