export interface GeoPoint {
  id?: string;
  lat: number;
  lon: number;
}

export interface ClusterPolygonsOptions {
  minClusterSize?: number;
  alpha?: number;
}

export interface ClusterPolygonProperties {
  clusterId: number;
  pointCount: number;
}

export interface ClusterPolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface ClusterPolygonFeature {
  type: 'Feature';
  properties: ClusterPolygonProperties;
  geometry: ClusterPolygonGeometry;
}

export interface ClusterPolygonFeatureCollection {
  type: 'FeatureCollection';
  features: ClusterPolygonFeature[];
}

export interface ClusterPolygonsRequest {
  points: GeoPoint[];
  options?: ClusterPolygonsOptions;
}
