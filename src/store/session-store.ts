import { create } from "zustand";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";

export type SetTagUI = "WARMUP" | "WORKING" | "DROP" | "FAILURE";

export interface LoggedSet {
  localId: string;
  exerciseSlug: string;
  exerciseName: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  tag: SetTagUI;
  e1rm: number;
  /** false until the API write lands (optimistic logging) */
  persisted: boolean;
  isPR: boolean;
}

/**
 * The active training session. Optimistic-first: every set is committed to
 * this store instantly (zero-friction logging), then synced to /api/sets
 * fire-and-forget. A failed sync keeps the set local and flags it.
 */
interface SessionState {
  activeExercise: { slug: string; name: string } | null;
  sets: LoggedSet[];
  /** PR banner payload — cleared after the celebration plays */
  celebration: { exerciseName: string; e1rm: number } | null;
  setActiveExercise: (ex: { slug: string; name: string } | null) => void;
  logSet: (input: { weightKg: number; reps: number; tag: SetTagUI }) => LoggedSet | null;
  markPersisted: (localId: string, isPR: boolean) => void;
  clearCelebration: () => void;
  resetSession: () => void;
}

let idCounter = 0;

export const useSessionStore = create<SessionState>((set, get) => ({
  activeExercise: null,
  sets: [],
  celebration: null,

  setActiveExercise: (ex) => set({ activeExercise: ex }),

  logSet: ({ weightKg, reps, tag }) => {
    const { activeExercise, sets } = get();
    if (!activeExercise) return null;
    const forExercise = sets.filter((s) => s.exerciseSlug === activeExercise.slug);
    const entry: LoggedSet = {
      localId: `set-${Date.now()}-${idCounter++}`,
      exerciseSlug: activeExercise.slug,
      exerciseName: activeExercise.name,
      setNumber: forExercise.length + 1,
      weightKg,
      reps,
      tag,
      e1rm: roundE1RM(epleyE1RM(weightKg, reps)),
      persisted: false,
      isPR: false,
    };
    set({ sets: [...sets, entry] });
    return entry;
  },

  markPersisted: (localId, isPR) =>
    set((s) => {
      const sets = s.sets.map((x) => (x.localId === localId ? { ...x, persisted: true, isPR } : x));
      const hit = sets.find((x) => x.localId === localId);
      return {
        sets,
        celebration:
          isPR && hit ? { exerciseName: hit.exerciseName, e1rm: hit.e1rm } : s.celebration,
      };
    }),

  clearCelebration: () => set({ celebration: null }),
  resetSession: () => set({ sets: [], activeExercise: null, celebration: null }),
}));
