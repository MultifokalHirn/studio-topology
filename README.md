# Studio Planner

Local-first web app for modelling a music studio: gear and stands to scale, typed connections, multiple setup variants, and rule-based validation. See [`docs/studio-planner-spec.md`](docs/studio-planner-spec.md); decisions that resolve ambiguities are in [`docs/decisions.md`](docs/decisions.md), architectural deviations in [`docs/adr/`](docs/adr/).

## Scripts

| Command                      | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `npm run dev`                | Dev server                              |
| `npm run build` / `preview`  | Static production build / serve it      |
| `npm test` / `test:e2e`      | Vitest unit tests / Playwright e2e      |
| `npm run lint` / `typecheck` | ESLint + Prettier check / `tsc`         |
| `npm run schema:gen`         | Regenerate `schema/project.schema.json` |
| `npm run seed:validate`      | Validate `/seed` against the schema     |

## What it does

- **Library and inventory**: gear, stand and cable models with provenance on every value (unknown and estimated values are flagged, never guessed), templates, images with rectification and connector placement.
- **Layout**: front elevation, side elevation and plan to scale; tiers, racks, desks, floor; loads, width budgets, row pitch, occlusion; ergonomic overlays, optimiser and assignment advisor.
- **Patch**: typed, direction-aware connections (L/R, MIDI channels, USB, CV, clock, power) with cable suggestions, animated signal flow and tracing.
- **Validation**: explainable rules (`PHYS`, `DIR`, `SIG`, `MIDI`, `CLK`, `USB`, `PWR`, `PLC`, `ERG`, `DATA`) plus project integrity checks.
- **Variants**: clone/derive setups, compare, A/B toggle, migration checklist.
- **Tables**: connections, cable BOM, connection matrix, MIDI channel map, MIDI/clock, USB and power trees, power sheet with adapter labels, stand/rack summary, unverified fields, gear sheets.

## Export and print (top bar → Export…, `Ctrl+E`)

| Export                    | Notes                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawing + report (PDF)    | Front/side elevation or plan at 1:5 … 1:100 or "fit", A4/A3, with title block, scale bar and legend, followed by any tables. Uses the print dialog: **Save as PDF, scale 100 %**. |
| Drawing as SVG / PNG      | Same drawing sized to the content at the chosen scale (SVG in physical millimetres).                                                                                              |
| Footprint templates (1:1) | Paper outlines of each unit (optionally stands and rack gear), tiled over pages with alignment marks.                                                                             |
| CSV                       | Cable BOM, power sheet, connections, MIDI map, connection matrix (per signal group).                                                                                              |
| Markdown / DOT / Mermaid  | Setup summary; signal graph for Graphviz or GitHub Markdown. The migration checklist exports from Compare.                                                                        |
| Static snapshot (HTML)    | One read-only file with the three views, the tables and the setup data embedded; no external resources.                                                                           |
| Save with asset folder    | Chromium only: project JSON plus `assets/` images in a folder you pick; reopen it with "Open folder" in the command palette.                                                      |

Library bundles (models, stands, cables, templates) are exported and imported from the Library tab.

## Keyboard

`Ctrl/⌘+K` opens the command palette (every action), `?` shows all shortcuts. Highlights: `1`–`5` switch Layout / Patch / Face / Tables / Compare, `\` A/B toggles setups, `L` legend, `Ctrl+Z`/`Ctrl+Y` undo/redo, `Ctrl+S` save, `Ctrl+D` duplicate the selected unit, `F` fit (canvas focused), `Space`-drag pan, `R` rotate, arrows nudge (Shift ×10), `Del` remove. In sidebar lists, Up/Down move between rows.

## Settings (`Ctrl+,`)

Units and decimals, theme, palette (signal and MIDI channel colours), grid and snap, animation speed and reduced motion, label density, ergonomic defaults (hand clearance, holder thickness, comfort band), cable slack and service loops, mains voltage, default body profile, autosave interval. Settings are stored in the project file, so changes are undoable.

## Sample studio

`seed/studio.sample.json` holds the full rig from [`docs/studio-gear-reference.md`](docs/studio-gear-reference.md): 29 devices, their included power supplies, a Jaspers 3D-145B, a rack, a desk and a Eurorack-format stand, in two setups ("Current" demo arrangement and "Planned (standing)"). It loads on first launch (the ✦ button reloads it). Values the reference could not locate are `null` with provenance `unknown` and appear under **Issues → Unverified fields**.

## Browser support, privacy and security

- Full features in current Chromium (File System Access API for save-in-place and asset folders). Firefox and Safari use download/upload for files; autosave (IndexedDB, rolling 20 snapshots) works everywhere.
- No backend, accounts, analytics or runtime network calls; fonts are the system UI fonts. Exports are generated locally.
- Recommended Content-Security-Policy when hosting the static build:

  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  ```

  (`'unsafe-inline'` styles are needed for inline SVG/React styles; `data:`/`blob:` images for embedded gear photos and exports.)
