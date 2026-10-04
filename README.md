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
