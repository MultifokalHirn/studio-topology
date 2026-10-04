// Shared UI primitives (technical-drawing look: neutral, thin borders, compact).
import * as Dialog from '@radix-ui/react-dialog';
import { IconRuler2, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { type ReactNode, useId, useState } from 'react';
import type { LengthUnit, Provenance } from '@/domain/types';
import { formatLength, mmTo, parseLength } from '@/domain/units';
import { t } from '@/i18n';

export const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-sm focus:outline-2 focus:outline-blue-500 dark:border-neutral-600 dark:bg-neutral-800';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const { variant = 'ghost' } = props;
  return (
    <button
      type={props.type ?? 'button'}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={clsx(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-xs disabled:opacity-40',
        variant === 'primary' &&
          'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900',
        variant === 'ghost' &&
          'border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800',
        variant === 'danger' &&
          'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300',
        props.className,
      )}
    >
      {props.children}
    </button>
  );
}

export function Field(props: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={clsx('flex flex-col gap-0.5', props.className)}>
      <label htmlFor={id} className="flex items-center gap-1 text-xs text-neutral-500">
        {props.label}
        {props.hint}
      </label>
      {props.children(id)}
    </div>
  );
}

export function TextInput(props: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  'aria-label'?: string;
}) {
  return (
    <input
      id={props.id}
      aria-label={props['aria-label']}
      className={inputCls}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

/** Commit-on-blur/Enter input so typing intermediate values does not create history entries. */
function useDraft(value: string, commit: (s: string) => void) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  return {
    value: focused ? draft : value,
    onFocus: () => {
      setDraft(value);
      setFocused(true);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: () => {
      setFocused(false);
      if (draft !== value) commit(draft);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.key === 'Escape') {
        setDraft(value);
        setFocused(false);
      }
    },
  };
}

/** Number input; empty means `null` (unknown) when `nullable`. */
export function NumberInput(props: {
  id?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  nullable?: boolean;
  'aria-label'?: string;
  placeholder?: string;
}) {
  const shown = props.value === null || props.value === undefined ? '' : String(props.value);
  const draft = useDraft(shown, (s) => {
    const trimmed = s.trim().replace(',', '.');
    if (trimmed === '') {
      if (props.nullable) props.onChange(null);
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n)) props.onChange(n);
  });
  return (
    <input
      id={props.id}
      aria-label={props['aria-label']}
      inputMode="decimal"
      className={inputCls}
      placeholder={props.placeholder ?? (props.nullable ? t('unknown') : '')}
      {...draft}
    />
  );
}

/** Length input: shows the display unit, accepts `12 cm`, `4.5"`, `1U`, `3 HP`; stores mm. */
export function LengthInput(props: {
  id?: string;
  valueMm: number | null | undefined;
  onChange: (mm: number | null) => void;
  unit: LengthUnit;
  decimals?: number;
  nullable?: boolean;
  'aria-label'?: string;
}) {
  const shown =
    props.valueMm === null || props.valueMm === undefined
      ? ''
      : `${+mmTo(props.valueMm, props.unit).toFixed(props.decimals ?? 2)} ${props.unit === 'in' ? 'in' : props.unit}`;
  const draft = useDraft(shown, (s) => {
    if (s.trim() === '') {
      if (props.nullable) props.onChange(null);
      return;
    }
    const mm = parseLength(s, props.unit);
    if (mm !== null) props.onChange(Math.round(mm * 1000) / 1000);
  });
  return (
    <input
      id={props.id}
      aria-label={props['aria-label']}
      className={inputCls}
      placeholder={props.nullable ? t('unknown') : ''}
      title={props.valueMm == null ? undefined : formatLength(props.valueMm, 'mm', 2)}
      {...draft}
    />
  );
}

export function Select<T extends string>(props: {
  id?: string;
  value: T | undefined;
  options: readonly T[] | { value: T; label: string }[];
  onChange: (v: T) => void;
  allowEmpty?: boolean;
  'aria-label'?: string;
}) {
  const opts = (props.options as (T | { value: T; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  return (
    <select
      id={props.id}
      aria-label={props['aria-label']}
      className={inputCls}
      value={props.value ?? ''}
      onChange={(e) => props.onChange(e.target.value as T)}
    >
      {(props.allowEmpty || props.value === undefined) && <option value="">—</option>}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-1 text-xs">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

const HATCH = 'repeating-linear-gradient(135deg, rgba(180,83,9,.25) 0 3px, transparent 3px 6px)';

/** Provenance badge (spec §3.3): unknown = hatched, estimated = dashed, measured = ruler icon. */
export function ProvenanceBadge({ prov, isNull }: { prov?: Provenance; isNull?: boolean }) {
  const kind = isNull ? 'unknown' : (prov?.kind ?? null);
  if (!kind) return null;
  const title = [kind, prov?.note, prov?.url].filter(Boolean).join(' · ');
  return (
    <span
      title={title}
      aria-label={t('Provenance: {kind}', { kind })}
      data-provenance={kind}
      className={clsx(
        'inline-flex items-center gap-0.5 rounded px-1 text-[10px] leading-4',
        kind === 'unknown' && 'border border-amber-600 text-amber-800 dark:text-amber-300',
        kind === 'estimated' && 'border border-dashed border-neutral-500 text-neutral-600 dark:text-neutral-300',
        kind === 'measured' && 'border border-emerald-600 text-emerald-700 dark:text-emerald-300',
        !['unknown', 'estimated', 'measured'].includes(kind) &&
          'border border-neutral-300 text-neutral-500 dark:border-neutral-600',
      )}
      style={kind === 'unknown' ? { backgroundImage: HATCH } : undefined}
    >
      {kind === 'measured' && <IconRuler2 size={10} />}
      {kind}
    </span>
  );
}

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  full?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={clsx(
            'fixed z-50 flex flex-col overflow-hidden rounded-lg bg-white text-sm text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100',
            props.full
              ? 'inset-4'
              : clsx(
                  'top-1/2 left-1/2 max-h-[85vh] -translate-x-1/2 -translate-y-1/2',
                  props.wide ? 'w-[820px]' : 'w-[480px]',
                ),
          )}
        >
          <div className="flex items-center border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
            <Dialog.Title className="flex-1 text-base font-semibold">{props.title}</Dialog.Title>
            <Dialog.Close
              aria-label={t('Close')}
              className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <IconX size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">{props.children}</div>
          {props.footer && (
            <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-2 dark:border-neutral-700">
              {props.footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Inline confirmation used instead of window.confirm for destructive actions. */
export function ConfirmModal(props: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('Cancel')}</Button>
          <Button
            variant="danger"
            onClick={() => {
              props.onConfirm();
              props.onClose();
            }}
          >
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      {props.children}
    </Modal>
  );
}
