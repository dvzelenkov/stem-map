import { TrunkMap, TrunkMapInputData } from '@study/trunk-map';
import { INITIAL_VIEW_STATE } from '../constants';

const trunkMapData: TrunkMapInputData = {
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
  trunks: [
    {
      trunk_id: 'trunk-1',
      label: 'Alpha',
      geo: { lat: 54.9, lon: 111.2 },
      properties: { time: 1, class: 'A', depth: 10 },
    },
    {
      trunk_id: 'trunk-2',
      label: 'Beta',
      geo: { lat: 57.6, lon: 116.8 },
      properties: { time: 2, class: 'B', depth: 20 },
    },
    {
      trunk_id: 'trunk-3',
      label: 'Gamma',
      geo: { lat: 58.1, lon: 109.4 },
      properties: { time: 3, class: 'A', depth: 35 },
    },
    {
      trunk_id: 'trunk-4',
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
      source_trunk_id: 'trunk-1',
      target_trunk_id: 'trunk-2',
      directed: false,
      weight: 1,
      edge_type: 'temporal-near',
    },
    {
      edge_id: 'edge-time-2',
      layer_id: 'time',
      source_trunk_id: 'trunk-2',
      target_trunk_id: 'trunk-3',
      directed: true,
      weight: 2,
      edge_type: 'temporal-flow',
    },
    {
      edge_id: 'edge-class-1',
      layer_id: 'class',
      source_trunk_id: 'trunk-1',
      target_trunk_id: 'trunk-3',
      directed: false,
      weight: 3,
      edge_type: 'same-class',
    },
    {
      edge_id: 'edge-depth-1',
      layer_id: 'depth',
      source_trunk_id: 'trunk-4',
      target_trunk_id: 'trunk-1',
      directed: true,
      weight: 2,
      edge_type: 'depth-link',
    },
  ],
};

export function TrunkMapPage() {
  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <TrunkMap
        data={trunkMapData}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'}
      />
    </div>
  );
}

export default TrunkMapPage;
