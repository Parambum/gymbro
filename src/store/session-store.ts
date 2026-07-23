import { create } from "zustand";

export type SetTypeUI = "WARMUP" | "WORKING" | "DROP" | "FAILURE";

export interface LoggedSet {
  id: string;
  exercise: string;
  muscleGroup: string;
  setNumber: number;
  weight: number;
  reps: number;
  setType: SetTypeUI;
  supersetGroup: string | null;
  e1rm: number;
  isPR: boolean;
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
  celebration: { exercise: string; e1rm: number } | null;
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
      celebration: entry.isPR ? { exercise: entry.exercise, e1rm: entry.e1rm } : s.celebration,
    })),
  removeSet: (id) => set((s) => ({ sets: s.sets.filter((x) => x.id !== id) })),
  clearCelebration: () => set({ celebration: null }),
  reset: () => set({ activeExercise: null, sets: [], celebration: null }),
}));
