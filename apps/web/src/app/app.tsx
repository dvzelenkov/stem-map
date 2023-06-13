import styles from './app.module.scss';
import DeckGL from '@deck.gl/react/typed';
import {ColumnLayer, LineLayer} from '@deck.gl/layers/typed';
import Map from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import { useEffect, useState } from 'react';

export function App() {
  // Viewport settings
  const INITIAL_VIEW_STATE = {
    latitude: 56.06,
    longitude: 113.9,
    zoom: 5,
    pitch: 0,
    bearing: 0
  };

  const data = [
    {position: [113.9, 56.06]},
    {position: [106.64, 52.47]},
  ];

  const [file, setFile] = useState();
  const [array, setArray] = useState<any[]>([]);
  const [layers, setLayers] = useState<any[]>([
    // new ColumnLayer({
    //   id: 'column-layer',
    //   data,
    //   radius: 5000,
    //   getFillColor: [219, 0, 0, 255],
    //   elevationScale: 1000,
    //   getElevation: 60,
    //   extruded: true,
    //   pickable: true,
    // }),
    // new LineLayer({
    //   id: 'line-layer',
    //   data: [
    //     {
    //       sourcePosition: [113.9, 56.06, 20000],
    //       targetPosition: [106.64, 52.47, 20000]
    //     },
    //     {
    //       sourcePosition: [113.9, 56.06, 40000],
    //       targetPosition: [106.64, 52.47, 40000]
    //     },
    //   ],
    //   pickable: true,
    //   getWidth: 4,
    //   getColor:  [219, 0, 0, 255],
    // })
  ]);

    const fileReader = new FileReader();

    const handleOnChange = (e: any) => {
      setFile(e.target.files[0]);
    };

    const csvFileToArray = (data: string) => {
      const csvHeader = data.slice(0, data.indexOf("\r\n")).split(";");
      const csvRows = data.slice(data.indexOf("\r\n") + 2).split("\r\n");

      const array = csvRows.map(i => {
        const values = i.split(";");
        const obj = csvHeader.reduce((object: any, header, index) => {
          object[header] = values[index];
          return object;
        }, {});
        return obj;
      });

      setArray(array);
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

  function normDate(dateS: string) {
    const date = new Date(dateS);
    console.log((date.getMonth() + date.getFullYear() - 2000 - 20) * 100 / 12 * 0.01);
    return (date.getMonth() + date.getFullYear() - 2000 - 20) * 100 / 12 * 0.01;
  }

  useEffect(() => {
    if (array.length > 0) {
      const filteredArray = array.filter(value => value.force >= 12.5);
      const startDate = new Date("2022-06-08");
      const endDate = new Date('2022-08-20');
      const mainLat = 52.06;
      const mainLong = 105.66;
      const afterShocks = array.filter(
        value => value.force < 12 &&
        new Date(value.date) >= startDate &&
        new Date(value.date) <= endDate &&
        Math.sqrt(Math.pow(mainLat - value.latitude, 2) + Math.pow(mainLong - value.longitude, 2)) < 1
      );
      console.log(afterShocks);
      const timeLines = filteredArray.map((value, ind, array) => {
        const next = array[ind + 1];
        if (next) {
          return {
            sourcePosition: [+value.longitude, +value.latitude, 10000],
            targetPosition: [+next.longitude, +next.latitude, 10000],
            colorScale: normDate(value.date),
          }; 
        } else {
          return null;
        }
      }).filter(value => Boolean(value));

      const afterShockTimeLines = afterShocks.map((value, ind, array) => {
          return {
            sourcePosition: [+value.longitude, +value.latitude, 5000],
            targetPosition: [mainLong, mainLat, 5000],
          }; 
      }).filter(value => Boolean(value));

      console.log(filteredArray);
      setLayers([
        new ColumnLayer({
          id: 'column-layer',
          data: afterShocks,
          radius: 300,
          getFillColor: [0, 0, 219, 255],
          elevationScale: 1000,
          getElevation: 9,
          extruded: true,
          pickable: true,
          getPosition: d => [+d.longitude, +d.latitude],
        }),
        new ColumnLayer({
          id: 'column-layer-2',
          data: filteredArray,
          radius: 500,
          getFillColor: d => [normDate(d.date) * 255, 0, 0, 255],
          elevationScale: 1000,
          getElevation: 15,
          extruded: true,
          pickable: true,
          getPosition: d => [+d.longitude, +d.latitude],
        }),
        new LineLayer({
          id: 'line-layer',
          data: timeLines,
          pickable: true,
          getWidth: 300,
          widthUnits: 'meters',
          getColor: d => [d.colorScale * 255, 0, 0, 255],
        }),
        new LineLayer({
          id: 'line-layer-2',
          data: afterShockTimeLines,
          pickable: true,
          getWidth: 300,
          widthUnits: 'meters',
          getColor:  [0, 0, 219, 255],
        })
    ])
    }
  }, [array]);

  return (
    <div className={styles['app']}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        width={'100vw'}
        height={'100vh'}
        getTooltip={({object}) => object && `K: ${object.force}${'\n'}Дата: ${object.date}${'\n'}Ширина: ${object.latitude}${'\n'}Долгота: ${object.longitude}`}
      >
        <Map mapLib={maplibregl} mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'} />
      </DeckGL>
      <div className={styles['field']}>
        <form>
          <input type={"file"} accept={".csv"} onChange={handleOnChange} />
          <button onClick={(e) => { handleOnSubmit(e) }}>
            Обработать файл
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
