import { PolygonLayer } from '@deck.gl/layers';
import { StemMap, StemMapInputData } from '@study/trunk-map';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { INITIAL_VIEW_STATE } from '../constants';

const STEM_MAP_STORAGE_KEY = 'stem-map-uploaded-data';

interface ClusterPolygonFeature {
  type: 'Feature';
  properties: {
    clusterId: number;
    pointCount: number;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

interface ClusterPolygonFeatureCollection {
  type: 'FeatureCollection';
  features: ClusterPolygonFeature[];
}

type ClusterAttributeType = 'numeric' | 'time';
type ClusterMode = 'auto' | 'quality' | 'scalable';

interface ClusterFeatureAttributeOption {
  key: string;
  type: ClusterAttributeType;
  weight: number;
}

const EMPTY_STEM_MAP_DATA: StemMapInputData = {
  layers: [],
  stems: [],
  edges: [],
  copies: 'implicit',
};

const getStoredStemMapData = (): StemMapInputData | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawData = localStorage.getItem(STEM_MAP_STORAGE_KEY);
  if (!rawData) {
    return null;
  }

  try {
    const parsedData = JSON.parse(rawData) as StemMapInputData;

    if (
      !Array.isArray(parsedData.layers) ||
      !Array.isArray(parsedData.stems) ||
      !Array.isArray(parsedData.edges)
    ) {
      return null;
    }

    return parsedData;
  } catch {
    return null;
  }
};

export function StemMapPage() {
  const currentData = useMemo(
    () => getStoredStemMapData() ?? EMPTY_STEM_MAP_DATA,
    []
  );
  const [minClusterSize, setMinClusterSize] = useState<number>(8);
  const [alpha, setAlpha] = useState<number>(12);
  const [spatialWeight, setSpatialWeight] = useState<number>(1);
  const [clusterMode, setClusterMode] = useState<ClusterMode>('auto');
  const [h3Resolution, setH3Resolution] = useState<number>(6);
  const [clusterHeightScale, setClusterHeightScale] = useState<number>(1);
  const [selectedAttributes, setSelectedAttributes] = useState<
    ClusterFeatureAttributeOption[]
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [clusters, setClusters] = useState<ClusterPolygonFeatureCollection | null>(
    null
  );

  const polygonOverlayLayer = useMemo(() => {
    if (!clusters) {
      return null;
    }

    return new PolygonLayer<ClusterPolygonFeature>({
      id: 'trunk-map-clusters',
      data: clusters.features,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: true,
      wireframe: true,
      lineWidthMinPixels: 3,
      getPolygon: (feature) => feature.geometry.coordinates[0],
      getFillColor: (feature) => {
        const seed = feature.properties.clusterId + 1;
        const pointCountOpacityBoost = Math.min(
          70,
          Math.floor(feature.properties.pointCount / 20)
        );
        return [
          (seed * 97) % 255,
          (seed * 163) % 255,
          (seed * 53) % 255,
          150 + pointCountOpacityBoost,
        ];
      },
      getLineColor: [10, 10, 10, 255],
      getLineWidth: 3,
      elevationScale: 12000 * clusterHeightScale,
      getElevation: () => 1,
      updateTriggers: {
        getElevation: [clusterHeightScale],
      },
      material: {
        ambient: 0.5,
        diffuse: 0.7,
        shininess: 32,
        specularColor: [220, 220, 220],
      },
    });
  }, [clusterHeightScale, clusters]);

  const availableAttributeKeys = useMemo(() => {
    const keysFromLayers = currentData.layers
      .map((layer) => layer.attribute_name)
      .filter((value): value is string => typeof value === 'string' && !!value);
    return [...new Set(keysFromLayers)];
  }, [currentData.layers]);

  const selectedAttributeByKey = useMemo(
    () =>
      new Map(
        selectedAttributes.map((attributeConfig) => [
          attributeConfig.key,
          attributeConfig,
        ])
      ),
    [selectedAttributes]
  );

  const toggleAttribute = (key: string, checked: boolean) => {
    setSelectedAttributes((previous) => {
      if (checked) {
        if (previous.some((item) => item.key === key)) {
          return previous;
        }
        return [...previous, { key, type: 'numeric', weight: 1 }];
      }
      return previous.filter((item) => item.key !== key);
    });
  };

  const updateSelectedAttribute = (
    key: string,
    patch: Partial<ClusterFeatureAttributeOption>
  ) => {
    setSelectedAttributes((previous) =>
      previous.map((item) =>
        item.key === key
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  };

  const handleBuildClusters = async () => {
    setErrorText('');
    setIsLoading(true);
    try {
      const payload = {
        points: currentData.stems.map((stem) => ({
          id: stem.stem_id,
          lat: stem.geo.lat,
          lon: stem.geo.lon,
          attributes: stem.properties ?? {},
        })),
        options: {
          minClusterSize,
          alpha,
          spatialWeight,
          mode: clusterMode,
          h3Resolution,
          featureAttributes: selectedAttributes,
        },
      };

      const { data } = await axios.post<ClusterPolygonFeatureCollection>(
        '/api/trunk-map/clusters',
        payload
      );
      setClusters(data);
    } catch {
      setErrorText(
        'Не удалось построить кластеры. Проверьте, что backend запущен и доступен.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <StemMap
        data={currentData}
        showLabels={false}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'}
        overlayLayers={polygonOverlayLayer ? [polygonOverlayLayer] : []}
      />
      <Paper
        elevation={3}
        sx={{
          position: 'absolute',
          top: 12,
          left: 240,
          zIndex: 10,
          p: 1.5,
          width: 320,
          background: '#ffffffee',
        }}
      >
        <Stack spacing={1.2}>
          <Typography variant="subtitle2">
            Формирование кластеров (backend)
          </Typography>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Высота кластеров: {clusterHeightScale.toFixed(1)}x
            </Typography>
            <Slider
              value={clusterHeightScale}
              min={0.2}
              max={8}
              step={0.1}
              onChange={(_, value) => setClusterHeightScale(value as number)}
              valueLabelDisplay="auto"
              size="small"
            />
          </Box>
          <TextField
            label="Min cluster size"
            type="number"
            size="small"
            value={minClusterSize}
            onChange={(event) => setMinClusterSize(Math.max(2, Number(event.target.value)))}
          />
          <TextField
            label="Alpha (км)"
            type="number"
            size="small"
            value={alpha}
            onChange={(event) => setAlpha(Math.max(0.1, Number(event.target.value)))}
          />
          <FormControl size="small" fullWidth>
            <Select
              value={clusterMode}
              onChange={(event) => setClusterMode(event.target.value as ClusterMode)}
            >
              <MenuItem value="auto">auto (recommended)</MenuItem>
              <MenuItem value="quality">quality (HDBSCAN points)</MenuItem>
              <MenuItem value="scalable">scalable (H3 + HDBSCAN)</MenuItem>
            </Select>
          </FormControl>
          {clusterMode !== 'quality' ? (
            <TextField
              label="H3 resolution (2-10)"
              type="number"
              size="small"
              value={h3Resolution}
              onChange={(event) =>
                setH3Resolution(
                  Math.max(2, Math.min(10, Math.floor(Number(event.target.value) || 6)))
                )
              }
            />
          ) : null}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Вес пространственной близости: {spatialWeight.toFixed(1)}
            </Typography>
            <Slider
              value={spatialWeight}
              min={0.2}
              max={5}
              step={0.1}
              onChange={(_, value) => setSpatialWeight(value as number)}
              valueLabelDisplay="auto"
              size="small"
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Атрибуты для кластеризации
            </Typography>
            <Stack spacing={0.8} sx={{ maxHeight: 180, overflowY: 'auto', mt: 0.5 }}>
              {availableAttributeKeys.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Атрибутные колонки не найдены
                </Typography>
              ) : (
                availableAttributeKeys.map((attributeKey) => {
                  const selectedOption = selectedAttributeByKey.get(attributeKey);
                  const isChecked = Boolean(selectedOption);

                  return (
                    <Box
                      key={attributeKey}
                      sx={{
                        border: '1px solid #ddd',
                        borderRadius: 1,
                        p: 0.6,
                        background: isChecked ? '#f8fbff' : '#fff',
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={isChecked}
                            onChange={(event) =>
                              toggleAttribute(attributeKey, event.target.checked)
                            }
                          />
                        }
                        label={
                          <Typography variant="caption" sx={{ fontWeight: 500 }}>
                            {attributeKey}
                          </Typography>
                        }
                        sx={{ m: 0 }}
                      />
                      {isChecked && selectedOption ? (
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                          <FormControl size="small" sx={{ minWidth: 110 }}>
                            <Select
                              value={selectedOption.type}
                              onChange={(event) =>
                                updateSelectedAttribute(attributeKey, {
                                  type: event.target.value as ClusterAttributeType,
                                })
                              }
                            >
                              <MenuItem value="numeric">numeric</MenuItem>
                              <MenuItem value="time">time</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            type="number"
                            label="weight"
                            value={selectedOption.weight}
                            onChange={(event) =>
                              updateSelectedAttribute(attributeKey, {
                                weight: Math.max(0.05, Number(event.target.value) || 1),
                              })
                            }
                            sx={{ width: 100 }}
                          />
                        </Stack>
                      ) : null}
                    </Box>
                  );
                })
              )}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={handleBuildClusters}
              disabled={isLoading || currentData.stems.length === 0}
            >
              {isLoading ? 'Построение...' : 'Построить кластеры'}
            </Button>
            <Button
              variant="outlined"
              disabled={!clusters}
              onClick={() => setClusters(null)}
            >
              Очистить
            </Button>
          </Stack>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Точек: {currentData.stems.length}
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              Кластеров: {clusters?.features.length ?? 0}
            </Typography>
          </Box>
          {errorText ? <Alert severity="error">{errorText}</Alert> : null}
        </Stack>
      </Paper>
      <Button
        component={Link}
        to="/trunk-map-csv"
        variant="contained"
        sx={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
      >
        Загрузить/редактировать CSV
      </Button>
    </div>
  );
}

export default StemMapPage;
