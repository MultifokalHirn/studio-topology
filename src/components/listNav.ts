// Keyboard helpers for lists.
import type { KeyboardEvent } from 'react';

/**
 * Arrow-key navigation between list rows (spec §5.16 keyboard operation of lists): Up/Down move focus between the
 * first button of each `<li>` inside the container; Home/End jump to the ends.
 */
export function listArrowNav(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const target = e.target as HTMLElement;
  const rows = 'li > button:first-of-type';
  if (!target.matches(rows)) return;
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>(rows)];
  const i = all.indexOf(target);
  const next = e.key === 'Home' ? all[0] : e.key === 'End' ? all.at(-1) : all[i + (e.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  next.focus();
  e.preventDefault();
}
