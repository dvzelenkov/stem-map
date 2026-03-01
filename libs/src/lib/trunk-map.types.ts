import { CSSProperties } from 'react';
import { MapViewState } from '@deck.gl/core';

export interface Layer {
  layer_id: string;
  title: string;
  attribute_name: string;
  order?: number;
}

export interface TrunkGeo {
  lat: number;
  lon: number;
}

export interface Trunk {
  trunk_id: string;
  label?: string;
  geo: TrunkGeo;
  properties?: Record<string, unknown>;
}

export interface TrunkCopy {
  copy_id: string;
  trunk_id: string;
  layer_id: string;
  layer_value: string | number | null;
}

export interface Edge {
  edge_id: string;
  layer_id: string;
  source_trunk_id: string;
  target_trunk_id: string;
  directed: boolean;
  weight: number | null;
  edge_type: string | null;
}

export interface TrunkMapInputData {
  layers: Layer[];
  trunks: Trunk[];
  copies: TrunkCopy[] | 'implicit';
  edges: Edge[];
}

export interface LayerValueResolverArgs {
  layer: Layer;
  trunk: Trunk;
}

export type LayerValueResolver = (
  args: LayerValueResolverArgs
) => string | number | null | undefined;

export interface TrunkMapProps {
  data: TrunkMapInputData;
  mapStyle?: string;
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
  showLabels?: boolean;
  initialViewState?: Partial<MapViewState>;
  resolveLayerValue?: LayerValueResolver;
}
