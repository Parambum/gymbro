import type { RoutineTemplate } from './types';

/**
 * Starting points, not logged data — picking one only pre-fills the exercise
 * list for a new session. Every set still starts empty.
 */
export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'push-day',
    name: 'Push Day',
    focus: 'Chest · Shoulders · Triceps',
    exerciseIds: [
      'barbell-bench-press',
      'overhead-press',
      'incline-dumbbell-press',
      'lateral-raise',
      'triceps-pushdown',
      'overhead-triceps-extension',
    ],
  },
  {
    id: 'pull-day',
    name: 'Pull Day',
    focus: 'Back · Biceps',
    exerciseIds: [
      'deadlift',
      'pull-up',
      'barbell-row',
      'seated-cable-row',
      'face-pull',
      'barbell-curl',
    ],
  },
  {
    id: 'leg-day',
    name: 'Leg Day',
    focus: 'Quads · Hamstrings · Calves',
    exerciseIds: [
      'back-squat',
      'romanian-deadlift',
      'leg-press',
      'lying-leg-curl',
      'standing-calf-raise',
    ],
  },
  {
    id: 'arnold-chest-back',
    name: 'Arnold Split — Chest & Back',
    focus: 'Antagonist supersets',
    exerciseIds: [
      'barbell-bench-press',
      'barbell-row',
      'incline-dumbbell-press',
      'lat-pulldown',
      'dumbbell-fly',
      'seated-cable-row',
    ],
  },
  {
    id: 'arnold-shoulders-arms',
    name: 'Arnold Split — Shoulders & Arms',
    focus: 'Delts · Biceps · Triceps',
    exerciseIds: [
      'overhead-press',
      'lateral-raise',
      'rear-delt-fly',
      'barbell-curl',
      'skullcrusher',
      'hammer-curl',
    ],
  },
  {
    id: 'arnold-legs',
    name: 'Arnold Split — Legs & Lower Back',
    focus: 'Squat · Hinge · Calves',
    exerciseIds: [
      'back-squat',
      'romanian-deadlift',
      'leg-extension',
      'lying-leg-curl',
      'standing-calf-raise',
    ],
  },
  {
    id: 'upper-body',
    name: 'Upper Body',
    focus: 'Full upper split',
    exerciseIds: [
      'barbell-bench-press',
      'barbell-row',
      'overhead-press',
      'lat-pulldown',
      'barbell-curl',
      'triceps-pushdown',
    ],
  },
  {
    id: 'lower-body',
    name: 'Lower Body',
    focus: 'Quads · Glutes · Hamstrings',
    exerciseIds: [
      'back-squat',
      'hip-thrust',
      'bulgarian-split-squat',
      'lying-leg-curl',
      'seated-calf-raise',
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body',
    focus: 'One compound per pattern',
    exerciseIds: [
      'back-squat',
      'barbell-bench-press',
      'barbell-row',
      'overhead-press',
      'plank',
    ],
  },
];
