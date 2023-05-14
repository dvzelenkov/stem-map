import { QuadraticBezierLine } from '@react-three/drei';
import styles from './line.module.scss';
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three'

/* eslint-disable-next-line */
export interface LineProps {
  start: any;
  end: any;
  level?: number,
  color?: THREE.ColorRepresentation,
}

export function Line(props: LineProps) {
  const { start, end, level = 1, color } = props;
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const ref = useRef<any>();
  // useFrame(() => {
  //   ref.current.setPoints(start.current.getWorldPosition(v1), end.current.getWorldPosition(v2));
  // });

  useEffect(() => {
    const startCoords = start.current.getWorldPosition(v1);
    const endCoords = end.current.getWorldPosition(v2);
    ref.current.setPoints(
      [startCoords.x, 2 * level, startCoords.z],
      [endCoords.x, 2 * level, endCoords.z],
    );
  }, []);

  return (
    <QuadraticBezierLine start={new THREE.Vector3()} end={new THREE.Vector3()} ref={ref} lineWidth={7} color={color} />
  );
}

export default Line;
