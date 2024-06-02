import { StemData } from "./classes/stem";

export interface EarthQuake extends StemData {
  force: number;
  date: string;
  hasChildren: boolean;
}

export interface AfterShock extends EarthQuake {
  parentId: string;
}