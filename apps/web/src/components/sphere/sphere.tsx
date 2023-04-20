import { useFrame } from "@react-three/fiber";
import { ReactNode } from "react";

/* eslint-disable-next-line */
export interface CylinderProps {
  position: any,
  radius: number,
  openEnded?: boolean,
  children: ReactNode,
  refLink?: any,
}

export function Cylinder(props: CylinderProps) {
  return (
    <mesh
      position={props.position}
      ref={props.refLink}
    >
      <cylinderGeometry args={[props.radius, props.radius, 4, 32, 1, props.openEnded]} />
      {props.children}
    </mesh>
  );
}

export default Cylinder;
