"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { AnatomyModel } from "./anatomy-model";
import { CameraRig } from "./camera-rig";
import { useAnatomyStore } from "@/store/anatomy-store";
import { DEFAULT_POSE } from "./anatomy-config";

/**
 * The 3D navigation hub. Click a muscle zone → camera focuses + the
 * logging panel filters to that group. Import with `next/dynamic`
 * (`ssr: false`) — WebGL only exists client-side.
 */
export function AnatomyCanvas({ className }: { className?: string }) {
  const clearSelection = useAnatomyStore((s) => s.clearSelection);

  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: DEFAULT_POSE.position, fov: 38 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={() => clearSelection()}
      >
        <color attach="background" args={["#05050a"]} />
        <fog attach="fog" args={["#05050a", 4.5, 11]} />

        <ambientLight intensity={0.35} color="#8a8aff" />
        <directionalLight position={[2, 3, 2]} intensity={1.1} color="#dfe6ff" />
        <pointLight position={[-2.2, 1.8, -2]} intensity={4} color="#7c3aed" />
        <pointLight position={[2.2, 1.2, -1.4]} intensity={2.5} color="#06b6d4" />

        <Suspense fallback={null}>
          <AnatomyModel />
        </Suspense>

        <Grid
          position={[0, 0, 0]}
          args={[14, 14]}
          cellSize={0.4}
          cellColor="#161628"
          sectionSize={2}
          sectionColor="#26264a"
          fadeDistance={9}
          fadeStrength={1.6}
          infiniteGrid
        />

        <CameraRig />

        <EffectComposer>
          <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.85} mipmapBlur />
          <Vignette eskil={false} offset={0.25} darkness={0.85} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
