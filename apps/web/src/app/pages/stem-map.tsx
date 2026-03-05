import { PolygonLayer } from '@deck.gl/layers';
import { StemMap, StemMapInputData } from '@study/trunk-map';
import {
  Alert,
  Box,
  Button,
  Paper,
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
  const [clusterHeightScale, setClusterHeightScale] = useState<number>(1);
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

  const handleBuildClusters = async () => {
    setErrorText('');
    setIsLoading(true);
    try {
      const payload = {
        points: currentData.stems.map((stem) => ({
          id: stem.stem_id,
          lat: stem.geo.lat,
          lon: stem.geo.lon,
        })),
        options: {
          minClusterSize,
          alpha,
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
