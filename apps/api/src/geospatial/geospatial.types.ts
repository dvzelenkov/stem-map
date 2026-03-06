export interface GeoPoint {
  id?: string;
  lat: number;
  lon: number;
  attributes?: Record<string, unknown>;
}

export type ClusterAttributeType = 'numeric' | 'time';
export type ClusterMode = 'quality' | 'scalable' | 'auto';

export interface ClusterFeatureAttribute {
  key: string;
  type?: ClusterAttributeType;
  weight?: number;
}

export interface ClusterPolygonsOptions {
  minClusterSize?: number;
  alpha?: number;
  spatialWeight?: number;
  featureAttributes?: ClusterFeatureAttribute[];
  mode?: ClusterMode;
  h3Resolution?: number;
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
