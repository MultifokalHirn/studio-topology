import { ulid } from 'ulid';

/** New entity id (ULID: sortable, collision-free, stable once written). */
export function newId(): string {
  return ulid();
}
