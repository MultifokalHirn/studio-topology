// Patch canvas (spec §5.7): signal graph of the active setup with the connect tool and visual encodings (§5.9).
import clsx from 'clsx';
import type { Draft } from 'immer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Modal, Select, TextInput } from '@/components/ui';
import { resolveCableColor } from '@/domain/cables';
import type { Connection, Connector, Project, Setup } from '@/domain/types';
import { compatibility, effectiveConnector } from '@/engine/connections';
import {
  buildPatchGraph,
  layeredLayout,
  makeConnection,
  newBundleId,
  NODE_W,
  pairPartner,
  portPosition,
  type PatchEdge,
  type PatchGraph,
  type PatchNode,
  type PatchPort,
} from '@/engine/patch';
import { elkPositions } from '@/engine/elkLayout';
import { buildSignalGraph, nodeKey } from '@/engine/graph';
import { breadcrumb, traceFrom } from '@/engine/trace';
import { clockMasters, clockTree } from '@/engine/trees';
import { resolveLayout } from '@/engine/placement';
import { t } from '@/i18n';
import { cableStyle, type CableStyle } from '@/render/cableStyle';
import { glyphRadius } from '@/render/glyphSize';
import { useViewport, Viewport } from '@/render/Viewport';
import { projectStore, uiStore, useProject, useUi } from '@/store';
import { useValidation } from '../issues/useValidation';
import { dragTypes } from '../layout/dragTypes';

const MAX_ANIMATED = 300;

function editSetup(setupId: string, label: string, recipe: (s: Draft<Setup>) => void, coalesceKey?: string) {
  projectStore.getState().change(
    (p) => {
      const s = p.setups.find((x) => x.id === setupId);
      if (s) recipe(s);
    },
    { label, ...(coalesceKey ? { coalesceKey } : {}) },
  );
}

interface ConnectDrag {
  unitId: string;
  connector: Connector;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function PatchView() {
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const setup = project.setups.find((s) => s.id === project.activeSetupId);
  const [allPorts, setAllPorts] = useState(false);
  const [legend, setLegend] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState(project.settings.labelDensity);
  const [animate, setAnimate] = useState(project.settings.animation.enabled);
  const [midiPrompt, setMidiPrompt] = useState<string[] | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [bulk, setBulk] = useState(false);
  const graph = useMemo(
    () => (setup ? buildPatchGraph(project, setup, { allPorts }) : null),
    [project, setup, allPorts],
  );
  const positions = useMemo(
    () => (graph && setup ? layeredLayout(graph, setup.viewState.patchPositions) : new Map()),
    [graph, setup],
  );
  const units = useMemo(() => (setup ? resolveLayout(project, setup).units : new Map()), [project, setup]);
  const { issues } = useValidation();
  const sig = useMemo(() => (setup ? buildSignalGraph(project, setup) : null), [project, setup]);
  const traceState = useUi((s) => s.trace);
  const follow = useUi((s) => s.follow);
  const highlight = useMemo(() => {
    if (!sig) return null;
    const nick = (id: string) =>
      projectStore.getState().project.inventory.gearUnits.find((u) => u.id === id)?.nickname ?? id;
    if (follow) {
      const conns = new Set<string>();
      const unitIds = new Set<string>();
      for (let i = 0; i <= Math.min(follow.step, follow.path.length - 1); i++) {
        unitIds.add(follow.path[i]!.split('/')[0]!);
        if (i > 0)
          for (const e of sig.out(follow.path[i - 1]!))
            if (e.to === follow.path[i] && e.connection) conns.add(e.connection.id);
      }
      const crumb = follow.path
        .slice(0, follow.step + 1)
        .map((k) => `${nick(k.split('/')[0]!)} · ${sig.connectorOf(k)?.label}`)
        .join(' → ');
      return { connections: conns, units: unitIds, crumb };
    }
    if (!traceState) return null;
    const down = traceFrom(sig, traceState.start, 'down');
    const up = traceFrom(sig, traceState.start, 'up');
    const conns = new Set([...down.edges, ...up.edges].flatMap((e) => (e.connection ? [e.connection.id] : [])));
    const unitIds = new Set([...down.nodes, ...up.nodes].map((k) => k.split('/')[0]!));
    const dest = down.terminals.filter((x) => x.kind === 'destination').length;
    const sources = up.terminals.length;
    return {
      connections: conns,
      units: unitIds,
      crumb: `${breadcrumb(sig, down, nick)}  ·  ↑ ${sources} source${sources === 1 ? '' : 's'}  ↓ ${dest} destination${dest === 1 ? '' : 's'}`,
    };
  }, [sig, traceState, follow]);
  const clockHops = useMemo(() => {
    const m = new Map<string, number>();
    if (!sig || !setup) return m;
    for (const master of clockMasters(project, setup))
      for (const l of clockTree(sig, setup, master).links) if (!m.has(l.connection.id)) m.set(l.connection.id, l.hops);
    return m;
  }, [sig, project, setup]);

  // Follow-signal playback: advance one hop every 600 ms.
  useEffect(() => {
    if (!follow || follow.step >= follow.path.length - 1) return;
    const id = setTimeout(() => uiStore.getState().setFollow({ ...follow, step: follow.step + 1 }), 600);
    return () => clearTimeout(id);
  }, [follow]);
  const issueByConnection = useMemo(() => {
    const rank = { error: 3, warning: 2, info: 1 } as const;
    const m = new Map<string, 'error' | 'warning' | 'info'>();
    for (const i of issues)
      for (const id of i.entityIds) {
        const cur = m.get(id);
        if (!cur || rank[i.severity] > rank[cur]) m.set(id, i.severity);
      }
    return m;
  }, [issues]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'l' && !(e.target instanceof HTMLInputElement) && !e.metaKey && !e.ctrlKey) setLegend((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!setup || !graph) return <p className="p-4 text-sm text-neutral-500">{t('No active setup.')}</p>;

  const styles = new Map<string, { style: CableStyle; color: string; src: Connector; dst: Connector }>();
  const nodeOf = new Map(graph.nodes.map((n) => [n.unitId, n]));
  const connectorOf = (unitId: string, id: string) => {
    const n = nodeOf.get(unitId);
    const c = n?.model.connectors.find((x) => x.id === id);
    return c ? effectiveConnector(c, setup.unitConfigs[unitId]) : undefined;
  };
  for (const e of graph.edges) {
    const src = connectorOf(e.from.unitId, e.from.connectorId);
    const dst = connectorOf(e.to.unitId, e.to.connectorId);
    if (!src || !dst) continue;
    const style = cableStyle(e.connection, src, dst, project.settings);
    const cableUnit = e.connection.cable.unitId
      ? project.inventory.cables.find((x) => x.id === e.connection.cable.unitId)
      : undefined;
    const cableModel = e.connection.cable.modelId
      ? project.library.cableModels.find((x) => x.id === e.connection.cable.modelId)
      : undefined;
    const color = resolveCableColor(e.connection, {
      cableUnit,
      cableModel,
      domain: src.domain,
      role: style.key === 'audio-L' ? 'L' : style.key === 'audio-R' ? 'R' : src.channel?.role,
      settings: project.settings,
    });
    styles.set(e.connection.id, { style, color, src, dst });
  }
  const legendEntries = [...new Map([...styles.values()].map((s) => [s.style.key, s])).values()];

  const create = (
    from: { unitId: string; connector: Connector },
    to: { unitId: string; connector: Connector },
    shift: boolean,
  ) => {
    // Invalid combinations are stored and flagged by the rules (spec §4.10); only read-only mode refuses.
    if (readOnly) return;
    const pairs: [typeof from, typeof to][] = [[from, to]];
    if (shift) {
      const fm = nodeOf.get(from.unitId)?.model;
      const tm = nodeOf.get(to.unitId)?.model;
      const fp = fm && pairPartner(fm, from.connector);
      const tp = tm && pairPartner(tm, to.connector);
      if (fp && tp)
        pairs.push([
          { unitId: from.unitId, connector: fp },
          { unitId: to.unitId, connector: tp },
        ]);
    }
    const bundleId = pairs.length > 1 ? newBundleId() : undefined;
    const made = pairs.map(([a, b]) => makeConnection(project, units, { a, b, bundleId }));
    editSetup(setup.id, pairs.length > 1 ? 'Connect pair' : 'Connect', (s) => void s.connections.push(...made));
    uiStore.getState().select({ kind: 'connection', id: made[0]!.id });
    if (made.some((c) => c.midi)) setMidiPrompt(made.map((c) => c.id));
  };

  return (
    <div
      className="flex h-full flex-col"
      style={{ ['--flow-speed' as string]: String(project.settings.animation.speed) }}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-2 py-1 text-xs dark:border-neutral-700">
        <Checkbox checked={allPorts} onChange={setAllPorts} label={t('All ports')} />
        <Checkbox checked={animate} onChange={setAnimate} label={t('Animate flow')} />
        <label className="flex items-center gap-1">
          {t('BPM')}
          <input
            type="number"
            min={30}
            max={300}
            aria-label={t('Clock BPM')}
            className="w-16 rounded border border-neutral-300 px-1 dark:border-neutral-600 dark:bg-neutral-800"
            value={project.settings.animation.bpm}
            onChange={(e) => {
              const v = Math.min(300, Math.max(30, Number(e.target.value) || 120));
              projectStore
                .getState()
                .change((p) => void (p.settings.animation.bpm = v), { label: 'BPM', coalesceKey: 'bpm' });
            }}
          />
        </label>
        <Checkbox checked={legend} onChange={setLegend} label={t('Legend (L)')} />
        <label className="flex items-center gap-1">
          {t('Labels')}
          <Select
            aria-label={t('Label density')}
            value={density}
            options={['off', 'minimal', 'full'] as const}
            onChange={setDensity}
          />
        </label>
        <Button
          disabled={readOnly}
          onClick={() =>
            editSetup(
              setup.id,
              'Reset patch layout',
              (s) =>
                void (s.viewState.patchPositions = Object.fromEntries(
                  Object.entries(s.viewState.patchPositions).filter(
                    ([id]) =>
                      !s.placements.some((p) => p.unitId === id) &&
                      !s.connections.some((c) => c.a.unitId === id || c.b.unitId === id),
                  ),
                )),
            )
          }
        >
          {t('Reset layout')}
        </Button>
        <Button
          disabled={readOnly}
          onClick={() =>
            void elkPositions(graph).then((pos) =>
              editSetup(setup.id, 'Auto-layout (ELK)', (s) => {
                for (const [id, p] of pos) s.viewState.patchPositions[id] = { ...p, pinned: true };
              }),
            )
          }
        >
          {t('Auto-layout (ELK)')}
        </Button>
        <Button disabled={readOnly} onClick={() => setBulk(true)}>
          {t('Bulk connect…')}
        </Button>
        <span className="ml-auto text-neutral-500">
          {t('Drag port → port to connect · Shift-drag: L/R pair or next channel · right-click a cable for options')}
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <PatchCanvas
          project={project}
          setup={setup}
          graph={graph}
          positions={positions}
          styles={styles}
          hidden={hidden}
          density={density}
          animate={animate}
          readOnly={readOnly}
          onCreate={create}
          onMenu={setMenu}
          issueByConnection={issueByConnection}
          highlight={highlight}
          clockHops={clockHops}
          bpm={project.settings.animation.bpm}
        />
        {legend && legendEntries.length > 0 && (
          <aside
            aria-label={t('Legend')}
            className="absolute top-2 right-2 w-52 rounded border border-neutral-200 bg-white/95 p-2 text-xs shadow dark:border-neutral-700 dark:bg-neutral-900/95"
          >
            <h4 className="mb-1 font-semibold">{t('Legend')}</h4>
            <ul className="space-y-0.5">
              {legendEntries.map(({ style, color }) => (
                <li key={style.key}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={t('Show {what}', { what: style.legend })}
                      checked={!hidden.has(style.key)}
                      onChange={(e) =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (e.target.checked) n.delete(style.key);
                          else n.add(style.key);
                          return n;
                        })
                      }
                    />
                    <svg width={34} height={10} aria-hidden>
                      <line
                        x1={1}
                        y1={5}
                        x2={33}
                        y2={5}
                        stroke={color}
                        strokeWidth={style.width + 0.5}
                        strokeDasharray={style.dash}
                      />
                    </svg>
                    <span className="flex-1">{t(style.legend)}</span>
                    <span className="rounded bg-neutral-200 px-1 text-[10px] dark:bg-neutral-700">
                      {style.badge.length > 4 ? style.badge.slice(0, 4) : style.badge}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </aside>
        )}
        {menu && <EdgeMenu setup={setup} menu={menu} onClose={() => setMenu(null)} />}
        {highlight && (
          <div
            role="status"
            aria-label={t('Signal trace')}
            className="absolute right-2 bottom-2 left-2 flex items-center gap-2 rounded border border-blue-200 bg-blue-50/95 px-2 py-1 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/95 dark:text-blue-100"
          >
            <span className="min-w-0 flex-1 truncate" title={highlight.crumb}>
              {highlight.crumb}
            </span>
            <button
              className="underline"
              onClick={() => {
                uiStore.getState().setTrace(null);
                uiStore.getState().setFollow(null);
              }}
            >
              {t('Clear')}
            </button>
          </div>
        )}
      </div>
      {midiPrompt && <MidiDialog setup={setup} ids={midiPrompt} onClose={() => setMidiPrompt(null)} />}
      {bulk && (
        <BulkConnectDialog
          project={project}
          setup={setup}
          graph={graph}
          onClose={() => setBulk(false)}
          onConnect={(pairs) => {
            for (const [a, b] of pairs) create(a, b, false);
          }}
        />
      )}
    </div>
  );
}

interface CanvasProps {
  project: Project;
  setup: Setup;
  graph: PatchGraph;
  positions: Map<string, { x: number; y: number }>;
  styles: Map<string, { style: CableStyle; color: string; src: Connector; dst: Connector }>;
  hidden: Set<string>;
  density: 'off' | 'minimal' | 'full';
  animate: boolean;
  readOnly: boolean;
  onCreate(
    from: { unitId: string; connector: Connector },
    to: { unitId: string; connector: Connector },
    shift: boolean,
  ): void;
  onMenu(m: { id: string; x: number; y: number }): void;
  issueByConnection: Map<string, 'error' | 'warning' | 'info'>;
  highlight: { connections: Set<string>; units: Set<string> } | null;
  clockHops: Map<string, number>;
  bpm: number;
}

function PatchCanvas(props: CanvasProps) {
  const { graph, positions, setup } = props;
  const selection = useUi((s) => s.selection);
  const [drag, setDrag] = useState<ConnectDrag | null>(null);
  const [hover, setHover] = useState<{ unitId: string; connectorId: string } | null>(null);
  const box = useMemo(() => {
    let maxX = 400;
    let maxY = 300;
    let minX = 0;
    let minY = 0;
    for (const n of graph.nodes) {
      const p = positions.get(n.unitId) ?? { x: 0, y: 0 };
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + n.width);
      maxY = Math.max(maxY, p.y + n.height);
    }
    return { x: minX - 80, y: minY - 60, w: maxX - minX + 160, h: maxY - minY + 120 };
  }, [graph, positions]);

  useEffect(() => {
    if (!drag) return;
    const up = () => setDrag(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [drag]);

  const portXY = (unitId: string, connectorId: string) => {
    const n = graph.nodes.find((x) => x.unitId === unitId);
    const port = n?.ports.find((p) => p.connector.id === connectorId);
    const origin = positions.get(unitId);
    return n && port && origin ? portPosition(n, port, origin) : null;
  };
  const animatedBudget = { n: 0 };
  const lanes = new Map<string, number>();

  return (
    <Viewport
      aria-label={t('Patch of {setup}', { setup: setup.name })}
      content={box}
      className="bg-neutral-50 dark:bg-neutral-950"
      onPointerMoveWorld={(p) => p && drag && setDrag({ ...drag, to: p })}
      onBackgroundClickWorld={() => {
        uiStore.getState().select(null);
        uiStore.getState().setTrace(null);
        uiStore.getState().setFollow(null);
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'connection' && !props.readOnly) {
          editSetup(
            setup.id,
            'Delete connection',
            (s) => void (s.connections = s.connections.filter((c) => c.id !== selection.id)),
          );
          uiStore.getState().select(null);
        }
      }}
      onDropWorld={(p, e) => {
        const id = e.dataTransfer.getData(dragTypes.gear);
        if (!id || props.readOnly) return;
        // Never drop onto another node: slide down below whatever is in the way.
        const x = Math.round(p.x);
        let y = Math.round(p.y);
        for (let k = 0; k < 50; k++) {
          const hit = graph.nodes.find((n) => {
            const o = positions.get(n.unitId);
            return (
              o &&
              n.unitId !== id &&
              x < o.x + n.width + 20 &&
              x + NODE_W + 20 > o.x &&
              y < o.y + n.height + 20 &&
              y + 160 > o.y
            );
          });
          if (!hit) break;
          y = positions.get(hit.unitId)!.y + hit.height + 30;
        }
        editSetup(setup.id, 'Add to patch', (s) => void (s.viewState.patchPositions[id] = { x, y, pinned: true }));
      }}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
      </defs>
      {graph.edges.map((e, i) => {
        const a = portXY(e.from.unitId, e.from.connectorId);
        const b = portXY(e.to.unitId, e.to.connectorId);
        const st = props.styles.get(e.connection.id);
        if (!a || !b || !st) return null;
        const laneKey = `${Math.round(a.x)}`;
        const lane = lanes.get(laneKey) ?? 0;
        lanes.set(laneKey, lane + 1);
        const animated = props.animate && e.connection.enabled && animatedBudget.n++ < MAX_ANIMATED;
        return (
          <EdgeShape
            key={e.connection.id}
            edge={e}
            index={i}
            a={a}
            b={b}
            lane={lane}
            {...st}
            selected={selection?.kind === 'connection' && selection.id === e.connection.id}
            dimmed={props.hidden.has(st.style.key)}
            density={props.density}
            animated={animated}
            midiColors={props.project.settings.palette.midiChannels}
            onMenu={props.onMenu}
            issue={props.issueByConnection.get(e.connection.id)}
            traced={props.highlight ? props.highlight.connections.has(e.connection.id) : null}
            clockHop={props.clockHops.get(e.connection.id)}
            bpm={props.bpm}
          />
        );
      })}
      {graph.nodes.map((n) => (
        <NodeShape
          key={n.unitId}
          node={n}
          origin={positions.get(n.unitId) ?? { x: 0, y: 0 }}
          setupId={setup.id}
          readOnly={props.readOnly}
          selected={selection?.kind === 'gear-unit' && selection.id === n.unitId}
          dimmed={!!props.highlight && !props.highlight.units.has(n.unitId)}
          drag={drag}
          hover={hover}
          setHover={setHover}
          onStartConnect={(port, from) => setDrag({ unitId: n.unitId, connector: port.connector, from, to: from })}
          onDropOnPort={(port, shift) => {
            if (drag && drag.unitId === n.unitId && drag.connector.id === port.connector.id) {
              uiStore.getState().select({ kind: 'port', id: `${n.unitId}/${port.connector.id}` });
              uiStore.getState().setTrace({ start: nodeKey(n.unitId, port.connector.id), pinned: true });
            } else if (drag)
              props.onCreate(
                { unitId: drag.unitId, connector: drag.connector },
                { unitId: n.unitId, connector: port.connector },
                shift,
              );
            setDrag(null);
          }}
        />
      ))}
      {drag && (
        <line
          x1={drag.from.x}
          y1={drag.from.y}
          x2={drag.to.x}
          y2={drag.to.y}
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
    </Viewport>
  );
}

function NodeShape(props: {
  node: PatchNode;
  origin: { x: number; y: number };
  setupId: string;
  readOnly: boolean;
  selected: boolean;
  dimmed: boolean;
  drag: ConnectDrag | null;
  hover: { unitId: string; connectorId: string } | null;
  setHover(h: { unitId: string; connectorId: string } | null): void;
  onStartConnect(port: PatchPort, from: { x: number; y: number }): void;
  onDropOnPort(port: PatchPort, shift: boolean): void;
}) {
  const { node, origin } = props;
  const vp = useViewport();
  const move = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <g data-unit-id={node.unitId} transform={`translate(${origin.x} ${origin.y})`} opacity={props.dimmed ? 0.35 : 1}>
      <rect
        width={node.width}
        height={node.height}
        rx={6}
        fill="white"
        className="dark:fill-neutral-900"
        stroke={props.selected ? '#2563eb' : '#737373'}
        strokeWidth={props.selected ? 2 : 1}
        vectorEffect="non-scaling-stroke"
      />
      <g
        role="button"
        aria-label={t('Unit {name}', { name: node.label })}
        style={{ cursor: props.readOnly ? 'pointer' : 'grab' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          uiStore.getState().select({ kind: 'gear-unit', id: node.unitId });
          if (props.readOnly) return;
          const w = vp.toWorld(e.clientX, e.clientY);
          move.current = { dx: w.x - origin.x, dy: w.y - origin.y };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const m = move.current;
          if (!m) return;
          const w = vp.toWorld(e.clientX, e.clientY);
          const x = Math.round((w.x - m.dx) / 10) * 10;
          const y = Math.round((w.y - m.dy) / 10) * 10;
          editSetup(
            props.setupId,
            'Move node',
            (s) => void (s.viewState.patchPositions[node.unitId] = { x, y, pinned: true }),
            `patch-node:${node.unitId}`,
          );
        }}
        onPointerUp={() => {
          if (move.current) projectStore.getState().seal();
          move.current = null;
        }}
      >
        <rect width={node.width} height={24} rx={6} fill="#f5f5f5" className="dark:fill-neutral-800" />
        <text
          x={8}
          y={16}
          fontSize={12}
          fontWeight={600}
          fill="currentColor"
          className="fill-neutral-800 dark:fill-neutral-100"
        >
          {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
        </text>
      </g>
      {node.ports.map((port) => {
        const p = portPosition(node, port, { x: 0, y: 0 });
        const compat = props.drag ? compatibility(props.drag.connector, port.connector) : null;
        const isSource = props.drag?.unitId === node.unitId && props.drag.connector.id === port.connector.id;
        const state = !compat || isSource ? 'idle' : compat.blocked ? 'blocked' : compat.reasons.length ? 'warn' : 'ok';
        const hovered = props.hover?.unitId === node.unitId && props.hover.connectorId === port.connector.id;
        const title =
          compat && !isSource
            ? compat.blocked || compat.reasons.length
              ? compat.reasons.join('; ')
              : t('Compatible')
            : `${port.connector.label} · ${port.connector.domain} · ${port.connector.jack}`;
        return (
          <g
            key={port.connector.id}
            role="button"
            aria-label={t('Port {unit} {port}', { unit: node.label, port: port.connector.label })}
            data-port={`${node.unitId}/${port.connector.id}`}
            data-compat={state}
            transform={`translate(${p.x} ${p.y})`}
            opacity={state === 'blocked' ? 0.3 : 1}
            style={{ cursor: props.readOnly ? 'default' : 'crosshair' }}
            onPointerEnter={() => {
              props.setHover({ unitId: node.unitId, connectorId: port.connector.id });
              const ui = uiStore.getState();
              if (!props.drag && !ui.trace?.pinned && !ui.follow)
                ui.setTrace({ start: nodeKey(node.unitId, port.connector.id), pinned: false });
            }}
            onPointerLeave={() => {
              props.setHover(null);
              const ui = uiStore.getState();
              if (!ui.trace?.pinned) ui.setTrace(null);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (props.readOnly || e.button !== 0) return;
              props.onStartConnect(port, { x: origin.x + p.x, y: origin.y + p.y });
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              props.onDropOnPort(port, e.shiftKey);
            }}
          >
            <title>{title}</title>
            <circle r={8} fill="transparent" />
            <circle
              r={Math.min(5, 2 + glyphRadius(port.connector.jack) / 3)}
              fill={port.connected ? '#525252' : 'white'}
              stroke={state === 'ok' ? '#16a34a' : state === 'warn' ? '#d97706' : hovered ? '#2563eb' : '#525252'}
              strokeWidth={state === 'ok' || state === 'warn' || hovered ? 3 : 1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={port.side === 'west' ? 10 : -10}
              y={4}
              fontSize={10}
              textAnchor={port.side === 'west' ? 'start' : 'end'}
              className="fill-neutral-700 dark:fill-neutral-300"
              pointerEvents="none"
            >
              {port.connector.label.length > 18 ? `${port.connector.label.slice(0, 17)}…` : port.connector.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function EdgeShape(props: {
  edge: PatchEdge;
  index: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
  lane: number;
  style: CableStyle;
  color: string;
  src: Connector;
  dst: Connector;
  selected: boolean;
  dimmed: boolean;
  density: 'off' | 'minimal' | 'full';
  animated: boolean;
  midiColors: string[];
  onMenu(m: { id: string; x: number; y: number }): void;
  issue?: 'error' | 'warning' | 'info';
  /** null = no trace active; true/false = on or off the traced path. */
  traced: boolean | null;
  clockHop?: number;
  bpm: number;
}) {
  const { a, b, style, edge } = props;
  const c = edge.connection;
  // Orthogonal route: horizontal out of the source port, vertical in a lane, horizontal into the target.
  const forward = b.x >= a.x + 40;
  const laneX = forward ? a.x + 24 + (props.lane % 10) * 7 : a.x + 30 + (props.lane % 10) * 7;
  const d = forward
    ? `M ${a.x} ${a.y} H ${laneX} V ${b.y} H ${b.x}`
    : `M ${a.x} ${a.y} H ${laneX} V ${(a.y + b.y) / 2} H ${b.x - 30} V ${b.y} H ${b.x}`;
  const id = `edge-${c.id}`;
  const opacity = !c.enabled ? 0.3 : props.dimmed || props.traced === false ? 0.12 : 1;
  const midX = (laneX + (forward ? laneX : b.x - 30)) / 2;
  const midY = (a.y + b.y) / 2;
  const badge = (x: number, y: number, anchor: 'start' | 'end') =>
    props.density !== 'off' && (
      <g transform={`translate(${x} ${y - 9})`} pointerEvents="none">
        <rect
          x={anchor === 'start' ? 0 : -(style.badge.length * 6 + 6)}
          y={-6}
          width={style.badge.length * 6 + 6}
          height={11}
          rx={3}
          fill={style.badgeColor ?? props.color}
        />
        <text x={anchor === 'start' ? 3 : -3} y={3} fontSize={8} textAnchor={anchor} fill="white" fontWeight={700}>
          {style.badge}
        </text>
      </g>
    );
  return (
    <g
      opacity={opacity}
      role="button"
      aria-label={t('Cable {label}: {from} to {to}', {
        label: c.label ?? '',
        from: props.src.label,
        to: props.dst.label,
      })}
      data-connection-id={c.id}
      data-domain={style.key}
      onPointerDown={(e) => {
        e.stopPropagation();
        uiStore.getState().select({ kind: 'connection', id: c.id });
      }}
      onPointerEnter={() => {
        const ui = uiStore.getState();
        if (!ui.trace?.pinned && !ui.follow)
          ui.setTrace({ start: nodeKey(edge.from.unitId, edge.from.connectorId), pinned: false });
      }}
      onPointerLeave={() => {
        const ui = uiStore.getState();
        if (!ui.trace?.pinned) ui.setTrace(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        uiStore.getState().select({ kind: 'connection', id: c.id });
        const host = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect();
        props.onMenu({ id: c.id, x: e.clientX - host.left, y: e.clientY - host.top });
      }}
      style={{ cursor: 'pointer' }}
    >
      <path d={d} fill="none" stroke="transparent" strokeWidth={10} vectorEffect="non-scaling-stroke" />
      <path
        id={id}
        d={d}
        fill="none"
        stroke={edge.invalid ? '#b91c1c' : props.color}
        strokeWidth={style.width + (props.selected ? 1.5 : 0) + (props.traced ? 1.5 : 0)}
        strokeDasharray={style.dash}
        markerEnd="url(#arrow)"
        markerStart={edge.bidir ? 'url(#arrow)' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {props.animated && (
        <path
          d={d}
          fill="none"
          // MIDI packets take the channel colour; clock pulses tick at the global BPM, delayed 40 ms per hop.
          stroke={style.key === 'midi' && style.badgeColor ? style.badgeColor : 'white'}
          strokeOpacity={0.9}
          strokeWidth={Math.max(1, style.width - 0.5) + (style.key === 'midi' ? 1 : 0)}
          className={style.anim}
          style={
            style.key === 'clock' || (style.key === 'midi' && props.clockHop !== undefined)
              ? { animationDuration: `${60 / props.bpm}s`, animationDelay: `${(props.clockHop ?? 0) * 40}ms` }
              : undefined
          }
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          data-animated="true"
        />
      )}
      {!props.animated && props.density !== 'off' && (
        <text fontSize={9} fill={props.color} pointerEvents="none">
          <textPath href={`#${id}`} startOffset="10">
            {'›          '.repeat(12)}
          </textPath>
        </text>
      )}
      {style.balancedTicks && props.density !== 'off' && (
        <path
          d={`M ${a.x + 8} ${a.y - 4} v 8 M ${a.x + 11} ${a.y - 4} v 8 M ${b.x - 8} ${b.y - 4} v 8 M ${b.x - 11} ${b.y - 4} v 8`}
          stroke={props.color}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {badge(a.x + 4, a.y, 'start')}
      {badge(b.x - 4, b.y, 'end')}
      {props.density === 'full' && (c.label || c.cable.lengthMm) && (
        <text
          x={midX + 4}
          y={midY}
          fontSize={9}
          className="fill-neutral-600 dark:fill-neutral-300"
          pointerEvents="none"
        >
          {[
            c.label,
            c.cable.lengthMm ? `${c.cable.lengthMm / 1000} m` : null,
            c.cable.adapters.length ? '+adapter' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </text>
      )}
      {props.issue && (
        <circle
          cx={midX}
          cy={midY}
          r={4.5}
          fill={props.issue === 'error' ? '#B91C1C' : props.issue === 'warning' ? '#B45309' : '#1D4ED8'}
          stroke="white"
          vectorEffect="non-scaling-stroke"
          data-issue={props.issue}
        />
      )}
    </g>
  );
}

function EdgeMenu({
  setup,
  menu,
  onClose,
}: {
  setup: Setup;
  menu: { id: string; x: number; y: number };
  onClose: () => void;
}) {
  const c = setup.connections.find((x) => x.id === menu.id);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [onClose]);
  if (!c) return null;
  const item = (label: string, run: () => void) => (
    <button role="menuitem" className="block w-full px-3 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800" onPointerDown={(e) => e.stopPropagation()} onClick={() => { run(); onClose(); }}>
      {label}
    </button>
  ); // prettier-ignore
  return (
    <div
      role="menu"
      aria-label={t('Cable options')}
      className="absolute z-10 min-w-40 rounded border border-neutral-200 bg-white py-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      style={{ left: menu.x, top: menu.y }}
    >
      {item(t('Edit…'), () => uiStore.getState().select({ kind: 'connection', id: c.id }))}
      {item(c.enabled ? t('Disable') : t('Enable'), () =>
        editSetup(
          setup.id,
          'Toggle connection',
          (s) => void (s.connections.find((x) => x.id === c.id)!.enabled = !c.enabled),
        ),
      )}
      {item(t('Delete'), () => {
        editSetup(
          setup.id,
          'Delete connection',
          (s) => void (s.connections = s.connections.filter((x) => x.id !== c.id)),
        );
        uiStore.getState().select(null);
      })}
    </div>
  );
}

/** Spec §5.7 item 3: after a MIDI connection, ask for channel(s) and purposes. */
function MidiDialog({ setup, ids, onClose }: { setup: Setup; ids: string[]; onClose: () => void }) {
  const first = setup.connections.find((c) => ids.includes(c.id));
  const [mode, setMode] = useState<'channels' | 'omni' | 'per-track'>(
    Array.isArray(first?.midi?.channels) ? 'channels' : ((first?.midi?.channels as 'omni' | 'per-track') ?? 'channels'),
  );
  const [channels, setChannels] = useState(Array.isArray(first?.midi?.channels) ? first.midi.channels.join(', ') : '1');
  const [purposes, setPurposes] = useState<Set<string>>(new Set(first?.midi?.purposes ?? ['notes']));
  const parsed = channels.split(/[ ,]+/).filter(Boolean).map(Number);
  const valid =
    mode !== 'channels' || (parsed.length > 0 && parsed.every((n) => Number.isInteger(n) && n >= 1 && n <= 16));
  return (
    <Modal
      title={t('MIDI channels and purposes')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('Keep defaults')}</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              editSetup(setup.id, 'MIDI channels', (s) => {
                for (const c of s.connections)
                  if (ids.includes(c.id) && c.midi) {
                    c.midi.channels = mode === 'channels' ? parsed : mode;
                    c.midi.purposes = [...purposes] as NonNullable<Connection['midi']>['purposes'];
                  }
              });
              onClose();
            }}
          >
            {t('Apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-xs text-neutral-500">
          {t('Channels')}
          <Select
            aria-label={t('Channel mode')}
            value={mode}
            options={[
              { value: 'channels', label: t('Specific channels') },
              { value: 'omni', label: t('All (omni)') },
              { value: 'per-track', label: t('Per track') },
            ]}
            onChange={setMode}
          />
        </label>
        {mode === 'channels' && (
          <label className="block text-xs text-neutral-500">
            {t('Channel numbers (1–16, comma-separated)')}
            <TextInput aria-label={t('MIDI channels')} value={channels} onChange={setChannels} />
          </label>
        )}
        <fieldset className={clsx('flex flex-wrap gap-3')}>
          <legend className="text-xs text-neutral-500">{t('Purposes')}</legend>
          {(['notes', 'cc', 'pc', 'clock', 'transport', 'sysex'] as const).map((p) => (
            <Checkbox
              key={p}
              label={p}
              checked={purposes.has(p)}
              onChange={(on) =>
                setPurposes((s) => {
                  const n = new Set(s);
                  if (on) n.add(p);
                  else n.delete(p);
                  return n;
                })
              }
            />
          ))}
        </fieldset>
      </div>
    </Modal>
  );
}

/** Spec §5.7 item 5: connect a unit's outputs to another unit's inputs in order. */
function BulkConnectDialog(props: {
  project: Project;
  setup: Setup;
  graph: PatchGraph;
  onClose: () => void;
  onConnect: (pairs: [{ unitId: string; connector: Connector }, { unitId: string; connector: Connector }][]) => void;
}) {
  const unitIds = props.graph.nodes.map((n) => ({ value: n.unitId, label: n.label }));
  const [from, setFrom] = useState(unitIds[0]?.value ?? '');
  const [to, setTo] = useState(unitIds[1]?.value ?? '');
  const [outs, setOuts] = useState<string[]>([]);
  const [ins, setIns] = useState<string[]>([]);
  const ports = (unitId: string, dir: 'out' | 'in') => {
    const n = props.graph.nodes.find((x) => x.unitId === unitId);
    const all = n?.model.connectors.map((c) => effectiveConnector(c, props.setup.unitConfigs[unitId])) ?? [];
    return all.filter((c) => (dir === 'out' ? c.direction === 'out' || c.direction === 'thru' : c.direction === 'in'));
  };
  const outList = ports(from, 'out');
  const inList = ports(to, 'in');
  const pairs = outs.slice(0, ins.length).map((o, i) => [
    { unitId: from, connector: outList.find((c) => c.id === o)! },
    { unitId: to, connector: inList.find((c) => c.id === ins[i])! },
  ]) as [{ unitId: string; connector: Connector }, { unitId: string; connector: Connector }][];
  const list = (items: Connector[], sel: string[], set: (v: string[]) => void, label: string) => (
    <select
      multiple
      aria-label={label}
      className="h-56 w-full rounded border border-neutral-300 text-xs dark:border-neutral-600 dark:bg-neutral-800"
      value={sel}
      onChange={(e) => set([...e.target.selectedOptions].map((o) => o.value))}
    >
      {items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
  return (
    <Modal
      title={t('Bulk connect')}
      wide
      onClose={props.onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-neutral-500">
            {t('{n} connections, in selection order', { n: pairs.length })}
          </span>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            disabled={pairs.length === 0}
            onClick={() => {
              props.onConnect(pairs);
              props.onClose();
            }}
          >
            {t('Connect sequentially')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="space-y-1">
          <Select
            aria-label={t('From unit')}
            value={from}
            options={unitIds}
            onChange={(v) => {
              setFrom(v);
              setOuts([]);
            }}
          />
          {list(outList, outs, setOuts, t('Outputs'))}
        </div>
        <div className="space-y-1">
          <Select
            aria-label={t('To unit')}
            value={to}
            options={unitIds}
            onChange={(v) => {
              setTo(v);
              setIns([]);
            }}
          />
          {list(inList, ins, setIns, t('Inputs'))}
        </div>
      </div>
    </Modal>
  );
}
