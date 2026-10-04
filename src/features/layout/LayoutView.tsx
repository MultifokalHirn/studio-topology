// Layout tab (spec §5.6): front elevation, side elevation and plan of the active setup.
import clsx from 'clsx';
import type { Draft } from 'immer';
import { useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/domain/assets';
import { categoryTint, snapPoint } from '@/domain/faces';
import { rotatePoint, surfaceToWorld, type Vec3 } from '@/domain/geometry';
import { provenanceFor } from '@/domain/integrity';
import {
  addStandToSetup,
  nudgePlacement,
  placeInRack,
  placeOnFloor,
  placeOnSurface,
  removeFromSetup,
  rotatePlacement,
  setSurfaceState,
} from '@/domain/setupOps';
import type { Point, Project, Setup } from '@/domain/types';
import { RACK_UNIT_MM } from '@/domain/units';
import { landmarks } from '@/engine/body';
import { ergonomicsReport } from '@/engine/ergonomics';
import { analyzeLayout, type LayoutReport } from '@/engine/layout';
import { resolveLayout, unitSize, type ResolvedSurface, type ResolvedUnit } from '@/engine/placement';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject, useUi } from '@/store';
import { useViewport, Viewport } from '@/render/Viewport';
import { dragTypes } from './dragTypes';
import { ErgonomicsPanel } from './ErgonomicsPanel';
import { LayoutReportPanel } from './LayoutReportPanel';

export type LayoutViewKind = 'front' | 'side' | 'plan';

function editSetup(
  setupId: string,
  label: string,
  recipe: (s: Draft<Setup>, p: Draft<Project>) => void,
  coalesceKey?: string,
) {
  projectStore.getState().change(
    (p) => {
      const s = p.setups.find((x) => x.id === setupId);
      if (s) recipe(s, p);
    },
    { label, ...(coalesceKey ? { coalesceKey } : {}) },
  );
}

export function LayoutView() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const [view, setView] = useState<LayoutViewKind>('front');
  const [overlays, setOverlays] = useState(true);
  const [heatOn, setHeatOn] = useState(false);
  const [ergoOpen, setErgoOpen] = useState(false);
  const report = useMemo(() => (setup ? analyzeLayout(project, setup) : null), [project, setup]);
  const heat = useMemo(() => {
    if (!heatOn || !setup || !report) return null;
    const e = ergonomicsReport(project, setup, report.layout);
    return new Map((e?.units ?? []).map((u) => [u.unitId, u.score]));
  }, [heatOn, project, setup, report]);
  if (!setup || !report) return <p className="p-4 text-sm text-neutral-500">{t('No active setup.')}</p>;

  const unknownOffsets = setup.stands.flatMap((st) => {
    const su = project.inventory.standUnits.find((u) => u.id === st.standUnitId);
    const m = project.library.standModels.find((x) => x.id === su?.modelId);
    return (m?.surfaces ?? []).flatMap((sf, i) =>
      sf.adjustable.y &&
      provenanceFor(m!.provenance, `surfaces.${i}.adjustable.y`)?.kind === 'unknown' &&
      st.surfaceStates[sf.id]?.y === undefined
        ? [`${su?.nickname} · ${sf.label}`]
        : [],
    );
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700">
        <div role="tablist" aria-label={t('Layout view')} className="flex gap-1">
          {(['front', 'side', 'plan'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={clsx(
                'rounded px-2 py-0.5',
                view === v ? 'bg-neutral-200 font-semibold dark:bg-neutral-700' : 'text-neutral-500',
              )}
            >
              {t({ front: 'Front elevation', side: 'Side elevation', plan: 'Plan' }[v])}
            </button>
          ))}
        </div>
        <label className="ml-2 flex items-center gap-1">
          <input type="checkbox" checked={overlays} onChange={(e) => setOverlays(e.target.checked)} />
          {t('Ergonomic overlays')}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={heatOn} onChange={(e) => setHeatOn(e.target.checked)} />
          {t('Comfort heat map')}
        </label>
        <button
          className={clsx(
            'rounded border px-2 py-0.5',
            ergoOpen ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-300 dark:border-neutral-600',
          )}
          aria-pressed={ergoOpen}
          onClick={() => setErgoOpen(!ergoOpen)}
        >
          {t('Ergonomics…')}
        </button>
        <span className="ml-auto text-neutral-500">
          {t('Drag gear or stands from the Inventory. R rotate · Del remove · arrows nudge (Shift ×10)')}
        </span>
      </div>
      {unknownOffsets.length > 0 && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {t(
            'Tier depth offsets are unknown ({list}); occlusion and pitch assume 0 mm until you measure them (stand inspector).',
            { list: unknownOffsets.join(', ') },
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <LayoutCanvas
            key={view}
            view={view}
            project={project}
            setup={setup}
            report={report}
            readOnly={readOnly}
            overlays={overlays}
            heat={heat}
          />
        </div>
        {ergoOpen && <ErgonomicsPanel project={project} setup={setup} report={report} readOnly={readOnly} />}
      </div>
      <LayoutReportPanel project={project} setup={setup} report={report} />
    </div>
  );
}

/** Map world → view coordinates (SVG y grows downward). */
function toView(view: LayoutViewKind, p: Vec3): Point {
  if (view === 'front') return { x: p.x, y: -p.z };
  if (view === 'side') return { x: p.y, y: -p.z };
  return { x: p.x, y: -p.y };
}
function fromView(_view: LayoutViewKind, p: Point): { a: number; b: number } {
  // a = horizontal world axis, b = vertical world axis of the view.
  return { a: p.x, b: -p.y };
}

function bounds(view: LayoutViewKind, report: LayoutReport) {
  const pts: Point[] = [];
  for (const u of report.layout.units.values()) for (const c of u.corners) pts.push(toView(view, c));
  for (const s of report.layout.surfaces) for (const c of surfaceCorners(s)) pts.push(toView(view, c));
  pts.push(toView(view, { x: 0, y: 0, z: 0 }), toView(view, report.eye));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - 200;
  const minY = Math.min(...ys) - 150;
  return { x: minX, y: minY, w: Math.max(...xs) + 200 - minX, h: Math.max(...ys) + 150 - minY };
}

function surfaceCorners(s: ResolvedSurface): Vec3[] {
  const { w, d } = s.surface.usable;
  return [
    { x: 0, y: 0, z: 0 },
    { x: w, y: 0, z: 0 },
    { x: w, y: d, z: 0 },
    { x: 0, y: d, z: 0 },
  ].map((p) => surfaceToWorld(s.frame, p));
}

interface CanvasProps {
  view: LayoutViewKind;
  project: Project;
  setup: Setup;
  report: LayoutReport;
  readOnly: boolean;
  overlays: boolean;
  /** Comfort score per unit when the heat map is on. */
  heat: Map<string, number> | null;
}

function LayoutCanvas(props: CanvasProps) {
  const { view, project, setup, report } = props;
  const selection = useUi((s) => s.selection);
  const selectedUnit = selection?.kind === 'gear-unit' ? selection.id : null;
  const box = useMemo(() => bounds(view, report), [view, report]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const ghostsFrom = useUi((s) => s.ghostsFrom);
  const ghostSetup =
    ghostsFrom && ghostsFrom !== setup.id ? project.setups.find((s) => s.id === ghostsFrom) : undefined;

  // Keep the camera when switching between setups of the same project (A/B toggle); refit when the content grows
  // within a setup or a different project is loaded.
  const sizeKey = `${box.w}x${box.h}`;
  const [fit, setFit] = useState({ setupId: setup.id, size: sizeKey, n: 0 });
  if (fit.setupId !== setup.id) {
    const sameProject = project.setups.some((s) => s.id === fit.setupId);
    setFit({ setupId: setup.id, size: sizeKey, n: sameProject ? fit.n : fit.n + 1 });
  } else if (fit.size !== sizeKey) setFit({ ...fit, size: sizeKey, n: fit.n + 1 });

  const onDrop = (p: Point, e: React.DragEvent) => {
    if (props.readOnly) return;
    const gearId = e.dataTransfer.getData(dragTypes.gear);
    const standId = e.dataTransfer.getData(dragTypes.stand);
    const w = fromView(view, p);
    if (standId) {
      editSetup(setup.id, 'Add stand', (s) =>
        addStandToSetup(s, standId, Math.round(w.a), view === 'plan' ? Math.round(w.b) : 300),
      );
      return;
    }
    if (!gearId) return;
    const unit = project.inventory.gearUnits.find((u) => u.id === gearId);
    const model = project.library.gearModels.find((m) => m.id === unit?.modelId);
    if (!unit || !model) return;
    const size = unitSize(model);
    const target =
      view === 'plan'
        ? surfaceAtPlan(report, w.a, w.b)
        : view === 'front'
          ? surfaceAtFront(report, w.a, w.b, size.h)
          : null;
    editSetup(setup.id, 'Place unit', (s) => {
      if (target?.surface.rack && model.dimensions.rack) {
        const top = target.frame.origin.z + target.surface.rack.u * RACK_UNIT_MM;
        placeInRack(
          s,
          gearId,
          target.standUnitId,
          target.surface.id,
          Math.max(1, Math.round((top - w.b) / RACK_UNIT_MM)),
        );
      } else if (target && !target.surface.rack) {
        const local =
          view === 'plan' ? toSurfaceLocal(target, w.a, w.b) : { x: w.a - target.frame.origin.x - size.w / 2, y: 0 };
        const snapped = snapPoint({ x: Math.max(0, local.x), y: Math.max(0, local.y) }, project.settings.snap.gridMm);
        placeOnSurface(s, gearId, target.standUnitId, target.surface.id, snapped.x, snapped.y);
      } else placeOnFloor(s, gearId, Math.round(w.a), view === 'plan' ? Math.round(w.b) : 0);
    });
    uiStore.getState().select({ kind: 'gear-unit', id: gearId });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!selectedUnit || props.readOnly || !report.layout.units.has(selectedUnit)) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'Delete' || e.key === 'Backspace')
      editSetup(setup.id, 'Remove from setup', (s) => removeFromSetup(s, selectedUnit));
    else if (e.key === 'r' || e.key === 'R')
      editSetup(setup.id, 'Rotate', (s) => rotatePlacement(s, selectedUnit, e.shiftKey ? -1 : 1));
    else {
      const d = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, view === 'plan' ? step : 0],
        ArrowDown: [0, view === 'plan' ? -step : 0],
      }[e.key];
      if (!d) return;
      editSetup(setup.id, 'Nudge', (s) => nudgePlacement(s, selectedUnit, d[0]!, d[1]!), `nudge:${selectedUnit}`);
    }
    e.preventDefault();
  };

  return (
    <Viewport
      aria-label={t('{view} layout of {setup}', { view, setup: setup.name })}
      content={box}
      fitKey={String(fit.n)}
      onPointerMoveWorld={setCursor}
      onBackgroundClickWorld={() => uiStore.getState().select(null)}
      onDropWorld={onDrop}
      onKeyDown={onKey}
      className="bg-neutral-50 dark:bg-neutral-950"
      overlay={
        <div
          className="pointer-events-none absolute bottom-1 left-2 text-[11px] text-neutral-500"
          data-testid="layout-cursor"
        >
          {cursor &&
            `${view === 'plan' ? 'x' : view === 'front' ? 'x' : 'y'} ${fromView(view, cursor).a.toFixed(0)} · ${view === 'plan' ? 'y' : 'z'} ${fromView(view, cursor).b.toFixed(0)} mm`}
        </div>
      }
    >
      <Ground {...props} box={box} />
      {props.overlays && view !== 'plan' && <ErgoOverlays {...props} box={box} />}
      {props.overlays && view === 'plan' && <ReachArcs />}
      {report.layout.surfaces.map((s) => (
        <SurfaceShape key={`${s.standUnitId}/${s.surface.id}`} {...props} s={s} />
      ))}
      {[...report.layout.units.values()]
        .sort((a, b) =>
          view === 'front' ? b.min.y - a.min.y : view === 'side' ? a.min.x - b.min.x : a.max.z - b.max.z,
        )
        .map((u) => (
          <UnitShape key={u.unitId} {...props} u={u} selected={selectedUnit === u.unitId} />
        ))}
      {props.overlays && view === 'side' && <SideSightLines {...props} />}
      {ghostSetup && <Ghosts {...props} other={ghostSetup} />}
    </Viewport>
  );
}

function surfaceAtFront(report: LayoutReport, x: number, z: number, unitH: number): ResolvedSurface | undefined {
  const candidates = report.layout.surfaces.filter((s) => {
    const xs = surfaceCorners(s).map((c) => c.x);
    return x >= Math.min(...xs) && x <= Math.max(...xs) && s.surface.kind !== 'floor';
  });
  const dist = (s: ResolvedSurface) =>
    s.surface.rack
      ? z >= s.frame.origin.z && z <= s.frame.origin.z + s.surface.rack.u * RACK_UNIT_MM
        ? 0
        : 1e9
      : Math.abs(z - (s.frame.origin.z + unitH / 2));
  return candidates.sort((a, b) => dist(a) - dist(b))[0];
}

function surfaceAtPlan(report: LayoutReport, x: number, y: number): ResolvedSurface | undefined {
  const inside = (poly: Point[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!;
      const b = poly[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  return report.layout.surfaces
    .filter((s) => !s.surface.rack && inside(surfaceCorners(s)))
    .sort((a, b) => b.frame.origin.z - a.frame.origin.z)[0];
}

function toSurfaceLocal(s: ResolvedSurface, x: number, y: number): Point {
  const p = rotatePoint({ x, y }, -s.frame.standRotationDeg, s.frame.standPos);
  const tilt = Math.cos((s.frame.tiltDeg * Math.PI) / 180) || 1;
  return { x: p.x - s.frame.origin.x, y: (p.y - s.frame.origin.y) / tilt };
}

function Ground({ view, box }: CanvasProps & { box: { x: number; y: number; w: number; h: number } }) {
  if (view === 'plan')
    return (
      <g>
        <circle cx={0} cy={0} r={120} fill="#a3a3a3" fillOpacity={0.25} />
        <text x={0} y={30} textAnchor="middle" fontSize={60} fill="#737373">
          {t('you')}
        </text>
      </g>
    );
  const ticks = Array.from({ length: Math.floor(-box.y / 100) + 1 }, (_, i) => i * 100);
  return (
    <g pointerEvents="none">
      <line
        x1={box.x}
        y1={0}
        x2={box.x + box.w}
        y2={0}
        stroke="#404040"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {ticks.map((z) => (
        <g key={z}>
          <line
            x1={box.x + 20}
            y1={-z}
            x2={box.x + (z % 500 === 0 ? 80 : 50)}
            y2={-z}
            stroke="#737373"
            vectorEffect="non-scaling-stroke"
          />
          {z % 500 === 0 && (
            <text x={box.x + 90} y={-z + 12} fontSize={36} fill="#737373">
              {z}
            </text>
          )}
        </g>
      ))}
      {view === 'side' && <circle cx={0} cy={0} r={8} fill="#737373" />}
    </g>
  );
}

function ErgoOverlays({ project, setup, box }: CanvasProps & { box: { x: number; y: number; w: number; h: number } }) {
  const body = project.bodyProfiles.find((b) => b.id === setup.bodyProfileId) ?? project.bodyProfiles[0];
  if (!body) return null;
  const lm = landmarks(body, setup.posture, setup.seatHeightMm);
  const e = project.settings.ergonomics;
  const line = (z: number, color: string, label: string, dash?: string) => (
    <g key={label}>
      <line
        x1={box.x}
        y1={-z}
        x2={box.x + box.w}
        y2={-z}
        stroke={color}
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
      <text x={box.x + box.w - 20} y={-z - 8} textAnchor="end" fontSize={28} fill={color}>
        {label} {Math.round(z)}
      </text>
    </g>
  );
  return (
    <g pointerEvents="none" data-testid="ergo-overlays">
      <rect
        x={box.x}
        y={-(lm.elbowMm + e.comfortBandMm)}
        width={box.w}
        height={2 * e.comfortBandMm}
        fill="#16a34a"
        fillOpacity={0.07}
      />
      <rect
        x={box.x}
        y={-(lm.elbowMm - e.comfortBandMm)}
        width={box.w}
        height={e.acceptableLowerMm - e.comfortBandMm}
        fill="#ca8a04"
        fillOpacity={0.06}
      />
      {line(lm.elbowMm, '#15803d', t('elbow'), '8 6')}
      {line(lm.eyeMm, '#1d4ed8', t('eye'), '2 6')}
    </g>
  );
}

function ReachArcs() {
  const arc = (r: number) => `M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`;
  return (
    <g pointerEvents="none" fill="none">
      <path d={arc(450)} stroke="#16a34a" strokeDasharray="10 8" vectorEffect="non-scaling-stroke" />
      <path d={arc(600)} stroke="#ca8a04" strokeDasharray="4 8" vectorEffect="non-scaling-stroke" />
      <text x={0} y={-460} textAnchor="middle" fontSize={30} fill="#16a34a">
        {t('comfortable reach 450')}
      </text>
    </g>
  );
}

function SideSightLines({ report, project }: CanvasProps) {
  const lines = [...report.layout.units.values()].filter(
    (u) => u.model.ergonomics.needsDisplayVisibility && u.placement.mount.type !== 'rack',
  );
  const ergo = project.settings.ergonomics;
  return (
    <g pointerEvents="none">
      <circle cx={report.eye.y} cy={-report.eye.z} r={14} fill="#1d4ed8" fillOpacity={0.6} />
      {lines.map((u) => {
        const mid = surfaceToWorld(u.frame, {
          x: u.local.x + u.local.w / 2,
          y: u.local.y + u.local.d / 2,
          z: u.local.z + u.size.h,
        });
        return (
          <line
            key={u.unitId}
            x1={report.eye.y}
            y1={-report.eye.z}
            x2={mid.y}
            y2={-mid.z}
            stroke="#1d4ed8"
            strokeOpacity={0.35}
            strokeDasharray="6 6"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {report.occlusions
        .filter((o) => o.gapMm !== null)
        .map((o) => {
          const lower = report.layout.units.get(o.lowerUnitId)!;
          return (
            <rect
              key={`${o.upperUnitId}/${o.lowerUnitId}`}
              x={lower.min.y}
              y={-(lower.max.z + ergo.handClearanceMm)}
              width={lower.max.y - lower.min.y}
              height={ergo.handClearanceMm}
              fill={o.gapMm! < ergo.handClearanceMm ? '#dc2626' : '#16a34a'}
              fillOpacity={0.12}
            />
          );
        })}
    </g>
  );
}

function SurfaceShape({ view, s, setup, readOnly, project }: CanvasProps & { s: ResolvedSurface }) {
  const vp = useViewport();
  const drag = useRef<{ startB: number; z: number } | null>(null);
  const corners = surfaceCorners(s).map((c) => toView(view, c));
  const isTier = s.surface.kind === 'tier';
  const rack = s.surface.rack;
  const front = [
    toView(view, surfaceToWorld(s.frame, { x: 0, y: 0, z: 0 })),
    toView(view, surfaceToWorld(s.frame, { x: s.surface.usable.w, y: 0, z: 0 })),
  ];
  const back = toView(
    view,
    surfaceToWorld(s.frame, { x: 0, y: s.surface.holders?.lengthMm ?? s.surface.usable.d, z: 0 }),
  );
  const zAdj = s.surface.adjustable.z;
  const label = `${project.inventory.standUnits.find((u) => u.id === s.standUnitId)?.nickname ?? ''} · ${s.surface.label}`;

  const handle = zAdj && !readOnly && view !== 'plan' && (
    <circle
      role="slider"
      aria-label={t('Height of {surface}', { surface: label })}
      aria-valuenow={Math.round(s.frame.origin.z)}
      cx={view === 'front' ? Math.min(front[0]!.x, front[1]!.x) - 40 : front[0]!.x - 40}
      cy={-s.frame.origin.z}
      r={18}
      fill="#2563eb"
      fillOpacity={0.6}
      style={{ cursor: 'ns-resize' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        drag.current = { startB: -vp.toWorld(e.clientX, e.clientY).y, z: s.frame.origin.z };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const z = d.z + (-vp.toWorld(e.clientX, e.clientY).y - d.startB);
        editSetup(
          setup.id,
          'Tier height',
          (x) => setSurfaceState(x, s.standUnitId, s.surface, { z }),
          `tier:${s.standUnitId}:${s.surface.id}`,
        );
      }}
      onPointerUp={() => {
        drag.current = null;
        projectStore.getState().seal();
      }}
    />
  );

  if (view === 'plan')
    return (
      <polygon
        points={corners.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="#a3a3a3"
        fillOpacity={0.12}
        stroke="#737373"
        strokeDasharray={isTier ? '6 4' : undefined}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    );
  if (rack) {
    const top = s.frame.origin.z + rack.u * RACK_UNIT_MM;
    const xs = view === 'front' ? corners.map((c) => c.x) : corners.map((c) => c.x);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    return (
      <g pointerEvents="none">
        <rect
          x={x0}
          y={-top}
          width={x1 - x0}
          height={rack.u * RACK_UNIT_MM}
          fill="#404040"
          fillOpacity={0.06}
          stroke="#525252"
          vectorEffect="non-scaling-stroke"
        />
        {view === 'front' &&
          Array.from({ length: rack.u }, (_, i) => (
            <text key={i} x={x0 - 8} y={-top + (i + 0.7) * RACK_UNIT_MM} textAnchor="end" fontSize={16} fill="#a3a3a3">
              {i + 1}
            </text>
          ))}
      </g>
    );
  }
  return (
    <g>
      {view === 'front' ? (
        <line
          x1={front[0]!.x}
          y1={front[0]!.y}
          x2={front[1]!.x}
          y2={front[1]!.y}
          stroke="#525252"
          strokeWidth={isTier ? 3 : 2}
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <line
          x1={front[0]!.x}
          y1={front[0]!.y}
          x2={back.x}
          y2={back.y}
          stroke="#525252"
          strokeWidth={isTier ? 3 : 2}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <text
        x={(view === 'front' ? Math.min(front[0]!.x, front[1]!.x) : front[0]!.x) - 70}
        y={front[0]!.y + 40}
        textAnchor="end"
        fontSize={24}
        fill="#737373"
        pointerEvents="none"
      >
        {s.surface.label} · {Math.round(s.frame.origin.z)}
        {s.frame.tiltDeg ? ` · ${s.frame.tiltDeg}°` : ''}
      </text>
      {handle}
    </g>
  );
}

function UnitShape({
  view,
  u,
  selected,
  setup,
  readOnly,
  project,
  report,
  ...props
}: CanvasProps & { u: ResolvedUnit; selected: boolean }) {
  const vp = useViewport();
  const drag = useRef<{
    start: { a: number; b: number };
    mount: ResolvedUnit['placement']['mount'];
    moved: boolean;
  } | null>(null);
  const issues = report.issues.filter((i) => i.entityIds.includes(u.unitId) && i.ruleId !== 'DATA-001');
  const severity = issues.some((i) => i.severity === 'error')
    ? 'error'
    : issues.some((i) => i.severity === 'warning')
      ? 'warning'
      : null;
  const c = u.corners;
  const poly =
    view === 'front'
      ? [c[0]!, c[1]!, c[5]!, c[4]!].map((p) => toView(view, p))
      : view === 'side'
        ? sideHull(u).map((p) => ({ x: p.x, y: p.y }))
        : u.plan.map((p) => ({ x: p.x, y: -p.y }));
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const bb = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  const frontImg =
    view === 'front' && u.placement.rotationDeg === 0 && Math.abs(u.tiltDeg) < 1
      ? assetUrl(project.assets, u.model.images.front?.id)
      : null;
  const stroke =
    severity === 'error' ? '#b91c1c' : severity === 'warning' ? '#b45309' : selected ? '#2563eb' : '#525252';

  return (
    <g
      role="button"
      aria-label={`${u.unit.nickname}${severity ? ` (${severity})` : ''}`}
      aria-pressed={selected}
      data-unit-id={u.unitId}
      style={{ cursor: readOnly || u.placement.locked ? 'pointer' : 'move' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        uiStore.getState().select({ kind: 'gear-unit', id: u.unitId });
        if (readOnly || u.placement.locked || e.button !== 0) return;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        drag.current = {
          start: fromView(view, vp.toWorld(e.clientX, e.clientY)),
          mount: structuredClone(u.placement.mount),
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const now = fromView(view, vp.toWorld(e.clientX, e.clientY));
        const da = now.a - d.start.a;
        const db = now.b - d.start.b;
        if (!d.moved && Math.hypot(da, db) * vp.zoom < 3) return;
        d.moved = true;
        const grid = e.altKey ? 0 : e.shiftKey ? project.settings.snap.fineMm : project.settings.snap.gridMm;
        editSetup(
          setup.id,
          'Move unit',
          (s) => applyDrag(s, u, d.mount, view, da, db, now, grid, report),
          `layout-drag:${u.unitId}`,
        );
      }}
      onPointerUp={() => {
        if (drag.current?.moved) projectStore.getState().seal();
        drag.current = null;
      }}
    >
      <polygon
        points={poly.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={frontImg ? '#fff' : categoryTint(u.model.category)}
        fillOpacity={0.9}
        stroke={stroke}
        strokeWidth={selected || severity ? 2.5 : 1}
        strokeDasharray={u.size.estimated ? '6 4' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {props.heat?.has(u.unitId) && (
        <polygon
          points={poly.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={heatColor(props.heat.get(u.unitId)!)}
          fillOpacity={0.6}
          pointerEvents="none"
          data-comfort={Math.round(props.heat.get(u.unitId)!)}
        />
      )}
      {frontImg && (
        <image
          href={frontImg}
          x={bb.x}
          y={bb.y}
          width={bb.w}
          height={bb.h}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      )}
      {bb.w > 40 && (
        <text
          x={bb.x + bb.w / 2}
          y={bb.y + bb.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(10, Math.min(28, bb.h * 0.45, (bb.w / Math.max(4, u.unit.nickname.length)) * 1.6))}
          fill="#262626"
          pointerEvents="none"
        >
          {u.unit.nickname}
        </text>
      )}
    </g>
  );
}

function sideHull(u: ResolvedUnit): Point[] {
  const pts = u.corners.map((c) => ({ x: c.y, y: -c.z }));
  // Convex hull in view space (y down), small n.
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Apply a drag delta (in the view's horizontal `a` and vertical `b` world axes) to a placement. */
function applyDrag(
  s: Draft<Setup>,
  u: ResolvedUnit,
  start: ResolvedUnit['placement']['mount'],
  view: LayoutViewKind,
  da: number,
  db: number,
  now: { a: number; b: number },
  grid: number,
  report: LayoutReport,
) {
  const p = s.placements.find((x) => x.unitId === u.unitId);
  if (!p) return;
  const snap = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : Math.round(v * 10) / 10);
  const rot = u.frame.standRotationDeg;
  const local = rotatePoint({ x: view === 'side' ? 0 : da, y: view === 'plan' ? db : view === 'side' ? da : 0 }, -rot);

  if (start.type === 'rack' && view === 'front') {
    const bay = report.layout.surfaceOf(start.standUnitId, start.surfaceId)?.surface.rack;
    const hU = Math.max(1, Math.ceil(u.size.h / RACK_UNIT_MM - 1e-9));
    const uStart = Math.min(
      Math.max(1, Math.round(start.uStart - db / RACK_UNIT_MM)),
      Math.max(1, (bay?.u ?? 1) - hU + 1),
    );
    p.mount = { ...start, uStart };
    return;
  }
  if (start.type === 'surface') {
    // Vertical drag in the front view hops to the nearest surface under the pointer.
    if (view === 'front' && Math.abs(db) > 60) {
      const target = surfaceAtFront(report, now.a, now.b, u.size.h);
      if (
        target &&
        !target.surface.rack &&
        (target.standUnitId !== start.standUnitId || target.surface.id !== start.surfaceId)
      ) {
        p.mount = {
          type: 'surface',
          standUnitId: target.standUnitId,
          surfaceId: target.surface.id,
          x: Math.max(0, snap(now.a - target.frame.origin.x - u.size.w / 2)),
          y: start.y,
        };
        return;
      }
    }
    const tilt = Math.cos((u.tiltDeg * Math.PI) / 180) || 1;
    p.mount = { ...start, x: snap(start.x + local.x), y: snap(Math.max(0, start.y + local.y / tilt)) };
    return;
  }
  if (start.type === 'stacked') {
    p.mount = { ...start, x: snap(start.x + local.x), y: snap(start.y + local.y) };
    return;
  }
  if (start.type === 'floor') {
    p.mount = {
      ...start,
      pos: {
        x: snap(start.pos.x + (view === 'side' ? 0 : da)),
        y: snap(start.pos.y + (view === 'plan' ? db : view === 'side' ? da : 0)),
      },
    };
  }
}

/** Compare overlay (spec §5.11): where units sit in another setup, with arrows to their position here. */
function Ghosts({ view, project, report, other }: CanvasProps & { other: Setup }) {
  const ghost = useMemo(() => resolveLayout(project, other), [project, other]);
  const rect = (u: ResolvedUnit) => {
    const pts = u.corners.map((c) => toView(view, c));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  };
  const out: React.ReactNode[] = [];
  for (const g of ghost.units.values()) {
    const here = report.layout.units.get(g.unitId);
    const a = rect(g);
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    if (here) {
      const b = rect(here);
      const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      if (Math.hypot(ca.x - cb.x, ca.y - cb.y) < 5) continue;
      out.push(
        <g key={g.unitId} data-ghost={g.unitId}>
          <rect
            x={a.x}
            y={a.y}
            width={a.w}
            height={a.h}
            fill="none"
            stroke="#6366f1"
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={ca.x}
            y1={ca.y}
            x2={cb.x}
            y2={cb.y}
            stroke="#6366f1"
            strokeWidth={1.5}
            markerEnd="url(#ghost-arrow)"
            vectorEffect="non-scaling-stroke"
          />
        </g>,
      );
    } else
      out.push(
        <g key={g.unitId} data-ghost={g.unitId}>
          <rect
            x={a.x}
            y={a.y}
            width={a.w}
            height={a.h}
            fill="none"
            stroke="#a3a3a3"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
          <text x={a.x + 4} y={a.y + 14} fontSize={12} fill="#a3a3a3">
            {g.unit.nickname}
          </text>
        </g>,
      );
  }
  return (
    <g pointerEvents="none" aria-label={t('Positions in {setup}', { setup: other.name })}>
      <defs>
        <marker
          id="ghost-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="#6366f1" />
        </marker>
      </defs>
      {out}
    </g>
  );
}

/** Comfort 0 → red, 100 → green. */
const heatColor = (score: number) => `hsl(${Math.round(score * 1.2)} 75% 45%)`;
