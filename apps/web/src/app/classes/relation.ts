import { ArcLayer, ArcLayerProps } from '@deck.gl/layers/typed';
import { DataFilterExtensionProps } from '@deck.gl/extensions/typed';
import { RelationData } from '@study/shared';

export class Relation extends ArcLayer<RelationData> {
  constructor(props: Partial<ArcLayerProps<RelationData> & DataFilterExtensionProps>) {
    super({
      pickable: true,
      getWidth: 500,
      widthUnits: 'meters',
      getHeight: 0.1,
      ...props,
    });
  }
}