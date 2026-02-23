import { Color } from "./stem.types";

export enum AttributeType {
  Number = 'number',
  String = 'string',
  Date = 'date',
}

export interface Attribute {
  title: string;
  key: string;
  type: AttributeType;
}

export interface ChunkCondition {
  attribute: Attribute;
  equal?: boolean;
  between?: number;
}

export interface Algorithm {
  title: string;
  attributes: Attribute[];
  code?: string;
}

export interface GenerationSettings {
  algorithm: Algorithm;
  sourceStemsId: string;
}

export interface ExpandedSettings {
  attribute: Attribute;
  markColor: Color;
}

export interface StemsSettings {
  id: string;
  color: Color;
  attributes: Attribute[];
  file?: File;
  chunkConditions?: ChunkCondition[];
  generationSettings?: GenerationSettings;
  expandedSettings?: ExpandedSettings;
}

export interface StemsSettingsWithFile extends StemsSettings {
  file?: File;
}

export interface BedSettings {
  id: string;
  color: Color;
  lineColor?: Color;
  generationSettings: GenerationSettings;
}

export interface UserSettings {
  stems: StemsSettings[];
  beds: BedSettings[];
}

export interface UserSettingsWithFiles extends UserSettings {
  files: File[];
}