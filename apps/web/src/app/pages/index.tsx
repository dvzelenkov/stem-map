import DeckGL from '@deck.gl/react';
import Map from 'react-map-gl/maplibre';
import { ChangeEvent, useEffect, useState } from 'react';
import { Stem } from '../classes/stem';
import { RelationData, Aftershock, Earthquake, GeoData, NestedEarthquake, FullEarthquakesDataWithSwarms, Coordinates } from '@study/shared';
import { Relation } from '../classes/relation';
import { LayersList, PickingInfo } from '@deck.gl/core';
import { DataFilterExtension } from '@deck.gl/extensions';
import Button from '@mui/material/Button';
import { Box, Checkbox, FormControlLabel, Paper, Slider, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadDoneIcon from '@mui/icons-material/FileDownloadDone';
import axios, { AxiosResponse } from 'axios';
import { NestedMark } from '../classes/nested-mark';
import { VisuallyHiddenInput } from '../components/hidden-input';
import { SolidPolygonLayer } from '@deck.gl/layers';

import {
  BACKGROUND_COLOR,
  INITIAL_VIEW_STATE,
  MAIN_COLOR,
  MAIN_LINE_COLOR,
  SECONDARY_COLOR,
  SECONDARY_LINE_COLOR,
  SELECT_BACKGROUND_COLOR,
  SELECT_MAIN_COLOR,
  SELECT_SECONDARY_COLOR,
  SWARM_COLOR,
  SWARM_LINE_COLOR,
  SWARM_SELECTED_COLOR,
} from '../constants';

export function App() {
  const [file, setFile] = useState<File>();
  const [filterLimit, setFilterLimit] = useState(14);
  const [selectedId, setSelectedId] = useState('');
  const [showAllAftershocks, setShowAllAftershocks] = useState(false);
  const [sliderDates, setSliderDates] = useState<number[]>([-1, 1]);
  const [shownAftershocks, setShownAftershocks] = useState<Aftershock[]>([]);
  const [shownAftershockTimelines, setShownAftershockTimelines] = useState<RelationData[]>([]);

  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [mains, setMains] = useState<Earthquake[]>([]);
  const [aftershocks, setAftershocks] = useState<Aftershock[]>([]);
  const [mainTimelines, setMainTimelines] = useState<RelationData[]>([]);
  const [aftershockTimelines, setAftershockTimelines] = useState<RelationData[]>([]);
  const [nestedMainMarks, setNestedMainMarks] = useState<GeoData[]>([]);
  const [backgrounds, setBackgrounds] = useState<Earthquake[]>([]);
  const [swarmContours, setSwarmContours] = useState<Coordinates[][]>([]);
  // const [swarms, setSwarms] = useState<SwarmEarthquake[][]>([]);

  const dataFilter = new DataFilterExtension({
    filterSize: 1,
    fp64: false
  }); 

  useEffect(() => {
    setShownAftershocks(
      aftershocks.filter(
        aftershock => aftershock.parentId === selectedId || showAllAftershocks
      )
    );
    setShownAftershockTimelines(
      aftershockTimelines.filter(
        timeline => timeline.sourceId === selectedId || showAllAftershocks
      )
    )
  }, [aftershockTimelines, aftershocks, selectedId, showAllAftershocks]);

  useEffect(() => {
    if (file) {
      uploadFile(file);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLimit, file]);

  const layers: LayersList = [
    new Stem<Earthquake>({
      id: 'backgrounds',
      data: backgrounds,
      getFillColor: data => selectedId === data.id ? SELECT_BACKGROUND_COLOR : BACKGROUND_COLOR,
      updateTriggers: {
        getFillColor: selectedId,
      },
      autoHighlight: true,
      highlightColor: SELECT_BACKGROUND_COLOR as number[],
      extensions: [dataFilter],
      getFilterValue: (d: Earthquake) => new Date(d.date).getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
    }),
    new Stem<Earthquake>({
      id: 'mains',
      data: mains,
      getFillColor: data => selectedId === data.id ? SELECT_MAIN_COLOR : MAIN_COLOR,
      updateTriggers: {
        getFillColor: selectedId,
      },
      autoHighlight: true,
      highlightColor: SELECT_MAIN_COLOR as number[],
      extensions: [dataFilter],
      getFilterValue: (d: Earthquake) => new Date(d.date).getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
    }),
    new NestedMark({
      id: 'mainMarks',
      data: nestedMainMarks,
      getFillColor: SECONDARY_COLOR,
      extensions: [dataFilter],
      getRadius: data => selectedId === data.id || showAllAftershocks ? 0 : NestedMark.RADIUS,
      updateTriggers: {
        getRadius: [selectedId, showAllAftershocks],
      },
      getFilterValue: (d: NestedEarthquake) => new Date(d.date).getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
    }),
    new Stem<Earthquake>({
      id: 'aftershocks',
      data: shownAftershocks,
      getFillColor: () => SECONDARY_COLOR,
      autoHighlight: true,
      highlightColor: SELECT_SECONDARY_COLOR as number[],
      extensions: [dataFilter],
      getFilterValue: (d: Earthquake) => new Date(d.date).getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
      // getFillColor: d => {
      //   if (+d.longitude === mainLong && +d.latitude === mainLat) {
      //     return [255, 255, 0, 255];
      //   }
      //   return [normDate(d.date, datesDiff, minDate.getTime()) * 255, 0, 0, 255]
      // },
    }),
    new Relation({
      id: 'timeLines',
      data: mainTimelines,
      getSourceColor: (data: RelationData) => selectedId === data.sourceId ||
        selectedId === data.targetId ? SELECT_MAIN_COLOR : MAIN_LINE_COLOR,
      getTargetColor: (data: RelationData) => selectedId === data.sourceId ||
        selectedId === data.targetId ? SELECT_MAIN_COLOR : MAIN_LINE_COLOR,
      updateTriggers: {
        getSourceColor: selectedId,
        getTargetColor: selectedId,
      },
      extensions: [dataFilter],
      getFilterValue: (d: RelationData) => [
        new Date(d.sourceDate).getTime(),
        new Date(d.targetDate).getTime(),
      ],
      filterRange: [sliderDates[0], sliderDates[1]],
      // filterSoftRange: [
      //   sliderDates[0] * 0.9 + sliderDates[1] * 0.1,
      //   sliderDates[0] * 0.1 + sliderDates[1] * 0.9
      // ],
    }),
    new Relation({
      id: 'afterShockTimeLines',
      data: shownAftershockTimelines,
      extensions: [dataFilter],
      getFilterValue: (d: RelationData) => new Date(d.sourceDate).getTime(),
      getSourceColor: SECONDARY_LINE_COLOR,
      getTargetColor: SECONDARY_LINE_COLOR,
      filterRange: [sliderDates[0], sliderDates[1]],
      // filterSoftRange: [
      //   sliderDates[0] * 0.9 + sliderDates[1] * 0.1,
      //   sliderDates[0] * 0.1 + sliderDates[1] * 0.9
      // ],
    }),
    new SolidPolygonLayer<Coordinates[]>({
      id: `swarmContours`,
      data: swarmContours,
      getPolygon: 
        (contour) => contour.map((item: any) => [item.longitude, item.latitude]),
      getFillColor: SWARM_COLOR,
      extruded: true,
      wireframe: true,
      getElevation: 10,
      getLineColor: SWARM_LINE_COLOR,
      pickable: true,
      autoHighlight: true,
      highlightColor: SWARM_SELECTED_COLOR as number[],
      // extensions: [dataFilter],
      // getFilterValue: (d: Earthquake) => new Date(d.date).getTime(),
      // filterRange: [sliderDates[0], sliderDates[1]],
    }),
  ];

  const uploadFile = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('limit', `${filterLimit}`);

    axios.post('http://localhost:3333/api/upload', formData)
    .then(({ data }: AxiosResponse<FullEarthquakesDataWithSwarms>) => setData(data));
  };

  const handleOnUploadFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  

  // const handleOnGetData = () => {
  //   clearData();

  //   const formData = new FormData();
  //   formData.append('limit', `${filterLimit}`);

  //   axios.post('http://localhost:3333/api/earthquakes', formData)
  //   .then(({ data }: AxiosResponse<FullEarthquakesData>) => setData(data));
  // };

  const handleSliderChange = (_event: Event, newValue: number | number[]) => {
    setSliderDates(newValue as number[]);
  };

  const setData = (data: FullEarthquakesDataWithSwarms) => {
    if (data && data.mains) {
      console.log(data.mains);
      setMains(data.mains);
      setAftershocks(data.aftershocks);
      setMainTimelines(data.mainTimelines);
      setAftershockTimelines(data.aftershockTimelines);
      setStartDate(new Date(data.startDate));
      setEndDate(new Date(data.endDate));
      setNestedMainMarks(data.nestedMainMarks);
      setBackgrounds(data.backgrounds);
      setSwarmContours(data.contours);
      // setSwarms(data.swarms);
      setSliderDates([
        new Date(data.startDate).getTime(),
        new Date(data.endDate).getTime(),
      ]);
    }
  };

  const clearData = () => {
    setMains([]);
    setShownAftershocks([]);
    setMainTimelines([]);
    setSwarmContours([]);
    // setSwarms([]);
    setBackgrounds([]);
    setFile(undefined);
    setSliderDates([-1, 1]);
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const valueLabelFormat = (value: number): string => {
    const date = new Date(value);
    return `${date.getMonth() + 1}.${date.getFullYear()}`;
  }

  const marks = startDate && endDate ? [
    {
      value: startDate.getTime(),
      label: `${startDate.getMonth() + 1}.${startDate.getFullYear()}`,
    },
    {
      value: endDate.getTime(),
      label: `${endDate.getMonth()}.${endDate.getFullYear()}`,
    },
  ] : [];

  useEffect(() => {
    console.log(mains);
    if (mains && mains.length > 0) {
      setStartDate(new Date(mains[0].date));
      setEndDate(new Date(mains[mains.length - 1].date));
      setSliderDates([
        new Date(mains[0].date).getTime(),
        new Date(mains[mains.length - 1].date).getTime(),
      ]);
    }
  }, [mains]);

  return (
    <div
      style={{
        position: 'relative',
        textAlign: 'center',
        height: '100vh',
      }}
      onContextMenu={evt => evt.preventDefault()}
    >
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        width={'100vw'}
        height={'100vh'}
        onClick={(info: PickingInfo) => { info.object?.id ? setSelectedId(info.object.id) : setSelectedId('')}}
        getTooltip={({object}) => object && object.force && `K: ${object.force}${'\n'}Дата: 0${new Date(object.date).getDay()}.0${new Date(object.date).getMonth()}.${new Date(object.date).getFullYear()}${'\n'}Ширина: ${object.latitude}${'\n'}Долгота: ${object.longitude}`}
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
        <Stack
          spacing={2}
          direction="row"
        >
          <Button
            component="label"
            variant={file ? 'outlined' : 'contained'}
            startIcon={file ? <FileDownloadDoneIcon /> : <CloudUploadIcon />}
            disabled={!!file}
          >
            {file ? file.name : 'Загрузить файл'}
            {!file && <VisuallyHiddenInput type="file" accept=".csv" onChange={handleOnUploadFile} />}
          </Button>
          {/* <Button variant="contained" onClick={handleOnGetData}>
            Загрузить данные из БД
          </Button> */}
          <Button disabled={mains.length === 0} variant="outlined" onClick={clearData}>
            Очистить
          </Button>
        </Stack>
        {file &&
          <Stack
            spacing={2}
            direction="row"
            sx={{ mt: 2 }}
            justifyContent="space-between"
          >
            <FormControlLabel
              label="Раскрыть все вложения"
              control={
                <Checkbox
                  checked={showAllAftershocks}
                  onChange={(_e, checked) => setShowAllAftershocks(checked)}
                />
              }
            />
            <ToggleButtonGroup
              size="small"
              color="primary"
              value={filterLimit}
              exclusive
              onChange={(_e, value) => setFilterLimit(value)}
            >
              <ToggleButton value={12}>12</ToggleButton>
              <ToggleButton value={13}>13</ToggleButton>
              <ToggleButton value={14}>14</ToggleButton>
              <ToggleButton value={15}>15</ToggleButton>
              <ToggleButton value={16}>16</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      </Paper>
      {sliderDates.length > 0 && startDate && endDate && <Box
        component="div"
        sx = {{
          position: 'absolute',
          left: 'calc(50% - 45vw)',
          bottom: 0,
          width: '90vw',
          p: 2,
        }}
      >
        <Slider
          min={startDate.getTime()}
          max={endDate.getTime()}
          step={1000 * 60 * 60 * 24 * 29}
          value={sliderDates}
          marks={marks}
          valueLabelFormat={valueLabelFormat}
          onChange={handleSliderChange}
          valueLabelDisplay="auto"
        />
      </Box>}
    </div>
  );
}

export default App;
