import { ColumnLayer, ColumnLayerProps } from '@deck.gl/layers';
import { DataFilterExtensionProps } from '@deck.gl/extensions';
import { StemData } from '@study/shared';

export class Stem<ExtraData> extends ColumnLayer<ExtraData & StemData> {
  constructor(props: Partial<ColumnLayerProps<ExtraData & StemData> & DataFilterExtensionProps>) {
    super({
      radius: 500,
      extruded: true,
      pickable: true,
      elevationScale: 2000,
      getElevation: stem => 5 * stem.levelsCount,
      getPosition: stem => [stem.longitude, stem.latitude],
      ...props,
    });
  }
}