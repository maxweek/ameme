import { CameraControls } from "@react-three/drei";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import _, { set, update } from "lodash";
import { useDebouncedCallback, useThrottledCallback } from "use-debounce";


export const CAMERA_FOV = {
  MIN: 20,
  MAX: 160,
  DEFAULT: 75,
}

let wheelTimeout: any = null;

export const Scene_Controls: FC = observer(() => {

  const { gl, camera, invalidate } = useThree();
  const cameraControlsRef = useRef<CameraControls | null>(null)
  const [disableWheel, setDisableWheel] = useState(true);
  const [inited, setInited] = useState(false);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const grabbingRef = useRef<boolean>(false);
  const [isCameraAnimating, setIsCameraAnimating] = useState(false);

  const cameraFov = useRef<number>(CAMERA_FOV.DEFAULT)


  useFrame(() => {
    if (isCameraAnimating) {
      // console.log("Camera animating...")
      invalidate();
    }
  });

  useEffect(() => {
    if (disableWheel) return;
    if (!gl) return
    if (!gl.domElement) return

    gl.domElement.addEventListener("pointermove", updatePointerPosition)
    return () => {
      gl.domElement.removeEventListener("pointermove", updatePointerPosition)
    }
  }, [gl, disableWheel])


  // useTargetClamp(cameraControlsRef, 60, inited);

  useEffect(() => {
    window.addEventListener("_cameraReset", cameraReset)
    window.addEventListener("wheel", handleWheel, { passive: false })
    cameraInit()
    return () => {
      window.removeEventListener("_cameraReset", cameraReset)
      window.removeEventListener("wheel", handleWheel)
    }
  }, [])


  const cameraReset = () => {
    // setTarget(new THREE.Vector3(0, 0, 0));
    console.log("Camera reset")
    setTimeout(() => {
      camera.updateProjectionMatrix();

      cameraControlsRef.current?.setTarget(0, 0, 0, true)
      cameraControlsRef.current?.setPosition(700, 700, 700, true)
      // cameraControlsRef.current?.reset(true)
      // const isOrtograpic = SettingsStore.camera.type === 1
      // SettingsStore.setMySettingProperty("camera.fov", isOrtograpic ? CAMERA_FOV.orthographic.DEFAULT : CAMERA_FOV.perspective.DEFAULT)
      // cameraControlsRef.current?.dollyTo(SettingsStore.camera.type === 1 ? 150 : 10, true)
    }, 100)
  }


  const handleWheel = (event: WheelEvent) => {

    const target = event.target as HTMLElement | null; // Приведение к HTMLElement
    if (target?.nodeName !== "CANVAS") {
      if (event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
      }
      return
    }
    if (!cameraControlsRef.current) return

    event.stopPropagation();
    event.preventDefault();
    if (event.ctrlKey) {
      setDisableWheel(true)
      cameraControlsRef.current.mouseButtons.wheel = 32;
      clearTimeout(wheelTimeout)
      wheelTimeout = setTimeout(() => {
        setDisableWheel(false)
      }, 500)
    } else {
      cameraControlsRef.current.mouseButtons.wheel = 16;
    }
  }


  const cameraInit = () => {
    if (!cameraControlsRef.current) return

    setInited(false)
    cameraControlsRef.current.setTarget(-0, 0, -0, false)
    cameraControlsRef.current.setPosition(-10, 2000, -10, false)

    cameraControlsRef.current.zoomTo(fovToZoom(190), false)
    setIsCameraAnimating(true);
    console.log("invalidate cameraInit")
    invalidate();

    setTimeout(() => {
      if (!cameraControlsRef.current) {
        setIsCameraAnimating(false);
        return
      }

      cameraControlsRef.current.setTarget(0, 0, 0, true)
      cameraControlsRef.current.setPosition(700, 700, 700, true)
      cameraControlsRef.current.zoomTo(fovToZoom(cameraFov.current), true)

      setTimeout(() => {
        setIsCameraAnimating(false);
        setInited(true)
      }, 1000)
    }, 10)
  }



  useEffect(() => {
    if (!inited) return
    if (!cameraControlsRef.current || disableWheel) return
    console.log("Camera FOV changed, zooming to", cameraFov.current)
    cameraControlsRef.current.zoomTo(fovToZoom(cameraFov.current), true)
  }, [cameraFov.current])


  const updatePointerPosition = (event: PointerEvent) => {
    if (grabbingRef.current) return
    if (!cameraControlsRef.current) return

    const rect = gl.domElement.getBoundingClientRect();
    const x = (((event.clientX - rect.left) / rect.width) * 2 - 1) * -1;
    const y = (-((event.clientY - rect.top) / rect.height) * 2 + 1) * 1;
    pointerRef.current = { x, y }

    updateCamera();
  }

  const updateCamera = useThrottledCallback(() => {
    if (!cameraControlsRef.current) return

    const target = new THREE.Vector3()
    cameraControlsRef.current.getTarget(target, true);

  }, 50, {
    leading: true,
    trailing: true
  });

  const maxZoom = fovToZoom(CAMERA_FOV.MIN)
  const minZoom = fovToZoom(CAMERA_FOV.MAX)


  return <CameraControls
    ref={cameraControlsRef}
    makeDefault

    enabled={true}
    minDistance={200}
    maxDistance={3000}

    infinityDolly={true}
    dollyToCursor={true}

    maxZoom={maxZoom}
    minZoom={minZoom}
    onStart={() => {
      console.log("invalidate onStart")
      invalidate()
      grabbingRef.current = true
    }}

    onEnd={() => {
      grabbingRef.current = false
      // console.log("GRABBING END")
    }}
    // zoomTo={{zoom: fovToZoom(isOrtograpic ? 1 : EditorStore.camera.fov), enabletransition: true}}
    onChange={(e) => {
      if (cameraControlsRef.current && disableWheel && inited) {
        const zoom = cameraControlsRef.current.camera.zoom
        const fov = Number(zoomToFov(zoom).toFixed(1))
      }
      // handleSaveCamera()
      pointerRef.current = null
      updateCamera()
      invalidate()
    }}
  // dollyToCursor={EditorStore.selectedObject !== undefined ? false : true}
  // infinityDolly={infinityDolly}
  />
})

export const zoomToFov = (zoom: number, baseFov = 75) => {
  return (2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / zoom)) * (180 / Math.PI);
};

export const fovToZoom = (fov: number, baseFov = 75) => {
  return Math.tan((baseFov * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360);
};


function useTargetClamp(
  controlsRef: React.RefObject<CameraControls | null>,
  radius: number,
  enabled = false
) {
  const targetVec = useRef(new THREE.Vector3());
  const { invalidate } = useThree();


  useFrame(() => {
    if (!enabled) return
    const controls = controlsRef.current;
    if (!controls) return;

    const position = controls.getPosition(new THREE.Vector3());

    const dist = position.distanceTo(new THREE.Vector3()); // force update
    if (dist <= radius) return;

    const target = controls.getTarget(new THREE.Vector3());
    const clampedPos = position.clone().setLength(Math.min(dist, radius));

    // console.log("CLAMP", dist, radius, clampedPos);

    // target.lerp(clamped, 0.12);
    console.log("invalidate target clamp")
    invalidate()
    controls.setTarget(0, 0, 0, true);
    // position.lerp(clampedPos, 0.12);

    controls.setPosition(
      clampedPos.x,
      clampedPos.y,
      clampedPos.z,
      true
    );
  });
}
