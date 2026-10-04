// Zod schemas for the project file (spec §4). These are the single source of truth:
// `types.ts` re-exports the inferred types and `scripts/schema-gen.ts` emits JSON Schema from them.
// Names are normative; do not rename fields.
import { z } from 'zod';

// ---------- primitives ----------

export const Id = z.string().min(1);
export const IsoDate = z.string();
export const Point = z.object({ x: z.number(), y: z.number() });
export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export const Polyline = z.array(Point);
/** Nullable number: `null` means unknown (pair with provenance `unknown`). */
const nnum = z.number().nullable();

export const ProvenanceKind = z.enum([
  'manufacturer',
  'datasheet',
  'retailer',
  'measured',
  'estimated',
  'user',
  'unknown',
]);
export const Provenance = z.object({
  kind: ProvenanceKind,
  url: z.string().optional(),
  retrieved: IsoDate.optional(),
  note: z.string().optional(),
});
export const ProvenanceMap = z.record(z.string(), Provenance);
export const Source = z.object({ label: z.string(), url: z.string().optional(), retrieved: IsoDate.optional() });

export const AssetRef = z.object({ id: Id });

// ---------- gear ----------

export const GearCategory = z.enum([
  'synth', 'drum-machine', 'sampler', 'sequencer', 'controller', 'effect', 'dynamics', 'mixer',
  'interface', 'converter', 'midi-hub', 'patchbay', 'eurorack-case', 'power', 'computer', 'tablet', 'monitor-speaker',
  'headphones', 'microphone', 'accessory', 'other',
]); // prettier-ignore
export const FormFactor = z.enum([
  'desktop',
  'keyboard',
  'rack',
  'pedal',
  'eurorack',
  'handheld',
  'tablet',
  'speaker',
  'other',
]);
export const FaceId = z.enum(['top', 'front', 'back', 'left', 'right', 'bottom']);

export const SignalDomain = z.enum([
  'audio.analog', 'audio.headphone', 'audio.adat', 'audio.spdif', 'audio.aes', 'audio.usb',
  'midi.din', 'midi.trs-a', 'midi.trs-b', 'midi.usb', 'midi.ble', 'midi.network',
  'cv', 'gate', 'clock.pulse', 'clock.dinsync', 'clock.word',
  'expression', 'footswitch', 'usb.data', 'ethernet', 'power.dc', 'power.ac', 'power.usb', 'other',
]); // prettier-ignore
export const Direction = z.enum(['in', 'out', 'thru', 'bidir']);

/** Receptacle on the gear (Appendix A). DC barrels encode their size: `dc-barrel-5.5x2.5`. */
export const FixedJackType = z.enum([
  'jack-6.35-TS', 'jack-6.35-TRS', 'jack-3.5-TS', 'jack-3.5-TRS', 'xlr-f', 'xlr-m', 'combo-xlr-trs', 'din5-f',
  'rca-f', 'toslink-f', 'bnc-f', 'usb-a-f', 'usb-b-f', 'usb-c-f', 'usb-micro-b-f', 'usb-mini-b-f', 'rj45',
  'iec-c14', 'speakon',
]); // prettier-ignore
export const DcBarrelJackType = z.templateLiteral(['dc-barrel-', z.number(), 'x', z.number()]);
export const JackType = z.union([FixedJackType, DcBarrelJackType]);

export const PlugType = z.enum([
  'TS-6.35', 'TRS-6.35', 'TS-3.5', 'TRS-3.5', 'XLR-M', 'XLR-F', 'DIN5-M', 'RCA-M', 'TOSLINK', 'BNC',
  'USB-A', 'USB-B', 'USB-C', 'USB-micro-B', 'USB-mini-B', 'RJ45', 'DC-barrel', 'IEC-C13', 'Y-insert',
]); // prettier-ignore

export const Polarity = z.enum(['center-positive', 'center-negative']);
export const PowerPlug = z.discriminatedUnion('type', [
  z.object({ type: z.literal('barrel'), odMm: z.number(), idMm: z.number(), polarity: Polarity }),
  z.object({ type: z.literal('iec-c14') }),
  z.object({ type: z.literal('usb') }),
  z.object({ type: z.literal('other'), note: z.string() }),
]);

export const SignalLevel = z.enum([
  'mic', 'line', 'instrument', 'hi-z', '+4dBu', '-10dBV', 'speaker', 'headphone', 'eurorack-audio',
  'cv-1v-oct', 'cv-unipolar', 'cv-bipolar', 'gate-5v', 'gate-12v',
]); // prettier-ignore
export const MidiCarry = z.enum(['notes', 'cc', 'pc', 'sysex', 'clock', 'transport', 'mtc', 'aftertouch']);
export const UsbVersion = z.enum(['1.1', '2.0', '3.0', '3.1', '3.2', '4', 'unknown']);

export const Connector = z.object({
  id: Id,
  label: z.string(),
  face: FaceId,
  pos: Point,
  domain: SignalDomain,
  direction: Direction,
  jack: JackType,
  signal: z
    .object({
      balance: z.enum(['balanced', 'imp-balanced', 'unbalanced', 'n/a']),
      level: SignalLevel.optional(),
      maxDbu: z.number().optional(),
      impedanceOhm: z.number().optional(),
      phantom: z.enum(['none', 'switchable', 'always']).optional(),
    })
    .optional(),
  channel: z
    .object({
      role: z.enum(['mono', 'L', 'R', 'numbered']),
      group: z.string().optional(),
      index: z.number().int().optional(),
      bus: z.string().optional(),
    })
    .optional(),
  midi: z
    .object({
      carries: z.array(MidiCarry),
      thruMode: z.enum(['hard', 'soft', 'switchable-with-out', 'none']).optional(),
      trsType: z.enum(['A', 'B']).optional(),
    })
    .optional(),
  usb: z
    .object({
      role: z.enum(['host', 'device', 'otg']),
      version: UsbVersion,
      carries: z.array(z.enum(['midi', 'audio', 'data', 'power', 'firmware'])),
      audio: z
        .object({
          inChannels: z.number().int(),
          outChannels: z.number().int(),
          compliance: z.enum(['class-compliant', 'driver-required', 'overbridge', 'unknown']),
          maxRateHz: z.number().optional(),
        })
        .optional(),
      drawsBusPowerMa: nnum.optional(),
      suppliesBusPowerMa: nnum.optional(),
      busPowered: z.boolean().optional(),
    })
    .optional(),
  clock: z
    .object({
      format: z.enum(['midi', 'dinsync24', 'dinsync48', 'pulse', 'word', 'adat']),
      ppqn: z.number().optional(),
      canMaster: z.boolean().optional(),
      canSlave: z.boolean().optional(),
      note: z.string().optional(),
    })
    .optional(),
  cv: z.object({ standard: z.string(), rangeV: z.tuple([z.number(), z.number()]).optional() }).optional(),
  /** Output rating for PSUs, strips and hubs (spec §4.5). */
  psu: z
    .object({
      voltage: nnum,
      currentMaMax: nnum,
      plug: PowerPlug.optional(),
      polarity: Polarity.optional(),
    })
    .optional(),
  alternates: z
    .array(
      z.object({
        id: Id,
        label: z.string(),
        domain: SignalDomain.optional(),
        direction: Direction.optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  exclusiveWith: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const InternalPath = z.object({
  id: Id,
  from: z.array(z.string()),
  to: z.array(z.string()),
  mode: z.enum(['passthrough', 'process', 'sum', 'split', 'host-bridge', 'insert-normal']),
  condition: z.string().optional(),
  channelMap: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  presetId: z.string().optional(),
});

export const PowerSource = z.object({
  kind: z.enum(['external-dc', 'internal-mains', 'usb-bus', 'battery', 'eurorack-bus', 'optional-dc']),
  inputConnectorId: z.string().optional(),
  nominalV: z.number().optional(),
  voltageMinV: z.number().optional(),
  voltageMaxV: z.number().optional(),
  drawMa: nnum.optional(),
  peakMa: nnum.optional(),
  plug: PowerPlug.optional(),
  included: z.boolean(),
  suppliedModelId: z.string().optional(),
  maxVoltageNote: z.string().optional(),
});
export const MainsRegion = z.enum(['selectable', 'auto-100-240', '115-only', '230-only', 'unknown']);
export const PowerSpec = z.object({
  sources: z.array(PowerSource),
  typicalW: nnum.optional(),
  maxW: nnum.optional(),
  inrushNote: z.string().optional(),
  mainsRegion: MainsRegion.optional(),
});

export const MidiSpec = z.object({
  channelsRx: z.union([z.array(z.number().int()), z.literal('omni'), z.literal('per-track')]).optional(),
  tracks: z.array(z.object({ id: Id, label: z.string(), defaultChannel: z.number().int().optional() })).optional(),
  maxThruChain: z.number().int().optional(),
  clockOut: z.boolean().optional(),
  clockIn: z.boolean().optional(),
  notes: z.string().optional(),
});
export const ClockFormat = z.enum([
  'midi', 'dinsync24', 'dinsync48', 'pulse-1ppqn', 'pulse-2ppqn', 'pulse-24ppqn', 'pulse-48ppqn', 'adat', 'word',
]); // prettier-ignore
export const ClockSpec = z.object({
  canBeMaster: z.boolean(),
  canBeSlave: z.boolean(),
  formats: z.array(ClockFormat),
  notes: z.string().optional(),
});

export const FaceDims = z.object({ widthMm: z.number(), heightMm: z.number() });
export const ImageCalibration = z.object({
  pxPerMm: z.number(),
  cropRect: Rect.optional(),
  rectified: z.boolean().optional(),
});
export const Interaction = z.enum(['keys', 'knobs-buttons', 'pads', 'touch', 'fader', 'footswitch', 'set-and-forget']);
export const Usage = z.enum(['primary', 'secondary', 'rare']);

export const GearModel = z.object({
  id: Id,
  manufacturer: z.string(),
  name: z.string(),
  variant: z.string().optional(),
  aliases: z.array(z.string()),
  category: GearCategory,
  formFactor: FormFactor,
  tags: z.array(z.string()),
  dimensions: z.object({
    w: nnum,
    d: nnum,
    h: nnum,
    weightKg: nnum,
    rack: z.object({ u: z.number(), earsIncluded: z.boolean(), depthBehindEarsMm: z.number().optional() }).optional(),
    eurorack: z.object({ hp: z.number(), depthMm: z.number().optional() }).optional(),
    keyboard: z
      .object({ keys: z.number().int(), keyType: z.enum(['slim', 'mini', 'full', 'semi-weighted', 'weighted']) })
      .optional(),
    heightIncludesKnobsFeet: z.boolean(),
  }),
  mounting: z.object({
    vesa: z.union([z.literal(75), z.literal(100)]).optional(),
    rackEars: z.boolean().optional(),
    pegs: z.string().optional(),
    slipRiskNote: z.string().optional(),
    nonSlipFeet: z.boolean().optional(),
  }),
  controlsRegion: Rect.optional(),
  faces: z.partialRecord(FaceId, FaceDims),
  connectors: z.array(Connector),
  internalPaths: z.array(InternalPath),
  power: PowerSpec,
  midi: MidiSpec.optional(),
  clock: ClockSpec.optional(),
  audio: z
    .object({
      sampleRatesHz: z.array(z.number()).optional(),
      bitDepths: z.array(z.number()).optional(),
      adatMaxHzNote: z.string().optional(),
    })
    .optional(),
  ergonomics: z.object({ interaction: Interaction, defaultUsage: Usage, needsDisplayVisibility: z.boolean() }),
  images: z.partialRecord(z.enum([...FaceId.options, 'photo']), AssetRef),
  imageCalibration: z.partialRecord(FaceId, ImageCalibration).optional(),
  notes: z.string(),
  sources: z.array(Source),
  provenance: ProvenanceMap,
  createdFromTemplateId: z.string().optional(),
});

// ---------- stands ----------

export const StandType = z.enum([
  'tiered-keyboard-stand', 'desk', 'rack', 'eurorack-case', 'shelf', 'pedalboard', 'floor', 'custom',
]); // prettier-ignore
const Range = z.object({ min: z.number(), max: z.number(), step: z.number() });
export const SurfaceDef = z.object({
  id: Id,
  label: z.string(),
  kind: z.enum(['tier', 'desktop', 'rack-bay', 'shelf', 'floor', 'rail']),
  usable: z.object({ w: z.number(), d: z.number() }),
  anchor: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  adjustable: z.object({ z: Range.optional(), tiltDeg: Range.optional(), y: Range.optional() }),
  holders: z
    .object({
      lengthMm: z.number(),
      thicknessMm: z.number(),
      pairMinSpacingMm: z.number(),
      protrusionAdjustable: z.boolean(),
    })
    .optional(),
  loadKg: nnum,
  lipFrontMm: z.number().optional(),
  rack: z.object({ u: z.number().int(), innerWidthMm: z.literal(450), depthMm: z.number() }).optional(),
});
export const StandModel = z.object({
  id: Id,
  manufacturer: z.string(),
  name: z.string(),
  type: StandType,
  dimensions: z.object({
    w: nnum,
    d: nnum,
    h: nnum,
    innerSpanMm: nnum.optional(),
    weightKg: nnum.optional(),
  }),
  surfaces: z.array(SurfaceDef),
  structure: z
    .object({
      poleDiameterMm: z.number(),
      legSpreadMm: z.number().optional(),
      frameLines: z.array(Polyline).optional(),
    })
    .optional(),
  images: z.partialRecord(z.enum(['front', 'side', 'top', 'photo']), AssetRef),
  notes: z.string(),
  sources: z.array(Source),
  provenance: ProvenanceMap,
});

// ---------- cables ----------

export const CableModel = z.object({
  id: Id,
  name: z.string(),
  kind: z.enum(['cable', 'adapter']),
  endA: PlugType,
  endB: PlugType,
  carries: z.array(SignalDomain),
  balanced: z.boolean().optional(),
  lengthsMm: z.array(z.number()),
  maxLengthMm: z.number().optional(),
  swap: z.enum(['none', 'tip-ring-for-L-R', 'trs-a-to-b']).optional(),
  notes: z.string().optional(),
  provenance: ProvenanceMap.optional(),
});

// ---------- templates ----------

export const TemplateParam = z.object({
  key: z.string(),
  label: z.string(),
  default: z.number(),
  unit: z.string().optional(),
});
export const Template = z.object({
  id: Id,
  name: z.string(),
  group: z.string(),
  target: z.enum(['gear', 'stand', 'connectors']),
  description: z.string().optional(),
  params: z.array(TemplateParam).optional(),
  gear: GearModel.partial().optional(),
  stand: StandModel.partial().optional(),
  connectors: z.array(Connector).optional(),
});

// ---------- inventory ----------

export const GearUnit = z.object({
  id: Id,
  modelId: Id,
  nickname: z.string(),
  serial: z.string().optional(),
  purchaseDate: IsoDate.optional(),
  notes: z.string().optional(),
  /** Per-unit overrides of model fields, keyed by dotted path (e.g. `dimensions.h`). */
  overrides: z.record(z.string(), z.unknown()).optional(),
});
export const StandUnit = z.object({ id: Id, modelId: Id, nickname: z.string(), notes: z.string().optional() });
export const CableUnit = z.object({
  id: Id,
  modelId: Id,
  lengthMm: z.number(),
  label: z.string().optional(),
  inStock: z.boolean(),
});
export const Room = z.object({
  id: Id,
  name: z.string(),
  w: z.number(),
  d: z.number(),
  h: z.number().optional(),
  notes: z.string().optional(),
});

// ---------- body ----------

export const BodyProfile = z.object({
  id: Id,
  name: z.string(),
  heightMm: z.number(),
  overrides: z
    .object({
      elbowStandingMm: z.number(),
      elbowSeatedAboveSeatMm: z.number(),
      eyeStandingMm: z.number(),
      eyeSeatedAboveSeatMm: z.number(),
      shoulderStandingMm: z.number(),
      seatHeightMm: z.number(),
      forearmHandMm: z.number(),
    })
    .partial()
    .optional(),
  handedness: z.enum(['right', 'left']),
});

// ---------- setups ----------

export const Rotation = z.literal([0, 90, 180, 270]);

export const StandState = z.object({
  standUnitId: Id,
  pos: Point,
  rotationDeg: Rotation,
  surfaceStates: z.record(
    z.string(),
    z.object({ z: z.number().optional(), tiltDeg: z.number().optional(), y: z.number().optional() }),
  ),
});

export const Mount = z.discriminatedUnion('type', [
  z.object({ type: z.literal('surface'), standUnitId: Id, surfaceId: Id, x: z.number(), y: z.number() }),
  z.object({ type: z.literal('rack'), standUnitId: Id, surfaceId: Id, uStart: z.number() }),
  z.object({ type: z.literal('stacked'), parentUnitId: Id, x: z.number(), y: z.number() }),
  z.object({ type: z.literal('floor'), pos: Point, z: z.number().optional() }),
]);

export const Placement = z.object({
  unitId: Id,
  mount: Mount,
  rotationDeg: Rotation,
  locked: z.boolean(),
  zIndex: z.number(),
  groupId: z.string().optional(),
});

const Endpoint = z.object({ unitId: Id, connectorId: z.string() });
export const MidiPurpose = z.enum(['notes', 'clock', 'transport', 'cc', 'pc', 'sysex']);
export const Connection = z.object({
  id: Id,
  a: Endpoint,
  b: Endpoint,
  bundleId: z.string().optional(),
  cable: z.object({
    modelId: z.string().optional(),
    lengthMm: z.number().optional(),
    adapters: z.array(z.string()),
    autoLength: z.boolean(),
  }),
  mapping: z.array(z.object({ fromChannel: z.string(), toChannel: z.string() })).optional(),
  midi: z
    .object({
      channels: z.union([z.array(z.number().int()), z.literal('omni'), z.literal('per-track')]),
      purposes: z.array(MidiPurpose),
      trackMap: z.array(z.object({ fromTrack: z.string().optional(), toChannel: z.number().int() })).optional(),
    })
    .optional(),
  usb: z.object({ hostUnitId: Id }).optional(),
  label: z.string().optional(),
  color: z.string().optional(),
  waypoints: z.array(Point).optional(),
  enabled: z.boolean(),
  notes: z.string().optional(),
});

export const UnitConfig = z.object({
  activeAlternates: z.record(z.string(), z.string()),
  routingPresetId: z.string().optional(),
  clockSource: z.union([z.literal('internal'), z.object({ connectorId: z.string() })]).optional(),
  clockMaster: z.boolean().optional(),
  midiRxChannel: z.record(z.string(), z.number().int()).optional(),
  midiTxChannel: z.record(z.string(), z.number().int()).optional(),
  usbMode: z.string().optional(),
  mainsVoltage: z.literal([115, 230]).optional(),
  powerAssignments: z.array(z.object({ connectorId: z.string(), supplyUnitId: Id, supplyConnectorId: z.string() })),
  usage: Usage,
  notes: z.string().optional(),
});

export const Annotation = z.object({
  id: Id,
  kind: z.enum(['note', 'measurement', 'dimension']),
  view: z.enum(['front', 'side', 'plan', 'patch']),
  points: z.array(Point),
  text: z.string().optional(),
});

export const Viewport = z.object({ x: z.number(), y: z.number(), zoom: z.number() });
export const ViewState = z.object({
  layoutView: z.enum(['front', 'side', 'plan']),
  viewports: z.record(z.string(), Viewport),
  patchPositions: z.record(z.string(), z.object({ x: z.number(), y: z.number(), pinned: z.boolean() })),
});

export const Setup = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  status: z.enum(['current', 'planned', 'idea', 'archived']),
  tags: z.array(z.string()),
  derivedFromId: z.string().optional(),
  bodyProfileId: Id,
  posture: z.enum(['standing', 'seated']),
  seatHeightMm: z.number().optional(),
  stands: z.array(StandState),
  placements: z.array(Placement),
  connections: z.array(Connection),
  unitConfigs: z.record(z.string(), UnitConfig),
  annotations: z.array(Annotation),
  roomId: z.string().optional(),
  viewState: ViewState,
  createdAt: IsoDate,
  updatedAt: IsoDate,
  suppressedIssues: z.array(z.object({ ruleId: z.string(), entityIds: z.array(z.string()), reason: z.string() })),
});

// ---------- settings ----------

export const LengthUnit = z.enum(['mm', 'cm', 'in']);
export const Settings = z.object({
  units: z.object({ length: LengthUnit, decimals: z.number().int().min(0).max(4) }),
  theme: z.enum(['light', 'dark', 'system']),
  palette: z.object({
    domains: z.record(z.string(), z.string()),
    midiChannels: z.array(z.string()).length(16),
  }),
  snap: z.object({ enabled: z.boolean(), gridMm: z.number().positive(), fineMm: z.number().positive() }),
  animation: z.object({
    enabled: z.boolean(),
    speed: z.number().positive(),
    reducedMotion: z.enum(['system', 'reduce', 'allow']),
    bpm: z.number().min(30).max(300),
  }),
  labelDensity: z.enum(['off', 'minimal', 'full']),
  ergonomics: z.object({
    handClearanceMm: z.number(),
    holderThicknessMm: z.number(),
    viewDistanceMm: z.number(),
    comfortBandMm: z.number(),
    acceptableLowerMm: z.number(),
  }),
  cables: z.object({ slack: z.number().min(0), serviceLoopMm: z.number().min(0), viaHeightMm: z.number() }),
  mainsVoltage: z.literal([115, 230]),
  defaultBodyProfileId: z.string().nullable(),
  autosaveIntervalS: z.number().positive(),
});

// ---------- assets ----------

export const AssetItem = z.object({
  name: z.string(),
  mime: z.enum(['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml']),
  widthPx: z.number().int(),
  heightPx: z.number().int(),
  bytes: z.number().int(),
  path: z.string().optional(),
  dataUri: z.string().optional(),
});
export const AssetIndex = z.object({ mode: z.enum(['embedded', 'folder']), items: z.record(z.string(), AssetItem) });

// ---------- project ----------

export const Project = z.object({
  schemaVersion: z.number().int(),
  meta: z.object({
    name: z.string(),
    createdAt: IsoDate,
    updatedAt: IsoDate,
    author: z.string().optional(),
    notes: z.string().optional(),
  }),
  settings: Settings,
  library: z.object({
    gearModels: z.array(GearModel),
    standModels: z.array(StandModel),
    cableModels: z.array(CableModel),
    templates: z.array(Template),
  }),
  inventory: z.object({
    gearUnits: z.array(GearUnit),
    standUnits: z.array(StandUnit),
    cables: z.array(CableUnit),
    rooms: z.array(Room),
  }),
  bodyProfiles: z.array(BodyProfile),
  setups: z.array(Setup),
  activeSetupId: z.string().nullable(),
  assets: AssetIndex,
});
