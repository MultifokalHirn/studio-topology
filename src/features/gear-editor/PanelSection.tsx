// Gear editor "Panel layout": the face canvas on the draft model.
import { useState } from 'react';
import type { FaceId } from '@/domain/types';
import { t } from '@/i18n';
import { useProject } from '@/store';
import { FaceCanvas } from '../face/FaceCanvas';
import type { EditorApi } from './GearEditor';

export function PanelSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const settings = useProject((s) => s.project.settings);
  const [face, setFace] = useState<FaceId>(() => (m.connectors.some((c) => c.face === 'back') ? 'back' : 'front'));
  const ref = m.images[face];
  const item = api.assetItem(ref?.id);
  const cal = m.imageCalibration?.[face];
  return (
    <section className="flex h-[70vh] flex-col">
      <h3 className="mb-2 text-sm font-semibold">{t('Panel layout')}</h3>
      <div className="min-h-0 flex-1">
        <FaceCanvas
          model={m}
          face={face}
          onFaceChange={setFace}
          image={{
            url: item?.dataUri ?? null,
            missing: !!ref && !item,
            widthPx: item?.widthPx,
            heightPx: item?.heightPx,
            pxPerMm: cal?.pxPerMm,
          }}
          palette={settings.palette.domains}
          gridMm={settings.snap.enabled ? settings.snap.gridMm : 0}
          fineMm={settings.snap.fineMm}
          onMove={(i, pos, phase) =>
            update(
              (d) => {
                const c = d.connectors[i];
                if (c) c.pos = pos;
              },
              phase === 'end' ? [`connectors.${i}.pos`] : undefined,
            )
          }
          onReplace={(i, c) => update((d) => void (d.connectors[i] = c), [`connectors.${i}.pos`])}
        />
      </div>
    </section>
  );
}
