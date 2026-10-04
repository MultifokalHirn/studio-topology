// Domain types (spec §4), inferred from the Zod schemas in `schemas.ts` so the two cannot drift.
import type { z } from 'zod';
import type * as S from './schemas';

export type Point = z.infer<typeof S.Point>;
export type Rect = z.infer<typeof S.Rect>;
export type Polyline = z.infer<typeof S.Polyline>;
export type ProvenanceKind = z.infer<typeof S.ProvenanceKind>;
export type Provenance = z.infer<typeof S.Provenance>;
export type AssetRef = z.infer<typeof S.AssetRef>;
export type AssetIndex = z.infer<typeof S.AssetIndex>;

export type GearCategory = z.infer<typeof S.GearCategory>;
export type FormFactor = z.infer<typeof S.FormFactor>;
export type FaceId = z.infer<typeof S.FaceId>;
export type SignalDomain = z.infer<typeof S.SignalDomain>;
export type Direction = z.infer<typeof S.Direction>;
export type JackType = z.infer<typeof S.JackType>;
export type PlugType = z.infer<typeof S.PlugType>;
export type PowerPlug = z.infer<typeof S.PowerPlug>;
export type Connector = z.infer<typeof S.Connector>;
export type InternalPath = z.infer<typeof S.InternalPath>;
export type PowerSource = z.infer<typeof S.PowerSource>;
export type PowerSpec = z.infer<typeof S.PowerSpec>;
export type MidiSpec = z.infer<typeof S.MidiSpec>;
export type ClockSpec = z.infer<typeof S.ClockSpec>;
export type Usage = z.infer<typeof S.Usage>;
export type Interaction = z.infer<typeof S.Interaction>;
export type GearModel = z.infer<typeof S.GearModel>;

export type StandType = z.infer<typeof S.StandType>;
export type SurfaceDef = z.infer<typeof S.SurfaceDef>;
export type StandModel = z.infer<typeof S.StandModel>;
export type CableModel = z.infer<typeof S.CableModel>;
export type Template = z.infer<typeof S.Template>;

export type GearUnit = z.infer<typeof S.GearUnit>;
export type StandUnit = z.infer<typeof S.StandUnit>;
export type CableUnit = z.infer<typeof S.CableUnit>;
export type Room = z.infer<typeof S.Room>;
export type BodyProfile = z.infer<typeof S.BodyProfile>;

export type Rotation = z.infer<typeof S.Rotation>;
export type StandState = z.infer<typeof S.StandState>;
export type Mount = z.infer<typeof S.Mount>;
export type Placement = z.infer<typeof S.Placement>;
export type Connection = z.infer<typeof S.Connection>;
export type UnitConfig = z.infer<typeof S.UnitConfig>;
export type Annotation = z.infer<typeof S.Annotation>;
export type ViewState = z.infer<typeof S.ViewState>;
export type Setup = z.infer<typeof S.Setup>;

export type LengthUnit = z.infer<typeof S.LengthUnit>;
export type Settings = z.infer<typeof S.Settings>;
export type Project = z.infer<typeof S.Project>;
