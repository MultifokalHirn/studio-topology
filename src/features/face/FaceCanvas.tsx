// Face canvas (spec §5.5 "Connector placement on images", fallback rendering): a panel at true scale with
// draggable, typed connector glyphs. Reused by the gear editor (edits a draft) and the Face tab (edits the store).
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button, NumberInput } from '@/components/ui';
import { domainPaletteKey } from '@/domain/cables';
import {
  categoryTint,
  clampToFace,
  faceSizeOrDefault,
  isConnectorPlaced,
  mirrorInPlace,
  mirrorToOppositeFace,
  OPPOSITE_FACE,
  snapPoint,
} from '@/domain/faces';
import { FaceId as FaceIdSchema } from '@/domain/schemas';
import type { Connector, FaceId, GearModel, Point } from '@/domain/types';
import { t } from '@/i18n';
import { glyphRadius } from '@/render/glyphSize';
import { JackGlyph } from '@/render/glyphs';
import { useViewport, Viewport } from '@/render/Viewport';

export interface FaceImage {
  url: string | null;
  /** Asset referenced but not found (missing file). */
  missing: boolean;
  widthPx?: number;
  heightPx?: number;
  pxPerMm?: number;
}

export interface FaceCanvasProps {
  model: GearModel;
  face: FaceId;
  onFaceChange(face: FaceId): void;
  image: FaceImage;
  palette: Record<string, string>;
  gridMm: number;
  fineMm: number;
  readOnly?: boolean;
  /** Called continuously while dragging (`phase: 'drag'`) and once at the end (`'end'`). */
  onMove(index: number, pos: Point, phase: 'drag' | 'end'): void;
  onReplace(index: number, connector: Connector): void;
}

const FACES = FaceIdSchema.options;

function snapFor(e: { altKey: boolean; shiftKey: boolean }, grid: number, fine: number) {
  return e.altKey ? 0 : e.shiftKey ? fine : grid;
}

export function FaceCanvas(props: FaceCanvasProps) {
  const { model, face } = props;
  const size = faceSizeOrDefault(model, face);
  const [selected, setSelected] = useState<number | null>(null);
  const [placing, setPlacing] = useState<number | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  const onFace = model.connectors.map((c, i) => ({ c, i })).filter(({ c }) => c.face === face);
  const placed = onFace.filter(({ i }) => isConnectorPlaced(model, i));
  const unplaced = onFace.filter(({ i }) => !isConnectorPlaced(model, i));
  const counts = Object.fromEntries(FACES.map((f) => [f, model.connectors.filter((c) => c.face === f).length]));
  const sel = selected !== null && model.connectors[selected]?.face === face ? model.connectors[selected] : undefined;

  const place = (index: number, p: Point, e: { altKey: boolean; shiftKey: boolean }) => {
    const pos = clampToFace(snapPoint(p, snapFor(e, props.gridMm, props.fineMm)), size.widthMm, size.heightMm);
    props.onMove(index, pos, 'end');
    setSelected(index);
    setPlacing(null);
  };

  const nudge = (e: React.KeyboardEvent) => {
    if (selected === null || props.readOnly || !sel) return;
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    props.onMove(
      selected,
      clampToFace({ x: sel.pos.x + d[0]!, y: sel.pos.y + d[1]! }, size.widthMm, size.heightMm),
      'end',
    );
  };

  const imgW =
    props.image.url && props.image.widthPx && props.image.pxPerMm
      ? props.image.widthPx / props.image.pxPerMm
      : size.widthMm;
  const imgH =
    props.image.url && props.image.heightPx && props.image.pxPerMm
      ? props.image.heightPx / props.image.pxPerMm
      : size.heightMm;

  return (
    <div className="flex h-full min-h-[420px] gap-3">
      <div className="relative min-w-0 flex-1 rounded border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950">
        <Viewport
          aria-label={t('{face} panel of {name}', { face, name: model.name })}
          content={{ x: -10, y: -10, w: Math.max(size.widthMm, imgW) + 20, h: Math.max(size.heightMm, imgH) + 20 }}
          onPointerMoveWorld={setCursor}
          onKeyDown={nudge}
          onBackgroundClickWorld={(p, e) => {
            if (placing !== null && !props.readOnly) place(placing, p, e);
            else setSelected(null);
          }}
          onDropWorld={(p, e) => {
            const i = Number(e.dataTransfer.getData('application/x-connector-index'));
            if (Number.isInteger(i) && !props.readOnly && model.connectors[i]) place(i, p, e);
          }}
          svgProps={{ style: { cursor: placing !== null ? 'crosshair' : undefined } }}
          overlay={
            <div className="pointer-events-none absolute bottom-1 left-2 flex gap-3 text-[11px] text-neutral-500">
              <span data-testid="face-cursor">
                {cursor ? `x ${cursor.x.toFixed(1)} · y ${cursor.y.toFixed(1)} mm` : ''}
              </span>
              <span>
                {size.widthMm} × {size.heightMm} mm{size.estimated ? ` (${t('estimated')})` : ''}
              </span>
              <span>{t('Wheel: zoom · Space-drag: pan · F: fit · Alt: no snap · Shift: 1 mm')}</span>
            </div>
          }
        >
          <PanelBackground
            {...props}
            widthMm={size.widthMm}
            heightMm={size.heightMm}
            estimated={size.estimated}
            imgW={imgW}
            imgH={imgH}
          />
          <Grid widthMm={size.widthMm} heightMm={size.heightMm} gridMm={props.gridMm} />
          {placed.map(({ c, i }) => (
            <ConnectorGlyph
              key={`${i}:${c.id}`}
              c={c}
              index={i}
              color={props.palette[domainPaletteKey(c.domain, c.channel?.role)] ?? '#374151'}
              selected={selected === i}
              readOnly={!!props.readOnly}
              faceSize={size}
              grid={props.gridMm}
              fine={props.fineMm}
              onSelect={() => setSelected(i)}
              onMove={props.onMove}
            />
          ))}
        </Viewport>
      </div>

      <aside className="w-64 shrink-0 space-y-3 overflow-auto text-xs" aria-label={t('Panel connectors')}>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('Face')}>
          {FACES.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={f === face}
              onClick={() => {
                props.onFaceChange(f);
                setPlacing(null);
              }}
              className={clsx(
                'rounded border px-1.5 py-0.5',
                f === face
                  ? 'border-neutral-900 font-semibold dark:border-neutral-100'
                  : 'border-neutral-300 text-neutral-500 dark:border-neutral-600',
              )}
            >
              {t(f)} {counts[f] ? `(${counts[f]})` : ''}
            </button>
          ))}
        </div>

        {unplaced.length > 0 && (
          <section>
            <h4 className="mb-1 font-semibold text-neutral-500 uppercase">
              {t('To place')} ({unplaced.length})
            </h4>
            <p className="mb-1 text-neutral-500">
              {t('Drag onto the panel, or click "place" and then click the panel.')}
            </p>
            <ul aria-label={t('Unplaced connectors')} className="space-y-0.5">
              {unplaced.map(({ c, i }) => (
                <li
                  key={`${i}:${c.id}`}
                  draggable={!props.readOnly}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-connector-index', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className={clsx(
                    'flex cursor-grab items-center gap-1 rounded border px-1 py-0.5',
                    placing === i
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950'
                      : 'border-neutral-200 dark:border-neutral-700',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate" title={`${c.id} · ${c.jack}`}>
                    {c.label}
                  </span>
                  <button
                    disabled={props.readOnly}
                    aria-label={t('Place {label}', { label: c.label })}
                    className="rounded px-1 text-blue-700 underline disabled:opacity-40 dark:text-blue-300"
                    onClick={() => setPlacing(placing === i ? null : i)}
                  >
                    {placing === i ? t('cancel') : t('place')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="mb-1 font-semibold text-neutral-500 uppercase">
            {t('Placed')} ({placed.length})
          </h4>
          <ul className="space-y-0.5">
            {placed.map(({ c, i }) => (
              <li key={`${i}:${c.id}`}>
                <button
                  className={clsx(
                    'w-full truncate rounded px-1 text-left',
                    selected === i && 'bg-blue-50 font-semibold dark:bg-blue-950',
                  )}
                  onClick={() => setSelected(i)}
                >
                  {c.label} <span className="text-neutral-500">{`${c.pos.x.toFixed(1)}, ${c.pos.y.toFixed(1)}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {sel && selected !== null && (
          <section
            aria-label={t('Selected connector')}
            className="rounded border border-neutral-200 p-2 dark:border-neutral-700"
          >
            <h4 className="mb-1 font-semibold">{sel.label}</h4>
            <p className="mb-1 text-neutral-500">
              {sel.domain} · {sel.direction} · {sel.jack}
            </p>
            <div className="mb-2 grid grid-cols-2 gap-1">
              <label>
                x mm
                <NumberInput
                  aria-label={t('x mm')}
                  value={sel.pos.x}
                  onChange={(v) => v !== null && props.onMove(selected, { x: v, y: sel.pos.y }, 'end')}
                />
              </label>
              <label>
                y mm
                <NumberInput
                  aria-label={t('y mm')}
                  value={sel.pos.y}
                  onChange={(v) => v !== null && props.onMove(selected, { x: sel.pos.x, y: v }, 'end')}
                />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <Button
                disabled={props.readOnly}
                onClick={() => props.onReplace(selected, mirrorInPlace(sel, model))}
                title={t('Re-read x from the other side: x → width − x')}
              >
                {t('Mirror x (measured from the other side)')}
              </Button>
              <Button
                disabled={props.readOnly}
                onClick={() => props.onReplace(selected, mirrorToOppositeFace(sel, model))}
              >
                {t('Move to {face} face (same spot)', { face: t(OPPOSITE_FACE[sel.face]) })}
              </Button>
              {face !== 'front' && face !== 'back' ? null : (
                <Button
                  disabled={props.readOnly}
                  onClick={() => {
                    for (const { c, i } of placed) props.onReplace(i, mirrorToOppositeFace(c, model));
                  }}
                >
                  {t('Move all placed to {face} (mirror helper)', { face: t(OPPOSITE_FACE[face]) })}
                </Button>
              )}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function PanelBackground(
  props: FaceCanvasProps & { widthMm: number; heightMm: number; estimated: boolean; imgW: number; imgH: number },
) {
  const { model, face, image } = props;
  const keyboard = face === 'top' ? model.dimensions.keyboard : undefined;
  return (
    <g>
      <rect
        data-background="true"
        x={0}
        y={0}
        width={props.widthMm}
        height={props.heightMm}
        rx={Math.min(6, props.heightMm / 8)}
        fill={categoryTint(model.category)}
        stroke="#525252"
        strokeDasharray={props.estimated ? '6 4' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {image.url ? (
        <image
          data-background="true"
          href={image.url}
          x={0}
          y={0}
          width={props.imgW}
          height={props.imgH}
          preserveAspectRatio="none"
        />
      ) : (
        <>
          <text
            x={props.widthMm / 2}
            y={Math.min(14, props.heightMm / 3)}
            textAnchor="middle"
            fontSize={Math.min(10, props.heightMm / 5)}
            fill="#404040"
            pointerEvents="none"
          >
            {[model.manufacturer, model.name].filter(Boolean).join(' ')} · {face}
          </text>
          {keyboard && <Keys widthMm={props.widthMm} heightMm={props.heightMm} keys={keyboard.keys} />}
        </>
      )}
      {(image.missing || !image.url) && (
        <text
          x={4}
          y={props.heightMm - 4}
          fontSize={Math.min(6, props.heightMm / 6)}
          fill={image.missing ? '#b91c1c' : '#737373'}
          pointerEvents="none"
        >
          {image.missing ? t('Image missing') : t('No image (fallback drawing)')}
        </text>
      )}
    </g>
  );
}

/** Simple key glyphs along the front edge of a keyboard's top face. */
function Keys({ widthMm, heightMm, keys }: { widthMm: number; heightMm: number; keys: number }) {
  const white = Math.round((keys * 7) / 12);
  const margin = Math.min(60, widthMm * 0.06);
  const kw = (widthMm - 2 * margin) / white;
  const kh = Math.min(heightMm * 0.55, 140);
  return (
    <g pointerEvents="none" opacity={0.7}>
      {Array.from({ length: white }, (_, i) => (
        <rect
          key={i}
          x={margin + i * kw}
          y={heightMm - kh - 4}
          width={kw}
          height={kh}
          fill="#fafafa"
          stroke="#a3a3a3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

function Grid({ widthMm, heightMm, gridMm }: { widthMm: number; heightMm: number; gridMm: number }) {
  const { zoom } = useViewport();
  if (gridMm <= 0 || gridMm * zoom < 6) return null;
  const xs = Array.from({ length: Math.floor(widthMm / gridMm) + 1 }, (_, i) => i * gridMm);
  const ys = Array.from({ length: Math.floor(heightMm / gridMm) + 1 }, (_, i) => i * gridMm);
  return (
    <g stroke="#000" strokeOpacity={0.06} pointerEvents="none">
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={0} x2={x} y2={heightMm} vectorEffect="non-scaling-stroke" />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} x1={0} y1={y} x2={widthMm} y2={y} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

function ConnectorGlyph(props: {
  c: Connector;
  index: number;
  color: string;
  selected: boolean;
  readOnly: boolean;
  faceSize: { widthMm: number; heightMm: number };
  grid: number;
  fine: number;
  onSelect(): void;
  onMove(index: number, pos: Point, phase: 'drag' | 'end'): void;
}) {
  const vp = useViewport();
  const drag = useRef<{ dx: number; dy: number; last: Point } | null>(null);
  const [, force] = useState(0);
  const { c } = props;
  const r = glyphRadius(c.jack);

  useEffect(() => () => void (drag.current = null), []);

  return (
    <g
      transform={`translate(${c.pos.x} ${c.pos.y})`}
      role="button"
      aria-label={`${c.label} (${c.jack})`}
      data-connector-id={c.id}
      style={{ color: props.color, cursor: props.readOnly ? 'default' : 'move' }}
      onPointerDown={(e) => {
        e.stopPropagation();
        props.onSelect();
        if (props.readOnly || e.button !== 0) return;
        const w = vp.toWorld(e.clientX, e.clientY);
        drag.current = { dx: w.x - c.pos.x, dy: w.y - c.pos.y, last: c.pos };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        force((n) => n + 1);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const w = vp.toWorld(e.clientX, e.clientY);
        const p = clampToFace(
          snapPoint({ x: w.x - d.dx, y: w.y - d.dy }, snapFor(e, props.grid, props.fine)),
          props.faceSize.widthMm,
          props.faceSize.heightMm,
        );
        if (p.x !== d.last.x || p.y !== d.last.y) {
          d.last = p;
          props.onMove(props.index, p, 'drag');
        }
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d) props.onMove(props.index, d.last, 'end');
      }}
    >
      <circle r={r + 3} fill="transparent" />
      {props.selected && (
        <circle r={r + 2} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      )}
      <JackGlyph jack={c.jack} color={props.color} />
      <text y={r + 5} textAnchor="middle" fontSize={4} fill="currentColor" pointerEvents="none">
        {c.label}
      </text>
    </g>
  );
}
