import styles from './app.module.scss';
import DeckGL from '@deck.gl/react/typed';
import Map from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { Stem } from './classes/stem';
import { Relation, RelationData } from './classes/relation';
import { LayersList, PickingInfo } from '@deck.gl/core/typed';
import { AfterShock, EarthQuake } from './data.types';
import { getDistanceFromLatLonInKm } from './distance';
import { Color } from '@deck.gl/core/typed';
import { CollisionFilterExtension } from '@deck.gl/extensions/typed';

export function App() {
  // Viewport settings
  const INITIAL_VIEW_STATE = {
    latitude: 56.06,
    longitude: 113.9,
    zoom: 5,
  };
  const SELECT_MAIN_COLOR: Color = [255, 215, 0];
  const SELECT_COLOR: Color = [0, 191, 255];

  const [file, setFile] = useState();
  const [earthQuakes, setEarthQuakes] = useState<EarthQuake[]>([]);
  const [mains, setMains] = useState<EarthQuake[]>([]);
  const [allAfterShocks, setAllAfterShocks] = useState<AfterShock[]>([]);
  const [afterShocks, setAfterShocks] = useState<AfterShock[]>([]);
  const [backs, setBacks] = useState<EarthQuake[]>([]);
  const [timeLines, setTimeLines] = useState<RelationData[]>([]);
  const [afterShockTimeLines, setAfterShockTimeLines] = useState<RelationData[]>([]);
  const [allAfterShockTimeLines, setAllAfterShockTimeLines] = useState<RelationData[]>([]);
  // const [layers, setLayers] = useState<LayersList>([]);
  const [selectedId, setSelectedId] = useState('');
  let layers: LayersList = [];

  const fileReader = new FileReader();

  const handleOnChange = (e: any) => {
    setFile(e.target.files[0]);
  };

  const csvFileToArray = (data: string) => {
    const csvHeader = data.slice(0, data.indexOf("\r\n")).split(";");
    const csvRows = data.slice(data.indexOf("\r\n") + 2).split("\r\n");

    const array: EarthQuake[] = csvRows.map(i => {
      const values = i.split(";");
      const obj = csvHeader.reduce((object: any, header, index) => {
        object[header] = values[index];
        return object;
      }, {});
      return obj;
    });

    setEarthQuakes(array.map(item => ({
      ...item,
      hasChildren: false,
    })));
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
    layers = [];
  };

  useEffect(() => {
    if (earthQuakes.length > 0) {
      console.log('all');
      console.log(earthQuakes);
      const mainsT: EarthQuake[] = earthQuakes.filter((item, index) => {
        if (item.force >= 12.5) {
          earthQuakes.splice(index, 1);
          return true;
        }
        return false;
      });
      console.log('mains');
      console.log(mainsT);
      const timeLinesT: RelationData[] = [];
      const afterShockTimeLinesT: RelationData[] = [];
      let aftershocksT: AfterShock[]  = [];
      mainsT.forEach((item, index, array) => {
        const next = array[index + 1];
        if (next) {
          timeLinesT.push({
            sourceId: item.id,
            targetId: next.id,
            sourcePosition: [+item.longitude, +item.latitude, 10000],
            targetPosition: [+next.longitude, +next.latitude, 10000],
            sourceColor: [255, 69, 0],
            targetColor: [255, 69, 0],
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
        aftershocksT = aftershocksT.concat(earthQuakes.reduce<AfterShock[]>((filtered, itemC) => {
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
              sourceColor: [25, 25, 112],
              targetColor: [25, 25, 112],
            });
            filtered.push({
              ...itemC,
              parentId: item.id,
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

  layers = [
    new Stem<EarthQuake>({
      id: 'mains',
      data: mains,
      getFillColor: data => selectedId === data.id ? SELECT_MAIN_COLOR : [255, 69, 0],
      updateTriggers: {
        getFillColor: selectedId,
      },
      autoHighlight: true,
      highlightColor: SELECT_MAIN_COLOR,
      extensions: [new CollisionFilterExtension()],
      collisionGroup: 'mains',
    }),
    // new Stem<EarthQuake>({
    //   id: 'back',
    //   data: earthQuakes,
    //   getFillColor: () => [175, 238, 238]
    // }),
    new Stem<EarthQuake>({
      id: 'aftershocks',
      data: afterShocks,
      getFillColor: () => [25, 25, 112],
      autoHighlight: true,
      highlightColor: SELECT_COLOR,
      extensions: [new CollisionFilterExtension()],
      collisionGroup: 'aftershocks',
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
      getSourceColor: data => selectedId === data.sourceId || selectedId === data.targetId ? SELECT_MAIN_COLOR : data.sourceColor,
      getTargetColor: data => selectedId === data.sourceId || selectedId === data.targetId ? SELECT_MAIN_COLOR : data.targetColor,
      updateTriggers: {
        getSourceColor: selectedId,
        getTargetColor: selectedId,
      },
    }),
    new Relation({
      id: 'afterShockTimeLines',
      data: afterShockTimeLines,
    })
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
      <div className={styles['field']}>
        <form>
          <input type={"file"} accept={".csv"} onChange={handleOnChange} />
          <button onClick={handleOnSubmit}>
            Обработать файл
          </button>
          <button onClick={handleClear}>
            Очистить
          </button>
        </form>
      </div> 
    </div>
  );
}

export default App;
