import { PolygonLayer } from '@deck.gl/layers';
import { StemMap, StemMapInputData } from '@study/trunk-map';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useCallback, useMemo, useState } from 'react';
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

interface ClusterQuery {
  id: string;
  label: string;
  color: [number, number, number];
  minClusterSize: number;
  alpha: number;
  spatialWeight: number;
  clusterMode: ClusterMode;
  h3Resolution: number;
  heightScale: number;
  selectedAttributes: ClusterFeatureAttributeOption[];
  clusters: ClusterPolygonFeatureCollection | null;
  isLoading: boolean;
  errorText: string;
}

const QUERY_COLORS: [number, number, number][] = [
  [41, 121, 255],
  [229, 57, 53],
  [67, 160, 71],
  [255, 179, 0],
  [142, 36, 170],
  [0, 151, 167],
  [244, 81, 30],
  [84, 110, 122],
];

let nextQueryId = 1;

const createQuery = (index: number): ClusterQuery => ({
  id: `q-${nextQueryId++}`,
  label: `Выборка ${nextQueryId - 1}`,
  color: QUERY_COLORS[index % QUERY_COLORS.length],
  minClusterSize: 8,
  alpha: 12,
  spatialWeight: 1,
  clusterMode: 'auto',
  h3Resolution: 6,
  heightScale: 1,
  selectedAttributes: [],
  clusters: null,
  isLoading: false,
  errorText: '',
});

const PANEL_SX = {
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(12px)',
  borderRadius: 3,
  border: '1px solid rgba(0,0,0,0.08)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
} as const;

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

  const [queries, setQueries] = useState<ClusterQuery[]>([]);
  const [expandedQueryId, setExpandedQueryId] = useState<string | false>(false);

  const updateQuery = useCallback(
    (queryId: string, patch: Partial<ClusterQuery>) => {
      setQueries((prev) =>
        prev.map((q) => (q.id === queryId ? { ...q, ...patch } : q))
      );
    },
    []
  );

  const addQuery = useCallback(() => {
    setQueries((prev) => {
      const newQuery = createQuery(prev.length);
      return [...prev, newQuery];
    });
    setQueries((prev) => {
      setExpandedQueryId(prev[prev.length - 1].id);
      return prev;
    });
  }, []);

  const removeQuery = useCallback(
    (queryId: string) => {
      setQueries((prev) => prev.filter((q) => q.id !== queryId));
      if (expandedQueryId === queryId) {
        setExpandedQueryId(false);
      }
    },
    [expandedQueryId]
  );

  const handleBuildClusters = useCallback(
    async (queryId: string) => {
      const query = queries.find((q) => q.id === queryId);
      if (!query) return;

      updateQuery(queryId, { errorText: '', isLoading: true });
      try {
        const payload = {
          points: currentData.stems.map((stem) => ({
            id: stem.stem_id,
            lat: stem.geo.lat,
            lon: stem.geo.lon,
            attributes: stem.properties ?? {},
          })),
          options: {
            minClusterSize: query.minClusterSize,
            alpha: query.alpha,
            spatialWeight: query.spatialWeight,
            mode: query.clusterMode,
            h3Resolution: query.h3Resolution,
            featureAttributes: query.selectedAttributes,
          },
        };

        const { data } = await axios.post<ClusterPolygonFeatureCollection>(
          '/api/trunk-map/clusters',
          payload
        );
        updateQuery(queryId, { clusters: data, isLoading: false });
      } catch {
        updateQuery(queryId, {
          errorText:
            'Не удалось построить кластеры. Проверьте, что backend запущен и доступен.',
          isLoading: false,
        });
      }
    },
    [currentData.stems, queries, updateQuery]
  );

  const polygonOverlayLayers = useMemo(() => {
    const layers: PolygonLayer<ClusterPolygonFeature>[] = [];

    for (const query of queries) {
      if (!query.clusters) continue;

      const [r, g, b] = query.color;

      layers.push(
        new PolygonLayer<ClusterPolygonFeature>({
          id: `cluster-layer-${query.id}`,
          data: query.clusters.features,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: true,
          wireframe: true,
          lineWidthMinPixels: 3,
          getPolygon: (feature) => feature.geometry.coordinates[0],
          getFillColor: (_feature) => [r, g, b, 180],
          getLineColor: [r * 0.4, g * 0.4, b * 0.4, 255],
          getLineWidth: 3,
          elevationScale: 12000 * query.heightScale,
          getElevation: () => 1,
          updateTriggers: {
            getElevation: [query.heightScale],
          },
          material: {
            ambient: 0.5,
            diffuse: 0.7,
            shininess: 32,
            specularColor: [220, 220, 220],
          },
        })
      );
    }

    return layers;
  }, [queries]);

  const availableAttributeKeys = useMemo(() => {
    const keysFromLayers = currentData.layers
      .map((layer) => layer.attribute_name)
      .filter((value): value is string => typeof value === 'string' && !!value);
    return [...new Set(keysFromLayers)];
  }, [currentData.layers]);

  const totalClusters = useMemo(
    () =>
      queries.reduce((sum, q) => sum + (q.clusters?.features.length ?? 0), 0),
    [queries]
  );

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <StemMap
        data={currentData}
        showLabels={false}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle="https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl"
        overlayLayers={polygonOverlayLayers}
      />

      {/* Cluster panel */}
      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          p: 2,
          width: 330,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          ...PANEL_SX,
        }}
      >
        <Stack spacing={1.2}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: 1.2,
                color: '#37474f',
              }}
            >
              Кластерные выборки
            </Typography>
            <Chip
              label={`${totalClusters}`}
              size="small"
              sx={{
                height: 20,
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(41,121,255,0.1)',
                color: '#2979ff',
              }}
            />
          </Stack>

          {queries.map((query) => (
            <ClusterQueryAccordion
              key={query.id}
              query={query}
              expanded={expandedQueryId === query.id}
              onToggle={() =>
                setExpandedQueryId(
                  expandedQueryId === query.id ? false : query.id
                )
              }
              onUpdate={(patch) => updateQuery(query.id, patch)}
              onRemove={() => removeQuery(query.id)}
              onBuild={() => handleBuildClusters(query.id)}
              availableAttributeKeys={availableAttributeKeys}
              stemsCount={currentData.stems.length}
            />
          ))}

          <Button
            startIcon={<AddIcon />}
            onClick={addQuery}
            size="small"
            variant="outlined"
            fullWidth
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              borderStyle: 'dashed',
              color: '#546e7a',
              borderColor: '#b0bec5',
              '&:hover': {
                borderColor: '#2979ff',
                color: '#2979ff',
                borderStyle: 'dashed',
                background: 'rgba(41,121,255,0.04)',
              },
            }}
          >
            Добавить выборку
          </Button>

          <Typography
            variant="caption"
            sx={{ color: '#90a4ae', textAlign: 'center' }}
          >
            {currentData.stems.length} точек
          </Typography>
        </Stack>
      </Paper>

      {/* CSV button */}
      <Tooltip title="Загрузить или редактировать CSV данные" arrow>
        <Button
          component={Link}
          to="/trunk-map-csv"
          variant="contained"
          size="small"
          startIcon={<FileUploadIcon />}
          sx={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            zIndex: 10,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            px: 2.5,
            py: 1,
            background: 'rgba(55,71,79,0.88)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            '&:hover': {
              background: 'rgba(55,71,79,0.95)',
            },
          }}
        >
          CSV
        </Button>
      </Tooltip>
    </div>
  );
}

/* ─── Accordion for one cluster query ─── */

interface ClusterQueryAccordionProps {
  query: ClusterQuery;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<ClusterQuery>) => void;
  onRemove: () => void;
  onBuild: () => void;
  availableAttributeKeys: string[];
  stemsCount: number;
}

function ClusterQueryAccordion({
  query,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  onBuild,
  availableAttributeKeys,
  stemsCount,
}: ClusterQueryAccordionProps) {
  const [r, g, b] = query.color;
  const rgb = `rgb(${r},${g},${b})`;
  const rgbLight = `rgba(${r},${g},${b},0.08)`;

  const selectedAttributeByKey = useMemo(
    () => new Map(query.selectedAttributes.map((attr) => [attr.key, attr])),
    [query.selectedAttributes]
  );

  const toggleAttribute = (key: string, checked: boolean) => {
    const prev = query.selectedAttributes;
    if (checked) {
      if (prev.some((item) => item.key === key)) return;
      onUpdate({
        selectedAttributes: [...prev, { key, type: 'numeric', weight: 1 }],
      });
    } else {
      onUpdate({
        selectedAttributes: prev.filter((item) => item.key !== key),
      });
    }
  };

  const updateAttribute = (
    key: string,
    patch: Partial<ClusterFeatureAttributeOption>
  ) => {
    onUpdate({
      selectedAttributes: query.selectedAttributes.map((item) =>
        item.key === key ? { ...item, ...patch } : item
      ),
    });
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={onToggle}
      disableGutters
      sx={{
        '&:before': { display: 'none' },
        border: 'none',
        borderLeft: `3px solid ${rgb}`,
        borderRadius: '10px !important',
        overflow: 'hidden',
        background: expanded ? rgbLight : 'rgba(236,239,241,0.4)',
        boxShadow: expanded
          ? `0 2px 12px rgba(${r},${g},${b},0.12)`
          : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: '#78909c' }} />}
        sx={{
          minHeight: 38,
          px: 1.5,
          '& .MuiAccordionSummary-content': { my: 0.4 },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ width: '100%', minWidth: 0 }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: rgb,
              flexShrink: 0,
              boxShadow: `0 0 0 2px rgba(${r},${g},${b},0.25)`,
            }}
          />
          <Typography
            variant="body2"
            noWrap
            sx={{ fontWeight: 600, flexGrow: 1, fontSize: 13, color: '#37474f' }}
          >
            {query.label}
          </Typography>
          {query.clusters && (
            <Chip
              label={query.clusters.features.length}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 700,
                backgroundColor: rgb,
                color: '#fff',
              }}
            />
          )}
          <Box
            component="span"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onRemove();
              }
            }}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 0.3,
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#b0bec5',
              '&:hover': { color: '#e53935', background: 'rgba(229,57,53,0.08)' },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </Box>
        </Stack>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, pb: 1.5, px: 1.5 }}>
        <Stack spacing={1}>
          <TextField
            label="Название"
            size="small"
            value={query.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            fullWidth
            sx={fieldSx}
          />

          <Stack direction="row" spacing={1}>
            <TextField
              label="Min размер"
              type="number"
              size="small"
              value={query.minClusterSize}
              onChange={(e) =>
                onUpdate({
                  minClusterSize: Math.max(2, Number(e.target.value)),
                })
              }
              sx={{ ...fieldSx, flex: 1 }}
            />
            <TextField
              label="Alpha, км"
              type="number"
              size="small"
              value={query.alpha}
              onChange={(e) =>
                onUpdate({ alpha: Math.max(0.1, Number(e.target.value)) })
              }
              sx={{ ...fieldSx, flex: 1 }}
            />
          </Stack>

          <FormControl size="small" fullWidth>
            <InputLabel>Режим</InputLabel>
            <Select
              value={query.clusterMode}
              label="Режим"
              onChange={(e) =>
                onUpdate({ clusterMode: e.target.value as ClusterMode })
              }
              sx={{ borderRadius: 2, fontSize: 13 }}
            >
              <MenuItem value="auto">auto</MenuItem>
              <MenuItem value="quality">quality (HDBSCAN)</MenuItem>
              <MenuItem value="scalable">scalable (H3)</MenuItem>
            </Select>
          </FormControl>

          {query.clusterMode !== 'quality' && (
            <TextField
              label="H3 resolution (2-10)"
              type="number"
              size="small"
              value={query.h3Resolution}
              onChange={(e) =>
                onUpdate({
                  h3Resolution: Math.max(
                    2,
                    Math.min(10, Math.floor(Number(e.target.value) || 6))
                  ),
                })
              }
              sx={fieldSx}
            />
          )}

          <SliderField
            label="Пространственный вес"
            value={query.spatialWeight}
            min={0.2}
            max={5}
            step={0.1}
            color={rgb}
            onChange={(v) => onUpdate({ spatialWeight: v })}
          />

          <SliderField
            label="Высота кластеров"
            value={query.heightScale}
            min={0.2}
            max={8}
            step={0.1}
            color={rgb}
            onChange={(v) => onUpdate({ heightScale: v })}
          />

          {availableAttributeKeys.length > 0 && (
            <Box>
              <Typography
                variant="caption"
                sx={{ color: '#78909c', fontWeight: 500, fontSize: 11 }}
              >
                Атрибуты для кластеризации
              </Typography>
              <Stack
                spacing={0.6}
                sx={{ maxHeight: 140, overflowY: 'auto', mt: 0.5 }}
              >
                {availableAttributeKeys.map((attrKey) => {
                  const selected = selectedAttributeByKey.get(attrKey);
                  const isChecked = Boolean(selected);

                  return (
                    <Box
                      key={attrKey}
                      sx={{
                        borderRadius: 2,
                        p: 0.5,
                        background: isChecked
                          ? rgbLight
                          : 'rgba(236,239,241,0.5)',
                        transition: 'background 0.15s',
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={isChecked}
                            onChange={(e) =>
                              toggleAttribute(attrKey, e.target.checked)
                            }
                            sx={{
                              p: 0.3,
                              color: '#b0bec5',
                              '&.Mui-checked': { color: rgb },
                            }}
                          />
                        }
                        label={
                          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                            {attrKey}
                          </Typography>
                        }
                        sx={{ m: 0 }}
                      />
                      {isChecked && selected && (
                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.3, pl: 3 }} alignItems="center">
                          <FormControl size="small" sx={{ minWidth: 80 }}>
                            <Select
                              value={selected.type}
                              onChange={(e) =>
                                updateAttribute(attrKey, {
                                  type: e.target
                                    .value as ClusterAttributeType,
                                })
                              }
                              sx={{
                                fontSize: 11,
                                borderRadius: 1.5,
                                '& .MuiSelect-select': { py: '4px' },
                              }}
                            >
                              <MenuItem value="numeric">numeric</MenuItem>
                              <MenuItem value="time">time</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            type="number"
                            label="вес"
                            value={selected.weight}
                            onChange={(e) =>
                              updateAttribute(attrKey, {
                                weight: Math.max(
                                  0.05,
                                  Number(e.target.value) || 1
                                ),
                              })
                            }
                            sx={{
                              width: 52,
                              ...fieldSx,
                              '& .MuiInputBase-input': { fontSize: 11, py: '4px', px: 0.6 },
                              '& .MuiInputLabel-root': { fontSize: 10 },
                            }}
                          />
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          )}

          <Stack direction="row" spacing={1} sx={{ pt: 0.5 }}>
            <Button
              variant="contained"
              onClick={onBuild}
              disabled={query.isLoading || stemsCount === 0}
              size="small"
              sx={{
                flex: 1,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: rgb,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: rgb,
                  filter: 'brightness(0.9)',
                  boxShadow: `0 3px 10px rgba(${r},${g},${b},0.3)`,
                },
              }}
            >
              {query.isLoading ? 'Построение...' : 'Построить'}
            </Button>
            <Button
              variant="text"
              size="small"
              disabled={!query.clusters}
              onClick={() => onUpdate({ clusters: null })}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                color: '#78909c',
              }}
            >
              Сбросить
            </Button>
          </Stack>

          {query.errorText && (
            <Alert
              severity="error"
              sx={{ py: 0, borderRadius: 2, fontSize: 12 }}
            >
              {query.errorText}
            </Alert>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

/* ─── Shared helpers ─── */

const fieldSx = {
  '& .MuiOutlinedInput-root': { borderRadius: 2 },
} as const;

function SliderField({
  label,
  value,
  min,
  max,
  step,
  color,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography
          variant="caption"
          sx={{ color: '#78909c', fontWeight: 500, fontSize: 11 }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: '#546e7a', fontWeight: 600, fontSize: 11 }}
        >
          {value.toFixed(1)}
        </Typography>
      </Stack>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => onChange(v as number)}
        size="small"
        sx={{
          color,
          '& .MuiSlider-thumb': { width: 12, height: 12 },
          mt: -0.3,
        }}
      />
    </Box>
  );
}

export default StemMapPage;
