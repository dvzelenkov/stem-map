import styles from './app.module.scss';
import DeckGL from '@deck.gl/react/typed';
import Map from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { ChangeEvent, useEffect, useState } from 'react';
import { Stem } from './classes/stem';
import { RelationData, Aftershock, Earthquake } from '@study/shared';
import { Relation } from './classes/relation';
import { LayersList, PickingInfo } from '@deck.gl/core/typed';
import { getDistanceFromLatLonInKm } from './distance';
import { Color } from '@deck.gl/core/typed';
import { DataFilterExtension } from '@deck.gl/extensions/typed';
import Button from '@mui/material/Button';
import { Box, Paper, Slider, Stack, styled } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileDownloadDoneIcon from '@mui/icons-material/FileDownloadDone';

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
  const MAIN_WITH_CHILDREN_COLOR: Color = [255, 69, 0];
  const MAIN_LINE_COLOR: Color = [165, 42, 42];
  
  const SECONDARY_COLOR: Color = [65, 105, 225];
  const SECONDARY_LINE_COLOR: Color = [100, 149, 237];

  const MIN_MAIN_FORCE = 14;

  const [sliderDates, setSliderDates] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<Date>(new Date(0));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [file, setFile] = useState<File>();
  const [earthQuakes, setEarthQuakes] = useState<Earthquake[]>([]);
  const [mains, setMains] = useState<Earthquake[]>([]);
  const [allAfterShocks, setAllAfterShocks] = useState<Aftershock[]>([]);
  const [afterShocks, setAfterShocks] = useState<Aftershock[]>([]);
  const [backs, setBacks] = useState<Earthquake[]>([]);
  const [timeLines, setTimeLines] = useState<RelationData[]>([]);
  const [afterShockTimeLines, setAfterShockTimeLines] = useState<RelationData[]>([]);
  const [allAfterShockTimeLines, setAllAfterShockTimeLines] = useState<RelationData[]>([]);
  // const [layers, setLayers] = useState<LayersList>([]);
  const [selectedId, setSelectedId] = useState('');
  let layers: LayersList = [];

  const fileReader = new FileReader();

  const handleOnChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files ? e.target.files[0] : undefined);
  };

  const csvFileToArray = (data: string) => {
    const csvHeader = data.slice(0, data.indexOf("\r\n")).split(";");
    const csvRows = data.slice(data.indexOf("\r\n") + 2).split("\r\n");

    const array: Earthquake[] = csvRows.map((item, index) => {
      const values = item.split(";");
      const obj: Earthquake = csvHeader.reduce((object: any, header, index) => {
        object[header] = values[index];
        return object;
      }, {});
      if (index === 0) {
        console.log(obj);
        setStartDate(getDate(obj.date));
      }
      if (index === csvRows.length - 2) {
        console.log(obj);
        setEndDate(getDate(obj.date));
      }

      return {
        ...obj,
        hasChildren: false,
        relationsCount: 2,
      };
    });

    setEarthQuakes(array);
  };

  const handleOnSubmit = (e: any) => {
    e.preventDefault();

    if (file) {
      fileReader.onload = function (event: any) {
        const csvOutput = event.target.result;
        csvFileToArray(csvOutput);
      };
      fileReader.readAsText(file);
    }
  };

  const handleClear = (e: any) => {
    e.preventDefault();
    setMains([]);
    setAfterShocks([]);
    setTimeLines([]);
    setFile(undefined);
    setSliderDates([]);
  };

  const getDate = (date: string) => {
    const dateParts = date.split('.');
    return new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0])
  };

  useEffect(() => {
    if (earthQuakes.length > 0) {
      setSliderDates([startDate.getTime(), endDate.getTime()]);
      console.log('all');
      console.log(earthQuakes);
      const mainsT: Earthquake[] = earthQuakes.filter((item, index) => {
        if (item.force >= MIN_MAIN_FORCE) {
          earthQuakes.splice(index, 1);
          return true;
        }
        return false;
      });
      console.log('mains');
      console.log(mainsT);
      const timeLinesT: RelationData[] = [];
      const afterShockTimeLinesT: RelationData[] = [];
      let aftershocksT: Aftershock[]  = [];
      mainsT.forEach((item, index, array) => {
        const next = array[index + 1];
        if (next) {
          timeLinesT.push({
            sourceId: item.id,
            targetId: next.id,
            sourcePosition: [+item.longitude, +item.latitude, 10000],
            targetPosition: [+next.longitude, +next.latitude, 10000],
            sourceColor: MAIN_LINE_COLOR,
            targetColor: MAIN_LINE_COLOR,
            sourceDate: getDate(item.date),
            targetDate: getDate(next.date),
          });
        }
        // console.log(item);
        let rMax = 3.5 * Math.pow(10, (1 / 3) * (item.force - 11));
        rMax = rMax > 1000 ? 1000 : Math.ceil(rMax);
        const tMax = item.force < 14.5 ? Math.pow(10, 0.033 * item.force + 0.19) : Math.pow(10, 0.17 * item.force - 1.8);
        const dateParts = item.date.split('.');
        const curDate = new Date(+dateParts[2], +dateParts[1] - 1, +dateParts[0]);
        const maxDate = new Date(curDate);
        maxDate.setMonth(maxDate.getMonth() + tMax);
        aftershocksT = aftershocksT.concat(earthQuakes.reduce<Aftershock[]>((filtered, itemC) => {
          const dateCParts = itemC.date.split('.');
          const curDateC = new Date(+dateCParts[2], +dateCParts[1] - 1, +dateCParts[0]);
          if (
            itemC.force < 12.5 && curDateC.getTime() >= curDate.getTime() && curDateC.getTime() <= maxDate.getTime() &&
            getDistanceFromLatLonInKm(item.latitude, item.longitude, itemC.latitude, itemC.longitude) <= rMax
          ) {
            item.hasChildren = true;
            earthQuakes.splice(index, 1);
            afterShockTimeLinesT.push({
              sourceId: item.id,
              targetId: itemC.id,
              sourcePosition: [+item.longitude, +item.latitude, 5000],
              targetPosition: [+itemC.longitude, +itemC.latitude, 5000],
              sourceColor: SECONDARY_LINE_COLOR,
              targetColor: SECONDARY_LINE_COLOR,
              sourceDate: getDate(item.date),
              targetDate: getDate(itemC.date),
            });
            filtered.push({
              ...itemC,
              parentId: item.id,
              relationsCount: 1,
            });
          }
          return filtered;
        }, []));
      });
      console.log('aftershocks');
      console.log(aftershocksT);
      console.log('timeLines');
      console.log(timeLinesT);
      console.log('afterShockTimeLines');
      console.log(afterShockTimeLinesT);

      setMains(mainsT);
      setAllAfterShocks(aftershocksT);
      setBacks(earthQuakes);
      setTimeLines(timeLinesT);
      setAllAfterShockTimeLines(afterShockTimeLinesT);
    }
  }, [earthQuakes]);

  useEffect(() => {
    setAfterShocks(allAfterShocks.filter(aftershock => aftershock.parentId === selectedId));
    setAfterShockTimeLines(allAfterShockTimeLines.filter(timeline => timeline.sourceId === selectedId))
  }, [allAfterShockTimeLines, allAfterShocks, selectedId]);

  const dataFilter = new DataFilterExtension({
    filterSize: 1,
    fp64: false
  }); 

  layers = [
    new Stem<Earthquake>({
      id: 'mains',
      data: mains,
      getFillColor: data => selectedId === data.id ? SELECT_MAIN_COLOR :
        data.hasChildren ? MAIN_WITH_CHILDREN_COLOR : MAIN_COLOR,
      updateTriggers: {
        getFillColor: selectedId,
      },
      autoHighlight: true,
      highlightColor: SELECT_MAIN_COLOR,
      extensions: [dataFilter],
      getFilterValue: (d: Earthquake) => getDate(d.date).getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
    }),
    // new Stem<EarthQuake>({
    //   id: 'back',
    //   data: earthQuakes,
    //   getFillColor: () => [175, 238, 238]
    // }),
    new Stem<Earthquake>({
      id: 'aftershocks',
      data: afterShocks,
      getFillColor: () => SECONDARY_COLOR,
      autoHighlight: true,
      highlightColor: SELECT_SECONDARY_COLOR,
      extensions: [dataFilter],
      getFilterValue: (d: Earthquake) => getDate(d.date).getTime(),
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
      data: timeLines,
      getSourceColor: (data: RelationData) => selectedId === data.sourceId ||
        selectedId === data.targetId ? SELECT_MAIN_COLOR : data.sourceColor,
      getTargetColor: (data: RelationData) => selectedId === data.sourceId ||
        selectedId === data.targetId ? SELECT_MAIN_COLOR : data.targetColor,
      updateTriggers: {
        getSourceColor: selectedId,
        getTargetColor: selectedId,
      },
      extensions: [dataFilter],
      getFilterValue: (d: RelationData) => [
        d.sourceDate.getTime(),
        d.targetDate.getTime(),
      ],
      filterRange: [sliderDates[0], sliderDates[1]],
      // filterSoftRange: [
      //   sliderDates[0] * 0.9 + sliderDates[1] * 0.1,
      //   sliderDates[0] * 0.1 + sliderDates[1] * 0.9
      // ],
    }),
    new Relation({
      id: 'afterShockTimeLines',
      data: afterShockTimeLines,
      extensions: [dataFilter],
      getFilterValue: (d: RelationData) => d.sourceDate.getTime(),
      filterRange: [sliderDates[0], sliderDates[1]],
      // filterSoftRange: [
      //   sliderDates[0] * 0.9 + sliderDates[1] * 0.1,
      //   sliderDates[0] * 0.1 + sliderDates[1] * 0.9
      // ],
    })
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

  const marks = [
    {
      value: startDate.getTime(),
      label: `${startDate.getMonth() + 1}.${startDate.getFullYear()}`,
    },
    {
      value: endDate.getTime(),
      label: `${endDate.getMonth()}.${endDate.getFullYear()}`,
    },
  ];

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
          <Button disabled={!file} variant="contained" onClick={handleOnSubmit}>
            Обработать файл
          </Button>
          <Button disabled={!file} variant="outlined" onClick={handleClear}>
            Очистить
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
      </Box>}
    </div>
  );
}

export default App;
