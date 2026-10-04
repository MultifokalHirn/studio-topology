// Auto-generated front-elevation thumbnail of a setup (spec §5.11).
import { useMemo } from 'react';
import { surfaceToWorld } from '@/domain/geometry';
import { categoryTint } from '@/domain/faces';
import type { Project, Setup } from '@/domain/types';
import { resolveLayout } from '@/engine/placement';

export function SetupThumbnail({ project, setup }: { project: Project; setup: Setup }) {
  const shapes = useMemo(() => {
    const l = resolveLayout(project, setup);
    const rects = [...l.units.values()].map((u) => {
      const xs = u.corners.map((c) => c.x);
      const zs = u.corners.map((c) => c.z);
      return {
        id: u.unitId,
        x: Math.min(...xs),
        y: -Math.max(...zs),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...zs) - Math.min(...zs),
        fill: categoryTint(u.model.category),
      };
    });
    const lines = l.surfaces.map((s) => {
      const a = surfaceToWorld(s.frame, { x: 0, y: 0, z: 0 });
      const b = surfaceToWorld(s.frame, { x: s.surface.usable.w, y: 0, z: 0 });
      return { id: `${s.standUnitId}/${s.surface.id}`, x1: a.x, y1: -a.z, x2: b.x, y2: -b.z };
    });
    const xs = [...rects.flatMap((r) => [r.x, r.x + r.w]), ...lines.flatMap((l) => [l.x1, l.x2]), 0];
    const ys = [...rects.flatMap((r) => [r.y, r.y + r.h]), ...lines.flatMap((l) => [l.y1, l.y2]), 0];
    const minX = Math.min(...xs) - 50;
    const minY = Math.min(...ys) - 50;
    return { rects, lines, box: `${minX} ${minY} ${Math.max(...xs) + 50 - minX} ${Math.max(...ys) + 50 - minY}` };
  }, [project, setup]);
  return (
    <svg viewBox={shapes.box} className="h-12 w-20 shrink-0 rounded bg-white dark:bg-neutral-800" aria-hidden="true">
      <line x1={-1e5} x2={1e5} y1={0} y2={0} stroke="#a3a3a3" strokeWidth={8} />
      {shapes.lines.map((l) => (
        <line key={l.id} {...l} stroke="#737373" strokeWidth={12} />
      ))}
      {shapes.rects.map((r) => (
        <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} stroke="#525252" strokeWidth={4} />
      ))}
    </svg>
  );
}
