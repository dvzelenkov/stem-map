import DeckGL from '@deck.gl/react';
import { TextLayer } from '@deck.gl/layers';
import { LayersList, ViewStateChangeParameters } from '@deck.gl/core';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import MapLibre from 'react-map-gl/maplibre';

import { StemColumn } from './classes/stem-column';
import { StemRelation } from './classes/stem-relation';
import {
  Edge,
  Layer,
  Stem,
  StemCopy,
  StemMapProps,
} from './stem-map.types';
import {
  buildCopies,
  getOrderedLayers,
  validateStemMapInput,
} from './stem-map.utils';

interface StemWithCopy extends Stem {
  copy: StemCopy | null;
  connectedLayersCount: number;
}

interface VisibleEdge extends Edge {
  source: Stem;
  target: Stem;
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
const EDGE_HIGHLIGHT_COLOR: [number, number, number, number] = [250, 120, 20, 255];
const EDGE_DIMMED_COLOR: [number, number, number, number] = [130, 130, 130, 90];
const MIN_COLUMN_RADIUS = 900;
const MAX_COLUMN_RADIUS = 9310;
const ALL_LAYERS_FILTER_ID = '__all_layers__';
const COLUMN_ELEVATION_UNIT = 3500;
const COLUMN_ELEVATION_SCALE = 1.4;

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

const getEdgeLayerAltitude = (
  layerOrderIndex: number,
  edgeOrderIndexInLayer: number,
  totalEdgesInLayer: number,
  heightScale: number
): number => {
  const segmentCenter = (layerOrderIndex + 0.5) * COLUMN_ELEVATION_UNIT;
  const maxSpread = COLUMN_ELEVATION_UNIT * 0.6;
  const edgeSpread =
    totalEdgesInLayer > 1
      ? ((edgeOrderIndexInLayer / (totalEdgesInLayer - 1)) - 0.5) * maxSpread
      : 0;
  return (segmentCenter + edgeSpread) * heightScale * COLUMN_ELEVATION_SCALE;
};

const normalizeHexColor = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
};

const hexToRgba = (
  color: string | undefined,
  fallback: [number, number, number, number]
): [number, number, number, number] => {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return fallback;
  }

  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
    fallback[3],
  ];
};

const getTooltipText = (item: StemWithCopy): string => {
  const label = item.label ? `Подпись: ${item.label}\n` : '';
  const value =
    item.copy?.layer_value !== null && item.copy?.layer_value !== undefined
      ? String(item.copy.layer_value)
      : 'null';

  return `${label}Стем: ${item.stem_id}\nЗначение слоя: ${value}\nСвязанных слоёв: ${item.connectedLayersCount}\nШирота: ${item.geo.lat}\nДолгота: ${item.geo.lon}`;
};

const isStemWithCopy = (value: unknown): value is StemWithCopy => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StemWithCopy>;
  return Boolean(
    candidate.stem_id &&
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

const isEdgeConnectedToSelectedStem = (
  edge: VisibleEdge,
  selectedStemId: string
): boolean =>
  edge.source_stem_id === selectedStemId ||
  edge.target_stem_id === selectedStemId;

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

export function StemMap({
  data,
  mapStyle = DEFAULT_MAP_STYLE,
  width = '100%',
  height = '100%',
  style,
  showLabels = true,
  initialViewState,
  resolveLayerValue,
  overlayLayers,
  panelContent,
  getStemColor,
}: StemMapProps) {
  validateStemMapInput(data);

  const orderedLayers = useMemo(() => getOrderedLayers(data.layers), [data.layers]);
  const [activeLayerId, setActiveLayerId] = useState<string>(ALL_LAYERS_FILTER_ID);
  const [selectedStemId, setSelectedStemId] = useState<string>('');
  const [isWebGlSupported] = useState<boolean>(() => isWebGlAvailable());
  const [currentZoom, setCurrentZoom] = useState<number>(
    initialViewState?.zoom ?? DEFAULT_VIEW_STATE.zoom
  );
  const [columnRadiusScale, setColumnRadiusScale] = useState<number>(0.5);

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

  const stemById = useMemo(
    () => new globalThis.Map(data.stems.map((stem) => [stem.stem_id, stem])),
    [data.stems]
  );

  const copiesByLayerAndStem = useMemo(() => {
    const map = new globalThis.Map<string, StemCopy>();
    for (const copy of copies) {
      map.set(`${copy.layer_id}::${copy.stem_id}`, copy);
    }
    return map;
  }, [copies]);

  const connectedLayersCountByStem = useMemo(() => {
    const stemToLayerIds = new globalThis.Map<string, Set<string>>();

    for (const stem of data.stems) {
      stemToLayerIds.set(stem.stem_id, new Set<string>());
    }

    for (const edge of data.edges) {
      stemToLayerIds.get(edge.source_stem_id)?.add(edge.layer_id);
      stemToLayerIds.get(edge.target_stem_id)?.add(edge.layer_id);
    }

    const countByStem = new globalThis.Map<string, number>();
    for (const [stemId, layerIds] of stemToLayerIds) {
      countByStem.set(stemId, layerIds.size);
    }

    return countByStem;
  }, [data.edges, data.stems]);

  const layerEdgeCountById = useMemo(() => {
    const edgeCountByLayerId = new globalThis.Map<string, number>();

    for (const layer of orderedLayers) {
      edgeCountByLayerId.set(layer.layer_id, 0);
    }

    for (const edge of data.edges) {
      edgeCountByLayerId.set(
        edge.layer_id,
        (edgeCountByLayerId.get(edge.layer_id) ?? 0) + 1
      );
    }

    return edgeCountByLayerId;
  }, [data.edges, orderedLayers]);

  const layerColorById = useMemo(() => {
    const colorById = new globalThis.Map<string, [number, number, number, number]>();
    for (const layer of orderedLayers) {
      colorById.set(
        layer.layer_id,
        hexToRgba(data.layerColors?.[layer.layer_id], EDGE_COLOR)
      );
    }
    return colorById;
  }, [data.layerColors, orderedLayers]);

  const layerAltitudeOrderById = useMemo(() => {
    const rankedLayers = [...orderedLayers].sort((left, right) => {
      const leftEdgeCount = layerEdgeCountById.get(left.layer_id) ?? 0;
      const rightEdgeCount = layerEdgeCountById.get(right.layer_id) ?? 0;

      if (leftEdgeCount !== rightEdgeCount) {
        return rightEdgeCount - leftEdgeCount;
      }

      return (left.order ?? 0) - (right.order ?? 0);
    });

    const orderByLayerId = new globalThis.Map<string, number>();
    rankedLayers.forEach((layer, index) => {
      orderByLayerId.set(layer.layer_id, index);
    });

    return orderByLayerId;
  }, [layerEdgeCountById, orderedLayers]);

  const stemsWithCopies = useMemo<StemWithCopy[]>(() => {
    const copyLayerId =
      activeLayerId === ALL_LAYERS_FILTER_ID
        ? orderedLayers[0]?.layer_id ?? ''
        : activeLayerId;

    return data.stems.map((stem) => ({
      ...stem,
      copy: copiesByLayerAndStem.get(`${copyLayerId}::${stem.stem_id}`) ?? null,
      connectedLayersCount:
        connectedLayersCountByStem.get(stem.stem_id) ?? 0,
    }));
  }, [
    activeLayerId,
    connectedLayersCountByStem,
    copiesByLayerAndStem,
    data.stems,
    orderedLayers,
  ]);

  const baseRadiusByZoom = getRadiusByZoom(currentZoom);
  const currentRadius = Math.round(baseRadiusByZoom * clamp(columnRadiusScale, 0.1, 1));
  const heightScaleByZoom = getHeightScaleByRadius(baseRadiusByZoom);

  const visibleEdges = useMemo<VisibleEdge[]>(() => {
    const edgeIndexByLayerId = new globalThis.Map<string, number>();
    orderedLayers.forEach((layer) => {
      edgeIndexByLayerId.set(layer.layer_id, 0);
    });

    return data.edges
      .filter((edge) => {
        if (activeLayerId !== ALL_LAYERS_FILTER_ID && edge.layer_id !== activeLayerId) {
          return false;
        }
        return true;
      })
      .map((edge) => {
        const source = stemById.get(edge.source_stem_id);
        const target = stemById.get(edge.target_stem_id);

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
            layerAltitudeOrderById.get(edge.layer_id) ?? 0,
            edgeOrderIndexInLayer,
            layerEdgeCountById.get(edge.layer_id) ?? 1,
            heightScaleByZoom
          ),
        };
      })
      .filter((edge): edge is VisibleEdge => edge !== null);
  }, [
    activeLayerId,
    data.edges,
    heightScaleByZoom,
    layerAltitudeOrderById,
    layerEdgeCountById,
    orderedLayers,
    stemById,
  ]);

  const layers: LayersList = [
    new StemRelation<VisibleEdge>({
      id: `stem-edges-${activeLayerId}`,
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
      getSourceColor: (item) => {
        if (!selectedStemId) {
          return layerColorById.get(item.layer_id) ?? EDGE_COLOR;
        }

        return isEdgeConnectedToSelectedStem(item, selectedStemId)
          ? EDGE_HIGHLIGHT_COLOR
          : EDGE_DIMMED_COLOR;
      },
      getTargetColor: (item) => {
        if (!selectedStemId) {
          return layerColorById.get(item.layer_id) ?? EDGE_COLOR;
        }

        return isEdgeConnectedToSelectedStem(item, selectedStemId)
          ? EDGE_HIGHLIGHT_COLOR
          : EDGE_DIMMED_COLOR;
      },
      widthUnits: 'pixels',
      getWidth: (item) => {
        const baseWidth = 1 + clamp((currentZoom - 3) / 7, 0, 1) * 2.5;
        if (!selectedStemId) {
          return baseWidth;
        }
        return isEdgeConnectedToSelectedStem(item, selectedStemId)
          ? baseWidth + 1.2
          : baseWidth;
      },
      getHeight: 0.06,
      updateTriggers: {
        getSourceColor: [selectedStemId, data.layerColors],
        getTargetColor: [selectedStemId, data.layerColors],
        getWidth: [selectedStemId, currentZoom],
      },
    }),
    new StemColumn<StemWithCopy>({
      id: `stems-${activeLayerId}`,
      data: stemsWithCopies,
      radius: currentRadius,
      elevationScale: COLUMN_ELEVATION_SCALE,
      getFillColor: (item) => {
        if (item.stem_id === selectedStemId) return SELECTED_COLOR;
        return getStemColor?.(item) ?? NODE_COLOR;
      },
      getLineColor: [255, 255, 255, 240],
      lineWidthMinPixels: 1,
      getElevation: () =>
        orderedLayers.length * COLUMN_ELEVATION_UNIT * heightScaleByZoom,
      updateTriggers: {
        getFillColor: [activeLayerId, selectedStemId, getStemColor],
        getElevation: [heightScaleByZoom, orderedLayers.length],
        radius: [currentRadius, columnRadiusScale],
      },
    }),
  ];

  if (showLabels) {
    layers.push(
      new TextLayer<StemWithCopy>({
        id: `stem-labels-${activeLayerId}`,
        data: stemsWithCopies,
        getPosition: (item) => [item.geo.lon, item.geo.lat],
        getText: (item) => item.label ?? item.stem_id,
        getColor: [20, 20, 20, 220],
        getSize: 14,
        getPixelOffset: [0, 14],
        sizeUnits: 'pixels',
      })
    );
  }

  const mapLayers = useMemo(
    () => [...layers, ...(overlayLayers ?? [])],
    [layers, overlayLayers]
  );

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
          WebGL недоступен в текущем окружении браузера.
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
        layers={mapLayers}
        width={width}
        height={height}
        onViewStateChange={(params: ViewStateChangeParameters) => {
          const zoom = params.viewState.zoom;
          if (typeof zoom === 'number') {
            setCurrentZoom(zoom);
          }
        }}
        onClick={(info) =>
          setSelectedStemId(
            (info.object as StemWithCopy | undefined)?.stem_id ?? ''
          )
        }
        getTooltip={({ object }) => {
          if (!object) {
            return null;
          }

          if (isStemWithCopy(object)) {
            return getTooltipText(object);
          }

          if (isVisibleEdge(object)) {
            return `Связь: ${object.edge_id}\nСлой: ${object.layer_id}\nИсточник: ${object.source_stem_id}\nЦель: ${object.target_stem_id}\nZ: ${Math.round(object.layerAltitude)}`;
          }

          return null;
        }}
      >
        <MapLibre mapStyle={mapStyle} />
      </DeckGL>

      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          p: 2,
          width: 300,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: 3,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        <Stack spacing={1.5}>
          <Typography
            variant="overline"
            sx={{ fontWeight: 700, letterSpacing: 1.2, color: '#455a64' }}
          >
            Управление картой
          </Typography>

          <FormControl size="small" fullWidth>
            <InputLabel id="stem-map-layer-select-label">Слой</InputLabel>
            <Select
              labelId="stem-map-layer-select-label"
              value={activeLayerId}
              label="Слой"
              onChange={(event: SelectChangeEvent<string>) => {
                setSelectedStemId('');
                setActiveLayerId(event.target.value);
              }}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value={ALL_LAYERS_FILTER_ID}>Все слои</MenuItem>
              {orderedLayers.map((layer) => (
                <MenuItem key={layer.layer_id} value={layer.layer_id}>
                  {layer.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ px: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#78909c', fontWeight: 500 }}>
              Радиус столбов
            </Typography>
            <Slider
              value={columnRadiusScale}
              min={0.1}
              max={1}
              step={0.1}
              onChange={(_, value) => setColumnRadiusScale(value as number)}
              valueLabelDisplay="auto"
              size="small"
              sx={{
                color: '#546e7a',
                '& .MuiSlider-thumb': { width: 14, height: 14 },
              }}
            />
          </Box>

          {activeLayer?.attribute_name && (
            <Typography variant="caption" sx={{ color: '#90a4ae' }}>
              Атрибут: {activeLayer.attribute_name}
            </Typography>
          )}

          {panelContent && (
            <>
              <Divider sx={{ borderColor: 'rgba(0,0,0,0.06)' }} />
              {panelContent}
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

export default StemMap;
