import type { MuscleGroupSlug } from "@/lib/data/exercise-catalog";

/**
 * Parametric low-poly anatomy rig. The figure is ~1.9 units tall, feet at
 * y = 0. Every interactive muscle zone is a set of primitive meshes; parts
 * flagged `mirror` render twice, x-negated.
 */

export type PartGeom =
  | { kind: "capsule"; args: [radius: number, length: number, capSeg: number, radSeg: number] }
  | { kind: "sphere"; args: [radius: number, wSeg: number, hSeg: number] }
  | { kind: "box"; args: [w: number, h: number, d: number] }
  | { kind: "cylinder"; args: [rTop: number, rBottom: number, h: number, seg: number] }
  | { kind: "icosahedron"; args: [radius: number, detail: number] };

export interface PartDef {
  geom: PartGeom;
  position: [number, number, number];
  rotation?: [number, number, number];
  mirror?: boolean;
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface ZoneDef {
  slug: MuscleGroupSlug;
  parts: PartDef[];
  camera: CameraPose;
}

export const DEFAULT_POSE: CameraPose = {
  position: [0, 1.35, 3.1],
  target: [0, 1.05, 0],
};

/** Non-interactive chassis: head, spine, pelvis, arms, shins, feet. */
export const CHASSIS: PartDef[] = [
  { geom: { kind: "icosahedron", args: [0.13, 1] }, position: [0, 1.78, 0] },
  { geom: { kind: "cylinder", args: [0.05, 0.06, 0.1, 6] }, position: [0, 1.65, 0] },
  { geom: { kind: "box", args: [0.3, 0.52, 0.16] }, position: [0, 1.32, 0] },
  { geom: { kind: "box", args: [0.26, 0.16, 0.15] }, position: [0, 0.98, 0] },
  { geom: { kind: "capsule", args: [0.045, 0.22, 2, 6] }, position: [0.315, 1.4, 0], mirror: true },
  {
    geom: { kind: "capsule", args: [0.04, 0.2, 2, 6] },
    position: [0.35, 1.1, 0.02],
    rotation: [0.12, 0, -0.08],
    mirror: true,
  },
  { geom: { kind: "sphere", args: [0.05, 6, 5] }, position: [0.365, 0.94, 0.05], mirror: true },
  { geom: { kind: "capsule", args: [0.045, 0.34, 2, 6] }, position: [0.12, 0.3, 0.02], mirror: true },
  { geom: { kind: "box", args: [0.09, 0.05, 0.22] }, position: [0.12, 0.03, 0.06], mirror: true },
];

export const ZONES: ZoneDef[] = [
  {
    slug: "chest",
    parts: [
      {
        geom: { kind: "box", args: [0.16, 0.13, 0.07] },
        position: [0.085, 1.46, 0.1],
        rotation: [0, -0.15, 0],
        mirror: true,
      },
    ],
    camera: { position: [0.25, 1.55, 1.5], target: [0, 1.44, 0] },
  },
  {
    slug: "abs",
    parts: [
      { geom: { kind: "box", args: [0.085, 0.075, 0.05] }, position: [0.05, 1.28, 0.095], mirror: true },
      { geom: { kind: "box", args: [0.085, 0.075, 0.05] }, position: [0.05, 1.19, 0.095], mirror: true },
      { geom: { kind: "box", args: [0.085, 0.075, 0.05] }, position: [0.05, 1.1, 0.095], mirror: true },
    ],
    camera: { position: [0, 1.28, 1.35], target: [0, 1.19, 0] },
  },
  {
    slug: "back",
    parts: [
      { geom: { kind: "box", args: [0.3, 0.3, 0.06] }, position: [0, 1.42, -0.095] },
      {
        geom: { kind: "box", args: [0.1, 0.26, 0.06] },
        position: [0.17, 1.28, -0.075],
        rotation: [0, 0.2, 0.18],
        mirror: true,
      },
    ],
    camera: { position: [0.2, 1.6, -1.7], target: [0, 1.35, 0] },
  },
  {
    slug: "shoulders",
    parts: [{ geom: { kind: "sphere", args: [0.085, 7, 6] }, position: [0.3, 1.57, 0], mirror: true }],
    camera: { position: [0.5, 1.75, 1.35], target: [0, 1.56, 0] },
  },
  {
    slug: "biceps",
    parts: [
      {
        geom: { kind: "capsule", args: [0.05, 0.16, 2, 6] },
        position: [0.315, 1.4, 0.055],
        rotation: [-0.08, 0, 0],
        mirror: true,
      },
    ],
    camera: { position: [0.85, 1.45, 1.05], target: [0.3, 1.4, 0] },
  },
  {
    slug: "triceps",
    parts: [
      {
        geom: { kind: "capsule", args: [0.05, 0.17, 2, 6] },
        position: [0.32, 1.39, -0.05],
        rotation: [0.08, 0, 0],
        mirror: true,
      },
    ],
    camera: { position: [0.95, 1.45, -0.95], target: [0.3, 1.4, 0] },
  },
  {
    slug: "quads",
    parts: [
      { geom: { kind: "capsule", args: [0.08, 0.32, 2, 7] }, position: [0.115, 0.72, 0.045], mirror: true },
    ],
    camera: { position: [0.3, 0.95, 1.6], target: [0, 0.75, 0] },
  },
  {
    slug: "hams-glutes",
    parts: [
      { geom: { kind: "sphere", args: [0.085, 7, 6] }, position: [0.1, 0.96, -0.08], mirror: true },
      { geom: { kind: "capsule", args: [0.07, 0.28, 2, 7] }, position: [0.115, 0.7, -0.055], mirror: true },
    ],
    camera: { position: [0.3, 1.0, -1.65], target: [0, 0.82, 0] },
  },
  {
    slug: "calves",
    parts: [
      { geom: { kind: "capsule", args: [0.055, 0.22, 2, 7] }, position: [0.12, 0.34, -0.045], mirror: true },
    ],
    camera: { position: [0.45, 0.5, -1.4], target: [0, 0.34, 0] },
  },
];

export function zonePose(slug: MuscleGroupSlug | null): CameraPose {
  if (!slug) return DEFAULT_POSE;
  return ZONES.find((z) => z.slug === slug)?.camera ?? DEFAULT_POSE;
}
