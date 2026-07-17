"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useAnatomyStore } from "@/store/anatomy-store";
import { MUSCLE_GROUPS, groupBySlug } from "@/lib/data/exercise-catalog";
import { CHASSIS, ZONES, type PartDef, type PartGeom, type ZoneDef } from "./anatomy-config";

function buildGeometry(geom: PartGeom): THREE.BufferGeometry {
  switch (geom.kind) {
    case "capsule":
      return new THREE.CapsuleGeometry(...geom.args);
    case "sphere":
      return new THREE.SphereGeometry(...geom.args);
    case "box":
      return new THREE.BoxGeometry(...geom.args);
    case "cylinder":
      return new THREE.CylinderGeometry(...geom.args);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(...geom.args);
  }
}

/** Expand mirror-flagged parts into left/right instances. */
function expandParts(parts: PartDef[]): Array<PartDef & { key: string }> {
  return parts.flatMap((p, i) => {
    const base = { ...p, key: `p${i}` };
    if (!p.mirror) return [base];
    const [x, y, z] = p.position;
    const [rx = 0, ry = 0, rz = 0] = p.rotation ?? [];
    return [
      base,
      {
        ...p,
        key: `p${i}-mirror`,
        position: [-x, y, z] as [number, number, number],
        rotation: [rx, -ry, -rz] as [number, number, number],
      },
    ];
  });
}

function PartMesh({
  part,
  material,
}: {
  part: PartDef & { key: string };
  material: THREE.Material;
}) {
  const geometry = useMemo(() => buildGeometry(part.geom), [part]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={part.position}
      rotation={part.rotation ?? [0, 0, 0]}
    />
  );
}

/**
 * One interactive muscle zone: all its meshes share a material whose
 * emissive state is damped every frame — idle ember, hover glow,
 * selected pulse (bright enough to feed the bloom pass).
 */
function MuscleZone({ zone }: { zone: ZoneDef }) {
  const { hovered, selected, setHovered, select } = useAnatomyStore();
  const accent = groupBySlug(zone.slug)?.accent ?? "#7c3aed";
  const isHovered = hovered === zone.slug;
  const isSelected = selected === zone.slug;

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a1a2e",
        emissive: new THREE.Color(accent),
        emissiveIntensity: 0.08,
        roughness: 0.35,
        metalness: 0.55,
        flatShading: true,
      }),
    [accent],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    const target = isSelected
      ? 1.35 + Math.sin(state.clock.elapsedTime * 4) * 0.35
      : isHovered
        ? 0.9
        : 0.08;
    material.emissiveIntensity = THREE.MathUtils.damp(
      material.emissiveIntensity,
      target,
      10,
      delta,
    );
  });

  const parts = useMemo(() => expandParts(zone.parts), [zone]);
  const group = groupBySlug(zone.slug);

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(zone.slug);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (useAnatomyStore.getState().hovered === zone.slug) setHovered(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        select(zone.slug);
      }}
    >
      {parts.map((p) => (
        <PartMesh key={p.key} part={p} material={material} />
      ))}
      {isHovered && !isSelected && group && (
        <Html position={zone.camera.target} center distanceFactor={2.6} zIndexRange={[20, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded border border-edge bg-void/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-300">
            {group.name}
          </div>
        </Html>
      )}
    </group>
  );
}

/** The full figure: neutral chassis + nine interactive muscle zones. */
export function AnatomyModel() {
  const hovered = useAnatomyStore((s) => s.hovered);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "auto";
    return () => {
      document.body.style.cursor = "auto";
    };
  }, [hovered]);

  const chassisMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#12121f",
        emissive: new THREE.Color("#0e0e1a"),
        emissiveIntensity: 0.4,
        roughness: 0.5,
        metalness: 0.6,
        flatShading: true,
      }),
    [],
  );
  useEffect(() => () => chassisMaterial.dispose(), [chassisMaterial]);

  const chassisParts = useMemo(() => expandParts(CHASSIS), []);

  return (
    <group>
      {chassisParts.map((p) => (
        <PartMesh key={p.key} part={p} material={chassisMaterial} />
      ))}
      {ZONES.map((zone) => (
        <MuscleZone key={zone.slug} zone={zone} />
      ))}
    </group>
  );
}

/** Sanity: every catalog group must have a 3D zone. */
if (process.env.NODE_ENV !== "production") {
  const zoneSlugs = new Set(ZONES.map((z) => z.slug));
  for (const g of MUSCLE_GROUPS) {
    if (!zoneSlugs.has(g.slug)) {
      console.warn(`[anatomy] muscle group "${g.slug}" has no 3D zone`);
    }
  }
}
