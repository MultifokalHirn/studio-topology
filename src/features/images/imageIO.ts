// Browser image I/O (spec §5.5, §9): decode with size limits, re-encode to WebP (EXIF dropped), data URIs.
import type { AssetItem } from '@/domain/assets';
import { fitWithin, MAX_IMAGE_PIXELS, MAX_STORED_EDGE_PX, type Pixels } from '@/domain/imaging';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

export class ImageImportError extends Error {}

/** Decode a raster file into pixels (SVG is rasterised), rejecting images above 100 MP before allocating. */
export async function decodeToPixels(blob: Blob): Promise<Pixels> {
  if (blob.type && !ACCEPTED_TYPES.includes(blob.type))
    throw new ImageImportError(`Unsupported file type ${blob.type}`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    if (blob.type === 'image/svg+xml') bitmap = await rasterizeSvg(blob);
    else throw new ImageImportError('Could not decode the image.');
  }
  if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close();
    throw new ImageImportError(`Image too large (${bitmap.width}×${bitmap.height}); limit is 100 MP.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: img.width, height: img.height, data: img.data };
}

async function rasterizeSvg(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = MAX_STORED_EDGE_PX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1);
    const w = Math.max(1, Math.round((img.naturalWidth || 1024) * Math.min(scale, 4)));
    const h = Math.max(1, Math.round((img.naturalHeight || 1024) * Math.min(scale, 4)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function urlToPixels(url: string): Promise<Pixels> {
  return decodeToPixels(await (await fetch(url)).blob());
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Encode as WebP (quality 0.85, ≤ 2048 px long edge). Browsers without a WebP encoder fall back to PNG. */
export async function encodeAsset(pixels: Pixels, name: string): Promise<AssetItem> {
  const p = fitWithin(pixels, MAX_STORED_EDGE_PX);
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageImportError('Encoding failed'))), 'image/webp', 0.85),
  );
  const mime = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
  return {
    name: name.replace(/\.[^.]+$/, '') + (mime === 'image/webp' ? '.webp' : '.png'),
    mime,
    widthPx: p.width,
    heightPx: p.height,
    bytes: blob.size,
    dataUri: await blobToDataUri(blob),
  };
}

/** Image files from a drop, paste or file input. */
export function imageFilesFrom(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const f = item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null;
    if (f && (ACCEPTED_TYPES.includes(f.type) || /\.(png|jpe?g|webp|svg)$/i.test(f.name))) out.push(f);
  }
  return out;
}
