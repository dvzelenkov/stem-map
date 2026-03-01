import DeckGL from '@deck.gl/react';
import { TextLayer } from '@deck.gl/layers';
import { LayersList, ViewStateChangeParameters } from '@deck.gl/core';
import { useEffect, useMemo, useState } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Typography } from '@mui/material';
import MapLibre from 'react-map-gl/maplibre';

import { TrunkColumn } from './classes/trunk-column';
import { TrunkRelation } from './classes/trunk-relation';
import {
  Edge,
  Layer,
  Trunk,
  TrunkCopy,
  TrunkMapProps,
} from './trunk-map.types';
import {
  buildCopies,
  getOrderedLayers,
  validateTrunkMapInput,
} from './trunk-map.utils';

interface TrunkWithCopy extends Trunk {
  copy: TrunkCopy | null;
  connectedLayersCount: number;
}

interface VisibleEdge extends Edge {
  source: Trunk;
  target: Trunk;
  layerAltitude: number;
}

const DEFAULT_MAP_STYLE = 'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl';

const DEFAULT_VIEW_STATE = {
  longitude: 113.9,
  latitude: 56.06,
  zoom: 5,
  pitch: 55,
  bearing: 0,
};

const SELECTED_COLOR: [number, number, number, number] = [250, 120, 20, 255];
const NODE_COLOR: [number, number, number, number] = [52, 109, 241, 220];
const EDGE_COLOR: [number, number, number, number] = [80, 80, 80, 180];
const DIRECTED_EDGE_COLOR: [number, number, number, number] = [169, 56, 244, 180];
const MIN_COLUMN_RADIUS = 900;
const MAX_COLUMN_RADIUS = 9310;
const ALL_LAYERS_FILTER_ID = '__all_layers__';
const EDGE_LAYER_BASE_ALTITUDE = 2500;
const EDGE_LAYER_ALTITUDE_STEP = 20000;
const EDGE_IN_LAYER_ALTITUDE_STEP = 220;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getRadiusByZoom = (zoom: number): number => {
  const normalized = clamp((zoom - 3) / 7, 0, 1);
  return Math.round(
    MAX_COLUMN_RADIUS - (MAX_COLUMN_RADIUS - MIN_COLUMN_RADIUS) * normalized
  );
};

const getHeightScaleByRadius = (radius: number): number =>
  radius / MIN_COLUMN_RADIUS;

const getEdgeAltitudeScaleByZoom = (zoom: number): number => {
  const normalizedZoom = clamp((zoom - 3) / 7, 0, 1);
  // At far zoom (small zoom value) edges are higher on Z, and
  // at near zoom edges get lower to avoid excessive vertical spread.
  return 2.3 - normalizedZoom * 1.6;
};

const getEdgeLayerAltitude = (
  layerOrderIndex: number,
  edgeOrderIndexInLayer: number,
  edgeAltitudeScale: number
): number => {
  const baseAltitude =
    EDGE_LAYER_BASE_ALTITUDE + layerOrderIndex * EDGE_LAYER_ALTITUDE_STEP;
  const edgeOffsetInsideLayer = edgeOrderIndexInLayer * EDGE_IN_LAYER_ALTITUDE_STEP;
  return (baseAltitude + edgeOffsetInsideLayer) * edgeAltitudeScale;
};

const getTooltipText = (item: TrunkWithCopy): string => {
  const label = item.label ? `Label: ${item.label}\n` : '';
  const value =
    item.copy?.layer_value !== null && item.copy?.layer_value !== undefined
      ? String(item.copy.layer_value)
      : 'null';

  return `${label}Trunk: ${item.trunk_id}\nLayer value: ${value}\nConnected layers: ${item.connectedLayersCount}\nLat: ${item.geo.lat}\nLon: ${item.geo.lon}`;
};

const isTrunkWithCopy = (value: unknown): value is TrunkWithCopy => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TrunkWithCopy>;
  return Boolean(
    candidate.trunk_id &&
      candidate.geo &&
      typeof candidate.geo.lat === 'number' &&
      typeof candidate.geo.lon === 'number'
  );
};

const isVisibleEdge = (value: unknown): value is VisibleEdge => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VisibleEdge>;
  return Boolean(
    candidate.edge_id &&
      candidate.source &&
      candidate.target &&
      candidate.source.geo &&
      candidate.target.geo
  );
};

const getActiveLayer = (layers: Layer[], activeLayerId: string): Layer | undefined =>
  layers.find((layer) => layer.layer_id === activeLayerId);

const isWebGlAvailable = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const canvas = document.createElement('canvas');
  return Boolean(
    canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
  );
};

export function TrunkMap({
  data,
  mapStyle = DEFAULT_MAP_STYLE,
  width = '100%',
  height = '100%',
  style,
  showLabels = true,
  initialViewState,
  resolveLayerValue,
}: TrunkMapProps) {
  validateTrunkMapInput(data);

  const orderedLayers = useMemo(() => getOrderedLayers(data.layers), [data.layers]);
  const [activeLayerId, setActiveLayerId] = useState<string>(ALL_LAYERS_FILTER_ID);
  const [selectedTrunkId, setSelectedTrunkId] = useState<string>('');
  const [isWebGlSupported] = useState<boolean>(() => isWebGlAvailable());
  const [currentZoom, setCurrentZoom] = useState<number>(
    initialViewState?.zoom ?? DEFAULT_VIEW_STATE.zoom
  );

  useEffect(() => {
    if (!orderedLayers.length) {
      setActiveLayerId('');
      return;
    }

    if (activeLayerId === ALL_LAYERS_FILTER_ID) {
      return;
    }

    const hasCurrentLayer = orderedLayers.some(
      (layer) => layer.layer_id === activeLayerId
    );

    if (!hasCurrentLayer) {
      setActiveLayerId(orderedLayers[0].layer_id);
    }
  }, [activeLayerId, orderedLayers]);

  useEffect(() => {
    if (typeof initialViewState?.zoom === 'number') {
      setCurrentZoom(initialViewState.zoom);
    }
  }, [initialViewState?.zoom]);

  const copies = useMemo(
    () => buildCopies(data, resolveLayerValue),
    [data, resolveLayerValue]
  );

  const trunkById = useMemo(
    () => new globalThis.Map(data.trunks.map((trunk) => [trunk.trunk_id, trunk])),
    [data.trunks]
  );

  const copiesByLayerAndTrunk = useMemo(() => {
    const map = new globalThis.Map<string, TrunkCopy>();
    for (const copy of copies) {
      map.set(`${copy.layer_id}::${copy.trunk_id}`, copy);
    }
    return map;
  }, [copies]);

  const connectedLayersCountByTrunk = useMemo(() => {
    const trunkToLayerIds = new globalThis.Map<string, Set<string>>();

    for (const trunk of data.trunks) {
      trunkToLayerIds.set(trunk.trunk_id, new Set<string>());
    }

    for (const edge of data.edges) {
      trunkToLayerIds.get(edge.source_trunk_id)?.add(edge.layer_id);
      trunkToLayerIds.get(edge.target_trunk_id)?.add(edge.layer_id);
    }

    const countByTrunk = new globalThis.Map<string, number>();
    for (const [trunkId, layerIds] of trunkToLayerIds) {
      countByTrunk.set(trunkId, layerIds.size);
    }

    return countByTrunk;
  }, [data.edges, data.trunks]);

  const trunksWithCopies = useMemo<TrunkWithCopy[]>(() => {
    const copyLayerId =
      activeLayerId === ALL_LAYERS_FILTER_ID
        ? orderedLayers[0]?.layer_id ?? ''
        : activeLayerId;

    return data.trunks.map((trunk) => ({
      ...trunk,
      copy: copiesByLayerAndTrunk.get(`${copyLayerId}::${trunk.trunk_id}`) ?? null,
      connectedLayersCount:
        connectedLayersCountByTrunk.get(trunk.trunk_id) ?? 0,
    }));
  }, [
    activeLayerId,
    connectedLayersCountByTrunk,
    copiesByLayerAndTrunk,
    data.trunks,
    orderedLayers,
  ]);

  const currentRadius = getRadiusByZoom(currentZoom);
  const heightScaleByZoom = getHeightScaleByRadius(currentRadius);
  const edgeAltitudeScaleByZoom = getEdgeAltitudeScaleByZoom(currentZoom);

  const visibleEdges = useMemo<VisibleEdge[]>(() => {
    const layerOrderById = new globalThis.Map<string, number>();
    const edgeIndexByLayerId = new globalThis.Map<string, number>();
    orderedLayers.forEach((layer, index) => {
      layerOrderById.set(layer.layer_id, index);
      edgeIndexByLayerId.set(layer.layer_id, 0);
    });

    return data.edges
      .filter((edge) =>
        activeLayerId === ALL_LAYERS_FILTER_ID
          ? true
          : edge.layer_id === activeLayerId
      )
      .map((edge) => {
        const source = trunkById.get(edge.source_trunk_id);
        const target = trunkById.get(edge.target_trunk_id);

        if (!source || !target) {
          return null;
        }

        const edgeOrderIndexInLayer = edgeIndexByLayerId.get(edge.layer_id) ?? 0;
        edgeIndexByLayerId.set(edge.layer_id, edgeOrderIndexInLayer + 1);

        return {
          ...edge,
          source,
          target,
          layerAltitude: getEdgeLayerAltitude(
            layerOrderById.get(edge.layer_id) ?? 0,
            edgeOrderIndexInLayer,
            edgeAltitudeScaleByZoom
          ),
        };
      })
      .filter((edge): edge is VisibleEdge => edge !== null);
  }, [activeLayerId, data.edges, edgeAltitudeScaleByZoom, orderedLayers, trunkById]);

  const layers: LayersList = [
    new TrunkRelation<VisibleEdge>({
      id: `trunk-edges-${activeLayerId}`,
      data: visibleEdges,
      getSourcePosition: (item) => [
        item.source.geo.lon,
        item.source.geo.lat,
        item.layerAltitude,
      ],
      getTargetPosition: (item) => [
        item.target.geo.lon,
        item.target.geo.lat,
        item.layerAltitude,
      ],
      getSourceColor: (item) => (item.directed ? DIRECTED_EDGE_COLOR : EDGE_COLOR),
      getTargetColor: (item) => (item.directed ? DIRECTED_EDGE_COLOR : EDGE_COLOR),
      widthUnits: 'pixels',
      getWidth: (item) => Math.max(1, (item.weight ?? 1) * 1.1),
      getHeight: 0.06,
    }),
    new TrunkColumn<TrunkWithCopy>({
      id: `trunks-${activeLayerId}`,
      data: trunksWithCopies,
      radius: currentRadius,
      elevationScale: 1.4,
      getFillColor: (item) =>
        item.trunk_id === selectedTrunkId ? SELECTED_COLOR : NODE_COLOR,
      getLineColor: [255, 255, 255, 240],
      lineWidthMinPixels: 1,
      getElevation: (item) =>
        Math.max(1, item.connectedLayersCount) * 3500 * heightScaleByZoom,
      updateTriggers: {
        getFillColor: [activeLayerId, selectedTrunkId],
        getElevation: [data.edges.length, heightScaleByZoom],
        radius: currentRadius,
      },
    }),
  ];

  if (showLabels) {
    layers.push(
      new TextLayer<TrunkWithCopy>({
        id: `trunk-labels-${activeLayerId}`,
        data: trunksWithCopies,
        getPosition: (item) => [item.geo.lon, item.geo.lat],
        getText: (item) => item.label ?? item.trunk_id,
        getColor: [20, 20, 20, 220],
        getSize: 14,
        getPixelOffset: [0, 14],
        sizeUnits: 'pixels',
      })
    );
  }

  const activeLayer = getActiveLayer(orderedLayers, activeLayerId);

  if (!isWebGlSupported) {
    return (
      <Box
        sx={{
          position: 'relative',
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8f8f8',
          color: '#333',
          ...style,
        }}
      >
        <Typography variant="body1">
          WebGL is not available in this browser environment.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{ position: 'relative', width, height, ...style }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <DeckGL
        initialViewState={{ ...DEFAULT_VIEW_STATE, ...initialViewState }}
        controller={true}
        layers={layers}
        width={width}
        height={height}
        onViewStateChange={(params: ViewStateChangeParameters) => {
          const zoom = params.viewState.zoom;
          if (typeof zoom === 'number') {
            setCurrentZoom(zoom);
          }
        }}
        onClick={(info) =>
          setSelectedTrunkId(
            (info.object as TrunkWithCopy | undefined)?.trunk_id ?? ''
          )
        }
        getTooltip={({ object }) => {
          if (!object) {
            return null;
          }

          if (isTrunkWithCopy(object)) {
            return getTooltipText(object);
          }

          if (isVisibleEdge(object)) {
            return `Edge: ${object.edge_id}\nLayer: ${object.layer_id}\nSource: ${object.source_trunk_id}\nTarget: ${object.target_trunk_id}\nZ: ${Math.round(object.layerAltitude)}`;
          }

          return null;
        }}
      >
        <MapLibre mapStyle={mapStyle} />
      </DeckGL>

      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: '#ffffffee',
          p: 1.5,
          minWidth: 200,
          border: '1px solid #d9d9d9',
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Layer
        </Typography>
        <FormControl size="small" fullWidth sx={{ mb: 1 }}>
          <InputLabel id="trunk-map-layer-select-label">Layer</InputLabel>
          <Select
            labelId="trunk-map-layer-select-label"
            value={activeLayerId}
            label="Layer"
            onChange={(event: SelectChangeEvent<string>) => {
              setSelectedTrunkId('');
              setActiveLayerId(event.target.value);
            }}
          >
            <MenuItem value={ALL_LAYERS_FILTER_ID}>All layers</MenuItem>
            {orderedLayers.map((layer) => (
              <MenuItem key={layer.layer_id} value={layer.layer_id}>
                {layer.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary">
          Attribute: {activeLayer?.attribute_name ?? '-'}
        </Typography>
      </Paper>
    </Box>
  );
}

export default TrunkMap;
