// SVG pan/zoom viewport in world units (mm) (spec §7.1). Wheel = zoom at cursor; Space-drag or middle mouse = pan;
// F = fit. Children draw in world coordinates; use `useViewport().toWorld` for pointer maths.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export interface ViewportApi {
  zoom: number;
  toWorld(clientX: number, clientY: number): { x: number; y: number };
  fit(): void;
}

const Ctx = createContext<ViewportApi | null>(null);

export function useViewport(): ViewportApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useViewport outside <Viewport>');
  return v;
}

export interface WorldBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function Viewport(props: {
  content: WorldBox;
  children: ReactNode;
  overlay?: ReactNode;
  className?: string;
  'aria-label': string;
  onBackgroundPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMoveWorld?: (p: { x: number; y: number } | null) => void;
  /** Click on empty canvas (not on a child element), in world coordinates. */
  onBackgroundClickWorld?: (p: { x: number; y: number }, e: React.MouseEvent<SVGSVGElement>) => void;
  /** HTML drag-and-drop onto the canvas, in world coordinates. */
  onDropWorld?: (p: { x: number; y: number }, e: React.DragEvent<SVGSVGElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<SVGSVGElement>) => void;
  /** Refit only when this key changes (default: whenever the content size changes). */
  fitKey?: string;
  svgProps?: React.SVGProps<SVGSVGElement>;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ tx: 0, ty: 0, z: 1 });
  const [fitted, setFitted] = useState(false);
  const spaceDown = useRef(false);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { content: c } = props;
    if (!size.w || !size.h || c.w <= 0 || c.h <= 0) return;
    const margin = 24;
    const z = Math.min((size.w - 2 * margin) / c.w, (size.h - 2 * margin) / c.h);
    setView({ z, tx: (size.w - c.w * z) / 2 - c.x * z, ty: (size.h - c.h * z) / 2 - c.y * z });
  }, [props, size]);

  // Fit once the container has a size (and when the content box changes identity in size).
  const key = props.fitKey ?? `${props.content.w}x${props.content.h}`;
  const lastKey = useRef(key);
  useEffect(() => {
    if (size.w && (!fitted || lastKey.current !== key)) {
      lastKey.current = key;
      fit();
      setFitted(true);
    }
  }, [size, key, fitted, fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement))
        spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => {
        const z = Math.min(Math.max(v.z * factor, 0.02), 200);
        return { z, tx: sx - ((sx - v.tx) * z) / v.z, ty: sy - ((sy - v.ty) * z) / v.z };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left - view.tx) / view.z, y: (clientY - rect.top - view.ty) / view.z };
    },
    [view],
  );

  const api: ViewportApi = { zoom: view.z, toWorld, fit };

  return (
    <Ctx.Provider value={api}>
      <div className={`relative h-full w-full overflow-hidden ${props.className ?? ''}`}>
        <svg
          ref={ref}
          role="img"
          aria-label={props['aria-label']}
          className="h-full w-full touch-none select-none"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'f' || e.key === 'F') fit();
            props.onKeyDown?.(e);
          }}
          onClick={(e) => {
            const target = e.target as Element;
            if (target === ref.current || target.getAttribute('data-background') === 'true')
              props.onBackgroundClickWorld?.(toWorld(e.clientX, e.clientY), e);
          }}
          onDragOver={(e) => {
            if (props.onDropWorld) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!props.onDropWorld) return;
            e.preventDefault();
            props.onDropWorld(toWorld(e.clientX, e.clientY), e);
          }}
          onPointerDown={(e) => {
            if (e.button === 1 || spaceDown.current) {
              e.preventDefault();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
              return;
            }
            if (e.target === ref.current) props.onBackgroundPointerDown?.(e);
          }}
          onPointerMove={(e) => {
            if (pan.current) {
              const p = pan.current;
              setView((v) => ({ ...v, tx: p.tx + e.clientX - p.x, ty: p.ty + e.clientY - p.y }));
            }
            props.onPointerMoveWorld?.(toWorld(e.clientX, e.clientY));
          }}
          onPointerUp={() => {
            pan.current = null;
          }}
          onPointerLeave={() => props.onPointerMoveWorld?.(null)}
          {...props.svgProps}
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.z})`}>{props.children}</g>
        </svg>
        {props.overlay}
      </div>
    </Ctx.Provider>
  );
}
