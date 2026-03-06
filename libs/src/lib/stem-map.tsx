import DeckGL from '@deck.gl/react';
import { TextLayer } from '@deck.gl/layers';
import { LayersList, ViewStateChangeParameters } from '@deck.gl/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
const HIGHLIGHT_COLOR: [number, number, number, number] = [255, 214, 0, 255];
const EDGE_COLOR: [number, number, number, number] = [80, 80, 80, 180];
const EDGE_HIGHLIGHT_COLOR: [number, number, number, number] = [250, 120, 20, 255];
const EDGE_DIMMED_COLOR: [number, number, number, number] = [130, 130, 130, 90];
const MIN_COLUMN_RADIUS = 900;
const MAX_COLUMN_RADIUS = 9310;
const ALL_LAYERS_FILTER_ID = '__all_layers__';
const EDGE_LAYER_BASE_ALTITUDE = 2500;
const EDGE_LAYER_ALTITUDE_STEP = 15000;
const EDGE_IN_LAYER_ALTITUDE_STEP = 220;
const COLUMN_ELEVATION_UNIT = 3500;

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
  return 4.4 - normalizedZoom * 4.1;
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

type FilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

const FILTER_OPS: { value: FilterOp; label: string }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'contains', label: '∋' },
];

type FilterAction = 'hide' | 'highlight';

const PRESET_HIGHLIGHT_COLORS = [
  '#FFD600',
  '#E53935',
  '#43A047',
  '#FF6D00',
  '#8E24AA',
  '#00ACC1',
];

interface AttributeFilter {
  id: string;
  key: string;
  op: FilterOp;
  value: string;
  action: FilterAction;
  highlightColor: string;
}

let nextFilterId = 1;

const matchesFilter = (
  properties: Record<string, unknown> | undefined,
  filter: AttributeFilter
): boolean => {
  if (!filter.key || filter.value === '') return true;
  const raw = properties?.[filter.key];
  if (raw === undefined || raw === null) return false;

  const strVal = String(raw);

  if (filter.op === 'contains') {
    return strVal.toLowerCase().includes(filter.value.toLowerCase());
  }

  const numProp = Number(raw);
  const numFilter = Number(filter.value);
  const canCompareNumbers = !isNaN(numProp) && !isNaN(numFilter);

  switch (filter.op) {
    case '=':
      return canCompareNumbers ? numProp === numFilter : strVal === filter.value;
    case '!=':
      return canCompareNumbers ? numProp !== numFilter : strVal !== filter.value;
    case '>':
      return canCompareNumbers ? numProp > numFilter : strVal > filter.value;
    case '<':
      return canCompareNumbers ? numProp < numFilter : strVal < filter.value;
    case '>=':
      return canCompareNumbers ? numProp >= numFilter : strVal >= filter.value;
    case '<=':
      return canCompareNumbers ? numProp <= numFilter : strVal <= filter.value;
    default:
      return true;
  }
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
  const [defaultColumnColor, setDefaultColumnColor] = useState<string>('#455A64');
  const [attributeFilters, setAttributeFilters] = useState<AttributeFilter[]>([]);

  const colorDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debouncedSetColumnColor = useCallback((color: string) => {
    clearTimeout(colorDebounceRef.current);
    colorDebounceRef.current = setTimeout(() => setDefaultColumnColor(color), 60);
  }, []);
  const debouncedSetFilterColor = useCallback(
    (filterId: string, color: string) => {
      clearTimeout(colorDebounceRef.current);
      colorDebounceRef.current = setTimeout(
        () =>
          setAttributeFilters((prev) =>
            prev.map((f) => (f.id === filterId ? { ...f, highlightColor: color } : f))
          ),
        60
      );
    },
    []
  );

  const availablePropertyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const stem of data.stems) {
      if (stem.properties) {
        for (const key of Object.keys(stem.properties)) {
          keys.add(key);
        }
      }
    }
    return [...keys].sort();
  }, [data.stems]);

  const addFilter = useCallback(() => {
    setAttributeFilters((prev) => [
      ...prev,
      {
        id: `af-${nextFilterId++}`,
        key: availablePropertyKeys[0] ?? '',
        op: '=' as FilterOp,
        value: '',
        action: 'hide',
        highlightColor: PRESET_HIGHLIGHT_COLORS[prev.length % PRESET_HIGHLIGHT_COLORS.length],
      },
    ]);
  }, [availablePropertyKeys]);

  const removeFilter = useCallback((filterId: string) => {
    setAttributeFilters((prev) => prev.filter((f) => f.id !== filterId));
  }, []);

  const updateFilter = useCallback(
    (filterId: string, patch: Partial<AttributeFilter>) => {
      setAttributeFilters((prev) =>
        prev.map((f) => (f.id === filterId ? { ...f, ...patch } : f))
      );
    },
    []
  );

  const activeFilters = useMemo(
    () => attributeFilters.filter((f) => f.key && f.value !== ''),
    [attributeFilters]
  );

  const { hiddenStemIds, highlightColorByStemId } = useMemo(() => {
    const hidden = new Set<string>();
    const colorMap = new globalThis.Map<string, string>();

    if (activeFilters.length === 0) return { hiddenStemIds: hidden, highlightColorByStemId: colorMap };

    for (const filter of activeFilters) {
      for (const stem of data.stems) {
        if (!matchesFilter(stem.properties, filter)) continue;
        if (filter.action === 'hide') {
          hidden.add(stem.stem_id);
        } else {
          colorMap.set(stem.stem_id, filter.highlightColor);
        }
      }
    }

    return { hiddenStemIds: hidden, highlightColorByStemId: colorMap };
  }, [activeFilters, data.stems]);

  const hasHideFilters = activeFilters.some((f) => f.action === 'hide');
  const filteredStemIds = hasHideFilters && hiddenStemIds.size > 0 ? hiddenStemIds : null;

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

  const maxConnectedLayersCount = useMemo(() => {
    let maxCount = 1;
    for (const count of connectedLayersCountByStem.values()) {
      if (count > maxCount) {
        maxCount = count;
      }
    }
    return maxCount;
  }, [connectedLayersCountByStem]);

  const stemsWithCopies = useMemo<StemWithCopy[]>(() => {
    const copyLayerId =
      activeLayerId === ALL_LAYERS_FILTER_ID
        ? orderedLayers[0]?.layer_id ?? ''
        : activeLayerId;

    const all = data.stems.map((stem) => ({
      ...stem,
      copy: copiesByLayerAndStem.get(`${copyLayerId}::${stem.stem_id}`) ?? null,
      connectedLayersCount:
        connectedLayersCountByStem.get(stem.stem_id) ?? 0,
    }));

    if (!filteredStemIds) return all;
    return all.filter((s) => !filteredStemIds.has(s.stem_id));
  }, [
    activeLayerId,
    connectedLayersCountByStem,
    copiesByLayerAndStem,
    data.stems,
    filteredStemIds,
    orderedLayers,
  ]);

  const baseRadiusByZoom = getRadiusByZoom(currentZoom);
  const currentRadius = Math.round(baseRadiusByZoom * clamp(columnRadiusScale, 0.1, 1));
  const heightScaleByZoom = getHeightScaleByRadius(baseRadiusByZoom);
  const edgeAltitudeScaleByZoom = getEdgeAltitudeScaleByZoom(currentZoom);

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
        if (filteredStemIds) {
          return (
            !filteredStemIds.has(edge.source_stem_id) &&
            !filteredStemIds.has(edge.target_stem_id)
          );
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
            edgeAltitudeScaleByZoom
          ),
        };
      })
      .filter((edge): edge is VisibleEdge => edge !== null);
  }, [
    activeLayerId,
    data.edges,
    edgeAltitudeScaleByZoom,
    filteredStemIds,
    layerAltitudeOrderById,
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
        const baseWidth = Math.max(1, (item.weight ?? 1) * 1.1);
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
        getWidth: selectedStemId,
      },
    }),
    new StemColumn<StemWithCopy>({
      id: `stems-${activeLayerId}`,
      data: stemsWithCopies,
      radius: currentRadius,
      elevationScale: 1.4,
      getFillColor: (item) => {
        if (item.stem_id === selectedStemId) return SELECTED_COLOR;
        const hlColor = highlightColorByStemId.get(item.stem_id);
        if (hlColor) return hexToRgba(hlColor, HIGHLIGHT_COLOR);
        return hexToRgba(defaultColumnColor, NODE_COLOR);
      },
      getLineColor: [255, 255, 255, 240],
      lineWidthMinPixels: 1,
      getElevation: () =>
        maxConnectedLayersCount * COLUMN_ELEVATION_UNIT * heightScaleByZoom,
      updateTriggers: {
        getFillColor: [activeLayerId, selectedStemId, highlightColorByStemId, defaultColumnColor],
        getElevation: [heightScaleByZoom, maxConnectedLayersCount],
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
          width: 240,
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

          <Box>
            <Typography variant="caption" sx={{ color: '#78909c', fontWeight: 500 }}>
              Цвет столбов
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
              {['#455A64', '#346DF1', '#43A047', '#E53935', '#FF6D00', '#8E24AA'].map((c) => (
                <Box
                  key={c}
                  onClick={() => setDefaultColumnColor(c)}
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: defaultColumnColor === c
                      ? '2px solid #37474f'
                      : '2px solid transparent',
                    transition: 'border 0.15s',
                    '&:hover': { transform: 'scale(1.15)' },
                  }}
                />
              ))}
              <input
                type="color"
                value={defaultColumnColor}
                onChange={(e) => debouncedSetColumnColor(e.target.value)}
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  border: 'none',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  background: 'transparent',
                }}
              />
            </Stack>
          </Box>

          {activeLayer?.attribute_name && (
            <Typography variant="caption" sx={{ color: '#90a4ae' }}>
              Атрибут: {activeLayer.attribute_name}
            </Typography>
          )}

          {availablePropertyKeys.length > 0 && (
            <>
              <Divider sx={{ borderColor: 'rgba(0,0,0,0.06)' }} />
              <Typography
                variant="overline"
                sx={{ fontWeight: 700, letterSpacing: 1.2, color: '#455a64', fontSize: 10 }}
              >
                Фильтры по атрибутам
              </Typography>
              <Stack spacing={0.8}>
                {attributeFilters.map((filter) => (
                  <Box
                    key={filter.id}
                    sx={{
                      background: 'rgba(236,239,241,0.6)',
                      borderRadius: 2,
                      p: 0.8,
                      borderLeft: filter.action === 'highlight'
                        ? `3px solid ${filter.highlightColor}`
                        : '3px solid #b0bec5',
                    }}
                  >
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                      <FormControl size="small" sx={{ flex: 1 }}>
                      <Select
                        value={filter.key}
                        onChange={(e) =>
                          updateFilter(filter.id, { key: e.target.value })
                        }
                        displayEmpty
                        sx={{ fontSize: 12, borderRadius: 1.5, background: '#fff' }}
                      >
                        {availablePropertyKeys.map((k) => (
                          <MenuItem key={k} value={k} sx={{ fontSize: 12 }}>
                            {k}
                          </MenuItem>
                        ))}
                      </Select>
                      </FormControl>
                      <IconButton
                        size="small"
                        onClick={() => removeFilter(filter.id)}
                        sx={{
                          p: 0.4,
                          color: '#78909c',
                          '&:hover': { color: '#e53935', background: 'rgba(229,57,53,0.08)' },
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Stack>

                    <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                      <FormControl size="small" sx={{ width: 58 }}>
                        <Select
                          value={filter.op}
                          onChange={(e) =>
                            updateFilter(filter.id, {
                              op: e.target.value as FilterOp,
                            })
                          }
                          sx={{ fontSize: 12, borderRadius: 1.5, background: '#fff' }}
                        >
                          {FILTER_OPS.map((op) => (
                            <MenuItem key={op.value} value={op.value} sx={{ fontSize: 12 }}>
                              {op.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        placeholder="Значение"
                        value={filter.value}
                        onChange={(e) =>
                          updateFilter(filter.id, { value: e.target.value })
                        }
                        sx={{
                          flex: 1,
                          '& .MuiOutlinedInput-root': { borderRadius: 1.5, background: '#fff' },
                        }}
                        inputProps={{ style: { fontSize: 12 } }}
                      />
                    </Stack>

                    <ToggleButtonGroup
                      value={filter.action}
                      exclusive
                      onChange={(_, val) => {
                        if (val) updateFilter(filter.id, { action: val as FilterAction });
                      }}
                      size="small"
                      fullWidth
                    >
                      <ToggleButton
                        value="hide"
                        sx={{
                          fontSize: 10,
                          textTransform: 'none',
                          py: 0.15,
                          '&.Mui-selected': {
                            background: 'rgba(229,57,53,0.1)',
                            color: '#c62828',
                            fontWeight: 700,
                          },
                        }}
                      >
                        Скрыть
                      </ToggleButton>
                      <ToggleButton
                        value="highlight"
                        sx={{
                          fontSize: 10,
                          textTransform: 'none',
                          py: 0.15,
                          '&.Mui-selected': {
                            background: `${filter.highlightColor}22`,
                            color: filter.highlightColor,
                            fontWeight: 700,
                          },
                        }}
                      >
                        Выделить
                      </ToggleButton>
                    </ToggleButtonGroup>

                    {filter.action === 'highlight' && (
                      <Stack direction="row" spacing={0.4} sx={{ mt: 0.5 }}>
                        {PRESET_HIGHLIGHT_COLORS.map((c) => (
                          <Box
                            key={c}
                            onClick={() => updateFilter(filter.id, { highlightColor: c })}
                            sx={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              backgroundColor: c,
                              cursor: 'pointer',
                              border: filter.highlightColor === c
                                ? '2px solid #37474f'
                                : '2px solid transparent',
                              transition: 'border 0.15s',
                              '&:hover': { transform: 'scale(1.2)' },
                            }}
                          />
                        ))}
                        <input
                          type="color"
                          value={filter.highlightColor}
                          onChange={(e) =>
                            debouncedSetFilterColor(filter.id, e.target.value)
                          }
                          style={{
                            width: 18,
                            height: 18,
                            padding: 0,
                            border: 'none',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            background: 'transparent',
                          }}
                        />
                      </Stack>
                    )}
                  </Box>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={addFilter}
                  size="small"
                  variant="text"
                  sx={{
                    fontSize: 11,
                    textTransform: 'none',
                    color: '#546e7a',
                    justifyContent: 'flex-start',
                  }}
                >
                  Добавить фильтр
                </Button>
                {activeFilters.length > 0 && (
                  <Typography variant="caption" sx={{ color: '#78909c' }}>
                    Скрыто: {hiddenStemIds.size} | Выделено: {highlightColorByStemId.size} / {data.stems.length}
                  </Typography>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

export default StemMap;
