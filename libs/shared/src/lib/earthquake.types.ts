import { GeoData, RelationData, StemData } from "./stem.types";
import { Coordinates } from "./utils";

export interface Earthquake extends StemData {
  force: number;
  date: Date;
}

export interface NestedEarthquake extends GeoData {
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

export type SwarmEarthquake = Aftershock;

export interface EarthquakeSwarms {
  contours: Coordinates[][];
  swarms: SwarmEarthquake[][];
  backgrounds: Earthquake[];
}

export interface FullEarthquakesData {
  mains: Earthquake[];
  nestedMainMarks: NestedEarthquake[];
  aftershocks: Aftershock[];
  mainTimelines: RelationData[];
  aftershockTimelines: RelationData[];
  backgrounds: Earthquake[];
  startDate: Date;
  endDate: Date;
}

export type FullEarthquakesDataWithSwarms = FullEarthquakesData & EarthquakeSwarms;