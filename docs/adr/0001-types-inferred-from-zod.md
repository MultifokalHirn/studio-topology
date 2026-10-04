# ADR 0001: Domain types are inferred from the Zod schemas

- Status: accepted
- Date: 2026-10-04

## Context
Spec §4 says all types live in `src/domain/types.ts` "with Zod mirrors in `schemas.ts`". Keeping two hand-written copies of about 50 types in sync is error-prone. A field added to one copy and not the other passes type-checking but fails on load, or the reverse.

## Decision
`schemas.ts` is the single source of truth. `types.ts` exports `z.infer<>` of each schema under the normative names from the spec (`GearModel`, `Connector`, `Setup`, …). The JSON Schema in `schema/project.schema.json` is generated from the same schemas, and CI fails on drift (`npm run schema:check`).

## Consequences
- Types, runtime validation and the published JSON Schema cannot diverge.
- Editor hovers show inferred shapes rather than interface declarations. This is acceptable.
- Schema-driven forms (§5.3) can read field metadata from the Zod schemas directly via `.meta()`.
