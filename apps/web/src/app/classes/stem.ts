import { ColumnLayer, ColumnLayerProps } from '@deck.gl/layers/typed';
import { DataFilterExtensionProps } from '@deck.gl/extensions/typed';
import { StemData } from '@study/shared';

export class Stem<ExtraData> extends ColumnLayer<ExtraData & StemData> {
  private static stemHeight = 5;

  constructor(props: Partial<ColumnLayerProps<ExtraData & StemData> & DataFilterExtensionProps>) {
    super({
      radius: 500,
      getFillColor: [0, 0, 219, 255],
      elevationScale: 2000,
      getElevation: stem => Stem.stemHeight * stem.relationsCount,
      extruded: true,
      pickable: true,
      getPosition: stem => [+stem.longitude, +stem.latitude],
      ...props,
    });
  }
}