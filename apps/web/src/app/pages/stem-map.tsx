import { StemMap, StemMapInputData } from '@study/trunk-map';
import { Button } from '@mui/material';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { INITIAL_VIEW_STATE } from '../constants';

const STEM_MAP_STORAGE_KEY = 'stem-map-uploaded-data';

const stemMapData: StemMapInputData = {
  layers: [
    {
      layer_id: 'time',
      title: 'Time',
      attribute_name: 'time',
      order: 1,
    },
    {
      layer_id: 'class',
      title: 'Class',
      attribute_name: 'class',
      order: 2,
    },
    {
      layer_id: 'depth',
      title: 'Depth',
      attribute_name: 'depth',
      order: 3,
    },
  ],
  stems: [
    {
      stem_id: 'stem-1',
      label: 'Alpha',
      geo: { lat: 54.9, lon: 111.2 },
      properties: { time: 1, class: 'A', depth: 10 },
    },
    {
      stem_id: 'stem-2',
      label: 'Beta',
      geo: { lat: 57.6, lon: 116.8 },
      properties: { time: 2, class: 'B', depth: 20 },
    },
    {
      stem_id: 'stem-3',
      label: 'Gamma',
      geo: { lat: 58.1, lon: 109.4 },
      properties: { time: 3, class: 'A', depth: 35 },
    },
    {
      stem_id: 'stem-4',
      label: 'Delta',
      geo: { lat: 53.7, lon: 118.5 },
      properties: { time: 4, class: 'C', depth: 15 },
    },
  ],
  copies: 'implicit',
  edges: [
    {
      edge_id: 'edge-time-1',
      layer_id: 'time',
      source_stem_id: 'stem-1',
      target_stem_id: 'stem-2',
      directed: false,
      weight: 1,
    },
    {
      edge_id: 'edge-time-2',
      layer_id: 'time',
      source_stem_id: 'stem-2',
      target_stem_id: 'stem-3',
      directed: true,
      weight: 2,
    },
    {
      edge_id: 'edge-class-1',
      layer_id: 'class',
      source_stem_id: 'stem-1',
      target_stem_id: 'stem-3',
      directed: false,
      weight: 3,
    },
    {
      edge_id: 'edge-depth-1',
      layer_id: 'depth',
      source_stem_id: 'stem-4',
      target_stem_id: 'stem-1',
      directed: true,
      weight: 2,
    },
  ],
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
    () => getStoredStemMapData() ?? stemMapData,
    []
  );

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <StemMap
        data={currentData}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'}
      />
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
