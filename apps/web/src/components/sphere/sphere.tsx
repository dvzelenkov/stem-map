import { useFrame } from "@react-three/fiber";
import { ReactNode } from "react";

/* eslint-disable-next-line */
export interface CylinderProps {
  position: {
    x: number,
    y: number,
    z: number,
  },
  radius: number,
  openEnded?: boolean,
  children: ReactNode,
  refLink?: any,
}

export function Cylinder(props: CylinderProps) {
  const height = 10;

  return (
    <mesh
      position={[props.position.x, props.position.y + height / 2, props.position.z]}
      ref={props.refLink}
    >
      <cylinderGeometry args={[props.radius, props.radius, height, 32, 1, props.openEnded]} />
      {props.children}
    </mesh>
  );
}

export default Cylinder;
