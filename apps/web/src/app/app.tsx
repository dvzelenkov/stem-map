// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Canvas } from '@react-three/fiber';
import styles from './app.module.scss';
import ForceGraph3D from 'react-force-graph-3d';
import Cylinder from '../components/sphere/sphere';
import { Edges, OrbitControls } from '@react-three/drei';
import { DoubleSide } from 'three';
import { useRef } from 'react';
import Line from '../components/line/line';


export function App() {
  function genRandomTree(N = 300, reverse = false) {
    return {
      nodes: [...Array(N).keys()].map(i => ({ id: i })),
        links: [...Array(N).keys()]
      .filter(id => id)
      .map(id => ({
        [reverse ? 'target' : 'source']: id,
        [reverse ? 'source' : 'target']: Math.round(Math.random() * (id-1))
      }))
    };
  }

  const red1 = useRef<any>();
  const red2 = useRef<any>();

  return (
    <div className={styles['app']}>
      <Canvas camera={{ position: [10, 10, 2.5] }}>
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
        <pointLight position={[-10, -10, -10]} />
        <group>
          <Cylinder position={[-1, 0, 0]} radius={1} >
            <meshStandardMaterial color={'orange'} />
          </Cylinder>
          <Cylinder refLink={red1} position={[1, 0, 0]}  radius={1} >
            <meshStandardMaterial color={'red'} />
          </Cylinder>
          <Cylinder position={[0, 0, 0]} openEnded={true} radius={2.5} >
            {/* <meshPhysicalMaterial {...materialProps} /> */}
            <meshStandardMaterial color={'white'} transparent opacity={0.5}/>
            <Edges />
          </Cylinder>
        </group>
        <group>
          <Cylinder position={[-1, 0, 8]} radius={1} >
            <meshStandardMaterial color={'orange'} />
          </Cylinder>
          <Cylinder refLink={red2} position={[1, 0, 8]}  radius={1} >
            <meshStandardMaterial color={'red'} />
          </Cylinder>
          <Cylinder position={[0, 0, 8]} openEnded={true} radius={2.5} >
            {/* <meshPhysicalMaterial {...materialProps} /> */}
            <meshStandardMaterial color={'white'} transparent opacity={0.5}/>
            <Edges />
          </Cylinder>
        </group>
        <Line start={red1} end={red2} />
        <OrbitControls maxPolarAngle={Math.PI / 2} />
      </Canvas>
    </div>
  );
}

export default App;
