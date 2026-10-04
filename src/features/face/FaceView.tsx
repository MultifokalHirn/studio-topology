// Centre "Face" tab (spec §5.1): the selected gear's panels, editing the project directly (drags coalesce).
import { useState } from 'react';
import { assetUrl } from '@/domain/assets';
import { modelLabel } from '@/domain/libraryOps';
import type { FaceId } from '@/domain/types';
import { t } from '@/i18n';
import { projectStore, uiStore, useProject, useUi } from '@/store';
import { readSessionProvenanceKind } from '../provenanceSession';
import { FaceCanvas } from './FaceCanvas';

export function FaceView() {
  const sel = useUi((s) => s.selection);
  const project = useProject((s) => s.project);
  const readOnly = useProject((s) => s.readOnly);
  const [face, setFace] = useState<FaceId>('back');

  const unit = sel?.kind === 'gear-unit' ? project.inventory.gearUnits.find((u) => u.id === sel.id) : undefined;
  const modelId = unit?.modelId ?? (sel?.kind === 'gear-model' ? sel.id : undefined);
  const model = project.library.gearModels.find((m) => m.id === modelId);
  if (!model)
    return (
      <p className="p-4 text-sm text-neutral-500">{t('Select a unit or model in the sidebar to see its panels.')}</p>
    );

  const ref = model.images[face];
  const item = ref ? project.assets.items[ref.id] : undefined;
  const cal = model.imageCalibration?.[face];
  const edit = (
    label: string,
    recipe: (m: (typeof project.library.gearModels)[number]) => void,
    coalesceKey?: string,
  ) =>
    projectStore.getState().change(
      (p) => {
        const m = p.library.gearModels.find((x) => x.id === model.id);
        if (m) recipe(m);
      },
      { label, ...(coalesceKey ? { coalesceKey } : {}) },
    );

  return (
    <div className="flex h-full flex-col p-2">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <h2 className="font-semibold">{unit?.nickname ?? modelLabel(model)}</h2>
        <span className="text-xs text-neutral-500">{modelLabel(model)}</span>
        <button className="ml-auto text-xs underline" onClick={() => uiStore.getState().editGearModel(model.id)}>
          {t('Edit model')}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <FaceCanvas
          model={model}
          face={face}
          onFaceChange={setFace}
          readOnly={readOnly}
          image={{
            url: assetUrl(project.assets, ref?.id),
            missing: !!ref && !item,
            widthPx: item?.widthPx,
            heightPx: item?.heightPx,
            pxPerMm: cal?.pxPerMm,
          }}
          palette={project.settings.palette.domains}
          gridMm={project.settings.snap.enabled ? project.settings.snap.gridMm : 0}
          fineMm={project.settings.snap.fineMm}
          onMove={(i, pos, phase) => {
            edit(
              'Move connector',
              (m) => {
                const c = m.connectors[i];
                if (!c) return;
                c.pos = pos;
                m.provenance[`connectors.${i}.pos`] = { kind: readSessionProvenanceKind() };
              },
              `face-drag:${model.id}:${i}`,
            );
            if (phase === 'end') projectStore.getState().seal();
          }}
          onReplace={(i, c) =>
            edit('Mirror connector', (m) => {
              m.connectors[i] = c;
              m.provenance[`connectors.${i}.pos`] = { kind: readSessionProvenanceKind() };
            })
          }
        />
      </div>
    </div>
  );
}
