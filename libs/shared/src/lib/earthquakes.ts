import { RelationData, StemData } from "./stem";

export interface Earthquake extends StemData {
  force: number;
  date: string;
  hasChildren: boolean;
}

export interface Aftershock extends Earthquake {
  parentId: string;
}

export interface FullEarthquakesData extends StemData {
  mains: Earthquake[];
  aftershocks: Aftershock[];
  mainTimelines: RelationData[];
  aftershockTimelines: RelationData[];
  startDate: Date;
  endDate: Date;
}