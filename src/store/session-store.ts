import { create } from "zustand";
import { formatHold, type LoggingMode } from "@/lib/exercise-modes";

export type SetTypeUI = "WARMUP" | "WORKING" | "DROP" | "FAILURE";

export interface LoggedSet {
  id: string;
  exercise: string;
  muscleGroup: string;
  mode: LoggingMode;
  setNumber: number;
  weight: number;
  reps: number;
  durationSec: number | null;
  setType: SetTypeUI;
  supersetGroup: string | null;
  e1rm: number;
  isPR: boolean;
}

/** Mode-aware PR headline, e.g. "126.5 KG e1RM", "15 REPS", "1:30 HOLD". */
function prLabel(s: LoggedSet): string {
  if (s.mode === "time") return `${formatHold(s.durationSec ?? 0)} HOLD`;
  if (s.mode === "reps") return `${s.reps} REPS`;
  return `${s.e1rm} KG e1RM`;
}

/**
 * Transient state for the click-to-log modal. Sets are written straight to
 * MongoDB (POST /api/workouts) and mirrored here so the modal can show the
 * running list for the current exercise and fire the PR celebration.
 * Nothing here is persisted client-side — reload = fetch from the server.
 */
interface SessionState {
  activeExercise: { name: string; muscleGroup: string } | null;
  sets: LoggedSet[];
  celebration: { exercise: string; label: string } | null;
  setActiveExercise: (ex: { name: string; muscleGroup: string } | null) => void;
  addSet: (set: LoggedSet) => void;
  removeSet: (id: string) => void;
  clearCelebration: () => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeExercise: null,
  sets: [],
  celebration: null,
  setActiveExercise: (ex) => set({ activeExercise: ex }),
  addSet: (entry) =>
    set((s) => ({
      sets: [...s.sets, entry],
      celebration: entry.isPR ? { exercise: entry.exercise, label: prLabel(entry) } : s.celebration,
    })),
  removeSet: (id) => set((s) => ({ sets: s.sets.filter((x) => x.id !== id) })),
  clearCelebration: () => set({ celebration: null }),
  reset: () => set({ activeExercise: null, sets: [], celebration: null }),
}));
