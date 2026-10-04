// Calibration and cleaning of one face image (spec §5.5 steps 1–4).
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Modal, NumberInput } from '@/components/ui';
import type { AssetItem } from '@/domain/assets';
import { homographyFrom4, orderCorners, rectifiedSize } from '@/domain/homography';
import {
  crop,
  floodTransparent,
  pxPerMmFromPoints,
  rotate90,
  rotateFree,
  warpPerspective,
  type Pixels,
} from '@/domain/imaging';
import type { Point, Rect } from '@/domain/types';
import { t } from '@/i18n';
import { encodeAsset, urlToPixels } from './imageIO';

type Tool = 'rectify' | 'rotate' | 'crop' | 'scale' | 'background';

interface Work {
  pixels: Pixels;
  pxPerMm?: number;
  rectified: boolean;
}

export interface CalibrationResult {
  asset: AssetItem;
  pxPerMm: number;
  rectified: boolean;
}

export function CalibrateDialog(props: {
  sourceUrl: string;
  name: string;
  faceWidthMm: number | null;
  faceHeightMm: number | null;
  onApply(result: CalibrationResult): void;
  onClose(): void;
}) {
  const [history, setHistory] = useState<Work[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('rectify');
  const [points, setPoints] = useState<Point[]>([]);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [targetW, setTargetW] = useState<number | null>(props.faceWidthMm);
  const [targetH, setTargetH] = useState<number | null>(props.faceHeightMm);
  const [angle, setAngle] = useState(0);
  const [knownMm, setKnownMm] = useState<number | null>(props.faceWidthMm);
  const [tolerance, setTolerance] = useState(24);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const work = history[history.length - 1];

  useEffect(() => {
    let alive = true;
    urlToPixels(props.sourceUrl)
      .then((pixels) => alive && setHistory([{ pixels, rectified: false }]))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [props.sourceUrl]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !work) return;
    c.width = work.pixels.width;
    c.height = work.pixels.height;
    c.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(work.pixels.data), work.pixels.width, work.pixels.height),
      0,
      0,
    );
  }, [work]);

  const push = (next: Work) => {
    setHistory((h) => [...h, next]);
    setPoints([]);
    setDragRect(null);
  };

  const toPixel = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };

  const onClick = (e: React.MouseEvent) => {
    if (!work) return;
    const p = toPixel(e);
    if (tool === 'rectify') setPoints((ps) => (ps.length >= 4 ? [p] : [...ps, p]));
    else if (tool === 'scale') setPoints((ps) => (ps.length >= 2 ? [p] : [...ps, p]));
    else if (tool === 'background') push({ ...work, pixels: floodTransparent(work.pixels, p, tolerance) });
  };

  const rectify = () => {
    if (!work || points.length !== 4 || !targetW || !targetH) return;
    const corners = orderCorners(points);
    const size = rectifiedSize(targetW, targetH, Math.min(2048, Math.max(work.pixels.width, work.pixels.height)));
    const H = homographyFrom4(corners, [
      { x: 0, y: 0 },
      { x: size.width, y: 0 },
      { x: size.width, y: size.height },
      { x: 0, y: size.height },
    ]);
    if (!H) return setError(t('Those four points do not form a quadrilateral.'));
    setError(null);
    push({ pixels: warpPerspective(work.pixels, H, size.width, size.height), pxPerMm: size.pxPerMm, rectified: true });
  };

  const apply = async () => {
    if (!work) return;
    setBusy(true);
    try {
      const asset = await encodeAsset(work.pixels, props.name);
      // The stored image may be downscaled; keep px/mm consistent with what is stored.
      const scale = asset.widthPx / work.pixels.width;
      const pxPerMm = (work.pxPerMm ?? (props.faceWidthMm ? work.pixels.width / props.faceWidthMm : 1)) * scale;
      props.onApply({ asset, pxPerMm, rectified: work.rectified });
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const scaleFromPoints = points.length === 2 && knownMm ? pxPerMmFromPoints(points[0]!, points[1]!, knownMm) : null;
  const w = work?.pixels.width ?? 1;
  const h = work?.pixels.height ?? 1;
  const marker = Math.max(w, h) / 120;

  return (
    <Modal
      full
      title={t('Calibrate image: {name}', { name: props.name })}
      onClose={props.onClose}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-neutral-500" data-testid="calibration-status">
            {work && `${w} × ${h} px`}
            {work?.pxPerMm ? ` · ${work.pxPerMm.toFixed(3)} px/mm` : ` · ${t('scale not set')}`}
            {work?.rectified ? ` · ${t('rectified')}` : ''}
          </span>
          <Button disabled={history.length <= 1} onClick={() => setHistory((hs) => hs.slice(0, -1))}>
            {t('Undo step')}
          </Button>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={!work || busy} onClick={() => void apply()}>
            {busy ? t('Saving…') : t('Apply')}
          </Button>
        </>
      }
    >
      <div className="flex h-full gap-4">
        <div className="flex w-64 shrink-0 flex-col gap-3 text-sm">
          <div role="tablist" aria-label={t('Calibration step')} className="flex flex-col gap-1">
            {(
              [
                ['rectify', '1. Straighten (4 corners)'],
                ['rotate', '2. Rotate'],
                ['crop', '3. Crop'],
                ['scale', '4. Scale check'],
                ['background', '5. Background'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tool === id}
                onClick={() => {
                  setTool(id);
                  setPoints([]);
                  setDragRect(null);
                }}
                className={clsx(
                  'rounded px-2 py-1 text-left',
                  tool === id
                    ? 'bg-neutral-200 font-semibold dark:bg-neutral-700'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                )}
              >
                {t(label)}
              </button>
            ))}
          </div>

          {tool === 'rectify' && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                {t('Click the four corners of the panel ({n}/4). Order does not matter.', { n: points.length })}
              </p>
              <Field label={t('Face width (mm)')}>
                {(id) => <NumberInput id={id} nullable value={targetW} onChange={setTargetW} />}
              </Field>
              <Field label={t('Face height (mm)')}>
                {(id) => <NumberInput id={id} nullable value={targetH} onChange={setTargetH} />}
              </Field>
              <Button variant="primary" disabled={points.length !== 4 || !targetW || !targetH} onClick={rectify}>
                {t('Rectify')}
              </Button>
            </div>
          )}
          {tool === 'rotate' && work && (
            <div className="space-y-2">
              <div className="flex gap-1">
                <Button onClick={() => push({ ...work, pixels: rotate90(work.pixels, 3) })}>⟲ 90°</Button>
                <Button onClick={() => push({ ...work, pixels: rotate90(work.pixels, 1) })}>⟳ 90°</Button>
              </div>
              <Field label={t('Free rotation (°, clockwise)')}>
                {(id) => <NumberInput id={id} value={angle} onChange={(v) => setAngle(v ?? 0)} />}
              </Field>
              <Button
                disabled={!angle}
                onClick={() => push({ ...work, pixels: rotateFree(work.pixels, angle), rectified: false })}
              >
                {t('Rotate')}
              </Button>
            </div>
          )}
          {tool === 'crop' && work && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">{t('Drag a rectangle on the image.')}</p>
              <Button
                disabled={!dragRect || dragRect.w < 2 || dragRect.h < 2}
                onClick={() => dragRect && push({ ...work, pixels: crop(work.pixels, dragRect) })}
              >
                {t('Crop')}
              </Button>
            </div>
          )}
          {tool === 'scale' && work && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                {t('Click two points a known distance apart (e.g. the panel edges).')}
              </p>
              <Field label={t('Known distance (mm)')}>
                {(id) => <NumberInput id={id} nullable value={knownMm} onChange={setKnownMm} />}
              </Field>
              {scaleFromPoints && (
                <p className="text-xs">
                  {scaleFromPoints.toFixed(3)} px/mm →{' '}
                  {t('image width {mm} mm', { mm: (w / scaleFromPoints).toFixed(1) })}
                  {props.faceWidthMm ? ` (${t('model: {mm} mm', { mm: props.faceWidthMm })})` : ''}
                  {work.pxPerMm ? ` · ${t('current {v} px/mm', { v: work.pxPerMm.toFixed(3) })}` : ''}
                </p>
              )}
              <Button
                disabled={!scaleFromPoints}
                onClick={() => scaleFromPoints && push({ ...work, pxPerMm: scaleFromPoints })}
              >
                {t('Set scale')}
              </Button>
            </div>
          )}
          {tool === 'background' && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">{t('Click the background to make it transparent.')}</p>
              <label className="block text-xs text-neutral-500">
                {t('Tolerance')} {tolerance}
                <input
                  type="range"
                  min={0}
                  max={128}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="w-full"
                />
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div
          className="relative min-w-0 flex-1 rounded border border-neutral-200 dark:border-neutral-700"
          style={{
            backgroundImage: 'repeating-conic-gradient(#e5e5e5 0 25%, #fafafa 0 50%)',
            backgroundSize: '16px 16px',
          }}
        >
          {!work && !error && <p className="p-4 text-sm text-neutral-500">{t('Loading image…')}</p>}
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-contain" />
          {work && (
            <svg
              ref={svgRef}
              aria-label={t('Calibration canvas')}
              data-width={w}
              data-height={h}
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 h-full w-full"
              style={{ cursor: 'crosshair' }}
              onClick={onClick}
              onPointerDown={(e) => {
                if (tool !== 'crop') return;
                const p = toPixel(e);
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
                setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
                setPoints([p]);
              }}
              onPointerMove={(e) => {
                if (tool !== 'crop' || !points[0] || !e.buttons) return;
                const p = toPixel(e);
                const a = points[0];
                setDragRect({
                  x: Math.min(a.x, p.x),
                  y: Math.min(a.y, p.y),
                  w: Math.abs(p.x - a.x),
                  h: Math.abs(p.y - a.y),
                });
              }}
            >
              {points.length > 1 && tool === 'rectify' && (
                <polygon
                  points={(points.length === 4 ? orderCorners(points) : points).map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(37,99,235,.15)"
                  stroke="#2563eb"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {tool === 'scale' && points.length === 2 && (
                <line
                  x1={points[0]!.x}
                  y1={points[0]!.y}
                  x2={points[1]!.x}
                  y2={points[1]!.y}
                  stroke="#dc2626"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {tool !== 'crop' &&
                points.map((p, i) => (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={marker} fill="#2563eb" />
                    <text x={p.x + marker * 1.5} y={p.y - marker} fontSize={marker * 2.5} fill="#2563eb">
                      {i + 1}
                    </text>
                  </g>
                ))}
              {dragRect && (
                <rect
                  {...{ x: dragRect.x, y: dragRect.y, width: dragRect.w, height: dragRect.h }}
                  fill="rgba(37,99,235,.1)"
                  stroke="#2563eb"
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}
        </div>
      </div>
    </Modal>
  );
}
