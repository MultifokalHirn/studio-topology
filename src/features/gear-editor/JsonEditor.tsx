// Schema-validated JSON editor for nested fields that have no dedicated form (keeps every schema field editable).
import { useState } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui';
import { t } from '@/i18n';

export function JsonEditor<T>(props: {
  label: string;
  value: T;
  schema: z.ZodType<T>;
  onApply: (v: T) => void;
  rows?: number;
}) {
  const pretty = JSON.stringify(props.value ?? null, null, 2);
  const [text, setText] = useState(pretty);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(pretty);
  if (shown !== pretty) {
    // The value changed outside this editor: reset the text (React's "adjust state on prop change" pattern).
    setShown(pretty);
    setText(pretty);
  }
  const apply = () => {
    try {
      const parsed = props.schema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        const i = parsed.error.issues[0];
        setError(`${i?.path.join('.') || '(root)'}: ${i?.message}`);
        return;
      }
      setError(null);
      props.onApply(parsed.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div>
      <label className="text-xs text-neutral-500">
        {props.label}
        <textarea
          spellCheck={false}
          rows={props.rows ?? 10}
          className="mt-0.5 w-full rounded border border-neutral-300 bg-white p-1.5 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button onClick={apply} disabled={text === pretty}>
          {t('Apply JSON')}
        </Button>
        {error && <span className="text-xs text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
