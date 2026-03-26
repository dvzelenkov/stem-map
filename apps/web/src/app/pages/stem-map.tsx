import { PolygonLayer } from '@deck.gl/layers';
import { Edge, Layer, Stem, StemMap, StemMapInputData } from '@study/trunk-map';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FilterListIcon from '@mui/icons-material/FilterList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemText,
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
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { INITIAL_VIEW_STATE } from '../constants';
import { getGeneratedLayers, mapStems, parseCsv, clearEditorTablesFromIDB } from './stem-map-csv';

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
type ClusterFilterOp = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

interface ClusterFeatureAttributeOption {
  key: string;
  type: ClusterAttributeType;
  weight: number;
}

interface ClusterStemFilter {
  id: string;
  key: string;
  op: ClusterFilterOp;
  value: string;
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
  selectedGroups: string[];
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
let nextClusterFilterId = 1;

const CLUSTER_FILTER_OPS: { value: ClusterFilterOp; label: string }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
];

const stemMatchesClusterFilter = (
  properties: Record<string, unknown> | undefined,
  filter: ClusterStemFilter
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
  const canCompare = !isNaN(numProp) && !isNaN(numFilter);

  switch (filter.op) {
    case '=': return canCompare ? numProp === numFilter : strVal === filter.value;
    case '!=': return canCompare ? numProp !== numFilter : strVal !== filter.value;
    case '>': return canCompare ? numProp > numFilter : strVal > filter.value;
    case '<': return canCompare ? numProp < numFilter : strVal < filter.value;
    case '>=': return canCompare ? numProp >= numFilter : strVal >= filter.value;
    case '<=': return canCompare ? numProp <= numFilter : strVal <= filter.value;
    default: return true;
  }
};

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
  selectedGroups: [],
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

const GROUP_COLORS = [
  '#1976d2', '#d32f2f', '#388e3c', '#f57c00',
  '#7b1fa2', '#0097a7', '#5d4037', '#455a64',
  '#c2185b', '#00796b', '#fbc02d', '#512da8',
];

type FilterMode = 'hide' | 'recolor';

interface StemGroup {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  filters: ClusterStemFilter[];
  filterMode: FilterMode;
  filterColor: string;
  stems: Stem[];
  layers: Layer[];
  edges: Edge[];
  layerColors?: Record<string, string>;
}

let nextGroupId = 1;

const IDB_NAME = 'stem-map-db';
const IDB_VERSION = 1;
const IDB_STORE = 'groups';
const IDB_KEY = 'all-groups';

const openGroupsDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const loadGroupsFromIDB = async (): Promise<StemGroup[]> => {
  try {
    const db = await openGroupsDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const data = req.result;
        if (!Array.isArray(data)) {
          resolve([]);
          return;
        }
        resolve(
          data.map((g: StemGroup) => ({
            ...g,
            filters: g.filters ?? [],
            filterMode: g.filterMode ?? 'hide',
            filterColor: g.filterColor ?? '#9e9e9e',
          }))
        );
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

const saveGroupsToIDB = async (groups: StemGroup[]): Promise<void> => {
  try {
    const db = await openGroupsDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(groups, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // silently fail on save errors
  }
};

const mergeGroupsData = (groups: StemGroup[]): StemMapInputData => {
  const visible = groups.filter((g) => g.visible);
  if (!visible.length) return EMPTY_STEM_MAP_DATA;

  const allStems: Stem[] = [];
  const allLayers: Layer[] = [];
  const allEdges: Edge[] = [];
  const layerIds = new Set<string>();
  const mergedLayerColors: Record<string, string> = {};

  for (const group of visible) {
    const hasFilters = group.filters.length > 0;

    if (hasFilters && group.filterMode === 'recolor') {
      for (const stem of group.stems) {
        const matches = group.filters.every((f) =>
          stemMatchesClusterFilter(stem.properties, f)
        );
        allStems.push({
          ...stem,
          properties: {
            ...stem.properties,
            __group: group.name,
            __groupColor: matches ? group.color : group.filterColor,
          },
        });
      }
    } else {
      const groupStems = hasFilters
        ? group.stems.filter((stem) =>
            group.filters.every((f) =>
              stemMatchesClusterFilter(stem.properties, f)
            )
          )
        : group.stems;
      for (const stem of groupStems) {
        allStems.push({
          ...stem,
          properties: { ...stem.properties, __group: group.name, __groupColor: group.color },
        });
      }
    }

    for (const layer of group.layers) {
      if (!layerIds.has(layer.layer_id)) {
        allLayers.push(layer);
        layerIds.add(layer.layer_id);
      }
    }
    allEdges.push(...group.edges);

    if (group.layerColors) {
      Object.assign(mergedLayerColors, group.layerColors);
    }
  }

  const stemIdSet = new Set(allStems.map((s) => s.stem_id));
  const validEdges = allEdges.filter(
    (edge) => stemIdSet.has(edge.source_stem_id) && stemIdSet.has(edge.target_stem_id)
  );

  return {
    layers: allLayers,
    stems: allStems,
    edges: validEdges,
    copies: 'implicit',
    layerColors: Object.keys(mergedLayerColors).length > 0 ? mergedLayerColors : undefined,
  };
};

export function StemMapPage() {
  const groupsRef = useRef<StemGroup[]>([]);
  const [groupsVersion, setGroupsVersion] = useState(0);
  const [groupsReady, setGroupsReady] = useState(false);

  const groups = groupsRef.current;

  const setGroups = useCallback(
    (updater: StemGroup[] | ((prev: StemGroup[]) => StemGroup[])) => {
      groupsRef.current = typeof updater === 'function' ? updater(groupsRef.current) : updater;
      setGroupsVersion((v) => v + 1);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    loadGroupsFromIDB().then((stored) => {
      if (cancelled) return;
      if (stored.length) {
        setGroups(stored);
      } else {
        const legacyData = getStoredStemMapData();
        if (legacyData && legacyData.stems.length > 0) {
          const migrated: StemGroup[] = [
            {
              id: `g-${nextGroupId++}`,
              name: 'Импорт',
              color: GROUP_COLORS[0],
              visible: true,
              filters: [],
              filterMode: 'hide',
              filterColor: '#9e9e9e',
              stems: legacyData.stems,
              layers: legacyData.layers,
              edges: legacyData.edges,
            },
          ];
          setGroups(migrated);
          saveGroupsToIDB(migrated);
        }
      }
      setGroupsReady(true);
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [expandedGroupId, setExpandedGroupId] = useState<string | false>(
    false
  );
  const importOverlayRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentData = useMemo(() => mergeGroupsData(groups), [groupsVersion]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupNames = useMemo(() => groups.map((g) => g.name), [groupsVersion]);

  useEffect(() => {
    if (!groupsReady) return;
    const timer = setTimeout(() => {
      saveGroupsToIDB(groupsRef.current);
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsVersion, groupsReady]);

  const handleImportCsvFiles = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || !files.length) return;

      if (importOverlayRef.current) importOverlayRef.current.style.display = 'flex';
      await new Promise<void>((resolve) => { setTimeout(resolve, 50); });

      try {
        const newGroups: StemGroup[] = [];
        const currentLen = groupsRef.current.length;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          try {
            const text = await file.text();
            const csvData = parseCsv(text);
            const name = file.name.replace(/\.csv$/i, '');
            const layers = getGeneratedLayers(csvData.headers);
            const stems = mapStems(csvData.rows, csvData.headers);
            newGroups.push({
              id: `g-${nextGroupId++}`,
              name,
              color:
                GROUP_COLORS[
                  (currentLen + newGroups.length) % GROUP_COLORS.length
                ],
              visible: true,
              filters: [],
              filterMode: 'hide',
              filterColor: '#9e9e9e',
              stems,
              layers,
              edges: [],
            });
          } catch {
            // skip malformed files
          }
        }
        if (newGroups.length) {
          setGroups((prev) => [...prev, ...newGroups]);
          localStorage.removeItem('stem-map-csv-editor-data');
          clearEditorTablesFromIDB();
        }
      } finally {
        if (importOverlayRef.current) importOverlayRef.current.style.display = 'none';
      }
      event.target.value = '';
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleGroupVisibility = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, visible: !g.visible } : g))
    );
  }, []);

  const removeGroup = useCallback(
    (groupId: string) => {
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (expandedGroupId === groupId) setExpandedGroupId(false);
    },
    [expandedGroupId]
  );

  const updateGroup = useCallback(
    (groupId: string, patch: Partial<StemGroup>) => {
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
      );
    },
    []
  );

  const groupPropertyKeysMap = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const group of groups) {
      const keys = new Set<string>();
      for (const stem of group.stems) {
        if (stem.properties) {
          for (const k of Object.keys(stem.properties)) {
            if (!k.startsWith('__')) keys.add(k);
          }
        }
      }
      result[group.id] = [...keys].sort();
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsVersion]);

  const groupFilteredCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.id] =
        group.filters.length === 0
          ? group.stems.length
          : group.stems.filter((stem) =>
              group.filters.every((f) =>
                stemMatchesClusterFilter(stem.properties, f)
              )
            ).length;
    }
    return counts;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsVersion]);

  const getStemColor = useCallback((stem: Stem): [number, number, number, number] | undefined => {
    const color = stem.properties?.__groupColor;
    if (typeof color !== 'string') return undefined;
    const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(color);
    if (!match) return undefined;
    return [
      parseInt(match[1], 16),
      parseInt(match[2], 16),
      parseInt(match[3], 16),
      220,
    ];
  }, []);

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
        let filteredStems = currentData.stems;
        if (query.selectedGroups.length > 0) {
          filteredStems = filteredStems.filter((stem) =>
            query.selectedGroups.includes(
              String(stem.properties?.__group ?? '')
            )
          );
        }

        const payload = {
          points: filteredStems.map((stem) => ({
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
      <div
        ref={importOverlayRef}
        style={{
          display: 'none',
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
          color: '#fff',
        }}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body2">Импорт файлов…</Typography>
      </div>
      <StemMap
        data={currentData}
        showLabels={false}
        initialViewState={INITIAL_VIEW_STATE}
        getStemColor={getStemColor}
        mapStyle="https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl"
        overlayLayers={polygonOverlayLayers}
        panelContent={
          <Stack spacing={1.2}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Typography
              variant="overline"
              sx={{ fontWeight: 700, letterSpacing: 1.2, color: '#37474f' }}
            >
              Группы файлов
            </Typography>
            <Chip
              label={`${groups.length}`}
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

          {groups.map((group) => (
            <Accordion
              key={group.id}
              expanded={expandedGroupId === group.id}
              onChange={() =>
                setExpandedGroupId(
                  expandedGroupId === group.id ? false : group.id
                )
              }
              disableGutters
              sx={{
                '&:before': { display: 'none' },
                border: 'none',
                borderLeft: `3px solid ${group.color}`,
                borderRadius: '10px !important',
                overflow: 'hidden',
                background:
                  expandedGroupId === group.id
                    ? `${group.color}14`
                    : 'rgba(236,239,241,0.4)',
                boxShadow: 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <AccordionSummary
                expandIcon={
                  <ExpandMoreIcon sx={{ fontSize: 18, color: '#78909c' }} />
                }
                sx={{
                  minHeight: 38,
                  px: 1.5,
                  '& .MuiAccordionSummary-content': { my: 0.4 },
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.8}
                  sx={{ width: '100%', minWidth: 0 }}
                >
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupVisibility(group.id);
                    }}
                    sx={{
                      p: 0.2,
                      color: group.visible ? group.color : '#b0bec5',
                    }}
                  >
                    {group.visible ? (
                      <VisibilityIcon sx={{ fontSize: 16 }} />
                    ) : (
                      <VisibilityOffIcon sx={{ fontSize: 16 }} />
                    )}
                  </IconButton>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontWeight: 600,
                      flexGrow: 1,
                      fontSize: 13,
                      color: group.visible ? '#37474f' : '#b0bec5',
                    }}
                  >
                    {group.name}
                  </Typography>
                  <Chip
                    label={group.stems.length}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 700,
                      background: 'rgba(0,0,0,0.06)',
                    }}
                  />
                  <Box
                    component="span"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(group.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        removeGroup(group.id);
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
                      '&:hover': {
                        color: '#e53935',
                        background: 'rgba(229,57,53,0.08)',
                      },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </Box>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5, px: 1.5 }}>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#78909c',
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      Цвет
                    </Typography>
                    <input
                      type="color"
                      value={group.color}
                      onChange={(e) =>
                        updateGroup(group.id, { color: e.target.value })
                      }
                      style={{
                        width: 28,
                        height: 20,
                        padding: 0,
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    />
                  </Stack>

                  <Divider
                    sx={{ my: 0.5, borderColor: 'rgba(0,0,0,0.06)' }}
                  />
                  <Box>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={0.5}
                      >
                        <FilterListIcon
                          sx={{ fontSize: 14, color: '#78909c' }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            color: '#78909c',
                            fontWeight: 500,
                            fontSize: 11,
                          }}
                        >
                          Фильтр стволов
                        </Typography>
                      </Stack>
                      <Chip
                        label={`${groupFilteredCounts[group.id] ?? group.stems.length} / ${group.stems.length}`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 600,
                          background: 'rgba(0,0,0,0.05)',
                        }}
                      />
                    </Stack>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {group.filters.map((filter) => (
                        <Stack
                          key={filter.id}
                          direction="row"
                          spacing={0.4}
                          alignItems="center"
                        >
                          <FormControl
                            size="small"
                            sx={{ minWidth: 70, flex: 1 }}
                          >
                            <Select
                              displayEmpty
                              value={filter.key}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  filters: group.filters.map((f) =>
                                    f.id === filter.id
                                      ? { ...f, key: e.target.value }
                                      : f
                                  ),
                                })
                              }
                              sx={{
                                fontSize: 11,
                                borderRadius: 1.5,
                                '& .MuiSelect-select': { py: '3px' },
                              }}
                            >
                              <MenuItem value="" sx={{ fontSize: 11 }}>
                                <em>Ключ</em>
                              </MenuItem>
                              {(groupPropertyKeysMap[group.id] ?? []).map(
                                (k) => (
                                  <MenuItem
                                    key={k}
                                    value={k}
                                    sx={{ fontSize: 11 }}
                                  >
                                    {k}
                                  </MenuItem>
                                )
                              )}
                            </Select>
                          </FormControl>
                          <FormControl size="small" sx={{ minWidth: 42 }}>
                            <Select
                              value={filter.op}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  filters: group.filters.map((f) =>
                                    f.id === filter.id
                                      ? {
                                          ...f,
                                          op: e.target
                                            .value as ClusterFilterOp,
                                        }
                                      : f
                                  ),
                                })
                              }
                              sx={{
                                fontSize: 11,
                                borderRadius: 1.5,
                                '& .MuiSelect-select': {
                                  py: '3px',
                                  px: 0.8,
                                },
                              }}
                            >
                              {CLUSTER_FILTER_OPS.map((op) => (
                                <MenuItem
                                  key={op.value}
                                  value={op.value}
                                  sx={{ fontSize: 11 }}
                                >
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
                              updateGroup(group.id, {
                                filters: group.filters.map((f) =>
                                  f.id === filter.id
                                    ? { ...f, value: e.target.value }
                                    : f
                                ),
                              })
                            }
                            sx={{
                              flex: 1,
                              '& .MuiInputBase-input': {
                                fontSize: 11,
                                py: '3px',
                                px: 0.8,
                              },
                              '& .MuiOutlinedInput-root': {
                                borderRadius: 1.5,
                              },
                            }}
                          />
                          <IconButton
                            size="small"
                            onClick={() =>
                              updateGroup(group.id, {
                                filters: group.filters.filter(
                                  (f) => f.id !== filter.id
                                ),
                              })
                            }
                            sx={{
                              p: 0.3,
                              color: '#b0bec5',
                              '&:hover': { color: '#e53935' },
                            }}
                          >
                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Stack>
                      ))}
                      <Button
                        size="small"
                        onClick={() =>
                          updateGroup(group.id, {
                            filters: [
                              ...group.filters,
                              {
                                id: `cf-${nextClusterFilterId++}`,
                                key: '',
                                op: '=',
                                value: '',
                              },
                            ],
                          })
                        }
                        sx={{
                          alignSelf: 'flex-start',
                          textTransform: 'none',
                          fontSize: 11,
                          color: '#78909c',
                          px: 0.5,
                        }}
                      >
                        + Фильтр
                      </Button>
                      {group.filters.length > 0 && (
                        <Stack
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                          sx={{ mt: 0.5 }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: 11,
                              color: '#78909c',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Не совпавшие:
                          </Typography>
                          <FormControl size="small" sx={{ minWidth: 90 }}>
                            <Select
                              value={group.filterMode}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  filterMode: e.target
                                    .value as FilterMode,
                                })
                              }
                              sx={{
                                fontSize: 11,
                                borderRadius: 1.5,
                                '& .MuiSelect-select': {
                                  py: '3px',
                                  px: 0.8,
                                },
                              }}
                            >
                              <MenuItem
                                value="hide"
                                sx={{ fontSize: 11 }}
                              >
                                Скрыть
                              </MenuItem>
                              <MenuItem
                                value="recolor"
                                sx={{ fontSize: 11 }}
                              >
                                Перекрасить
                              </MenuItem>
                            </Select>
                          </FormControl>
                          {group.filterMode === 'recolor' && (
                            <input
                              type="color"
                              value={group.filterColor}
                              onChange={(e) =>
                                updateGroup(group.id, {
                                  filterColor: e.target.value,
                                })
                              }
                              style={{
                                width: 24,
                                height: 18,
                                padding: 0,
                                border: '1px solid rgba(0,0,0,0.1)',
                                borderRadius: 3,
                                cursor: 'pointer',
                              }}
                            />
                          )}
                        </Stack>
                      )}
                    </Stack>
                  </Box>

                  <Typography
                    variant="caption"
                    sx={{ color: '#90a4ae', fontSize: 11 }}
                  >
                    Слоёв: {group.layers.length} · Связей:{' '}
                    {group.edges.length}
                  </Typography>
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}

          <Button
            component="label"
            startIcon={<FileUploadIcon />}
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
            Импорт CSV
            <input
              hidden
              type="file"
              accept=".csv"
              multiple
              onChange={handleImportCsvFiles}
            />
          </Button>

          <Typography
            variant="caption"
            sx={{ color: '#90a4ae', textAlign: 'center' }}
          >
            {currentData.stems.length} точек ·{' '}
            {groups.filter((g) => g.visible).length}/{groups.length} групп
          </Typography>
          </Stack>
        }
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
              allGroupNames={groupNames}
              stems={currentData.stems}
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
            {currentData.stems.length} точек ·{' '}
            {groups.filter((g) => g.visible).length}/{groups.length} групп
          </Typography>
        </Stack>
      </Paper>

      <Tooltip title="Открыть CSV редактор" arrow>
        <Button
          component={Link}
          to="/trunk-map-csv"
          variant="contained"
          size="small"
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
            '&:hover': { background: 'rgba(55,71,79,0.95)' },
          }}
        >
          Редактор
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
  allGroupNames: string[];
  stems: Stem[];
}

function ClusterQueryAccordion({
  query,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  onBuild,
  availableAttributeKeys,
  allGroupNames,
  stems,
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

  const filteredStemsCount = useMemo(() => {
    if (query.selectedGroups.length === 0) return stems.length;
    return stems.filter((stem) =>
      query.selectedGroups.includes(
        String(stem.properties?.__group ?? '')
      )
    ).length;
  }, [stems, query.selectedGroups]);

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

          {allGroupNames.length > 1 && (
            <FormControl size="small" fullWidth>
              <InputLabel>Группы</InputLabel>
              <Select
                multiple
                value={query.selectedGroups}
                label="Группы"
                onChange={(e) => {
                  const value = e.target.value;
                  onUpdate({
                    selectedGroups:
                      typeof value === 'string' ? value.split(',') : value,
                  });
                }}
                renderValue={(selected) => {
                  const arr = selected as string[];
                  return arr.length === 0
                    ? 'Все группы'
                    : arr.join(', ');
                }}
                sx={{ borderRadius: 2, fontSize: 13 }}
              >
                {allGroupNames.map((name) => (
                  <MenuItem key={name} value={name} sx={{ py: 0.3 }}>
                    <Checkbox
                      size="small"
                      checked={query.selectedGroups.includes(name)}
                      sx={{ p: 0.3 }}
                    />
                    <ListItemText
                      primary={name}
                      primaryTypographyProps={{ fontSize: 12 }}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

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
                            inputProps={{ step: 0.1, min: 0.05 }}
                            sx={{
                              width: 64,
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
              disabled={query.isLoading || filteredStemsCount === 0}
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
