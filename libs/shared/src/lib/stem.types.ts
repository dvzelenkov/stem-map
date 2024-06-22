import { Coordinates } from "./utils";

export interface StemData extends GeoData {
  relationsCount: number;
  color?: Color;
}

export interface GeoData extends Coordinates {
  id: string;
}

export interface RelationData {
  sourceId: string,
  targetId: string,
  sourcePosition: number[];
  targetPosition: number[];
  sourceDate: Date;
  targetDate: Date;
}

export type Color =
  | [number, number, number]
  | [number, number, number, number]
  | Uint8Array
  | Uint8ClampedArray;