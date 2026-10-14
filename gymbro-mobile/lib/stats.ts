import type {
  CompletedSession,
  LoggedSet,
  SessionExercise,
  ActiveSession,
} from './types';

/** A set only counts once it is ticked off and has both numbers filled in. */
export function isCountableSet(set: LoggedSet): boolean {
  return set.completed && set.weight != null && set.reps != null;
}

export function setVolume(set: LoggedSet): number {
  if (!isCountableSet(set)) return 0;
  return (set.weight as number) * (set.reps as number);
}

export function sessionVolume(session: ActiveSession): number {
  return session.exercises.reduce(
    (total, ex) => total + ex.sets.reduce((s, set) => s + setVolume(set), 0),
    0,
  );
}

export function completedSetCount(session: ActiveSession): number {
  return session.exercises.reduce(
    (total, ex) => total + ex.sets.filter(isCountableSet).length,
    0,
  );
}

/**
 * Epley formula. Exact at 1 rep, and increasingly an estimate beyond ~10 —
 * which is why it is always labelled "est." in the UI.
 */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export type PersonalRecord = {
  exerciseId: string;
  name: string;
  bestOneRepMax: number;
  /** The set that produced bestOneRepMax. */
  bestWeight: number;
  bestReps: number;
  heaviestWeight: number;
  achievedAt: number;
  totalSets: number;
};

export function buildPersonalRecords(
  history: CompletedSession[],
): PersonalRecord[] {
  const byExercise = new Map<string, PersonalRecord>();

  for (const session of history) {
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        if (!isCountableSet(set)) continue;

        const weight = set.weight as number;
        const reps = set.reps as number;
        const oneRm = estimateOneRepMax(weight, reps);
        const existing = byExercise.get(ex.exerciseId);

        if (!existing) {
          byExercise.set(ex.exerciseId, {
            exerciseId: ex.exerciseId,
            name: ex.name,
            bestOneRepMax: oneRm,
            bestWeight: weight,
            bestReps: reps,
            heaviestWeight: weight,
            achievedAt: session.finishedAt,
            totalSets: 1,
          });
          continue;
        }

        existing.totalSets += 1;
        existing.heaviestWeight = Math.max(existing.heaviestWeight, weight);
        if (oneRm > existing.bestOneRepMax) {
          existing.bestOneRepMax = oneRm;
          existing.bestWeight = weight;
          existing.bestReps = reps;
          existing.achievedAt = session.finishedAt;
        }
      }
    }
  }

  return [...byExercise.values()].sort(
    (a, b) => b.bestOneRepMax - a.bestOneRepMax,
  );
}

/**
 * The sets logged for this exercise the last time it was trained, used as the
 * "previous" reference beside each input. Returns null when there is no
 * history yet — the UI shows a dash rather than inventing a number.
 */
export function previousPerformance(
  history: CompletedSession[],
  exerciseId: string,
): LoggedSet[] | null {
  const sorted = [...history].sort((a, b) => b.finishedAt - a.finishedAt);
  for (const session of sorted) {
    const match: SessionExercise | undefined = session.exercises.find(
      (ex) => ex.exerciseId === exerciseId,
    );
    if (!match) continue;
    const sets = match.sets.filter(isCountableSet);
    if (sets.length > 0) return sets;
  }
  return null;
}

export function totalVolume(history: CompletedSession[]): number {
  return history.reduce((sum, s) => sum + s.totalVolume, 0);
}

export function formatVolume(kg: number): string {
  if (kg >= 1_000_000) return `${(kg / 1_000_000).toFixed(1)}M`;
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k`;
  return `${Math.round(kg)}`;
}

export function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? `${weight}` : weight.toFixed(1);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}
