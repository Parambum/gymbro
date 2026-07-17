/**
 * The pre-populated exercise catalog: 9 muscle groups × 20 proven variations.
 * Single source of truth — the Prisma seed, the 3D anatomy hub, and the
 * client-side picker all import from here.
 */

export type MuscleGroupSlug =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hams-glutes"
  | "calves"
  | "abs";

export interface MuscleGroupDef {
  slug: MuscleGroupSlug;
  name: string;
  /** neon accent used by the 3D zone + UI chips (glow-only, not chart marks) */
  accent: string;
  exercises: string[];
}

export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  {
    slug: "chest",
    name: "Chest",
    accent: "#22ff88",
    exercises: [
      "Flat Barbell Bench Press",
      "Incline Barbell Bench Press",
      "Decline Barbell Bench Press",
      "Flat Dumbbell Bench Press",
      "Incline Dumbbell Bench Press",
      "Dumbbell Chest Fly",
      "Cable Chest Fly (High-to-Low)",
      "Cable Chest Fly (Low-to-High)",
      "Pec Deck Fly",
      "Seated Machine Chest Press",
      "Incline Machine Chest Press",
      "Dips (Chest Focus)",
      "Push-ups",
      "Weighted Push-ups",
      "Smith Machine Flat Bench",
      "Smith Machine Incline Bench",
      "Close-Grip Bench Press",
      "Floor Press",
      "Landmine Press",
      "Cable Crossover",
    ],
  },
  {
    slug: "back",
    name: "Back",
    accent: "#7c3aed",
    exercises: [
      "Conventional Deadlift",
      "Pull-up",
      "Chin-up",
      "Weighted Pull-up",
      "Lat Pulldown (Wide Grip)",
      "Lat Pulldown (Close Grip)",
      "Single-Arm Lat Pulldown",
      "Barbell Bent-Over Row",
      "Pendlay Row",
      "One-Arm Dumbbell Row",
      "Seated Cable Row",
      "T-Bar Row",
      "Chest-Supported Row",
      "Machine High Row",
      "Meadows Row",
      "Smith Machine Row",
      "Straight-Arm Pulldown",
      "Rack Pull",
      "Inverted Row",
      "Renegade Row",
    ],
  },
  {
    slug: "shoulders",
    name: "Shoulders",
    accent: "#06b6d4",
    exercises: [
      "Standing Overhead Barbell Press",
      "Seated Barbell Shoulder Press",
      "Seated Dumbbell Shoulder Press",
      "Arnold Press",
      "Push Press",
      "Machine Shoulder Press",
      "Smith Machine Shoulder Press",
      "Landmine Shoulder Press",
      "Dumbbell Lateral Raise",
      "Cable Lateral Raise",
      "Machine Lateral Raise",
      "Dumbbell Front Raise",
      "Cable Front Raise",
      "Barbell Front Raise",
      "Rear Delt Dumbbell Fly",
      "Reverse Pec Deck",
      "Face Pull",
      "Upright Row",
      "Dumbbell Shrug",
      "Barbell Shrug",
    ],
  },
  {
    slug: "biceps",
    name: "Biceps",
    accent: "#22ff88",
    exercises: [
      "Barbell Curl",
      "EZ-Bar Curl",
      "Standing Dumbbell Curl",
      "Alternating Dumbbell Curl",
      "Hammer Curl",
      "Cross-Body Hammer Curl",
      "Incline Dumbbell Curl",
      "Preacher Curl (EZ-Bar)",
      "Preacher Curl (Machine)",
      "Concentration Curl",
      "Spider Curl",
      "Cable Curl (Straight Bar)",
      "Cable Rope Hammer Curl",
      "Bayesian Cable Curl",
      "Zottman Curl",
      "Reverse Curl",
      "Drag Curl",
      "Chin-up (Bicep Focus)",
      "Barbell 21s",
      "Machine Bicep Curl",
    ],
  },
  {
    slug: "triceps",
    name: "Triceps",
    accent: "#7c3aed",
    exercises: [
      "Close-Grip Bench Press",
      "Smith Machine Close-Grip Bench",
      "Skull Crusher (EZ-Bar)",
      "Floor Skull Crusher",
      "Cable Rope Pushdown",
      "Cable Straight-Bar Pushdown",
      "Reverse-Grip Pushdown",
      "Single-Arm Cable Pushdown",
      "Overhead Cable Extension",
      "Overhead Dumbbell Extension",
      "Dips (Triceps Focus)",
      "Weighted Dip",
      "Bench Dip",
      "Diamond Push-up",
      "Dumbbell Kickback",
      "Cable Kickback",
      "Machine Triceps Extension",
      "JM Press",
      "Tate Press",
      "Board Press",
    ],
  },
  {
    slug: "quads",
    name: "Quads",
    accent: "#06b6d4",
    exercises: [
      "Barbell Back Squat",
      "Front Squat",
      "Box Squat",
      "Zercher Squat",
      "Goblet Squat",
      "Smith Machine Squat",
      "Hack Squat (Machine)",
      "Pendulum Squat",
      "Belt Squat",
      "Landmine Squat",
      "Leg Press",
      "Narrow-Stance Leg Press",
      "Bulgarian Split Squat",
      "Walking Lunge",
      "Reverse Lunge",
      "Step-Up",
      "Leg Extension",
      "Sissy Squat",
      "Cyclist Squat",
      "Weighted Wall Sit",
    ],
  },
  {
    slug: "hams-glutes",
    name: "Hamstrings / Glutes",
    accent: "#ff2d55",
    exercises: [
      "Romanian Deadlift (Barbell)",
      "Romanian Deadlift (Dumbbell)",
      "Single-Leg Romanian Deadlift",
      "Stiff-Leg Deadlift",
      "Sumo Deadlift",
      "Good Morning",
      "Barbell Hip Thrust",
      "Machine Hip Thrust",
      "Glute Bridge",
      "Frog Pump",
      "Lying Leg Curl",
      "Seated Leg Curl",
      "Nordic Ham Curl",
      "Cable Pull-Through",
      "Cable Glute Kickback",
      "Kettlebell Swing",
      "45° Hyperextension",
      "Reverse Hyperextension",
      "Curtsy Lunge",
      "Machine Hip Abduction",
    ],
  },
  {
    slug: "calves",
    name: "Calves",
    accent: "#22ff88",
    exercises: [
      "Standing Calf Raise (Machine)",
      "Seated Calf Raise",
      "Leg Press Calf Raise",
      "Smith Machine Calf Raise",
      "Hack Squat Calf Raise",
      "Donkey Calf Raise",
      "Barbell Standing Calf Raise",
      "Dumbbell Standing Calf Raise",
      "Seated Dumbbell Calf Raise",
      "Single-Leg Standing Calf Raise",
      "Calf Raise on Step (Bodyweight)",
      "Weighted Calf Raise on Step",
      "Bent-Knee Calf Raise",
      "Reverse Calf Raise",
      "Tibialis Raise",
      "Explosive Calf Raise (Plyo)",
      "Isometric Calf Hold",
      "Farmer's Walk on Toes",
      "Jump Rope (Calf Focus)",
      "Single-Leg Seated Calf Raise",
    ],
  },
  {
    slug: "abs",
    name: "Abs",
    accent: "#06b6d4",
    exercises: [
      "Cable Crunch",
      "Machine Crunch",
      "Decline Sit-up",
      "Reverse Crunch",
      "Bicycle Crunch",
      "Hanging Leg Raise",
      "Hanging Knee Raise",
      "Toes-to-Bar",
      "Ab Wheel Rollout",
      "Weighted Plank",
      "Side Plank",
      "L-Sit Hold",
      "Dragon Flag",
      "V-Up",
      "Russian Twist",
      "Cable Woodchopper",
      "Landmine Rotation",
      "Pallof Press",
      "Dead Bug",
      "Mountain Climber",
    ],
  },
];

/** Slugify an exercise name — stable IDs shared by seed + client. */
export function exerciseSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[°']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function groupBySlug(slug: string): MuscleGroupDef | undefined {
  return MUSCLE_GROUPS.find((g) => g.slug === slug);
}

export const TOTAL_EXERCISES = MUSCLE_GROUPS.reduce(
  (n, g) => n + g.exercises.length,
  0,
); // 180
