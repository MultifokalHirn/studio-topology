// Browser side of exports: print windows (PDF via the print dialog), SVG → PNG, and capturing a live canvas as SVG.

/** Open an HTML document in a new window and show the print dialog once it has rendered (Save as PDF there). */
export function openPrintWindow(html: string, opts: { print?: boolean } = {}): Window | null {
  const w = window.open('', '_blank');
  if (!w) return null;
  const auto =
    opts.print === false
      ? ''
      : `<script>addEventListener('load',function(){setTimeout(function(){print()},250)})</script>`;
  w.document.open();
  w.document.write(html.replace('</body>', `${auto}</body>`));
  w.document.close();
  w.focus();
  return w;
}

/** Physical size of an SVG document written with `width="…mm"`. */
function svgSizeMm(svg: string): { w: number; h: number } {
  const w = /width="([\d.]+)mm"/.exec(svg);
  const h = /height="([\d.]+)mm"/.exec(svg);
  return { w: Number(w?.[1] ?? 100), h: Number(h?.[1] ?? 100) };
}

/** Rasterise an SVG string at `dpi` (capped at 12 000 px per side). */
export async function svgToPng(svg: string, dpi = 200): Promise<Blob> {
  const mm = svgSizeMm(svg);
  let pxPerMm = dpi / 25.4;
  pxPerMm = Math.min(pxPerMm, 12000 / mm.w, 12000 / mm.h);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the drawing'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(mm.w * pxPerMm);
    canvas.height = Math.round(mm.h * pxPerMm);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas unavailable');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-size',
  'font-weight',
  'font-family',
  'color',
  'visibility',
];

/**
 * Capture a live canvas (an SVG whose first `<g>` holds the world content) as a standalone SVG: computed styles are
 * inlined (Tailwind classes do not travel), animations dropped, and the view box fitted to the content.
 */
export function captureCanvasSvg(svgEl: SVGSVGElement, title: string): string {
  const root = svgEl.querySelector(':scope > g') as SVGGElement | null;
  if (!root) throw new Error('Nothing to export');
  const bb = root.getBBox();
  const pad = 20;
  const clone = root.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  const src = [root, ...root.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const d = dst[i] as SVGElement;
    const cs = getComputedStyle(el);
    for (const p of STYLE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) d.style.setProperty(p, v);
    }
    d.style.removeProperty('animation');
    d.removeAttribute('class');
  });
  const defs = svgEl.querySelector(':scope > defs')?.outerHTML ?? '';
  const vb = `${bb.x - pad} ${bb.y - pad} ${bb.width + 2 * pad} ${bb.height + 2 * pad}`;
  // 1 world unit = 0.5 mm on paper: readable labels without a scale (the patch has no physical units).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(bb.width + 2 * pad) / 2}mm" height="${(bb.height + 2 * pad) / 2}mm" viewBox="${vb}" font-family="Helvetica, Arial, sans-serif"><title>${title.replace(/</g, '&lt;')}</title><rect x="${bb.x - pad}" y="${bb.y - pad}" width="${bb.width + 2 * pad}" height="${bb.height + 2 * pad}" fill="#fff"/>${defs}${new XMLSerializer().serializeToString(clone)}</svg>`;
}

export const fileSafe = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
