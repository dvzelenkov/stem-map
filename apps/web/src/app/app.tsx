// eslint-disable-next-line @typescript-eslint/no-unused-vars
// import { Canvas } from '@react-three/fiber';
import styles from './app.module.scss';
// import Cylinder from '../components/sphere/sphere';
// import { Edges, OrbitControls } from '@react-three/drei';
// import { DoubleSide } from 'three';
// import { useRef } from 'react';
// import Line from '../components/line/line';
import DeckGL from '@deck.gl/react/typed';
import {ColumnLayer, LineLayer} from '@deck.gl/layers/typed';
import Map from 'react-map-gl';
import maplibregl from 'maplibre-gl';


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

  const layers = [
    new ColumnLayer({
      id: 'column-layer',
      data,
      radius: 5000,
      getFillColor: [219, 0, 0, 255],
      // getLineColor: [0, 0, 255],
      // radiusUnits: 'pixels',
      elevationScale: 1000,
      getElevation: 60,
      extruded: true,
      pickable: true,
    }),
    new LineLayer({
      id: 'line-layer',
      data: [
        {
          sourcePosition: [113.9, 56.06, 20000],
          targetPosition: [106.64, 52.47, 20000]
        },
        {
          sourcePosition: [113.9, 56.06, 40000],
          targetPosition: [106.64, 52.47, 40000]
        },
      ],
      pickable: true,
      getWidth: 4,
      getColor:  [219, 0, 0, 255],
    })
  ];

  // const red1 = useRef<any>();
  // const red2 = useRef<any>();
  // const red3 = useRef<any>();
  // const org1 = useRef<any>();
  // const org2 = useRef<any>();
  // const org3 = useRef<any>();
  

  return (
    <div className={styles['app']}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        width={'100vw'}
        height={'100vh'}
      >
        <Map mapLib={maplibregl} mapStyle={'https://api.maptiler.com/maps/outdoor-v2/style.json?key=EY1glioABfpXI9vfzMwl'} />
      </DeckGL>
      {/* <Canvas camera={{ position: [50, 50, 2.5] }}>
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
        <pointLight position={[-10, -10, -10]} />
        <group>
          <Cylinder refLink={org1} position={{x: -1, y: 0, z: 0}} radius={1} >
            <meshStandardMaterial color={'orange'} />
          </Cylinder>
          <Cylinder refLink={red1} position={{x: 1, y: 0, z: 0}}  radius={1} >
            <meshStandardMaterial color={'red'} />
          </Cylinder>
          <Cylinder position={{x: 0, y: 0, z: 0}} openEnded={true} radius={2.5} >
            <meshStandardMaterial color={'white'} transparent opacity={0.5}/>
            <Edges />
          </Cylinder>
        </group>
        <group>
          <Cylinder refLink={org3} position={{x: -1, y: 0, z: 18}} radius={1} >
            <meshStandardMaterial color={'orange'} />
          </Cylinder>
          <Cylinder refLink={red2} position={{x: 1, y: 0, z: 18}}  radius={1} >
            <meshStandardMaterial color={'red'} />
          </Cylinder>
          <Cylinder position={{x: 0, y: 0, z: 18}} openEnded={true} radius={2.5} >
            <meshStandardMaterial color={'white'} side={DoubleSide} transparent opacity={0.3}/>
            <Edges />
          </Cylinder>
        </group>
        <Cylinder refLink={org2} position={{x: -15, y: 0, z: 13}} radius={1} >
          <meshStandardMaterial color={'orange'} />
        </Cylinder>
        <Cylinder refLink={red3} position={{x: 23, y: 0, z: 28}} radius={1} >
          <meshStandardMaterial color={'red'} />
        </Cylinder>
        <Line start={red1} end={red2} color={'red'} />
        <Line start={org1} end={org2} color={'orange'} />
        <Line start={red1} end={red3} level={3} color={'red'} />
        <Line start={org2} end={org3} level={3} color={'orange'} />
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[180, 180]} />
          <meshStandardMaterial map={} />
        </mesh>
        <OrbitControls maxPolarAngle={Math.PI / 2} />
      </Canvas> */}


    </div>
  );
}

export default App;
