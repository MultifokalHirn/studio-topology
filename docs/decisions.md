# Decisions log

Ambiguities in the spec resolved by picking the simpler reading (spec §0.2). Architectural deviations get an ADR in `docs/adr/`.

| # | Date | Topic | Decision |
|---|---|---|---|
| 1 | 2026-10-04 | Spec location | The spec moved to `docs/studio-planner-spec.md` per the repo layout in §2. |
| 2 | 2026-10-04 | Library versions | Scaffolded with current majors: React 19, Vite 8, TypeScript 6, Tailwind 4 (CSS-first config, no `tailwind.config.js`), Zod 4, ESLint 10 flat config, Vitest 5. All satisfy the spec's "React 18+". |
| 3 | 2026-10-04 | Domain/engine purity | Enforced by ESLint `no-restricted-imports`/`no-restricted-globals` on `src/domain/**` and `src/engine/**`, not only by convention. |
