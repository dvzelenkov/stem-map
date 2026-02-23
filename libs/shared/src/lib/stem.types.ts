export type Color =
  | [number, number, number]
  | [number, number, number, number]
  | Uint8Array
  | Uint8ClampedArray;

export interface Coordinates {
  longitude: number;
  latitude: number;
}

export interface GeoData extends Coordinates {
  id: string;
}

export interface StemData extends GeoData {
  levelsCount: number;
  parentId?: string;
  bedId?: string;
  date?: Date;
}

export interface RelationData {
  sourceId: string,
  targetId: string,
  sourcePosition: number[];
  targetPosition: number[];
  sourceDate: Date;
  targetDate: Date;
}

export interface BedData {
  id: string;
  contours: Coordinates[][];
  expanded?: boolean;
}

export interface FullData {
  stems: { [id: string]: StemData[] };
  marks: { [id: string]: GeoData[] };
  relations: { [id: string]: RelationData[] };
  beds: { [id: string]: BedData[] };
}