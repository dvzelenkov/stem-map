export interface StemData {
  id: string;
  longitude: number;
  latitude: number;
  relationsCount: number;
  color?: Color;
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