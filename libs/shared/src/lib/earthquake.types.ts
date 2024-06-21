import { RelationData, StemData } from "./stem.types";

export interface Earthquake extends StemData {
  force: number;
  date: Date;
}

export interface FileEarthquake {
  id: string;
  longitude: string;
  latitude: string;
  force: string;
  date: string;
}

export interface Aftershock extends Earthquake {
  parentId: string;
}

export interface FullEarthquakesData {
  mains: Earthquake[];
  aftershocks: Aftershock[];
  mainTimelines: RelationData[];
  aftershockTimelines: RelationData[];
  startDate: Date;
  endDate: Date;
}