import {
  Layer,
  LayerValueResolver,
  Trunk,
  TrunkCopy,
  TrunkMapInputData,
} from './trunk-map.types';

const buildCopyId = (trunkId: string, layerId: string): string =>
  `${trunkId}::${layerId}`;

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
  trunk: Trunk,
  layer: Layer,
  resolveLayerValue?: LayerValueResolver
): string | number | null => {
  const resolvedValue = resolveLayerValue?.({ layer, trunk });

  if (resolvedValue !== undefined) {
    return toLayerValue(resolvedValue);
  }

  return toLayerValue(trunk.properties?.[layer.attribute_name]);
};

export const buildCopies = (
  data: TrunkMapInputData,
  resolveLayerValue?: LayerValueResolver
): TrunkCopy[] => {
  if (data.copies !== 'implicit') {
    return data.copies;
  }

  return data.trunks.flatMap((trunk) =>
    data.layers.map((layer) => ({
      copy_id: buildCopyId(trunk.trunk_id, layer.layer_id),
      trunk_id: trunk.trunk_id,
      layer_id: layer.layer_id,
      layer_value: getImplicitLayerValue(trunk, layer, resolveLayerValue),
    }))
  );
};

export const validateTrunkMapInput = (data: TrunkMapInputData): void => {
  if (!data.layers.length) {
    throw new Error('TrunkMap: layers must be a non-empty array.');
  }

  if (!data.trunks.length) {
    throw new Error('TrunkMap: trunks must be a non-empty array.');
  }

  const layerIds = new Set(data.layers.map((layer) => layer.layer_id));
  const trunkIds = new Set(data.trunks.map((trunk) => trunk.trunk_id));

  for (const edge of data.edges) {
    if (!layerIds.has(edge.layer_id)) {
      throw new Error(
        `TrunkMap: edge ${edge.edge_id} references unknown layer_id ${edge.layer_id}.`
      );
    }

    if (!trunkIds.has(edge.source_trunk_id)) {
      throw new Error(
        `TrunkMap: edge ${edge.edge_id} references unknown source_trunk_id ${edge.source_trunk_id}.`
      );
    }

    if (!trunkIds.has(edge.target_trunk_id)) {
      throw new Error(
        `TrunkMap: edge ${edge.edge_id} references unknown target_trunk_id ${edge.target_trunk_id}.`
      );
    }
  }

  if (data.copies === 'implicit') {
    return;
  }

  for (const copy of data.copies) {
    if (!layerIds.has(copy.layer_id)) {
      throw new Error(
        `TrunkMap: copy ${copy.copy_id} references unknown layer_id ${copy.layer_id}.`
      );
    }

    if (!trunkIds.has(copy.trunk_id)) {
      throw new Error(
        `TrunkMap: copy ${copy.copy_id} references unknown trunk_id ${copy.trunk_id}.`
      );
    }
  }
};

export const getOrderedLayers = (layers: Layer[]): Layer[] =>
  [...layers].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
