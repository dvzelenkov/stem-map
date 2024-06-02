import { ArcLayer, ArcLayerProps } from '@deck.gl/layers/typed';
import { Color } from '@deck.gl/core/typed';

export interface RelationData {
  sourceId: string,
  targetId: string,
  sourcePosition: number[];
  targetPosition: number[];
  sourceColor: Color;
  targetColor: Color;
}

export class Relation extends ArcLayer<RelationData> {
  constructor(props: Partial<ArcLayerProps<RelationData>>) {
    super({
      pickable: true,
      getWidth: 300,
      widthUnits: 'meters',
      getHeight: 0.1,
      getSourceColor: data => data.sourceColor,
      getTargetColor: data => data.targetColor,
      ...props,
    });
  }
}