// Gear editor "Images" (spec §5.3 item 8, §5.5): import per face, calibrate, replace, remove, reuse.
import { useMemo, useRef, useState } from 'react';
import { Button, Select } from '@/components/ui';
import { faceSize } from '@/domain/geometry';
import { modelLabel } from '@/domain/libraryOps';
import type { FaceId } from '@/domain/types';
import { t } from '@/i18n';
import { useProject } from '@/store';
import type { EditorApi } from '../gear-editor/GearEditor';
import { CalibrateDialog } from './CalibrateDialog';
import { decodeToPixels, encodeAsset, imageFilesFrom } from './imageIO';

type Slot = FaceId | 'photo';
const SLOTS: Slot[] = ['front', 'back', 'top', 'left', 'right', 'bottom', 'photo'];

export function ImagesSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const models = useProject((s) => s.project.library.gearModels);
  const [busy, setBusy] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState<FaceId | null>(null);
  const [pasteTarget, setPasteTarget] = useState<Slot>('front');

  const reusable = useMemo(
    () =>
      models
        .filter((o) => o.id !== m.id)
        .flatMap((o) =>
          Object.entries(o.images).map(([slot, ref]) => ({
            value: `${o.id}|${slot}`,
            label: `${modelLabel(o)} · ${slot}`,
            ref: ref!,
            calibration: slot === 'photo' ? undefined : o.imageCalibration?.[slot as FaceId],
          })),
        ),
    [models, m.id],
  );

  const importFile = async (slot: Slot, file: File) => {
    setBusy(slot);
    setError(null);
    try {
      const asset = await encodeAsset(await decodeToPixels(file), file.name || `${slot}.png`);
      const id = api.addAsset(asset);
      const size = slot === 'photo' ? null : faceSize(m, slot);
      update((d) => {
        d.images[slot] = { id };
        if (slot === 'photo') return;
        d.imageCalibration ??= {};
        // Until calibrated, assume the image spans the face width.
        if (size) d.imageCalibration[slot] = { pxPerMm: asset.widthPx / size.widthMm, rectified: false };
        else delete d.imageCalibration[slot];
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      onPaste={(e) => {
        const f = imageFilesFrom(e.clipboardData.items)[0];
        if (f) {
          e.preventDefault();
          void importFile(pasteTarget, f);
        }
      }}
    >
      <h3 className="mb-1 text-sm font-semibold">{t('Images')}</h3>
      <p className="mb-3 text-xs text-neutral-500">
        {t(
          'PNG, JPEG, WebP or SVG; stored as WebP (≤ 2048 px, metadata stripped). Drop a file on a slot, use Import, or paste (goes to the highlighted slot).',
        )}
      </p>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {SLOTS.map((slot) => {
          const ref = m.images[slot];
          const item = api.assetItem(ref?.id);
          const cal = slot === 'photo' ? undefined : m.imageCalibration?.[slot];
          return (
            <ImageSlot
              key={slot}
              slot={slot}
              highlighted={pasteTarget === slot}
              onFocusSlot={() => setPasteTarget(slot)}
              url={item?.dataUri ?? null}
              missing={!!ref && !item}
              info={
                item
                  ? `${item.widthPx} × ${item.heightPx} px · ${(item.bytes / 1024).toFixed(0)} kB${cal ? ` · ${cal.pxPerMm.toFixed(2)} px/mm${cal.rectified ? ` · ${t('rectified')}` : ''}` : ''}`
                  : ref
                    ? t('Image missing')
                    : t('No image')
              }
              busy={busy === slot}
              onFile={(f) => void importFile(slot, f)}
              onCalibrate={slot !== 'photo' && item ? () => setCalibrating(slot) : undefined}
              onRemove={
                ref
                  ? () =>
                      update((d) => {
                        delete d.images[slot];
                        if (slot !== 'photo' && d.imageCalibration) delete d.imageCalibration[slot];
                      })
                  : undefined
              }
              reuseOptions={reusable}
              onReuse={(value) => {
                const r = reusable.find((x) => x.value === value);
                if (!r) return;
                update((d) => {
                  d.images[slot] = { id: r.ref.id };
                  if (slot !== 'photo') {
                    d.imageCalibration ??= {};
                    if (r.calibration) d.imageCalibration[slot] = structuredClone(r.calibration);
                    else delete d.imageCalibration[slot];
                  }
                });
              }}
            />
          );
        })}
      </div>
      {calibrating && (
        <CalibrateDialog
          sourceUrl={api.assetItem(m.images[calibrating]?.id)?.dataUri ?? ''}
          name={`${modelLabel(m)} ${calibrating}`}
          faceWidthMm={faceSize(m, calibrating)?.widthMm ?? null}
          faceHeightMm={faceSize(m, calibrating)?.heightMm ?? null}
          onClose={() => setCalibrating(null)}
          onApply={({ asset, pxPerMm, rectified }) => {
            const id = api.addAsset(asset);
            const face = calibrating;
            update((d) => {
              d.images[face] = { id };
              d.imageCalibration ??= {};
              d.imageCalibration[face] = { pxPerMm, rectified };
            });
          }}
        />
      )}
    </section>
  );
}

function ImageSlot(props: {
  slot: Slot;
  highlighted: boolean;
  onFocusSlot(): void;
  url: string | null;
  missing: boolean;
  info: string;
  busy: boolean;
  onFile(f: File): void;
  onCalibrate?: () => void;
  onRemove?: () => void;
  reuseOptions: { value: string; label: string }[];
  onReuse(value: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="group"
      aria-label={t('{slot} image', { slot: props.slot })}
      tabIndex={0}
      onFocus={props.onFocusSlot}
      onClick={props.onFocusSlot}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = imageFilesFrom(e.dataTransfer.files)[0];
        if (f) props.onFile(f);
      }}
      className={`flex gap-2 rounded border p-2 ${over ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : props.highlighted ? 'border-neutral-500' : 'border-neutral-200 dark:border-neutral-700'}`}
    >
      <div
        className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-100 text-xs text-neutral-500 dark:bg-neutral-800"
        style={{
          backgroundImage: props.url ? 'repeating-conic-gradient(#e5e5e5 0 25%, #fafafa 0 50%)' : undefined,
          backgroundSize: '12px 12px',
        }}
      >
        {props.url ? (
          <img
            src={props.url}
            alt={t('{slot} image', { slot: props.slot })}
            className="max-h-full max-w-full object-contain"
          />
        ) : props.missing ? (
          '⚠'
        ) : props.busy ? (
          '…'
        ) : (
          '—'
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-xs">
        <div className="font-semibold capitalize">{t(props.slot)}</div>
        <div className={props.missing ? 'text-red-700 dark:text-red-400' : 'text-neutral-500'}>
          {props.busy ? t('Importing…') : props.info}
        </div>
        <div className="flex flex-wrap gap-1">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            aria-label={t('Import {slot} image', { slot: props.slot })}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onFile(f);
              e.target.value = '';
            }}
          />
          <Button onClick={() => input.current?.click()}>{props.url ? t('Replace') : t('Import')}</Button>
          {props.onCalibrate && <Button onClick={props.onCalibrate}>{t('Calibrate…')}</Button>}
          {props.onRemove && (
            <Button variant="danger" onClick={props.onRemove}>
              {t('Remove')}
            </Button>
          )}
        </div>
        {props.reuseOptions.length > 0 && (
          <Select
            aria-label={t('Reuse an image for {slot}', { slot: props.slot })}
            allowEmpty
            value={undefined}
            options={props.reuseOptions}
            onChange={(v) => v && props.onReuse(v)}
          />
        )}
      </div>
    </div>
  );
}
