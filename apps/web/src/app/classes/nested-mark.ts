import { ScatterplotLayer, ScatterplotLayerProps } from '@deck.gl/layers/typed';
import { DataFilterExtensionProps } from '@deck.gl/extensions/typed';
import { NestedEarthquake } from '@study/shared';

export class NestedMark extends ScatterplotLayer<NestedEarthquake> {
  constructor(props: Partial<ScatterplotLayerProps<NestedEarthquake> & DataFilterExtensionProps>) {
    super({
      getRadius: 1000,
      pickable: true,
      getPosition: stem => [stem.longitude, stem.latitude],
      ...props,
    });
  }
}