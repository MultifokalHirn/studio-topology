// Provenance panel (spec §5.3 item 9): every recorded provenance entry plus unverified fields, with bulk marking.
import { useState } from 'react';
import { Button, inputCls, ProvenanceBadge, Select } from '@/components/ui';
import { unverifiedFields } from '@/domain/libraryOps';
import { ProvenanceKind } from '@/domain/schemas';
import { t } from '@/i18n';
import type { EditorApi } from './GearEditor';

export function ProvenanceSection({ api }: { api: EditorApi }) {
  const { draft: m, update } = api;
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const unverified = unverifiedFields(m);
  const keys = [...new Set([...Object.keys(m.provenance), ...unverified.map((u) => u.path)])].sort();
  const mark = (kind: 'datasheet' | 'measured') =>
    update((d) => {
      for (const k of checked) d.provenance[k] = { ...d.provenance[k], kind };
    });
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{t('Provenance')}</h3>
      <p className="mb-2 text-xs text-neutral-500">
        {t('{n} unverified fields. Keys are dotted paths; "*" matches any index.', { n: unverified.length })}
      </p>
      <div className="mb-2 flex gap-1">
        <Button disabled={!checked.size} onClick={() => mark('datasheet')}>
          {t('Mark as datasheet')}
        </Button>
        <Button disabled={!checked.size} onClick={() => mark('measured')}>
          {t('Mark as measured')}
        </Button>
        <Button onClick={() => setChecked(new Set(unverified.map((u) => u.path)))}>{t('Select unverified')}</Button>
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-neutral-500">
          <tr>
            <th />
            <th>{t('Field')}</th>
            <th>{t('Kind')}</th>
            <th>{t('Note')}</th>
            <th>{t('URL')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const p = m.provenance[k];
            return (
              <tr key={k} className="border-t border-neutral-100 align-top dark:border-neutral-800">
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('Select {k}', { k })}
                    checked={checked.has(k)}
                    onChange={(e) =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(k);
                        else n.delete(k);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="pr-2 font-mono">
                  {k} <ProvenanceBadge prov={p} isNull={!p} />
                </td>
                <td className="w-32 pr-1">
                  <Select
                    aria-label={t('Kind for {k}', { k })}
                    value={p?.kind}
                    options={ProvenanceKind.options}
                    onChange={(v) => update((d) => void (d.provenance[k] = { ...d.provenance[k], kind: v }))}
                  />
                </td>
                <td className="pr-1">
                  <input
                    aria-label={t('Note for {k}', { k })}
                    className={inputCls}
                    value={p?.note ?? ''}
                    onChange={(e) =>
                      update(
                        (d) =>
                          void (d.provenance[k] = {
                            kind: d.provenance[k]?.kind ?? 'user',
                            ...d.provenance[k],
                            note: e.target.value,
                          }),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={t('URL for {k}', { k })}
                    className={inputCls}
                    value={p?.url ?? ''}
                    onChange={(e) =>
                      update(
                        (d) =>
                          void (d.provenance[k] = {
                            kind: d.provenance[k]?.kind ?? 'user',
                            ...d.provenance[k],
                            url: e.target.value,
                          }),
                      )
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
