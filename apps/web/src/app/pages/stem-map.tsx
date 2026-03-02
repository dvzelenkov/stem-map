import { StemMap, StemMapInputData } from '@study/trunk-map';
import { Button } from '@mui/material';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { INITIAL_VIEW_STATE } from '../constants';

const STEM_MAP_STORAGE_KEY = 'stem-map-uploaded-data';
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
