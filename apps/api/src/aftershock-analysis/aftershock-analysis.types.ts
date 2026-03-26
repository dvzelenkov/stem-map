export interface AftershockAnalysisParams {
  csvPath: string;
  forceThreshold: number;
  mainEdgesOutputPath: string;
  aftershockEdgesOutputPath: string;
}

export interface EarthquakeRecord {
  stemId: number;
  label: string;
  lat: number;
  lon: number;
  date: Date;
  force: number;
}

export interface EdgeCsvRow {
  edge_id: string;
  attribute_name: string;
  source_stem_id: string;
  target_stem_id: string;
  directed: string;
  weight: string;
}

export interface AftershockAnalysisResult {
  mainEventsCount: number;
  aftershocksCount: number;
  mainEdgesCount: number;
  aftershockEdgesCount: number;
  mainEdgesPath: string;
  aftershockEdgesPath: string;
  durationMs: number;
}
