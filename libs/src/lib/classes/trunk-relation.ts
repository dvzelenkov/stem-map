import { ArcLayer, ArcLayerProps } from '@deck.gl/layers';

export class TrunkRelation<TData> extends ArcLayer<TData> {
  constructor(props: Partial<ArcLayerProps<TData>>) {
    super({
      pickable: true,
      widthUnits: 'meters',
      getHeight: 0.15,
      ...props,
    });
  }
}
