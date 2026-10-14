export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type Exercise = {
  id: string;
  name: string;
  muscle: MuscleGroup;
  /** True for exercises the user created themselves. */
  custom?: boolean;
};

export type LoggedSet = {
  id: string;
  /** Null until the user types a value — never defaulted to 0. */
  weight: number | null;
  reps: number | null;
  completed: boolean;
};

/**
 * An exercise inside a session. Name and muscle are denormalised on purpose:
 * history must stay readable even if the exercise is later renamed or deleted.
 */
export type SessionExercise = {
  id: string;
  exerciseId: string;
  name: string;
  muscle: MuscleGroup;
  sets: LoggedSet[];
};

export type ActiveSession = {
  id: string;
  name: string;
  startedAt: number;
  exercises: SessionExercise[];
};

export type CompletedSession = ActiveSession & {
  finishedAt: number;
  totalVolume: number;
  totalSets: number;
};

export type RoutineTemplate = {
  id: string;
  name: string;
  focus: string;
  exerciseIds: string[];
};
