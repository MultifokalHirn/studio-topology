# Decisions log

Ambiguities in the spec resolved by picking the simpler reading (spec §0.2). Architectural deviations get an ADR in `docs/adr/`.

| # | Date | Topic | Decision |
|---|---|---|---|
| 1 | 2026-10-04 | Spec location | The spec moved to `docs/studio-planner-spec.md` per the repo layout in §2. |
| 2 | 2026-10-04 | Library versions | Scaffolded with current majors: React 19, Vite 8, TypeScript 6, Tailwind 4 (CSS-first config, no `tailwind.config.js`), Zod 4, ESLint 10 flat config, Vitest 5. All satisfy the spec's "React 18+". |
| 3 | 2026-10-04 | Domain/engine purity | Enforced by ESLint `no-restricted-imports`/`no-restricted-globals` on `src/domain/**` and `src/engine/**`, not only by convention. |
| 4 | 2026-10-04 | Types vs schemas | Types are inferred from the Zod schemas instead of hand-written next to them. See [ADR 0001](adr/0001-types-inferred-from-zod.md). |
| 5 | 2026-10-04 | Stable key order | Saved JSON sorts object keys alphabetically at every level; arrays keep their order. Two-space indent and a trailing newline. Simplest ordering that is deterministic regardless of how an object was built. |
| 6 | 2026-10-04 | Unknown fields on load | Zod strips unknown keys, which would lose data on the next save. The loader treats unknown keys as a schema issue (listing their paths) and offers read-only opening instead of dropping them. |
| 7 | 2026-10-04 | Read-only "load anyway" | Read-only mode loads the raw, unvalidated document. Edits and saves are refused. Views must tolerate missing fields when rendering it. |
| 8 | 2026-10-04 | Bottom face orientation | §3.2 does not define it. The bottom face is viewed from below with the back edge at the top of the image, so the face-local x runs right to left in body coordinates. Top: viewed from above, back edge at the top of the image. Left/right: viewed from that side, top up. |
| 9 | 2026-10-04 | Settings shape | §4.1 lists the settings topics without a type. Concrete shape in `schemas.ts` (`Settings`). Defaults in `defaults.ts`. |
| 10 | 2026-10-04 | Template shape | `Template` = `{ id, name, group, target: 'gear'\|'stand'\|'connectors', params?, gear?: Partial<GearModel>, stand?: Partial<StandModel>, connectors? }`. `params` covers "N keys", "N channels", "N U" and similar. |
| 11 | 2026-10-04 | Tilt axis | A surface tilts about the x-axis through its front edge, and positive tilt raises the back edge (§7.2). |
| 12 | 2026-10-04 | Atomic writes | The File System Access API's writable stream already writes to a swap file and replaces the target on `close()`. On error we `abort()`. No extra temp handle is needed. |
| 13 | 2026-10-04 | `updatedAt` | Set at save time, not on every edit, so undo/redo restore states exactly. |
| 14 | 2026-10-04 | Undo depth | History keeps 500 entries (spec minimum: 200). |
