import { CSSProperties } from 'react';
import { MapViewState } from '@deck.gl/core';

export interface Layer {
  layer_id: string;
  title: string;
  attribute_name: string;
  order?: number;
}

export interface StemGeo {
  lat: number;
  lon: number;
}

export interface Stem {
  stem_id: string;
  label?: string;
  geo: StemGeo;
  properties?: Record<string, unknown>;
}

export interface StemCopy {
  copy_id: string;
  stem_id: string;
  layer_id: string;
  layer_value: string | number | null;
}

export interface Edge {
  edge_id: string;
  layer_id: string;
  source_stem_id: string;
  target_stem_id: string;
  directed: boolean;
  weight: number | null;
}

export interface StemMapInputData {
  layers: Layer[];
  stems: Stem[];
  copies: StemCopy[] | 'implicit';
  edges: Edge[];
  layerColors?: Record<string, string>;
}

export interface LayerValueResolverArgs {
  layer: Layer;
  stem: Stem;
}

export type LayerValueResolver = (
  args: LayerValueResolverArgs
) => string | number | null | undefined;

export interface StemMapProps {
  data: StemMapInputData;
  mapStyle?: string;
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
  showLabels?: boolean;
  initialViewState?: Partial<MapViewState>;
  resolveLayerValue?: LayerValueResolver;
}
