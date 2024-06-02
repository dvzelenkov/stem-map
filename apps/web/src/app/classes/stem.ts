import { ColumnLayer, ColumnLayerProps } from '@deck.gl/layers/typed';
import { Color } from '@deck.gl/core/typed';
import { CollisionFilterExtensionProps } from '@deck.gl/extensions/typed';

export interface StemData {
  id: string;
  longitude: number;
  latitude: number;
  color?: Color;
}

export class Stem<ExtraData> extends ColumnLayer<ExtraData & StemData> {
  private static stemHeight = 5;

  constructor(props: Partial<ColumnLayerProps<ExtraData & StemData> & CollisionFilterExtensionProps>) {
    super({
      radius: 500,
      getFillColor: [0, 0, 219, 255],
      elevationScale: 2000,
      getElevation: stem => {
        const {longitude, latitude, ...params} = stem;
        return Stem.stemHeight * Object.keys(params).length;
      },
      extruded: true,
      pickable: true,
      getPosition: stem => [+stem.longitude, +stem.latitude],
      ...props,
    });
  }
}