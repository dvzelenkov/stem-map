import styles from './app.module.scss';
import DeckGL from '@deck.gl/react/typed';
import Map from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { ChangeEvent, useEffect, useState } from 'react';
import { Stem } from './classes/stem';
import { RelationData, Aftershock, Earthquake, FullEarthquakesData, GeoData } from '@study/shared';
import { Relation } from './classes/relation';
import { LayersList, PickingInfo } from '@deck.gl/core/typed';
import { Color } from '@deck.gl/core/typed';
import { DataFilterExtension } from '@deck.gl/extensions/typed';
import Button from '@mui/material/Button';
import { Box, Paper, Slider, Stack, styled } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadDoneIcon from '@mui/icons-material/FileDownloadDone';
import axios, { AxiosResponse } from 'axios';
import { NestedMark } from './classes/nested-mark';

export function App() {
  // Viewport settings
  const INITIAL_VIEW_STATE = {
    latitude: 56.06,
    longitude: 113.9,
    zoom: 5,
  };
  const SELECT_MAIN_COLOR: Color = [255, 215, 0];
  const SELECT_SECONDARY_COLOR: Color = [0, 191, 255];

  const MAIN_COLOR: Color = [165, 42, 42];
  const MAIN_LINE_COLOR: Color = [165, 42, 42];
  
  const SECONDARY_COLOR: Color = [65, 105, 225];
  const SECONDARY_LINE_COLOR: Color = [100, 149, 237];

  const MIN_MAIN_FORCE = 14;

  const [file, setFile] = useState<File>();
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

  const [selectedId, setSelectedId] = useState('');
  let layers: LayersList = [];

  const handleOnChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      axios.post('http://localhost:3333/api/upload', formData)
      .then(({ data }: AxiosResponse<FullEarthquakesData>) => {
        console.log(data);
        setMains(data.mains);
        setAftershocks(data.aftershocks);
        setMainTimelines(data.mainTimelines);
        setAftershockTimelines(data.aftershockTimelines);
        setStartDate(new Date(data.startDate));
        setEndDate(new Date(data.endDate));
        setNestedMainMarks(data.nestedMainMarks);
        setSliderDates([
          new Date(data.startDate).getTime(),
          new Date(data.endDate).getTime(),
        ]);
      });
    }
  };

  const handleClear = (e: any) => {
    e.preventDefault();
    setMains([]);
    setShownAftershocks([]);
    setMainTimelines([]);
    setFile(undefined);
    setSliderDates([-1, 1]);
    setStartDate(undefined);
    setEndDate(undefined);
  };

  useEffect(() => {
    setShownAftershocks(aftershocks.filter(aftershock => aftershock.parentId === selectedId));
    setShownAftershockTimelines(aftershockTimelines.filter(timeline => timeline.sourceId === selectedId))
  }, [aftershockTimelines, aftershocks, selectedId]);

  const dataFilter = new DataFilterExtension({
    filterSize: 1,
    fp64: false
  }); 

  layers = [
    new Stem<Earthquake>({
      id: 'mains',
      data: mains,
      getFillColor: data => selectedId === data.id ? SELECT_MAIN_COLOR : MAIN_COLOR,
      updateTriggers: {
        getFillColor: selectedId,
      },
      autoHighlight: true,
      highlightColor: SELECT_MAIN_COLOR,
      extensions: [dataFilter],
      getFilterValue: (d: Earthquake) => new Date(d.date).getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
    }),
    new NestedMark({
      id: 'mainMarks',
      data: nestedMainMarks,
      getFillColor: SECONDARY_COLOR,
      getRadius: data => selectedId === data.id ? 0 : 1000,
      updateTriggers: {
        getRadius: selectedId,
      },
    }),
    new Stem<Earthquake>({
      id: 'aftershocks',
      data: shownAftershocks,
      getFillColor: () => SECONDARY_COLOR,
      autoHighlight: true,
      highlightColor: SELECT_SECONDARY_COLOR,
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
  ];

  const VisuallyHiddenInput = styled('input')({
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    bottom: 0,
    left: 0,
    whiteSpace: 'nowrap',
    width: 1,
  });

  const handleChange = (_event: Event, newValue: number | number[]) => {
    setSliderDates(newValue as number[]);
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

  return (
    <div className={styles['app']} onContextMenu={evt => evt.preventDefault()}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        width={'100vw'}
        height={'100vh'}
        onClick={(info: PickingInfo) => { info.object?.id ? setSelectedId(info.object.id) : setSelectedId('')}}
        getTooltip={({object}) => object && object.force && `K: ${object.force}${'\n'}Дата: ${object.date}${'\n'}Ширина: ${object.latitude}${'\n'}Долгота: ${object.longitude}`}
      >
        <Map mapLib={maplibregl} mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'} />
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
            color={file ? 'success' : 'primary'}
            variant={file ? 'outlined' : 'contained'}
            startIcon={file ? <FileDownloadDoneIcon /> : <CloudUploadIcon />}
          >
            {file ? file.name : 'Загрузить файл'}
            <VisuallyHiddenInput type="file" accept=".csv" onChange={handleOnChange} />
          </Button>
          <Button disabled={!file} variant="outlined" onClick={handleClear}>
            Очистить
          </Button>
          <Button variant="contained">
            Получить данные
          </Button>
        </Stack>
      </Paper>
      {sliderDates.length > 0 && <Box
        component="div"
        sx = {{
          position: 'absolute',
          left: 'calc(50% - 45vw)',
          bottom: 0,
          width: '90vw',
          p: 2,
        }}
      >
        {startDate && endDate &&
          <Slider
            min={startDate.getTime()}
            max={endDate.getTime()}
            step={1000 * 60 * 60 * 24 * 29}
            value={sliderDates}
            marks={marks}
            valueLabelFormat={valueLabelFormat}
            onChange={handleChange}
            valueLabelDisplay="auto"
          />
        }
      </Box>}
    </div>
  );
}

export default App;
