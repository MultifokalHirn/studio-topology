# Studio Planner

Local-first web app for modelling a music studio: gear and stands to scale, typed connections, multiple setup variants, and rule-based validation. See [`docs/studio-planner-spec.md`](docs/studio-planner-spec.md).

## Scripts

| Command                      | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `npm run dev`                | Dev server                              |
| `npm run build` / `preview`  | Static production build / serve it      |
| `npm test` / `test:e2e`      | Vitest unit tests / Playwright e2e      |
| `npm run lint` / `typecheck` | ESLint + Prettier check / `tsc`         |
| `npm run schema:gen`         | Regenerate `schema/project.schema.json` |
| `npm run seed:validate`      | Validate `/seed` against the schema     |

## Sample studio

`seed/studio.sample.json` holds the full rig from [`docs/studio-gear-reference.md`](docs/studio-gear-reference.md): 29 devices, their included power supplies, a Jaspers 3D-145B, a rack, a desk and a Eurorack-format stand, in two setups ("Current" demo arrangement and "Planned (standing)"). It loads on first launch. Values the reference could not locate are `null` with provenance `unknown` and appear under **Issues → Unverified fields**.
