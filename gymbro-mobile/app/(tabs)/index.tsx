import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronRight,
  Dumbbell,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';

import { ExercisePickerModal } from '../../components/ExercisePickerModal';
import { SetRow, SetRowHeader } from '../../components/SetRow';
import { EmptyState, ScreenTitle, StatCard } from '../../components/ui';
import { BUILT_IN_EXERCISES } from '../../lib/exercises';
import { ROUTINE_TEMPLATES } from '../../lib/routines';
import {
  completedSetCount,
  formatDuration,
  formatVolume,
  previousPerformance,
  sessionVolume,
} from '../../lib/stats';
import { useGymBro } from '../../lib/store';
import { colors } from '../../lib/theme';
import type { SessionExercise } from '../../lib/types';

/** Re-renders on an interval so elapsed time stays live. */
function useTicker(enabled: boolean, ms = 1000) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => bump((n) => n + 1), ms);
    return () => clearInterval(interval);
  }, [enabled, ms]);
}

export default function WorkoutScreen() {
  const { hydrated, active } = useGymBro();

  if (!hydrated) {
    return <SafeAreaView className="flex-1 bg-ink-950" edges={['top']} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
      {active ? <ActiveWorkout /> : <StartWorkout />}
    </SafeAreaView>
  );
}

function StartWorkout() {
  const { startSession, allExercises, history } = useGymBro();

  const startTemplate = (name: string, exerciseIds: string[]) => {
    const exercises = exerciseIds
      .map((id) => allExercises.find((e) => e.id === id))
      .filter((e): e is NonNullable<typeof e> => e != null);
    startSession(name, exercises);
  };

  return (
    <ScrollView
      contentContainerClassName="pb-10"
      showsVerticalScrollIndicator={false}
    >
      <ScreenTitle
        title="Start training"
        subtitle={
          history.length > 0
            ? `${history.length} workout${history.length === 1 ? '' : 's'} logged`
            : 'Pick a split or build your own'
        }
      />

      <View className="px-5">
        <Pressable
          onPress={() => startSession('Empty Workout', [])}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-flame-500 py-4 active:bg-flame-600"
        >
          <Plus size={18} color={colors.ink950} strokeWidth={3} />
          <Text className="text-base font-bold text-ink-950">
            Start empty workout
          </Text>
        </Pressable>

        <Text className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-ink-500">
          Routines
        </Text>

        <View className="gap-2">
          {ROUTINE_TEMPLATES.map((routine) => (
            <Pressable
              key={routine.id}
              onPress={() => startTemplate(routine.name, routine.exerciseIds)}
              className="flex-row items-center rounded-xl border border-ink-800 bg-ink-900 px-4 py-3.5 active:bg-ink-850"
            >
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-white">
                  {routine.name}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-500">
                  {routine.focus} · {routine.exerciseIds.length} exercises
                </Text>
              </View>
              <ChevronRight size={18} color={colors.ink600} strokeWidth={2.5} />
            </Pressable>
          ))}
        </View>

        <Text className="mt-6 text-center text-xs leading-5 text-ink-600">
          Routines only pre-fill the exercise list. Every set starts empty.
        </Text>
      </View>
    </ScrollView>
  );
}

function ActiveWorkout() {
  const {
    active,
    addExerciseToSession,
    cancelSession,
    finishSession,
  } = useGymBro();
  const [pickerOpen, setPickerOpen] = useState(false);

  useTicker(active != null);

  if (!active) return null;

  const volume = sessionVolume(active);
  const sets = completedSetCount(active);
  const elapsed = Date.now() - active.startedAt;

  const confirmFinish = () => {
    const completed = finishSession();
    if (completed) {
      Alert.alert(
        'Workout saved',
        `${completed.totalSets} sets · ${formatVolume(completed.totalVolume)} kg total volume`,
      );
    } else {
      Alert.alert(
        'Nothing to save',
        'No sets were ticked off, so this session was discarded rather than logged as an empty workout.',
      );
    }
  };

  const confirmDiscard = () => {
    Alert.alert('Discard workout?', 'Everything logged in this session is lost.', [
      { text: 'Keep training', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: cancelSession },
    ]);
  };

  return (
    <>
      <ScreenTitle
        title={active.name}
        subtitle={`In progress · ${formatDuration(elapsed)}`}
        right={
          <Pressable
            onPress={confirmFinish}
            className="rounded-xl bg-flame-500 px-4 py-2.5 active:bg-flame-600"
          >
            <Text className="text-sm font-bold text-ink-950">Finish</Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerClassName="px-5 pb-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row gap-2">
          <StatCard label="Volume" value={formatVolume(volume)} unit="kg" accent />
          <StatCard label="Sets done" value={String(sets)} />
          <StatCard label="Exercises" value={String(active.exercises.length)} />
        </View>

        {active.exercises.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No exercises yet"
            body="Add your first movement to start logging sets."
          />
        ) : (
          <View className="mt-4 gap-3">
            {active.exercises.map((exercise) => (
              <ExerciseCard key={exercise.id} exercise={exercise} />
            ))}
          </View>
        )}

        <Pressable
          onPress={() => setPickerOpen(true)}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 py-4 active:bg-ink-900"
        >
          <Plus size={17} color={colors.flame400} strokeWidth={3} />
          <Text className="text-sm font-bold text-flame-400">Add exercise</Text>
        </Pressable>

        <Pressable onPress={confirmDiscard} className="mt-6 py-2">
          <Text className="text-center text-sm font-semibold text-ink-500">
            Discard workout
          </Text>
        </Pressable>
      </ScrollView>

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExerciseToSession}
      />
    </>
  );
}

function ExerciseCard({ exercise }: { exercise: SessionExercise }) {
  const {
    history,
    addSet,
    removeSet,
    updateSet,
    toggleSetCompleted,
    removeExerciseFromSession,
    startRest,
  } = useGymBro();

  const previous = useMemo(
    () => previousPerformance(history, exercise.exerciseId),
    [history, exercise.exerciseId],
  );

  const isBuiltIn = BUILT_IN_EXERCISES.some((e) => e.id === exercise.exerciseId);

  const confirmRemove = () => {
    Alert.alert(`Remove ${exercise.name}?`, 'Its logged sets go with it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeExerciseFromSession(exercise.id),
      },
    ]);
  };

  return (
    <View className="rounded-2xl border border-ink-800 bg-ink-900 p-3">
      <View className="mb-2 flex-row items-center justify-between px-1">
        <View className="flex-1 pr-2">
          <Text className="text-base font-semibold text-white">
            {exercise.name}
          </Text>
          <Text className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">
            {exercise.muscle}
            {isBuiltIn ? '' : ' · Custom'}
          </Text>
        </View>
        <Pressable
          onPress={confirmRemove}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:bg-ink-800"
        >
          <X size={16} color={colors.ink600} strokeWidth={2.5} />
        </Pressable>
      </View>

      <SetRowHeader />

      {exercise.sets.map((set, index) => (
        <SetRow
          key={set.id}
          index={index}
          set={set}
          previous={previous?.[index] ?? null}
          onChangeWeight={(weight) => updateSet(exercise.id, set.id, { weight })}
          onChangeReps={(reps) => updateSet(exercise.id, set.id, { reps })}
          onToggle={() => {
            const fallback = previous?.[index];
            const nowComplete = toggleSetCompleted(exercise.id, set.id, {
              weight: fallback?.weight ?? null,
              reps: fallback?.reps ?? null,
            });
            if (nowComplete) startRest();
          }}
          onRemove={() => removeSet(exercise.id, set.id)}
        />
      ))}

      <Pressable
        onPress={() => addSet(exercise.id)}
        className="mt-2 flex-row items-center justify-center gap-1.5 rounded-lg bg-ink-800 py-2.5 active:bg-ink-700"
      >
        <Plus size={14} color={colors.ink300} strokeWidth={3} />
        <Text className="text-xs font-bold text-ink-300">Add set</Text>
      </Pressable>

      {exercise.sets.length > 0 ? (
        <View className="mt-2 flex-row items-center justify-center gap-1">
          <Trash2 size={10} color={colors.ink600} strokeWidth={2.5} />
          <Text className="text-[10px] text-ink-600">
            Long-press a set number to delete it
          </Text>
        </View>
      ) : null}
    </View>
  );
}
