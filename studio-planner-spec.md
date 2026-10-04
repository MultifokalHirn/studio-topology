# Studio Planner: Implementation Specification

**Audience:** Claude Code (and any human reviewer). This document specifies a complete, local-first web application for modelling a music studio: registering gear and stands with real dimensions and connectors, laying them out to scale, wiring them in multiple setup variants, and checking the result for physical, electrical, signal and ergonomic problems before anything is moved in real life.

**Companion file:** `docs/studio-gear-reference.md` (v2 of the user's gear reference) is the authoritative source for the seed data. Place it in the repo before starting. Never invent a specification value: use `null` plus a provenance of `unknown`, and show the field as unverified in the UI.

**How to work through this spec**
1. Build milestone by milestone (section 12). Commit at the end of each milestone, with passing tests and a short `docs/adr/` note for any architectural decision that deviates from this spec.
2. Every feature below carries acceptance criteria. If something is ambiguous, pick the simpler reading, record it in `docs/decisions.md`, and continue. Do not block on questions.
3. Work from the data model outward: schemas first, then store, then rendering, then rules.

---

## 1. Product definition

### 1.1 Purpose
The owner has about 30 devices (Elektron boxes, synths, effects, rack outboard, a mixer, an interface, controllers), several stands (a three-tier Jaspers 3D-145B keyboard stand, a separate Eurorack-format stand, a rack, a desk), and wants to rearrange everything without trial and error. The app is the planning surface: **a to-scale, connector-accurate digital twin of the studio**, with several alternative arrangements ("setups") that can be compared and turned into a step-by-step migration checklist.

### 1.2 Goals
- Register all gear and stands once (**library + inventory**), with type templates to speed entry, and edit every specification afterwards.
- Lay gear out **to scale** on stands, tiers, racks and desks, with correct tilt, collisions, load limits and control occlusion.
- Wire gear together in each setup with **typed, direction-aware connections** (audio L/R, MIDI with channel numbers, USB, CV/gate, clock/sync, ADAT, power), with adapters and cable lengths.
- Make signal flow visible: colour and badge conventions, arrows, **animated flow**, and upstream/downstream tracing.
- Validate each setup with an explainable rule engine (physical mating, levels, USB bus power, power supplies and voltage, clock masters, MIDI chains, load, ergonomics).
- Keep **multiple setup variants** (for example "Current", "Standing plan", "Seated plan"), compare them, and generate a migration checklist.
- Let the user **import images** of gear and place connectors on them.
- Persist to a human-readable **JSON file** (git-friendly), with optional asset folder.

### 1.3 Non-goals
No audio or MIDI processing, no DAW features, no cloud sync, no accounts, no telemetry, no mobile-first layout. A 3D renderer and a live Web MIDI mode are stretch features (milestone 10), not required for acceptance.

### 1.4 Design principles
- **Local-first and offline.** Everything works from static files. No backend.
- **Truthful data.** Every important value carries provenance (datasheet, retailer, measured, estimated, unknown). Unknown is a first-class value; the UI never silently substitutes a default.
- **Millimetres everywhere internally.** Display units are a setting.
- **Explainable validation.** Every warning names the rule, the entities, the numbers, and a suggested fix.
- **Reproducible files.** Stable key order, stable IDs, pretty-printed JSON, so diffs are meaningful.

---

## 2. Technology and architecture

| Concern | Decision | Notes |
|---|---|---|
| Language | TypeScript (strict), ES2022 | `noUncheckedIndexedAccess` on |
| UI | React 18+ with Vite | Single-page app, static build |
| Styling | Tailwind CSS plus Radix UI primitives (shadcn-style components) | Light and dark themes |
| Icons | Tabler (outline) | |
| State | Zustand plus Immer | Project state in one store; transient UI state in a second store |
| Undo/redo | Patch-based (Immer patches), per-project history, coalescing for drags | At least 200 steps |
| Validation and schema | Zod; generate JSON Schema (`schema:gen`) | Schema published at `schema/project.schema.json` |
| Rendering | SVG with a custom pan/zoom viewport | Crisp at any zoom, trivial hit-testing, easy export; see section 7.1 |
| Graph layout | `elkjs` (orthogonal edge routing) for the patch view | Fallback: simple layered layout |
| Tables | TanStack Table | |
| Storage | File System Access API (Chromium) for open/save; IndexedDB autosave (`idb-keyval`) | Fallback: download/upload |
| Image processing | Canvas API plus in-repo homography code | No OpenCV dependency |
| Tests | Vitest (unit), Playwright (e2e), plus a golden-file test for JSON round-tripping | |
| Lint/format | ESLint, Prettier | |
| Build | `npm run dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `schema:gen`, `seed:validate` | |

**Repo layout**
```
/docs              spec, studio-gear-reference.md, adr/, decisions.md
/schema            generated JSON Schema
/seed              catalog JSON (gear/, stands/, cables/, templates/)
/src
  /domain          types, zod schemas, units, geometry, migrations (pure, no React)
  /engine          graph build, tracing, rules/, ergonomics/, occlusion, clock/usb/power trees
  /store           project store, ui store, history, persistence
  /render          viewport, drawing primitives, view modules (layout, patch, face)
  /features        library, gear-editor, stand-editor, images, setups, reports, settings
  /components      shared UI
/tests             unit, e2e, fixtures
```
**Hard rule:** `domain` and `engine` have no React or DOM imports, so they can be unit-tested headless and reused by CLI scripts.

**Performance budgets:** 200 units, 1,000 connections, 60 fps pan/zoom on a mid-range laptop; a full rule-engine pass under 150 ms; incremental pass under 30 ms.

---

## 3. Coordinate system, units, provenance

### 3.1 Units
- Lengths in **mm** (floats), weights in **kg**, voltages in **V**, currents in **mA**, angles in **degrees**, levels in **dBu**.
- Display units (mm, cm, in) are a setting; inputs accept `12 cm`, `4.5"`, `0.5 U`.
- Derived constants (`src/domain/units.ts`): 1 rack unit = **44.45 mm**; 19" rack panel width = **482.6 mm** (inner opening 450 mm); 1 Eurorack HP = **5.08 mm**; Eurorack panel height 3U = **128.5 mm**.

### 3.2 Coordinate conventions
- **World / plan view:** x to the right, y away from the player (depth), z up. Origin is a per-setup datum (default: floor at the listening position).
- **Gear body axes:** w along x, d along y (front to back), h along z.
- **Face-local coordinates** for connectors and images: origin at the **top-left of the face as seen from outside, looking at it**, x to the right, y down. This means the *back* face is mirrored relative to the front: when drawing a rear view, no extra mirroring is needed because the coordinates already describe what the viewer sees from behind. The renderer must apply the correct transform when the same unit is shown in front and rear views. Include a unit test with a connector at the left edge of the back face of a 200 mm-wide unit (it appears on the *right* when viewed from the front).

### 3.3 Provenance
Every `GearModel`, `StandModel` and `CableModel` carries `provenance: Record<string, Provenance>` keyed by dotted field path (for example `dimensions.d`, `power.sources.0.drawMa`).
```ts
type ProvenanceKind = 'manufacturer' | 'datasheet' | 'retailer' | 'measured' | 'estimated' | 'user' | 'unknown';
interface Provenance { kind: ProvenanceKind; url?: string; retrieved?: string /* ISO date */; note?: string }
```
UI rules: unknown fields render with a hatched badge and appear in a project-wide **Unverified fields** list; estimated dimensions render with a dashed outline on canvas; `measured` wins over everything and shows a ruler icon. Editing a value prompts for provenance (default `user` or `measured`, remembered per session).

---

## 4. Domain model

All types live in `src/domain/types.ts` with Zod mirrors in `schemas.ts`. IDs are ULIDs (`string`). Names below are normative; add fields as needed but do not rename.

### 4.1 Project file
```ts
interface Project {
  schemaVersion: number;                    // integer, migrations in domain/migrations
  meta: { name: string; createdAt: string; updatedAt: string; author?: string; notes?: string };
  settings: Settings;                       // units, theme, palette, snap, animation, ergonomics defaults
  library: {                                // catalog definitions (models)
    gearModels: GearModel[];
    standModels: StandModel[];
    cableModels: CableModel[];
    templates: Template[];                  // user templates; built-ins ship in /seed
  };
  inventory: {                              // things the user owns (instances)
    gearUnits: GearUnit[];
    standUnits: StandUnit[];
    cables: CableUnit[];                    // owned cables (optional; used for BOM and stock)
    rooms: Room[];                          // optional (milestone 9)
  };
  bodyProfiles: BodyProfile[];
  setups: Setup[];
  activeSetupId: string | null;
  assets: AssetIndex;                       // see 4.9
}
```
**Model vs unit:** a `GearModel` is the catalog definition ("Elektron Digitone II"); a `GearUnit` is one physical item ("my Digitone", with nickname, serial, notes, purchase date, optional per-unit overrides). Setups reference units.

### 4.2 GearModel
```ts
type GearCategory = 'synth'|'drum-machine'|'sampler'|'sequencer'|'controller'|'effect'|'dynamics'|'mixer'
  |'interface'|'converter'|'midi-hub'|'patchbay'|'eurorack-case'|'power'|'computer'|'tablet'|'monitor-speaker'
  |'headphones'|'microphone'|'accessory'|'other';
type FormFactor = 'desktop'|'keyboard'|'rack'|'pedal'|'eurorack'|'handheld'|'tablet'|'speaker'|'other';
type FaceId = 'top'|'front'|'back'|'left'|'right'|'bottom';

interface GearModel {
  id: string; manufacturer: string; name: string; variant?: string; aliases: string[];
  category: GearCategory; formFactor: FormFactor; tags: string[];
  dimensions: {
    w: number|null; d: number|null; h: number|null; weightKg: number|null;
    rack?: { u: number; earsIncluded: boolean; depthBehindEarsMm?: number };
    eurorack?: { hp: number; depthMm?: number };
    keyboard?: { keys: number; keyType: 'slim'|'mini'|'full'|'semi-weighted'|'weighted' };
    heightIncludesKnobsFeet: boolean;
  };
  mounting: { vesa?: 75|100; rackEars?: boolean; pegs?: string; slipRiskNote?: string; nonSlipFeet?: boolean };
  controlsRegion?: Rect;                    // on the top face; default = top face minus 10 mm margin
  faces: Partial<Record<FaceId, { widthMm: number; heightMm: number }>>; // derived from dimensions when absent
  connectors: Connector[];                  // section 4.3
  internalPaths: InternalPath[];            // section 4.4
  power: PowerSpec;                         // section 4.5
  midi?: MidiSpec;                          // section 4.6
  clock?: ClockSpec;                        // section 4.6
  audio?: { sampleRatesHz?: number[]; bitDepths?: number[]; adatMaxHzNote?: string };
  ergonomics: {
    interaction: 'keys'|'knobs-buttons'|'pads'|'touch'|'fader'|'footswitch'|'set-and-forget';
    defaultUsage: 'primary'|'secondary'|'rare';
    needsDisplayVisibility: boolean;
  };
  images: Partial<Record<FaceId|'photo', AssetRef>>;
  imageCalibration?: Partial<Record<FaceId, { pxPerMm: number; cropRect?: Rect; rectified?: boolean }>>;
  notes: string; sources: { label: string; url?: string; retrieved?: string }[];
  provenance: Record<string, Provenance>;
  createdFromTemplateId?: string;
}
```

### 4.3 Connector (the core of the wiring model)
```ts
type SignalDomain =
 | 'audio.analog' | 'audio.headphone' | 'audio.adat' | 'audio.spdif' | 'audio.aes' | 'audio.usb'
 | 'midi.din' | 'midi.trs-a' | 'midi.trs-b' | 'midi.usb' | 'midi.ble' | 'midi.network'
 | 'cv' | 'gate' | 'clock.pulse' | 'clock.dinsync' | 'clock.word'
 | 'expression' | 'footswitch' | 'usb.data' | 'ethernet' | 'power.dc' | 'power.ac' | 'power.usb' | 'other';
type Direction = 'in' | 'out' | 'thru' | 'bidir';

interface Connector {
  id: string;                               // stable slug, unique within the model (e.g. 'out-main-l')
  label: string; face: FaceId; pos: { x: number; y: number };  // mm, face-local (see 3.2)
  domain: SignalDomain; direction: Direction;
  jack: JackType;                           // physical receptacle on the gear (Appendix A)
  signal?: {
    balance: 'balanced'|'imp-balanced'|'unbalanced'|'n/a';
    level?: 'mic'|'line'|'instrument'|'hi-z'|'+4dBu'|'-10dBV'|'speaker'|'headphone'|'eurorack-audio'|'cv-1v-oct'|'cv-unipolar'|'cv-bipolar'|'gate-5v'|'gate-12v';
    maxDbu?: number; impedanceOhm?: number; phantom?: 'none'|'switchable'|'always';
  };
  channel?: { role: 'mono'|'L'|'R'|'numbered'; group?: string /* stereo pair id */; index?: number; bus?: string };
  midi?: { carries: ('notes'|'cc'|'pc'|'sysex'|'clock'|'transport'|'mtc'|'aftertouch')[]; thruMode?: 'hard'|'soft'|'switchable-with-out'|'none'; trsType?: 'A'|'B' };
  usb?: {
    role: 'host'|'device'|'otg'; version: '1.1'|'2.0'|'3.0'|'3.1'|'3.2'|'4'|'unknown';
    carries: ('midi'|'audio'|'data'|'power'|'firmware')[];
    audio?: { inChannels: number; outChannels: number; compliance: 'class-compliant'|'driver-required'|'overbridge'|'unknown'; maxRateHz?: number };
    drawsBusPowerMa?: number|null; suppliesBusPowerMa?: number|null; busPowered?: boolean;
  };
  clock?: { format: 'midi'|'dinsync24'|'dinsync48'|'pulse'|'word'|'adat'; ppqn?: number; canMaster?: boolean; canSlave?: boolean; note?: string };
  cv?: { standard: string; rangeV?: [number, number] };
  alternates?: { id: string; label: string; domain?: SignalDomain; direction?: Direction; note?: string }[]; // e.g. headphone jack usable as line out; MIDI Out/Thru switch
  exclusiveWith?: string[];                 // connector ids that cannot be used simultaneously
  notes?: string;
}
```
Rules for modelling: a **stereo pair** is two connectors with the same `channel.group` and roles `L` and `R`. A switchable port (H90 Out/Thru, SSL 12 headphone-as-line) is one connector with `alternates`; the setup's `unitConfig` records which mode is active.

### 4.4 InternalPath (for tracing and loop detection)
```ts
interface InternalPath {
  id: string; from: string[]; to: string[];         // connector ids
  mode: 'passthrough'|'process'|'sum'|'split'|'host-bridge'|'insert-normal';
  condition?: string;                                // e.g. "ADAT input feeds line outputs"
  channelMap?: { from: string; to: string }[];       // preserves L/R continuity
  presetId?: string;                                 // routing preset name selectable per setup
}
```
Examples: Analog Heat (in → out, `process`); MixWizard (channels → main L/R, `sum`, aux sends, inserts `insert-normal`); SSL 12 (USB ↔ analog, `host-bridge`); mioXL (any MIDI in → any out, `split` and `sum`, preset based); Ultrapatch (rear↔rear `insert-normal`, per-channel mode). Sources with outputs only (synths) have no internal path from an input unless they have external input mix (Neutron, Octatrack).

### 4.5 PowerSpec
```ts
interface PowerSpec {
  sources: PowerSource[];                   // a unit may accept several (USB or DC)
  typicalW?: number|null; maxW?: number|null; inrushNote?: string; mainsRegion?: 'selectable'|'auto-100-240'|'115-only'|'230-only'|'unknown';
}
interface PowerSource {
  kind: 'external-dc'|'internal-mains'|'usb-bus'|'battery'|'eurorack-bus'|'optional-dc';
  inputConnectorId?: string;
  nominalV?: number; voltageMinV?: number; voltageMaxV?: number;
  drawMa?: number|null; peakMa?: number|null;
  plug?: { type: 'barrel'; odMm: number; idMm: number; polarity: 'center-positive'|'center-negative' } | { type: 'iec-c14' } | { type: 'usb' } | { type: 'other'; note: string };
  included: boolean; suppliedModelId?: string; maxVoltageNote?: string;   // e.g. NightSky "max 9 V"
}
```
Power supplies, power strips, hubs and wall adapters are modelled as gear with `power.dc` / `power.ac` output connectors that carry `signal`-like ratings: `{ voltage, currentMaMax, plug, polarity }` in a `psuOutput` field on the connector (add this to `Connector` as `psu?: {...}`).

### 4.6 MidiSpec and ClockSpec
```ts
interface MidiSpec { channelsRx?: number[]|'omni'|'per-track'; tracks?: { id: string; label: string; defaultChannel?: number }[]; maxThruChain?: number; clockOut?: boolean; clockIn?: boolean; notes?: string }
interface ClockSpec { canBeMaster: boolean; canBeSlave: boolean; formats: ('midi'|'dinsync24'|'dinsync48'|'pulse-1ppqn'|'pulse-2ppqn'|'pulse-24ppqn'|'pulse-48ppqn'|'adat'|'word')[]; notes?: string }
```
Example: Octatrack has `tracks` MIDI 1–8; Pyramid has 64 tracks; used to build the MIDI channel map.

### 4.7 Stands and surfaces
```ts
type StandType = 'tiered-keyboard-stand'|'desk'|'rack'|'eurorack-case'|'shelf'|'pedalboard'|'floor'|'custom';
interface StandModel {
  id: string; manufacturer: string; name: string; type: StandType;
  dimensions: { w: number|null; d: number|null; h: number|null; innerSpanMm?: number|null; weightKg?: number|null };
  surfaces: SurfaceDef[];
  structure?: { poleDiameterMm: number; legSpreadMm?: number; frameLines?: Polyline[] }; // optional drawing hints
  images: Partial<Record<'front'|'side'|'top'|'photo', AssetRef>>;
  notes: string; sources: { label: string; url?: string }[]; provenance: Record<string, Provenance>;
}
interface SurfaceDef {
  id: string; label: string; kind: 'tier'|'desktop'|'rack-bay'|'shelf'|'floor'|'rail';
  usable: { w: number; d: number };         // mm, along x and y of the surface
  anchor: { x: number; y: number; z: number };           // default position relative to stand origin
  adjustable: {
    z?: { min: number; max: number; step: number };
    tiltDeg?: { min: number; max: number; step: number };
    y?: { min: number; max: number; step: number };       // depth offset of the tier (A-frame geometry)
  };
  holders?: { lengthMm: number; thicknessMm: number; pairMinSpacingMm: number; protrusionAdjustable: boolean };
  loadKg: number|null; lipFrontMm?: number;
  rack?: { u: number; innerWidthMm: 450; depthMm: number };
}
interface StandUnit { id: string; modelId: string; nickname: string; notes?: string }
```
Rack bays are surfaces with `kind: 'rack-bay'` and `rack.u`; placement uses `uStart`. Eurorack-format "stand" is a `desktop` surface with width in HP when relevant.

### 4.8 Cables and adapters
```ts
type PlugType = 'TS-6.35'|'TRS-6.35'|'TS-3.5'|'TRS-3.5'|'XLR-M'|'XLR-F'|'DIN5-M'|'RCA-M'|'TOSLINK'|'BNC'|'USB-A'|'USB-B'|'USB-C'|'USB-micro-B'|'USB-mini-B'|'RJ45'|'DC-barrel'|'IEC-C13'|'Y-insert';
interface CableModel {
  id: string; name: string; kind: 'cable'|'adapter';
  endA: PlugType; endB: PlugType;           // Y-insert is a special three-end entry (see Appendix A)
  carries: SignalDomain[]; balanced?: boolean; lengthsMm: number[]; maxLengthMm?: number;
  swap?: 'none'|'tip-ring-for-L-R'|'trs-a-to-b'; notes?: string;
}
interface CableUnit { id: string; modelId: string; lengthMm: number; label?: string; inStock: boolean }
```
Connection cables are chosen from `CableModel`s by the engine's **suggest cable** function (section 5.8) so the app can output a shopping list.

### 4.9 Assets
```ts
interface AssetRef { id: string }          // resolves through project.assets
interface AssetIndex { mode: 'embedded'|'folder'; items: Record<string, { name: string; mime: 'image/webp'|'image/png'|'image/jpeg'|'image/svg+xml'; widthPx: number; heightPx: number; bytes: number; path?: string /* folder mode */; dataUri?: string /* embedded mode */ }> }
```
Folder mode stores images in `assets/` next to the project JSON (default when the File System Access API is available); embedded mode inlines base64 for a portable single file. Conversion between modes is an Export option.

### 4.10 Setups, placements, connections
```ts
interface Setup {
  id: string; name: string; description: string; status: 'current'|'planned'|'idea'|'archived'; tags: string[];
  derivedFromId?: string; bodyProfileId: string; posture: 'standing'|'seated'; seatHeightMm?: number;
  stands: StandState[]; placements: Placement[]; connections: Connection[];
  unitConfigs: Record<string /* gearUnitId */, UnitConfig>;
  annotations: Annotation[]; roomId?: string; viewState: ViewState;
  createdAt: string; updatedAt: string;
  suppressedIssues: { ruleId: string; entityIds: string[]; reason: string }[];
}
interface StandState { standUnitId: string; pos: { x: number; y: number }; rotationDeg: 0|90|180|270;
  surfaceStates: Record<string /* surfaceId */, { z?: number; tiltDeg?: number; y?: number }> }

type Mount =
  | { type: 'surface'; standUnitId: string; surfaceId: string; x: number; y: number }        // x,y relative to surface origin
  | { type: 'rack'; standUnitId: string; surfaceId: string; uStart: number }
  | { type: 'stacked'; parentUnitId: string; x: number; y: number }
  | { type: 'floor'; pos: { x: number; y: number }; z?: number };
interface Placement { unitId: string; mount: Mount; rotationDeg: 0|90|180|270; locked: boolean; zIndex: number; groupId?: string }

interface Connection {
  id: string; a: { unitId: string; connectorId: string }; b: { unitId: string; connectorId: string };
  bundleId?: string;                         // stereo pairs and multi-cable groups share this
  cable: { modelId?: string; lengthMm?: number; adapters: string[]; autoLength: boolean };
  mapping?: { fromChannel: string; toChannel: string }[];          // e.g. L→L, R→R, L→mono
  midi?: { channels: number[]|'omni'|'per-track'; purposes: ('notes'|'clock'|'transport'|'cc'|'pc'|'sysex')[]; trackMap?: { fromTrack?: string; toChannel: number }[] };
  usb?: { hostUnitId: string };              // derived by default, overridable
  label?: string; color?: string; waypoints?: { x: number; y: number }[]; enabled: boolean; notes?: string;
}
interface UnitConfig {                       // per-setup device settings that influence validation
  activeAlternates: Record<string /* connectorId */, string /* alternateId */>;
  routingPresetId?: string; clockSource?: 'internal' | { connectorId: string };
  clockMaster?: boolean; midiRxChannel?: Record<string /* trackId */, number>; midiTxChannel?: Record<string, number>;
  usbMode?: string; mainsVoltage?: 115|230; powerAssignments: { connectorId: string; supplyUnitId: string; supplyConnectorId: string }[];
  usage: 'primary'|'secondary'|'rare';       // overrides the model default for ergonomics scoring
  notes?: string;
}
```
The **direction of a connection is never stored**: it is derived from the two connectors' directions (`out → in`, `thru → in`, `bidir ↔ bidir`). Invalid combinations are stored but flagged by `DIR-*` rules.

### 4.11 Body profile
```ts
interface BodyProfile { id: string; name: string; heightMm: number; overrides?: Partial<{
  elbowStandingMm: number; elbowSeatedAboveSeatMm: number; eyeStandingMm: number; eyeSeatedAboveSeatMm: number;
  shoulderStandingMm: number; seatHeightMm: number; forearmHandMm: number }>; handedness: 'right'|'left' }
```

---

## 5. Functional specification

### 5.1 App shell
- **Top bar:** project name, dirty indicator, Open / Save / Save as / Export, undo/redo, setup switcher, validation badge (count by severity), theme toggle.
- **Left sidebar (tabs):** *Inventory* (gear units, stand units), *Library* (models and templates), *Setups*, *Issues*.
- **Centre:** tabbed canvas: **Layout** (front elevation, side elevation, plan), **Patch**, **Face** (rear/front panel view), **Tables**.
- **Right inspector:** context-sensitive properties for the selection; includes provenance badges, connector list, ergonomics summary, validation messages for the selection.
- **Status bar:** units, zoom, cursor position in mm, selection dimensions, grid/snap state, last autosave time.
- Keyboard-first: command palette (`Ctrl/Cmd+K`) lists every action. Full shortcut list in 5.16.

### 5.2 Library and inventory
**Models and units**
- CRUD for gear models, stand models and cable models, with duplicate, delete (with usage check), merge duplicates, and search/filter (text, category, tag, form factor, unverified-only).
- Adding a unit instance from a model is one click; the same model can have several units ("Behringer Pro-800 #2").
- **Templates:** the "New gear" dialog starts from a template that pre-fills category, form factor, dimension scaffolding, ergonomics, and a typical connector set, which the user then edits. Built-in templates (shipped in `/seed/templates`):

| Group | Templates |
|---|---|
| Desktop gear | Desktop synth, drum machine, sampler/groovebox, sequencer, controller keyboard (N keys, width computed from key pitch) |
| Effects | Pedal-format effect (stereo), desktop effect (stereo in/out), rack effect 1U, dynamics 1U (dual channel XLR+TRS), exciter/enhancer 1U |
| Audio infrastructure | Mixer (N-channel), USB audio interface (N in / M out), ADAT converter 1U, patchbay 1U (48-point, normalling modes), summing mixer |
| MIDI/CV | MIDI hub rack 1U, MIDI interface, Eurorack case (N HP, with optional MIDI/USB to CV) |
| Power | Wall-wart DC supply (voltage, current, polarity), power strip (N outlets), USB hub (powered/unpowered, N ports) |
| Computers | Tablet (USB-C), laptop, monitor speakers (pair), headphones |
| Stands | Tiered A-frame keyboard stand, X-stand, desk (w × d × h), 19" rack (N U × depth), Eurorack stand, shelf, pedalboard, floor |

- **Connector templates** (reusable groups): "Stereo ¼" TS out pair", "Balanced ¼" TRS stereo in/out", "MIDI DIN In/Out/Thru", "MIDI DIN In/Out", "USB-B device (MIDI)", "USB-C device (audio+MIDI)", "DC barrel input 12 V centre-positive 5.5×2.5", "IEC C14 inlet", "Headphone ¼" stereo", "3.5 mm sync in/out", "CV/Gate pair".
- **Bulk operations:** multi-select to tag, change category, mark verified, export selection as a JSON library bundle, import a library bundle (with conflict resolution: skip, replace, keep both).
- **Verification workflow:** *Unverified* filter lists models with any `unknown` or `estimated` fields and shows what is missing. A **Measure mode** (inspector action) lets the user enter measured width/depth/height/weight and stamps `measured` provenance, preserving the previous value in a history note.

### 5.3 Gear editor
A full-screen editor with sections (all schema-driven forms generated from Zod metadata, with unit-aware inputs):
1. **Identity:** manufacturer, name, variant, aliases, category, form factor, tags, notes, sources (URL list).
2. **Dimensions and mounting:** w/d/h/weight, rack U or Eurorack HP when applicable (auto-fills the exact mm), keyboard keys, VESA, non-slip feet. A live preview shows top, front and side silhouettes at scale.
3. **Connectors:** table plus **face canvas** (see 5.5). Add from templates or one by one; fields from 4.3; stereo-pair helper ("make L/R pair"); duplicate with offset; reorder; validation (duplicate IDs, impossible combinations, e.g. USB device with `balance`).
4. **Internal routing:** visual editor drawing paths between connectors, with preset names (for example "Heat: in → out", "A&H aux 1 mix"). Include a table view.
5. **Power:** sources, plug definition with a picker (barrel OD/ID/polarity glyph), draw in mA/W, mains region, PSU model reference, notes. Polarity is shown graphically.
6. **USB / MIDI / Clock:** per-port configuration summarised from connectors (bus power draw, audio channels, class compliance), MIDI tracks and thru mode, clock formats and master/slave capability.
7. **Ergonomics:** interaction type, default usage, display visibility, controls region (draggable rectangle on the top face).
8. **Images:** attach per face (5.5).
9. **Provenance panel:** every field's provenance, with bulk "mark as datasheet" and "mark as measured".
Autosave drafts; changes commit to the store as one undoable step per editor session.

### 5.4 Stand editor
- Edit `StandModel` and its surfaces: add tiers/shelves/rack bays/desktops, set usable rectangle, anchor, adjustment ranges (z, tilt, y offset), holder length/thickness, load capacity, front lip.
- Live **side and front preview** of the stand with surfaces at default and at the min/max of each adjustment (ghosted).
- A parametric **tiered A-frame** generator: number of tiers, per-tier holder lengths and capacities, inner span, pole diameter, optional frame lines. The Jaspers 3D-145B ships as a seed model (Appendix D).
- Rack generator: N U, depth, inner width 450 mm, rail hole pattern (EIA) as a drawn detail, bay surfaces at 44.45 mm pitch.
- Unknown geometry (for example the tier depth offsets of the Jaspers) is flagged `unknown`; the editor prompts for measurements and offers a **measure helper** (enter the horizontal offset and vertical gap between two tiers as measured on the real stand).

### 5.5 Images
**Import:** drag and drop, file picker or paste; accepted PNG, JPEG, WebP, SVG. Files are re-encoded to **WebP** (quality 0.85, max 2048 px on the long edge), EXIF stripped, and stored per face or as a generic photo.

**Calibration and cleaning (per face)**
1. **Perspective rectification:** the user clicks four corners; the app computes a homography and warps to the true aspect ratio from the model's face dimensions (`widthMm × heightMm`), producing `pxPerMm`.
2. **Crop and rotate** (90° steps plus free rotation).
3. **Scale check:** two-point measure tool compares a known dimension (for example panel width) with the image.
4. Optional **background fill**: click-to-transparent with tolerance slider, or draw a polygon mask. (A simple threshold tool is enough; no ML dependency.)
5. Images can be **replaced, removed, or reused** between models (for example the same front image for two variants).

**Connector placement on images:** in the face canvas the image is drawn at true scale; the user drops a connector from the list onto the image, or drags existing connectors; positions snap to a configurable grid and show mm coordinates. A **mirror helper** copies connector positions from the front to the back when a user measures the panel from behind (applying the 3.2 mirror rule).

**Fallback rendering** when an image is missing: category-coloured rounded rectangle with the device name and simple glyphs for knobs and keys where known; connectors shown as typed badges. Estimated dimensions use a dashed outline.

### 5.6 Layout canvas
Three synchronised views of one setup, switchable by tabs and shown at the same scale if split.

**Front elevation (x–z):** stands drawn from their surface parameters; units drawn from `front` images or placeholders at their actual width and height, tilt shown as foreshortened height `h·cosθ` plus a tilt indicator. Overlays (toggleable): control-plane height line, elbow height, comfort bands, eye level, ruler along the left with the floor at 0.

**Side elevation (y–z):** shows tilt, holder lengths, overhang and depth offsets between tiers, rack depth, hand-clearance zones above lower rows (a translucent band), and the display line-of-sight cone to the nearest display.

**Plan (x–y):** footprint, rotation, stand positions, optional room (milestone 9), reach envelopes from the body position, rack depth, cable reach arcs.

**Interactions (all views)**
- Pan (space-drag or middle mouse), zoom (wheel, pinch, fit selection, fit all), rulers, grid with snap (default 5 mm; Alt disables, Shift = 1 mm).
- Add gear/stands by dragging from the inventory; units attach to the **nearest compatible surface** under the pointer, with a ghost showing the landing spot and snap targets (edges, centres, other units with a configurable gap).
- Move, rotate (R / Shift+R, 90° steps), flip to a different surface, nudge with arrows (1 mm; Shift 10 mm), duplicate, lock, group (a group moves as one and survives variant cloning).
- **Tier controls:** each tier has handles for height and tilt with numeric inputs; moving a tier moves its units. Dimension lines show gaps between tiers and between a tier and the elbow line.
- **Measurement tool:** click two points for distance and angle; persistent measurements saved as annotations.
- **Multi-select, align and distribute** (left/right/centre, equal gaps).
- **Rack view:** drag units onto U positions; invalid positions (overlap, beyond depth) are rejected with a reason. Show total U used, weight, estimated mains draw.
- **Stacked placement:** a unit can sit on another unit (for example a pedal on a synth); stacking height uses `h` of the parent.
- **Collisions and fit:** `PLC-*` rules (section 5.12) run live and mark offenders with a red outline and a tooltip.
- **Occlusion preview:** a toggle highlights which controls areas are hidden by units on tiers above (projected along the line of sight from the player's eye), with percentage hidden.

### 5.7 Patch canvas (signal graph)
A schematic view of the same setup. Each unit is a node with its connectors drawn as ports on the node's edges (inputs on the left, outputs on the right by default, **configurable per unit** to mirror the real panel layout). Ports show type glyph, short label, and L/R/number badge.

**Auto-layout** (ELK layered, left to right: sources → processors → mixers/interfaces → monitors) with manual override: dragged nodes are pinned and persisted in `viewState.patchPositions`. Edge routing is orthogonal with bundling: stereo pairs run as a **ribbon** (two parallel lines labelled L and R).

**Connect tool**
1. Hover a port: compatible targets highlight green; incompatible ones dim with a tooltip stating the rule (for example "Output to output"; "TRS plug cannot mate XLR jack, adapter available").
2. Drag from a port to another: the connection is created and the **suggest-cable** engine proposes a cable or adapter (section 5.8).
3. For stereo pairs, **Shift-drag** connects both L and R at once; for MIDI, a popover asks for channel(s) and purposes; for USB, the host is chosen automatically (the only `host` port) with an override; for power, dragging from a PSU output to a power input validates voltage, polarity and plug immediately.
4. Right-click a connection: edit mapping, change cable/adapter, add a waypoint, delete, disable (greyed in the view and ignored by tracing and rules).
5. **Bulk connect:** select a unit's outputs and a mixer's inputs and apply "connect sequentially".

**Port-level inspection:** selecting a port opens the inspector with its specs, verification status, connections, and issues. Connected ports show the cable length and adapter chain.

### 5.8 Cable engine
`suggestCable(a: Connector, b: Connector, pathLengthMm, library)` returns ranked options:
1. Direct cable whose ends mate (Appendix A matrix) and carries the domain.
2. Cable plus adapter when plugs differ (for example TRS-A 3.5 mm MIDI to DIN, USB-A to USB-B).
3. Special cables: Y-insert for TRS inserts, MIDI-to-TRS-A, 3.5 mm to ¼" TS.
Length is computed from the layout: **Manhattan distance between the two connector positions in 3D** (using placement, tilt and face orientation) plus 15% slack plus 150 mm service loop per end, rounded up to the nearest stocked length from `CableModel.lengthsMm`. Settings expose slack and loop. The **cable BOM** groups by model and length, shows stock vs. need (against owned `CableUnit`s), and exports CSV. If either unit lacks a placement, the length is `unknown` and the BOM marks it.

### 5.9 Visual language (markings)
All encodings must be **colour-blind safe**: each colour is paired with a dash pattern, shape or text badge. Palette is in Appendix G and user-editable in Settings.

| Concept | Encoding |
|---|---|
| Audio, mono | Neutral dark line, badge `M` at both ends |
| Audio left | Blue line, badge `L` |
| Audio right | Red line, badge `R` |
| Stereo pair | Ribbon of two parallel lines (L above R) with a bracket and group label |
| Numbered channel (mixer, ADAT) | Neutral line with number badge `1…n`, optional channel colour |
| Balanced audio | Double-tick on the line (glyph near each end); unbalanced has none |
| Headphone | Dotted audio line with a headphone glyph |
| MIDI | Green line, small DIN-5 glyph at the ends, **channel badge** (`1`–`16`, `ALL`/`OMNI` for omni, `T` for per-track) in the channel's palette colour (16 colours, with striped fill for omni) |
| MIDI purposes | Small icons on the line: note, CC, clock, transport, PC, SysEx |
| MIDI thru chain | Line with a hop counter badge (`THRU 1/2/3…`) |
| USB | Purple line; badge `MIDI`, `AUDIO`, `A+M`; arrow towards the device from the host; two-way chevrons |
| CV | Orange line, small waveform glyph; label with standard (`1V/oct`, `mod`) |
| Gate/trigger | Orange dashed |
| Clock/sync | Magenta line with diamond ticks; label with format (`MIDI`, `DIN24`, `DIN48`, `1/2/24/48 ppqn`, `WORD`) |
| ADAT / S/PDIF (digital audio) | Teal dotted, labelled with channels and rate |
| Expression/footswitch | Thin brown line |
| Power | Thin grey/red dotted; polarity glyph at the barrel jack; voltage label |
| Disabled | 30% opacity |
| Issue overlay | Red/amber/blue dot on the cable midpoint; click opens the issue |

**Direction:** every cable has an arrowhead at the destination; bidirectional links have two. When animation is off, **chevron markers** repeat every 60 px along the cable pointing in the signal direction.

**Port glyphs:** a distinct glyph per `JackType` (Appendix A) so an incompatible mate is visible before the engine complains.

**Legend:** a collapsible legend card, auto-generated from the encodings in use in the current setup. Filters (checkboxes) per domain dim everything else.

**Label density control:** off / minimal (badges only) / full (cable length, adapter, label).

### 5.10 Signal flow animation and tracing
**Animation** (Patch and Layout views; toggle in toolbar, default on, respects `prefers-reduced-motion` and a Settings override):
- Audio: continuous dashed flow along the cable from output to input (`stroke-dashoffset` animation), speed proportional to a global factor, with a gentle intensity pulse on the source node.
- MIDI: discrete **packets** (short bright segments) travelling the cable, coloured by channel; packet cadence reflects the purpose (clock ticks at the global BPM, notes at irregular intervals).
- Clock: diamonds pulse in time with a **global BPM** control (30 to 300); the master's clock output pulses first and the pulse propagates through the sync tree with a per-hop delay of 40 ms purely for visibility.
- USB: bidirectional chevrons; audio USB shows a steady flow, MIDI-only shows packets.
- Power: a slow, faint pulse towards the powered device.
- Limits: animate at most 300 elements; beyond that, fall back to chevrons. Use CSS animations on `stroke-dashoffset`/`transform` only (compositor-friendly).

**Tracing modes**
- **Hover trace:** hovering a port or cable highlights the full upstream and downstream path for the same domain, dims everything else, and shows a breadcrumb: "Digitone II · Main L → Analog Heat · In L → Analog Heat · Out L → MixWizard · CH 5 → Main L → …".
- **Follow signal:** pick a source port and press Play: sequential highlighting hop by hop with a step list and a "to destinations" summary.
- **Where does it end?** Lists all terminal destinations (monitors, headphones, converters) for a selected output; flags dead ends (output goes nowhere).
- **Channel continuity:** traces L/R through internal paths; flags L→R swaps, mono sums, and stereo-to-mono collapses along the chain (rule `SIG-006`).

### 5.11 Setup variants
- **Create:** blank, **clone** (deep copy with new IDs), or **derive** (clone linked via `derivedFromId`).
- **Manage:** rename, status (`current`, `planned`, `idea`, `archived`), tags, notes, auto-generated **thumbnail** (front elevation render), reorder, delete.
- **A/B toggle:** a key (`\`) swaps the canvas between the active and the previous variant while preserving viewport.
- **Compare:** pick two variants; the compare panel shows
  - **Layout diff:** units added, removed, moved (with from/to surface and distance), tier height and tilt changes; an overlay on the canvas draws ghost positions with arrows.
  - **Connection diff:** cables to add, remove, re-route; adapter changes.
  - **Metric diff:** ergonomic score, issue counts by severity, rack U, total mains W, cable length, stand loads.
- **Migration checklist:** from setup A to setup B the app generates an ordered, checkable list: power down, disconnect cables (grouped by unit), move units (source → destination with measurements), adjust tiers (height/tilt), reconnect cables (with length and adapter), power up, then verification items (verify that each MIDI channel and clock source is set per `unitConfigs`). Export as Markdown/PDF; checkbox state is saved in the project.

### 5.12 Validation (rule engine)
Rules are pure functions `(ctx: SetupContext) => Issue[]`, registered in `src/engine/rules/`, each with an ID, severity, rationale and optional **fix actions**. The panel groups by severity, filters by rule family and by entity, and every issue can be **suppressed** for a setup with a stored reason.
```ts
interface Issue { ruleId: string; severity: 'error'|'warning'|'info'; entityIds: string[]; message: string; details?: Record<string, number|string>; fixes?: FixAction[] }
```
Re-evaluation is incremental (only rules that depend on changed entities).

| Rule family | IDs and conditions |
|---|---|
| **PHYS** | `PHYS-001` plug cannot mate the jack (error). `PHYS-002` mating needs an adapter (info, with suggestion). `PHYS-003` connector blocked or inaccessible: less than 80 mm free behind the unit for cable bend (warning). |
| **DIR** | `DIR-001` out→out or in→in (error). `DIR-002` two outputs into one input (error). `DIR-003` one analog output fanned to several inputs (warning, suggest a splitter or mult). `DIR-004` MIDI Out fanned out without a hub (warning). |
| **SIG** | `SIG-001` level mismatch (instrument/line/mic/headphone) (warning). `SIG-002` CV/audio domain confusion (warning). `SIG-003` balanced↔unbalanced info. `SIG-004` mono into stereo pair or stereo summed to mono (info). `SIG-005` headphone output into a line input (warning). `SIG-006` L/R continuity break (warning). `SIG-007` signal above the destination's max input level (warning). `SIG-008` phantom power concerns on unbalanced or ribbon sources if flagged (info). |
| **MIDI** | `MIDI-001` thru chain deeper than 3 hops (warning). `MIDI-002` channel collision: two destinations receive the same channel from the same source unintentionally (info; user can mark intentional). `MIDI-003` source without a MIDI out used as a source (error). `MIDI-004` TRS type A/B mismatch (error). `MIDI-005` DIN cable longer than 15 m (warning). `MIDI-006` channel number outside 1–16 (error). `MIDI-007` track→channel map: two tracks on one channel to the same device (info). |
| **CLK** | `CLK-001` more than one master in a connected clock domain (warning). `CLK-002` clock loop (error). `CLK-003` slave device with no incoming clock path (info). `CLK-004` format mismatch needing a converter, for example DIN sync 24 → 48 or Pocket-Operator sync vs. MIDI (warning, suggest a device that can convert, such as KeyStep or Pyramid, based on `ClockSpec`). `CLK-005` clock only via USB host path while the host is a tablet or computer (info). |
| **USB** | `USB-001` device-to-device without a host (error). `USB-002` bus-powered draw exceeds the host port budget (warning/error; budgets: USB 2.0 500 mA, USB 3.x 900 mA, USB-C 1.5 A default, configurable per port). `USB-003` hub depth over 5 (error). `USB-004` several USB audio devices on one host (info: separate clocks, aggregate device). `USB-005` bus-powered device behind an unpowered hub (warning). `USB-006` cable longer than 5 m for USB 2.0 (warning). |
| **PWR** | `PWR-001` supply voltage differs more than ±5% from the unit's accepted range (error). `PWR-002` polarity mismatch (error). `PWR-003` plug size mismatch (error). `PWR-004` supply current below 1.25× the unit's draw (warning) or below the draw (error). `PWR-005` mains region mismatch: 115 V-only unit on 230 V, or the reverse (error, using the setup's `mainsVoltage` and the model's `mainsRegion`). `PWR-006` strip or outlet rating exceeded (error). `PWR-007` no power assigned (warning). `PWR-008` supply shared beyond its rating (error). `PWR-009` unit powered only by an optional supply that is not provided (info). |
| **PLC** | `PLC-001` collision/overlap (error). `PLC-002` exceeds the surface bounds (warning). `PLC-003` tier load over the limit (error), over 80% (warning). `PLC-004` centre of mass unsupported: more than one third of the unit's depth is beyond the holder length (warning). `PLC-005` upper units occlude more than 15% of a lower unit's controls region or leave less than the clearance (default 90 mm hand + 30 mm holder) (warning). `PLC-006` rack depth overflow (error). `PLC-007` thermal: a hot unit directly below a sensitive unit without a gap (info). `PLC-008` cable reach: no stocked cable covers the computed length (warning). `PLC-009` slip risk: tilt over 12° without non-slip feet or VESA/strap mounting (warning). |
| **ERG** | `ERG-001` control plane outside the comfort band `[elbow−100, elbow+100]` for a primary unit (warning), outside the acceptable zone `[elbow−150, elbow+100]` (error for primary, warning for secondary). `ERG-002` row pitch below the computed minimum (warning). `ERG-003` primary unit outside the prime zone while a rare unit occupies it (warning, suggest swap). `ERG-004` display angle: line-of-sight angle over 40° below horizontal without tilt help (info). `ERG-005` lateral reach beyond ±450 mm from the body centre for a primary unit (warning). |
| **DATA** | `DATA-001` placement uses estimated or unknown dimensions (info). `DATA-002` unverified field count per unit (info). |

### 5.13 Ergonomics module
**Inputs:** `BodyProfile` (height H, optional overrides), posture, seat height, view distance (default 550 mm), clearances (default 90 mm hand, 30 mm holder), band widths (defaults ±100 mm, lower acceptable −150 mm).

**Default anthropometric model** (Drillis–Contini proportions for standing; seated values from DIN 33402-type data; all overridable):

| Landmark | Formula |
|---|---|
| Elbow, standing | 0.630·H |
| Wrist, standing | 0.485·H |
| Shoulder, standing | 0.818·H |
| Eye, standing | 0.936·H |
| Forearm+hand | 0.254·H (0.146·H + 0.108·H) |
| Seat height | 0.272·H (default 470 mm at 1730 mm) |
| Elbow, seated (above seat) | 0.139·H (≈240 mm) |
| Eye, seated (above seat) | 0.451·H (≈780 mm) |

For H = 1730 mm the defaults are: standing elbow ≈ 1090 mm, seated elbow ≈ 710 mm, standing eye ≈ 1620 mm, seated eye ≈ 1250 mm. Unit tests assert these within ±2 mm.

**Per row calculations**
- **Control plane height** = tray z + unit height (front-edge at tilt: `z + h·cosθ + (d/2)·sinθ` at mid-depth).
- **Forearm angle** = `asin(clamp((plane − elbow) / L, −1, 1))` with L the forearm+hand length.
- **Line-of-sight angle** = `atan((eye − plane) / viewDistance)`; **recommended tilt** = `clamp(LoS − 25°, 0°, 20°)`, capped at 12° for control-heavy rows.
- **Minimum row pitch** between adjacent rows (control plane to control plane) = `h_lower_tallest + handClearance + holderThickness + (h_upper − h_lower_tallest if the upper row overhangs the lower)`; for a staggered upper row with no overlap in y, the pitch reduces to the sightline-only constraint (`h_lower_tallest + 20 mm`). The overlap test uses the actual y-extents and tier offsets.
- **Lateral reach:** distance from the body centre line to the unit's centre; comfortable ±450 mm, maximum ±600 mm.
- **Comfort score** per unit (0–100) = `100 · max(0, 1 − |plane − targetPlane| / 250)`, where `targetPlane` = elbow for keys and fader units, `elbow − 50` for knob/button units, `elbow − 100` for rare, set-and-forget units. **Setup score** = usage-weighted mean (primary 3, secondary 2, rare 1).

**Optimiser:** given a setup, the assignment of units to tiers (fixed by the user), tier min/max ranges and tilt ranges, search heights on a 5 mm grid (and tilts on 2°) to maximise the setup score subject to the minimum pitch, load, and stand limits. Output: recommended tier z/tilt per tier, the resulting scores, and "apply to setup" (one undoable step). A separate **assignment advisor** proposes which units go on which row for a given set of rows using the same scoring (greedy plus swap improvement), keeping width budgets per tier (sum of unit widths plus gaps ≤ usable width).

**Overlays:** elbow line, comfort band, acceptable zone, eye line, display sightline cone, reach arcs in plan, and a **heat map** over placements coloured by comfort score.

### 5.14 Tables and reports (Tables tab)
| Table | Content |
|---|---|
| Connection matrix | Outputs (rows) × inputs (columns) per domain, filled cells for existing links, red where invalid |
| Cable list / BOM | Per connection: from/to, cable model, adapters, length (computed), stock status; grouped totals; CSV export |
| MIDI channel map | Per source, per track → channel → destination; conflict highlighting |
| MIDI/clock tree | Tree from each clock master through all sinks, with format labels and hop counts |
| USB tree | Host → hubs → devices with bus-power sums and audio device list |
| Power sheet | Per unit: supply, voltage, polarity, plug, draw typical/max, mains W total, supply load percentage; adapter label sheet (what plugs into what, printable) |
| Stand/rack summary | Tier loads, remaining capacity, row pitches, rack U used, depth, weight |
| Unverified fields | Project-wide |
| Gear sheet | One page per unit: specs, connectors table, image, provenance |

### 5.15 Import and export
- **Project JSON** (open/save), with **folder mode** assets or **embedded** assets; `schemaVersion` migrations run on open and show a diff of what changed.
- **Library bundles:** export/import selected models, stands, cables, templates.
- **Images:** PNG/SVG/PDF export of the current view at a chosen scale (for example 1:5 or 1:10, with scale bar, title block and legend; print layout A4/A3); **1:1 footprint tiles** (multi-page) to print paper templates of units and stands.
- **Data:** CSV for cable BOM, power sheet, connection matrix; Markdown summary of the setup (units, connections, issues); Graphviz DOT and Mermaid export of the signal graph; Markdown migration checklist.
- **Static snapshot:** a single read-only HTML file of a setup (embedded data and viewer) for sharing.

### 5.16 Settings, persistence, shortcuts
- **Settings:** units, decimal places, theme, palette editor, grid/snap values, animation on/off and speed, reduced motion override, label density, default clearances and ergonomic bands, default slack and loops for cable length, mains region (115/230), default body profile, autosave interval.
- **Persistence:** autosave every 5 s to IndexedDB (rolling 20 snapshots), explicit save to file, crash recovery prompt on load, dirty-state guard. File-handle permission is requested once per session.
- **Shortcuts (defaults):** `V` select, `M` move/measure, `C` connect, `A` annotate, `Space` pan, `R` rotate, `Del` delete, `Ctrl+Z/Y` undo/redo, `Ctrl+D` duplicate, `Ctrl+G` group, `\` A/B toggle, `1–4` switch view, `F` fit all, `Shift+F` fit selection, `L` toggle legend, `Ctrl+K` command palette, `?` shortcut sheet.
- **Accessibility:** full keyboard operation of lists and inspectors, focus rings, ARIA labels on canvas objects (screen-reader summary of the selection), WCAG AA contrast, patterns in addition to colours, reduced-motion support.

---

## 6. UX details

- **Empty states:** guided onboarding ("Add your first gear", "Create a setup"), sample project loader.
- **Add flow:** "Add gear → pick template or model → fill dimensions → add connectors → attach images → place". Every step is skippable; the unit appears on canvas as soon as it has dimensions (unknown dimensions placed as dashed placeholders at template defaults and flagged `DATA-001`).
- **Error handling:** schema errors on load show path, value and expected type with a "load anyway (read-only)" option; never discard data silently.
- **Undo:** every user-visible change is undoable; drags coalesce; canvas shows a toast with "Undo" for destructive actions.
- **Look and feel:** technical-drawing aesthetic, neutral background, thin lines, labelled dimension lines, scale bar, optional paper grid. Dark mode is mandatory.
- **Responsive:** desktop-first (≥1280 px); panels collapse and resize; touch gestures work on canvas but are not a design target.

---

## 7. Rendering and geometry notes

### 7.1 Rendering
SVG with a root `<g>` viewport transform; layers: grid, stands, units, cables, overlays, annotations, selection handles. Use `vector-effect: non-scaling-stroke` for all lines. Virtualise offscreen units when above 100 nodes. Hit-testing through SVG pointer events with an invisible wider stroke for cables.

### 7.2 Geometry functions (pure, `src/domain/geometry.ts`)
- Surface frame from stand state (position, rotation, tier z, tilt about the x-axis through the tier's front edge, y offset).
- Unit transform on a surface: footprint rectangle, tilted top face plane, corner coordinates in world space.
- Connector world position (face-local → world, honouring rotation, tilt and face orientation).
- Overlap tests (AABB plus rotated-rectangle SAT in plan; interval overlap in side view).
- **Occlusion:** for each pair (upper unit U, lower unit L) with overlapping x-intervals, project U's footprint along the eye-to-L line onto L's top face; the hidden fraction of `controlsRegion` is the area of the intersection divided by the region area; also report the minimum vertical gap between U's underside (tray z minus holder thickness) and L's top face.
- **Centre-of-mass support:** weight-weighted centroid in tier depth versus holder length; reports the unsupported fraction.
- **Cable path length:** 3D Manhattan between two connector positions through a configurable `via height`, plus slack and loops.

---

## 8. Seed data and templates

### 8.1 Seed catalogue
`/seed/gear/*.json` contains one model per device in `docs/studio-gear-reference.md` (sections 1–3: connectivity, dimensions and weight, power), converted by hand (not by a fragile parser) into schema-valid JSON. Requirements:
- All 29 devices listed in the reference, with connector lists matching the reference tables (including L/R groups, MIDI directions, USB roles and audio channels).
- Values marked "Not located" in the reference are `null` with provenance `unknown`; values flagged ⚠ get provenance `estimated` or a note.
- `power.sources` carry voltage, polarity and plug where the reference states them (for example the Elektron 12 V centre-positive 5.5 × 2.5 mm; NightSky 9 V centre-negative 2.1 × 5.5 mm and "max 9 V"; RD-8 MKII 18 V).
- Clock capabilities from reference section 5 (for example Analog Four: MIDI clock master, DIN sync out; Pyramid: master with DIN sync on Out B; KeyStep: sync formats).
- `internalPaths` for processors, mixers, interfaces and hubs where the reference gives enough detail (Heat, Ultrafex, Vitalizer, dbx, Composer, MixWizard, SSL 12, ADA8200, mioXL, PX3000).
- A `scripts/seed-validate` command validates every seed file against the schema and reports missing connector positions (positions are filled later using images).
- Stand models: Jaspers 3D-145B (Appendix D), a generic rack (N U), a desk, and a Eurorack-format stand for the Neutron / Pro-800 / 2-XM.
- A sample project `seed/studio.sample.json` containing all units, the stands, a "Current" setup and a "Planned (standing)" setup with at least one real tier assignment (middle: Octatrack, Analog Four, KeyStep; top: Digitone II, iPad, Analog Heat; bottom: RD-8 MKII) and a representative cable set.

### 8.2 Built-in cables and adapters
Ship with: ¼" TS/TRS, XLR M-F, 3.5 mm TS/TRS, 3.5 mm↔¼" adapters, TRS-to-2×TS Y-insert, MIDI DIN 5 (lengths 0.3–15 m), 3.5 mm TRS-A to DIN-5 MIDI adapter, 3.5 mm TRS-B variant, USB-A↔B/C/micro/mini, USB-C↔C, TOSLINK, Ethernet, DC barrel extension, IEC C13. Each with stocked lengths (editable).

---

## 9. Quality, security and privacy
- No network calls at runtime other than loading the app's own static assets. No analytics. Fonts self-hosted. A CSP header recommendation is included in the README.
- JSON inputs are validated before use; image decoding runs on `createImageBitmap` with size limits (100 MP) to avoid memory exhaustion.
- File writes are atomic: write to a temp handle, then replace.
- Browser support: current Chromium (full File System Access API), Firefox and Safari (download/upload fallback, IndexedDB autosave).
- Language: English UI, ISO dates, metric default; all strings through a thin `t()` helper to allow German later.

---

## 10. Testing strategy
- **Unit (Vitest):** units conversion; HP/RU maths; face-coordinate mirror rule; ergonomic defaults for H = 1730 (elbow 1090, seated 710, eye 1620, 1250 ± 2 mm); tray height for a 63 mm unit at plane 1000 = 937 mm; forearm angles at the reference rows (+13°, −12°, −41° standing); minimum pitch with overhang for 63 mm and 82 mm lower units (≈ 184 and 202 mm; accept ±2 mm); occlusion fractions on constructed fixtures; every rule with a passing and a failing fixture; cable suggestion and length; schema round trip (load → save → byte-identical); migrations.
- **Property tests:** random placements never produce NaN; undo/redo restores identical state; connection directions are never stored.
- **Golden tests:** rendered SVG snapshots of three reference setups (hash of SVG text).
- **E2E (Playwright):** the acceptance scenarios in section 11, plus keyboard-only navigation of the library and inspector.
- **CI:** lint, type-check, unit, e2e (headless Chromium), schema generation drift check, seed validation.

---

## 11. Acceptance scenarios (end-to-end)
1. **Register gear from a template.** Create a model from "Desktop effect (stereo)", set 215 × 184 × 63 mm and 1.5 kg, add stereo ¼" in/out pair, MIDI DIN In/Out/Thru and a USB-B device port with audio 2 in / 2 out; attach a front image, rectify it, place the connectors on it; save; reload; everything is identical.
2. **Stand with tiers.** Instantiate the Jaspers 3D-145B; set tier z to 800 / 1000 / 1190 mm planes (tray = plane − unit height); place Octatrack, Analog Four and KeyStep on the middle tier and Digitone II and iPad on the top; the app reports width budget, load per tier, row pitch, and an occlusion percentage; moving the top tier up by 20 mm clears the occlusion warning.
3. **Wiring with L/R and MIDI.** Connect Digitone II Main L/R to two MixWizard channels (Shift-drag creates both); connect Octatrack MIDI Out to Analog Four MIDI In on channel 3 and to Digitone II via Thru; the cables show L/R badges, channel badges, and arrowheads; animation shows flow from source to destination.
4. **Rule detection.** Connect an output to an output (error `DIR-001`), plug an NightSky 9 V supply label into an Elektron input (error `PWR-001` and `PWR-002`), place a 115 V-only unit with mains set to 230 V (error `PWR-005`), connect two USB audio devices to one iPad port (info `USB-004`).
5. **Variants.** Clone "Current" to "Standing plan", move gear, change tier heights, re-wire; compare shows layout and connection diffs; the migration checklist lists disconnect, move, adjust, reconnect steps in order; export to Markdown.
6. **Signal trace.** Select the Octatrack Main L output; hover trace highlights the full path to the monitors, with a breadcrumb; the "where does it end" list shows monitor L; a deliberate L→R swap triggers `SIG-006`.
7. **Clock tree.** Set the Pyramid as master; the clock tree shows MIDI clock to Elektron units and DIN sync to the RD-8 where wired; adding a second master raises `CLK-001`.
8. **Ergonomics.** With H = 1730 mm standing, the optimiser proposes planes near 1190 / 1000 / 800 mm for top / middle / bottom given the standing assignment; switching to seated moves them to about 880 / 690 / 490 mm and raises `ERG-001` on the top row for a primary unit.
9. **Reports.** Export a 1:10 PDF of front elevation plus connection table plus cable BOM; export 1:1 footprint tiles; export CSV.
10. **Robustness.** Open a file with an unknown future `schemaVersion` (read-only warning), a file with a missing asset (placeholder), and a file with a malformed connector (clear error with path).

---

## 12. Milestones and definition of done

| # | Milestone | Deliverables | Done when |
|---|---|---|---|
| M0 | Scaffold | Vite + TS strict, lint, CI, test setup, repo layout, ADR template | CI green on an empty app shell |
| M1 | Domain and persistence | Types, Zod, JSON Schema, units, geometry basics, migrations, store with undo/redo, file open/save, autosave, round-trip test | Schema round-trip golden test passes |
| M2 | Library and gear editor | Inventory/Library UI, templates, gear editor forms, provenance, connector table, unverified list, seed ingestion (all gear) | Seed validates; scenario 1 minus images passes |
| M3 | Images and face canvas | Import, WebP encode, rectification, calibration, connector placement, fallback rendering | Scenario 1 passes fully |
| M4 | Stands and layout | Stand editor, tiered stand generator, elevation/side/plan views, snapping, collisions, load, occlusion | Scenario 2 passes |
| M5 | Patch canvas and connections | Patch view, ELK layout, connect tool, cable engine, visual markings, legend, filters | Scenario 3 passes |
| M6 | Rule engine | All `PHYS/DIR/SIG/MIDI/PWR/USB/PLC/DATA` rules plus issues panel, suppression | Scenario 4 passes |
| M7 | Flow, clock and trees | Animation, tracing, channel continuity, clock/USB/power trees, CLK rules | Scenarios 6 and 7 pass |
| M8 | Variants | Clone/derive, A/B, compare, migration checklist | Scenario 5 passes |
| M9 | Ergonomics | Body profile, overlays, scores, optimiser, assignment advisor, ERG rules | Scenario 8 passes |
| M10 | Reports and polish | Tables, exports (PDF/PNG/SVG/CSV/MD/DOT/Mermaid/HTML snapshot), settings, shortcuts, accessibility pass, sample project, README | Scenarios 9 and 10 pass |
| M11 | Stretch (optional) | Rooms and outlets, 3D view (three.js with tilt and textured faces), Web MIDI live mode (light up cables on real traffic), German UI | Not required for acceptance |

---

## Appendix A. Jack, plug and mating tables

**Jack types** (receptacles on gear): `jack-6.35-TS`, `jack-6.35-TRS`, `jack-3.5-TS`, `jack-3.5-TRS`, `xlr-f`, `xlr-m`, `combo-xlr-trs`, `din5-f`, `rca-f`, `toslink-f`, `bnc-f`, `usb-a-f`, `usb-b-f`, `usb-c-f`, `usb-micro-b-f`, `usb-mini-b-f`, `rj45`, `dc-barrel-<od>x<id>`, `iec-c14`, `speakon`.

**Mating (plug → jack)** (the engine implements a table; the most common entries):

| Plug | Mates with |
|---|---|
| TS-6.35 | `jack-6.35-TS`, `jack-6.35-TRS` (unbalanced), `combo-xlr-trs` |
| TRS-6.35 | `jack-6.35-TRS`, `jack-6.35-TS` (balanced collapses to unbalanced; info), `combo-xlr-trs` |
| TS-3.5 / TRS-3.5 | `jack-3.5-TS`, `jack-3.5-TRS` (TRS-A vs TRS-B must match for MIDI) |
| XLR-M | `xlr-f`, `combo-xlr-trs` |
| XLR-F | `xlr-m` |
| DIN5-M | `din5-f` |
| USB-A | `usb-a-f` (host side) |
| USB-B / USB-C / micro / mini | the matching device jack |
| DC-barrel | `dc-barrel-<od>x<id>` only if OD and ID both match (polarity checked separately) |
| IEC-C13 | `iec-c14` |
| Y-insert (TRS to 2×TS) | `jack-6.35-TRS` insert jacks |

Mismatches produce `PHYS-001` or `PHYS-002` with an adapter suggestion if the library has one.

## Appendix B. Signal domain and direction compatibility

An `out` may connect to an `in` of the same domain family. `thru` behaves as `out` for MIDI. `bidir` connects only to `bidir` (USB data, Ethernet). Domain families: audio.* (analog, headphone, usb), midi.* (din, trs-a/b, usb, ble, network), clock.* (pulse, dinsync, word), cv/gate, power.*. Cross-family links (CV into audio, audio into clock) are allowed but raise `SIG-002`.

## Appendix C. Formulas (reference)
```
tray_z            = plane_z − unit_height
plane_z (tilted)  = tray_z + h·cosθ + (d/2)·sinθ
forearm_angle     = asin(clamp((plane_z − elbow)/L, −1, 1)),  L = 0.254·H
los_angle         = atan((eye − plane_z)/viewDistance)
tilt_rec          = clamp(los_angle − 25°, 0°, 20°),  cap 12° for control-heavy rows
min_pitch_overhang = h_lower_tallest + clearance_hand + holder_thickness + (h_upper − h_lower_tallest)
min_pitch_staggered = h_lower_tallest + 20 mm
cable_length      = ceil_to_stock( manhattan3D·(1 + slack) + 2·service_loop )
usb_budget        = Σ drawsBusPowerMa  ≤  port.suppliesBusPowerMa
psu_ok            = supply.V within [voltMin, voltMax] ∧ polarity ∧ plug ∧ supply.mA ≥ 1.25·draw.mA
```

## Appendix D. Seed example: Jaspers 3D-145B (stand model)
```json
{
  "id": "stand-jaspers-3d-145b", "manufacturer": "Jaspers", "name": "3D-145B", "type": "tiered-keyboard-stand",
  "dimensions": { "w": 1550, "d": 700, "h": 1400, "innerSpanMm": 1450, "weightKg": null },
  "surfaces": [
    { "id": "tier-bottom", "label": "Bottom tier (reinforced)", "kind": "tier",
      "usable": { "w": 1450, "d": 600 }, "anchor": { "x": 0, "y": 0, "z": 400 },
      "adjustable": { "z": { "min": 300, "max": 1400, "step": 5 }, "tiltDeg": { "min": 0, "max": 30, "step": 1 } },
      "holders": { "lengthMm": 600, "thicknessMm": 30, "pairMinSpacingMm": 150, "protrusionAdjustable": false },
      "loadKg": 40 },
    { "id": "tier-middle", "label": "Middle tier", "kind": "tier",
      "usable": { "w": 1450, "d": 400 }, "anchor": { "x": 0, "y": 0, "z": 800 },
      "adjustable": { "z": { "min": 300, "max": 1400, "step": 5 }, "tiltDeg": { "min": 0, "max": 30, "step": 1 }, "y": { "min": -300, "max": 300, "step": 5 } },
      "holders": { "lengthMm": 400, "thicknessMm": 30, "pairMinSpacingMm": 150, "protrusionAdjustable": false },
      "loadKg": 15 },
    { "id": "tier-top", "label": "Top tier", "kind": "tier",
      "usable": { "w": 1450, "d": 400 }, "anchor": { "x": 0, "y": 0, "z": 1100 },
      "adjustable": { "z": { "min": 300, "max": 1400, "step": 5 }, "tiltDeg": { "min": 0, "max": 30, "step": 1 }, "y": { "min": -300, "max": 300, "step": 5 } },
      "holders": { "lengthMm": 400, "thicknessMm": 30, "pairMinSpacingMm": 150, "protrusionAdjustable": false },
      "loadKg": 15 }
  ],
  "provenance": {
    "dimensions.w": { "kind": "retailer", "url": "https://www.musicstore.de/en_DE/EUR/Jaspers-3D-145B/art-KEY0003689-000" },
    "surfaces.0.adjustable.z": { "kind": "estimated", "note": "Retailer lists max height 140 cm only; measure the real stand." },
    "surfaces.1.adjustable.y": { "kind": "unknown", "note": "Tier depth offsets (A-frame geometry) not published; measure." }
  }
}
```
Notes: holder lengths and load limits are from retailer specs; all heights, tilt ranges and depth offsets are placeholders until measured.

## Appendix E. Seed example: Digitone II (gear model, abridged)
```json
{
  "id": "gear-elektron-digitone-ii", "manufacturer": "Elektron", "name": "Digitone II", "category": "synth", "formFactor": "desktop",
  "dimensions": { "w": 215, "d": 176, "h": 63, "weightKg": 1.48, "heightIncludesKnobsFeet": true },
  "mounting": { "vesa": 100 },
  "connectors": [
    { "id": "out-main-l", "label": "Main L", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "audio.analog", "direction": "out", "jack": "jack-6.35-TRS",
      "signal": { "balance": "imp-balanced", "level": "line" }, "channel": { "role": "L", "group": "main" } },
    { "id": "out-main-r", "label": "Main R", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "audio.analog", "direction": "out", "jack": "jack-6.35-TRS",
      "signal": { "balance": "imp-balanced", "level": "line" }, "channel": { "role": "R", "group": "main" } },
    { "id": "in-l", "label": "In L", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "audio.analog", "direction": "in", "jack": "jack-6.35-TRS", "signal": { "balance": "balanced", "level": "line" }, "channel": { "role": "L", "group": "in" } },
    { "id": "in-r", "label": "In R", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "audio.analog", "direction": "in", "jack": "jack-6.35-TRS", "signal": { "balance": "balanced", "level": "line" }, "channel": { "role": "R", "group": "in" } },
    { "id": "phones", "label": "Headphones", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "audio.headphone", "direction": "out", "jack": "jack-6.35-TRS" },
    { "id": "midi-in", "label": "MIDI In", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "midi.din", "direction": "in", "jack": "din5-f", "midi": { "carries": ["notes","cc","pc","clock","transport","sysex"] } },
    { "id": "midi-out", "label": "MIDI Out", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "midi.din", "direction": "out", "jack": "din5-f", "midi": { "carries": ["notes","cc","pc","clock","transport","sysex"] },
      "clock": { "format": "dinsync24", "canMaster": true, "note": "DIN sync on Out" } },
    { "id": "midi-thru", "label": "MIDI Thru", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "midi.din", "direction": "thru", "jack": "din5-f", "midi": { "carries": ["notes","cc","pc","clock","transport","sysex"], "thruMode": "hard" } },
    { "id": "usb", "label": "USB", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "usb.data", "direction": "bidir", "jack": "usb-b-f",
      "usb": { "role": "device", "version": "2.0", "carries": ["midi","audio","firmware"], "busPowered": false,
               "audio": { "inChannels": 2, "outChannels": 2, "compliance": "overbridge" } } },
    { "id": "dc-in", "label": "DC In", "face": "back", "pos": { "x": 0, "y": 0 }, "domain": "power.dc", "direction": "in", "jack": "dc-barrel-5.5x2.5" }
  ],
  "power": { "sources": [ { "kind": "external-dc", "inputConnectorId": "dc-in", "nominalV": 12, "drawMa": 1000,
      "plug": { "type": "barrel", "odMm": 5.5, "idMm": 2.5, "polarity": "center-positive" }, "included": true } ], "mainsRegion": "unknown" },
  "ergonomics": { "interaction": "knobs-buttons", "defaultUsage": "primary", "needsDisplayVisibility": true },
  "provenance": { "dimensions.w": { "kind": "manufacturer" }, "connectors.0.pos": { "kind": "unknown", "note": "Place on a back-panel image." } }
}
```
Connector positions are zero placeholders; the seed validator lists them for later placement. Overbridge audio channel counts beyond 2 are not modelled in the seed.

## Appendix F. Rule engine skeleton
```ts
export interface SetupContext { project: Project; setup: Setup; graph: SignalGraph; geometry: GeometryCache; body: BodyProfile }
export type Rule = { id: string; family: string; severity: Issue['severity']; dependsOn: ('placements'|'connections'|'stands'|'unitConfigs'|'body')[]; run(ctx: SetupContext): Issue[] };
export const rules: Rule[] = [ /* PHYS-001 … */ ];
export function runRules(ctx: SetupContext, changed?: Set<string>): Issue[] { /* filters by dependsOn when changed given; applies suppressions */ }
```
`SignalGraph` is a directed multigraph: nodes are `(unitId, connectorId)`; edges are connections (out → in) and internal paths (in → out, active per `UnitConfig.routingPresetId`). Provide `upstream`, `downstream`, `domainSubgraph`, `findCycles`, `clockDomains`, `usbTree`.

## Appendix G. Default palette
| Meaning | Hex |
|---|---|
| Audio mono | `#374151` |
| Audio L | `#2563EB` |
| Audio R | `#DC2626` |
| MIDI | `#16A34A` |
| USB | `#7C3AED` |
| CV/Gate | `#EA580C` |
| Clock | `#C026D3` |
| Digital audio (ADAT/S/PDIF) | `#0D9488` |
| Power | `#6B7280` |
| Expression/footswitch | `#92400E` |
| Error / warning / info | `#B91C1C` / `#B45309` / `#1D4ED8` |
MIDI channel colours: a 16-step categorical, colour-blind-safe palette (for example Okabe-Ito extended), plus text badge; omni uses diagonal stripes.

## Appendix H. Glossary
Control plane: top face of a unit where the hands operate. Tray: the surface the unit rests on (holder pair top). Pitch: vertical distance between control planes of adjacent rows. Overhang: part of an upper-tier unit projecting over a lower one. Thru: MIDI port that repeats the incoming stream. DIN sync: 5-pin analog clock at 24 or 48 pulses per quarter note. Class-compliant: works with the OS driver without a vendor driver.

## Appendix I. Assumptions and open items (record decisions in `docs/decisions.md`)
1. Tier depth offsets of the Jaspers are unknown; occlusion and pitch calculations use the entered offsets and show a banner while they are `unknown`.
2. Connector positions for seed devices start as placeholders; the user adds them on back-panel photos.
3. The default ergonomic model targets standing and seated players of any height; it is a heuristic, not medical advice, and all constants are editable.
4. Hand-clearance and holder-thickness defaults (90 mm, 30 mm) are the author's estimates; expose them prominently.
5. USB bus-power budgets are the USB specification's nominal values; actual host ports vary (an iPad's output is unverified).
6. The 2-XM USB audio capability is disputed between retailers; model it as `unknown`.
