"use client";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useAnatomyStore } from "@/store/anatomy-store";
import { zonePose } from "./anatomy-config";

/**
 * Smooth camera focus. When a zone is selected the rig exponentially damps
 * the camera and the OrbitControls target toward that zone's pose; the
 * moment the user grabs the controls, the rig lets go (focusActive=false).
 */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const selected = useAnatomyStore((s) => s.selected);
  const focusActive = useAnatomyStore((s) => s.focusActive);
  const releaseFocus = useAnatomyStore((s) => s.releaseFocus);

  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !focusActive) return;

    const pose = zonePose(selected);
    targetPos.current.set(...pose.position);
    targetLook.current.set(...pose.target);

    const t = 1 - Math.exp(-4.2 * Math.min(delta, 0.1));
    camera.position.lerp(targetPos.current, t);
    controls.target.lerp(targetLook.current, t);
    controls.update();

    if (
      camera.position.distanceTo(targetPos.current) < 0.005 &&
      controls.target.distanceTo(targetLook.current) < 0.005
    ) {
      releaseFocus();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      minDistance={0.8}
      maxDistance={4.5}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.72}
      target={[0, 1.05, 0]}
      onStart={releaseFocus}
    />
  );
}
