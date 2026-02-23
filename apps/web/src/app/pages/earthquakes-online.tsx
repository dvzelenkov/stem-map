import DeckGL from '@deck.gl/react';
import Map from 'react-map-gl/maplibre';
import { useEffect, useState } from 'react';
import { Stem } from '../classes/stem';
import { RelationData, Earthquake } from '@study/shared';
import { Relation } from '../classes/relation';
import { LayersList, PickingInfo } from '@deck.gl/core';
import Button from '@mui/material/Button';
import { Paper } from '@mui/material';
import socket from '../services/websocket';
import { INITIAL_VIEW_STATE, MAIN_COLOR, MAIN_LINE_COLOR, SELECT_MAIN_COLOR } from '../constants';
import { getEarthquakeTooltip } from '../services/tooltips';

export function EarthquakesOnline() {
  const [selectedId, setSelectedId] = useState('');
  const [mains, setMains] = useState<Earthquake[]>([]);
  const [mainTimelines, setMainTimelines] = useState<RelationData[]>([]);

  const layers: LayersList = [
    new Stem<Earthquake>({
      id: 'mains',
      data: mains,
      getFillColor: (data: any) => selectedId === data.id ? SELECT_MAIN_COLOR : MAIN_COLOR,
      updateTriggers: {
        getFillColor: selectedId,
      },
      autoHighlight: true,
      highlightColor: SELECT_MAIN_COLOR as number[],
      getFilterValue: (d: Earthquake) => new Date(d.date).getTime(),
    }),
    new Relation({
      id: 'timeLines',
      data: mainTimelines,
      getSourceColor: (data: RelationData) => selectedId === data.sourceId ||
        selectedId === data.targetId ? SELECT_MAIN_COLOR : SELECT_MAIN_COLOR,
      getTargetColor: (data: RelationData) => selectedId === data.sourceId ||
        selectedId === data.targetId ? SELECT_MAIN_COLOR : MAIN_LINE_COLOR,
      updateTriggers: {
        getSourceColor: selectedId,
        getTargetColor: selectedId,
      },
    }),
  ];

  const clearData = () => {
    setMains([]);
    setMainTimelines([]);
  };

  useEffect(() => {
    socket.connect();
    return () => {
      socket.off('message');
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    socket.on('message', (message) => {
      const newData = JSON.parse(message);
      setMains([...mains, ...newData.stems]);
      setMainTimelines([...mainTimelines, ...newData.relations]);
      console.log('-----')
    });

    return () => {
      socket.off('message');
    };
  }, [mains, mainTimelines]);

  return (
    <div
      onContextMenu={evt => evt.preventDefault()}
      style={{
        position: 'relative',
        textAlign: 'center',
        height: '100vh',
      }}
    >
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        width={'100vw'}
        height={'100vh'}
        onClick={(info: PickingInfo) => { info.object?.id ? setSelectedId(info.object.id) : setSelectedId('')}}
        getTooltip={getEarthquakeTooltip}
      >
        <Map mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'} />
      </DeckGL>
      <Paper
        elevation={3}
        sx={{
          p: 2,
          background: 'white',
          position: 'absolute',
          left: 0,
          top: 0,
        }}
      >
        <Button disabled={mains.length === 0} variant="outlined" onClick={clearData}>
          Очистить
        </Button>
      </Paper>
    </div>
  );
}

export default EarthquakesOnline;
