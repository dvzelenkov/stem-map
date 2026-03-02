import {
  Layer,
  LayerValueResolver,
  Stem,
  StemCopy,
  StemMapInputData,
} from './stem-map.types';

const buildCopyId = (stemId: string, layerId: string): string =>
  `${stemId}::${layerId}`;

const toLayerValue = (
  value: unknown
): string | number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }

  return String(value);
};

const getImplicitLayerValue = (
  stem: Stem,
  layer: Layer,
  resolveLayerValue?: LayerValueResolver
): string | number | null => {
  const resolvedValue = resolveLayerValue?.({ layer, stem });

  if (resolvedValue !== undefined) {
    return toLayerValue(resolvedValue);
  }

  return toLayerValue(stem.properties?.[layer.attribute_name]);
};

export const buildCopies = (
  data: StemMapInputData,
  resolveLayerValue?: LayerValueResolver
): StemCopy[] => {
  if (data.copies !== 'implicit') {
    return data.copies;
  }

  return data.stems.flatMap((stem) =>
    data.layers.map((layer) => ({
      copy_id: buildCopyId(stem.stem_id, layer.layer_id),
      stem_id: stem.stem_id,
      layer_id: layer.layer_id,
      layer_value: getImplicitLayerValue(stem, layer, resolveLayerValue),
    }))
  );
};

export const validateStemMapInput = (data: StemMapInputData): void => {
  if (!data.layers.length) {
    throw new Error('StemMap: layers must be a non-empty array.');
  }

  if (!data.stems.length) {
    throw new Error('StemMap: stems must be a non-empty array.');
  }

  const layerIds = new Set(data.layers.map((layer) => layer.layer_id));
  const stemIds = new Set(data.stems.map((stem) => stem.stem_id));

  for (const edge of data.edges) {
    if (!layerIds.has(edge.layer_id)) {
      throw new Error(
        `StemMap: edge ${edge.edge_id} references unknown layer_id ${edge.layer_id}.`
      );
    }

    if (!stemIds.has(edge.source_stem_id)) {
      throw new Error(
        `StemMap: edge ${edge.edge_id} references unknown source_stem_id ${edge.source_stem_id}.`
      );
    }

    if (!stemIds.has(edge.target_stem_id)) {
      throw new Error(
        `StemMap: edge ${edge.edge_id} references unknown target_stem_id ${edge.target_stem_id}.`
      );
    }
  }

  if (data.copies === 'implicit') {
    return;
  }

  for (const copy of data.copies) {
    if (!layerIds.has(copy.layer_id)) {
      throw new Error(
        `StemMap: copy ${copy.copy_id} references unknown layer_id ${copy.layer_id}.`
      );
    }

    if (!stemIds.has(copy.stem_id)) {
      throw new Error(
        `StemMap: copy ${copy.copy_id} references unknown stem_id ${copy.stem_id}.`
      );
    }
  }
};

export const getOrderedLayers = (layers: Layer[]): Layer[] =>
  [...layers].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
