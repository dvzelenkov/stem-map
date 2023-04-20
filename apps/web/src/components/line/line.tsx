import { QuadraticBezierLine } from '@react-three/drei';
import styles from './line.module.scss';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three'

/* eslint-disable-next-line */
export interface LineProps {
  start: any;
  end: any;
}

export function Line(props: LineProps) {
  const { start, end } = props;
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const ref = useRef<any>();
  useFrame(() => ref.current.setPoints(start.current.getWorldPosition(v1), end.current.getWorldPosition(v2)));

  return (
    <QuadraticBezierLine start={new THREE.Vector3()} end={new THREE.Vector3()} ref={ref} lineWidth={3} color="#ff2060" />
  );
}

export default Line;
