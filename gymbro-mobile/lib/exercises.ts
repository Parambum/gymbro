import type { Exercise, MuscleGroup } from './types';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function group(muscle: MuscleGroup, names: string[]): Exercise[] {
  return names.map((name) => ({ id: slugify(name), name, muscle }));
}

/** Reference catalogue of standard barbell/dumbbell/machine movements. */
export const BUILT_IN_EXERCISES: Exercise[] = [
  ...group('Chest', [
    'Barbell Bench Press',
    'Incline Barbell Bench Press',
    'Dumbbell Bench Press',
    'Incline Dumbbell Press',
    'Dumbbell Fly',
    'Cable Crossover',
    'Chest Dip',
    'Push-Up',
    'Machine Chest Press',
    'Pec Deck',
  ]),
  ...group('Back', [
    'Deadlift',
    'Barbell Row',
    'Pull-Up',
    'Chin-Up',
    'Lat Pulldown',
    'Seated Cable Row',
    'T-Bar Row',
    'Dumbbell Row',
    'Face Pull',
    'Straight-Arm Pulldown',
  ]),
  ...group('Legs', [
    'Back Squat',
    'Front Squat',
    'Romanian Deadlift',
    'Leg Press',
    'Bulgarian Split Squat',
    'Walking Lunge',
    'Leg Extension',
    'Lying Leg Curl',
    'Hip Thrust',
    'Goblet Squat',
    'Standing Calf Raise',
    'Seated Calf Raise',
  ]),
  ...group('Shoulders', [
    'Overhead Press',
    'Seated Dumbbell Shoulder Press',
    'Arnold Press',
    'Lateral Raise',
    'Cable Lateral Raise',
    'Rear Delt Fly',
    'Upright Row',
    'Front Raise',
  ]),
  ...group('Arms', [
    'Barbell Curl',
    'Dumbbell Curl',
    'Hammer Curl',
    'Preacher Curl',
    'Incline Dumbbell Curl',
    'Cable Curl',
    'Close-Grip Bench Press',
    'Triceps Pushdown',
    'Overhead Triceps Extension',
    'Skullcrusher',
    'Triceps Dip',
  ]),
  ...group('Core', [
    'Plank',
    'Side Plank',
    'Hanging Leg Raise',
    'Cable Crunch',
    'Ab Wheel Rollout',
    'Russian Twist',
    'Bicycle Crunch',
    'Dead Bug',
  ]),
];

export function findExercise(
  all: Exercise[],
  exerciseId: string,
): Exercise | undefined {
  return all.find((e) => e.id === exerciseId);
}
