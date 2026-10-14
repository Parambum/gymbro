import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

import { BUILT_IN_EXERCISES, slugify } from './exercises';
import { newId } from './id';
import { completedSetCount, isCountableSet, sessionVolume } from './stats';
import { storage } from './storage';
import type {
  ActiveSession,
  CompletedSession,
  Exercise,
  LoggedSet,
  MuscleGroup,
  SessionExercise,
} from './types';

export const DEFAULT_REST_SECONDS = 90;

type State = {
  hydrated: boolean;
  active: ActiveSession | null;
  history: CompletedSession[];
  customExercises: Exercise[];
  /** Epoch ms the current rest period ends, or null when not resting. */
  restEndsAt: number | null;
  /** Full length of the running rest period, for the progress bar. */
  restTotalSeconds: number | null;
};

type Action =
  | {
      type: 'hydrate';
      payload: Omit<State, 'hydrated' | 'restEndsAt' | 'restTotalSeconds'>;
    }
  | { type: 'startSession'; session: ActiveSession }
  | { type: 'setActive'; session: ActiveSession | null }
  | {
      type: 'updateActive';
      updater: (session: ActiveSession) => ActiveSession;
    }
  | { type: 'finishSession'; completed: CompletedSession | null }
  | { type: 'setCustomExercises'; exercises: Exercise[] }
  | { type: 'setRest'; endsAt: number | null; totalSeconds: number | null };

const initialState: State = {
  hydrated: false,
  active: null,
  history: [],
  customExercises: [],
  restEndsAt: null,
  restTotalSeconds: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.payload, hydrated: true };
    case 'startSession':
      return {
        ...state,
        active: action.session,
        restEndsAt: null,
        restTotalSeconds: null,
      };
    case 'setActive':
      return { ...state, active: action.session };
    case 'updateActive':
      // Applied against the latest state, so several edits fired from one
      // handler compose instead of overwriting each other.
      return state.active
        ? { ...state, active: action.updater(state.active) }
        : state;
    case 'finishSession':
      return {
        ...state,
        active: null,
        restEndsAt: null,
        restTotalSeconds: null,
        history: action.completed
          ? [action.completed, ...state.history]
          : state.history,
      };
    case 'setCustomExercises':
      return { ...state, customExercises: action.exercises };
    case 'setRest':
      return {
        ...state,
        restEndsAt: action.endsAt,
        restTotalSeconds: action.totalSeconds,
      };
    default:
      return state;
  }
}

function emptySet(): LoggedSet {
  return { id: newId('set'), weight: null, reps: null, completed: false };
}

function buildSessionExercise(exercise: Exercise): SessionExercise {
  return {
    id: newId('sx'),
    exerciseId: exercise.id,
    name: exercise.name,
    muscle: exercise.muscle,
    sets: [emptySet(), emptySet(), emptySet()],
  };
}

type StoreValue = State & {
  allExercises: Exercise[];
  startSession: (name: string, exercises: Exercise[]) => void;
  cancelSession: () => void;
  finishSession: () => CompletedSession | null;
  addExerciseToSession: (exercise: Exercise) => void;
  removeExerciseFromSession: (sessionExerciseId: string) => void;
  addSet: (sessionExerciseId: string) => void;
  removeSet: (sessionExerciseId: string, setId: string) => void;
  updateSet: (
    sessionExerciseId: string,
    setId: string,
    patch: Partial<Pick<LoggedSet, 'weight' | 'reps'>>,
  ) => void;
  toggleSetCompleted: (
    sessionExerciseId: string,
    setId: string,
    fallback?: { weight: number | null; reps: number | null },
  ) => boolean;
  addCustomExercise: (name: string, muscle: MuscleGroup) => Exercise | null;
  deleteCustomExercise: (exerciseId: string) => void;
  startRest: (seconds?: number) => void;
  extendRest: (seconds: number) => void;
  stopRest: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function GymBroProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [history, active, customExercises] = await Promise.all([
        storage.loadHistory(),
        storage.loadActive(),
        storage.loadCustomExercises(),
      ]);
      if (cancelled) return;
      dispatch({
        type: 'hydrate',
        payload: { history, active, customExercises },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave. Guarded on `hydrated` so the initial empty state can never
  // overwrite real data before the load finishes.
  useEffect(() => {
    if (!state.hydrated) return;
    void storage.saveActive(state.active);
  }, [state.active, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated) return;
    void storage.saveHistory(state.history);
  }, [state.history, state.hydrated]);

  useEffect(() => {
    if (!state.hydrated) return;
    void storage.saveCustomExercises(state.customExercises);
  }, [state.customExercises, state.hydrated]);

  const allExercises = useMemo(
    () =>
      [...BUILT_IN_EXERCISES, ...state.customExercises].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [state.customExercises],
  );

  const mutateActive = useCallback(
    (fn: (session: ActiveSession) => ActiveSession) => {
      dispatch({ type: 'updateActive', updater: fn });
    },
    [],
  );

  const mapExercise = useCallback(
    (sessionExerciseId: string, fn: (ex: SessionExercise) => SessionExercise) => {
      mutateActive((session) => ({
        ...session,
        exercises: session.exercises.map((ex) =>
          ex.id === sessionExerciseId ? fn(ex) : ex,
        ),
      }));
    },
    [mutateActive],
  );

  const startSession = useCallback((name: string, exercises: Exercise[]) => {
    dispatch({
      type: 'startSession',
      session: {
        id: newId('session'),
        name,
        startedAt: Date.now(),
        exercises: exercises.map(buildSessionExercise),
      },
    });
  }, []);

  const cancelSession = useCallback(() => {
    dispatch({ type: 'setActive', session: null });
    dispatch({ type: 'setRest', endsAt: null, totalSeconds: null });
  }, []);

  const finishSession = useCallback((): CompletedSession | null => {
    const active = state.active;
    if (!active) return null;

    // Keep only sets that were actually completed, and drop exercises that end
    // up empty — history records what happened, nothing more.
    const exercises = active.exercises
      .map((ex) => ({ ...ex, sets: ex.sets.filter(isCountableSet) }))
      .filter((ex) => ex.sets.length > 0);

    if (exercises.length === 0) {
      dispatch({ type: 'finishSession', completed: null });
      return null;
    }

    const trimmed: ActiveSession = { ...active, exercises };
    const completed: CompletedSession = {
      ...trimmed,
      finishedAt: Date.now(),
      totalVolume: sessionVolume(trimmed),
      totalSets: completedSetCount(trimmed),
    };
    dispatch({ type: 'finishSession', completed });
    return completed;
  }, [state.active]);

  const addExerciseToSession = useCallback(
    (exercise: Exercise) => {
      mutateActive((session) => ({
        ...session,
        exercises: [...session.exercises, buildSessionExercise(exercise)],
      }));
    },
    [mutateActive],
  );

  const removeExerciseFromSession = useCallback(
    (sessionExerciseId: string) => {
      mutateActive((session) => ({
        ...session,
        exercises: session.exercises.filter((ex) => ex.id !== sessionExerciseId),
      }));
    },
    [mutateActive],
  );

  const addSet = useCallback(
    (sessionExerciseId: string) => {
      mapExercise(sessionExerciseId, (ex) => ({
        ...ex,
        sets: [...ex.sets, emptySet()],
      }));
    },
    [mapExercise],
  );

  const removeSet = useCallback(
    (sessionExerciseId: string, setId: string) => {
      mapExercise(sessionExerciseId, (ex) => ({
        ...ex,
        sets: ex.sets.filter((s) => s.id !== setId),
      }));
    },
    [mapExercise],
  );

  const updateSet = useCallback(
    (
      sessionExerciseId: string,
      setId: string,
      patch: Partial<Pick<LoggedSet, 'weight' | 'reps'>>,
    ) => {
      mapExercise(sessionExerciseId, (ex) => ({
        ...ex,
        sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }));
    },
    [mapExercise],
  );

  /**
   * Ticks a set off and returns its new state. When completing a set that was
   * left blank, `fallback` (last session's numbers) fills it in — one atomic
   * update so the value and the tick can't race each other.
   */
  const toggleSetCompleted = useCallback(
    (
      sessionExerciseId: string,
      setId: string,
      fallback?: { weight: number | null; reps: number | null },
    ): boolean => {
      const target = state.active?.exercises
        .find((ex) => ex.id === sessionExerciseId)
        ?.sets.find((s) => s.id === setId);
      const next = !(target?.completed ?? false);

      mapExercise(sessionExerciseId, (ex) => ({
        ...ex,
        sets: ex.sets.map((s) => {
          if (s.id !== setId) return s;
          if (!next) return { ...s, completed: false };
          return {
            ...s,
            completed: true,
            weight: s.weight ?? fallback?.weight ?? null,
            reps: s.reps ?? fallback?.reps ?? null,
          };
        }),
      }));
      return next;
    },
    [mapExercise, state.active],
  );

  const addCustomExercise = useCallback(
    (name: string, muscle: MuscleGroup): Exercise | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const id = slugify(trimmed);
      const clash =
        BUILT_IN_EXERCISES.some((e) => e.id === id) ||
        state.customExercises.some((e) => e.id === id);
      if (clash) return null;

      const exercise: Exercise = { id, name: trimmed, muscle, custom: true };
      dispatch({
        type: 'setCustomExercises',
        exercises: [...state.customExercises, exercise],
      });
      return exercise;
    },
    [state.customExercises],
  );

  const deleteCustomExercise = useCallback(
    (exerciseId: string) => {
      dispatch({
        type: 'setCustomExercises',
        exercises: state.customExercises.filter((e) => e.id !== exerciseId),
      });
    },
    [state.customExercises],
  );

  const startRest = useCallback((seconds = DEFAULT_REST_SECONDS) => {
    dispatch({
      type: 'setRest',
      endsAt: Date.now() + seconds * 1000,
      totalSeconds: seconds,
    });
  }, []);

  const extendRest = useCallback(
    (seconds: number) => {
      const base = state.restEndsAt ?? Date.now();
      dispatch({
        type: 'setRest',
        endsAt: base + seconds * 1000,
        totalSeconds: (state.restTotalSeconds ?? 0) + seconds,
      });
    },
    [state.restEndsAt, state.restTotalSeconds],
  );

  const stopRest = useCallback(() => {
    dispatch({ type: 'setRest', endsAt: null, totalSeconds: null });
  }, []);

  const value: StoreValue = {
    ...state,
    allExercises,
    startSession,
    cancelSession,
    finishSession,
    addExerciseToSession,
    removeExerciseFromSession,
    addSet,
    removeSet,
    updateSet,
    toggleSetCompleted,
    addCustomExercise,
    deleteCustomExercise,
    startRest,
    extendRest,
    stopRest,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useGymBro(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useGymBro must be used inside <GymBroProvider>');
  }
  return ctx;
}
