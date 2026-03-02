import { ColumnLayer, ColumnLayerProps } from '@deck.gl/layers';

export interface StemColumnData {
  stem_id: string;
  geo: {
    lat: number;
    lon: number;
  };
  copy: {
    layer_value: string | number | null;
  } | null;
}

export class StemColumn<TData extends StemColumnData> extends ColumnLayer<TData> {
  constructor(props: Partial<ColumnLayerProps<TData>>) {
    super({
      pickable: true,
      extruded: true,
      diskResolution: 20,
      radiusUnits: 'meters',
      elevationScale: 1,
      getPosition: (item) => [item.geo.lon, item.geo.lat],
      ...props,
    });
  }
}
