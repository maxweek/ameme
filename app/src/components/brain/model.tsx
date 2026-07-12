import { Edges, Outlines, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type FC } from "react";
import * as THREE from "three"


interface Props {

}

export const BrainModel: FC<Props> = props => {

  const rawModel = useGLTF('/model.glb');

  const model = useMemo(() => {
    let model;
    rawModel.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name === "mesh_0") {
        // obj.material = null
        model = obj
      }
    })

    return model;

  }, [rawModel])

  console.log(model)

  return (


    <>

      <mesh geometry={model.geometry} scale={1406} renderOrder={10000} position-y={-150} >
        <meshBasicMaterial color={"#282828"} transparent={true} opacity={0} />

        <Edges
          linewidth={.03}
          scale={1}
          threshold={10} // Display edges only when the angle between two faces exceeds this value (default=15 degrees)
          color="#2492b7"
        />
      </mesh>
    </>
  )
}
