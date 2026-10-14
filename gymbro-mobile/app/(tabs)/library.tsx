import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Search, Trash2, X } from 'lucide-react-native';

import { ScreenTitle } from '../../components/ui';
import { useGymBro } from '../../lib/store';
import { colors } from '../../lib/theme';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../../lib/types';

export default function LibraryScreen() {
  const { allExercises, customExercises, deleteCustomExercise } = useGymBro();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allExercises.filter((e) => {
      if (muscle && e.muscle !== muscle) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });

    return MUSCLE_GROUPS.map((group) => ({
      title: group,
      data: filtered.filter((e) => e.muscle === group),
    })).filter((section) => section.data.length > 0);
  }, [allExercises, muscle, query]);

  const confirmDelete = (exercise: Exercise) => {
    Alert.alert(
      `Delete ${exercise.name}?`,
      'Past workouts keep their record of it — only the library entry is removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteCustomExercise(exercise.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
      <ScreenTitle
        title="Exercises"
        subtitle={`${allExercises.length} movements · ${customExercises.length} custom`}
        right={
          <Pressable
            onPress={() => setCreateOpen(true)}
            className="h-10 w-10 items-center justify-center rounded-xl bg-flame-500 active:bg-flame-600"
          >
            <Plus size={20} color={colors.ink950} strokeWidth={3} />
          </Pressable>
        }
      />

      <View className="mx-5 flex-row items-center gap-2 rounded-xl bg-ink-900 px-3">
        <Search size={16} color={colors.ink500} strokeWidth={2.5} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={colors.ink600}
          autoCorrect={false}
          className="h-11 flex-1 text-base text-white"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <X size={15} color={colors.ink500} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[null, ...MUSCLE_GROUPS]}
        keyExtractor={(m) => m ?? 'all'}
        className="max-h-14 flex-none"
        contentContainerClassName="gap-2 px-5 py-3"
        renderItem={({ item }) => {
          const selected = muscle === item;
          return (
            <Pressable
              onPress={() => setMuscle(item)}
              className={`h-8 justify-center rounded-full px-3.5 ${
                selected ? 'bg-flame-500' : 'bg-ink-800'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selected ? 'text-ink-950' : 'text-ink-300'
                }`}
              >
                {item ?? 'All'}
              </Text>
            </Pressable>
          );
        }}
      />

      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text className="mt-10 text-center text-sm leading-5 text-ink-500">
            Nothing matches “{query}”.{'\n'}Tap + to add it as a custom exercise.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-ink-500">
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => (
          <View className="flex-row items-center rounded-xl border border-ink-800 bg-ink-900 px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-base font-medium text-white">
                {item.name}
              </Text>
              {item.custom ? (
                <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-flame-400">
                  Custom
                </Text>
              ) : null}
            </View>
            {item.custom ? (
              <Pressable
                onPress={() => confirmDelete(item)}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-full active:bg-ink-800"
              >
                <Trash2 size={15} color={colors.ink500} strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </View>
        )}
      />

      <CreateExerciseModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </SafeAreaView>
  );
}

function CreateExerciseModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { addCustomExercise } = useGymBro();
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup>('Chest');

  const reset = () => {
    setName('');
    setMuscle('Chest');
  };

  const submit = () => {
    const created = addCustomExercise(name, muscle);
    if (!created) {
      Alert.alert(
        'Could not add that',
        name.trim()
          ? `"${name.trim()}" already exists in the library.`
          : 'Give the exercise a name first.',
      );
      return;
    }
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-ink-950" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 pb-4 pt-3">
          <Text className="text-2xl font-bold text-white">New exercise</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-ink-800 active:bg-ink-700"
          >
            <X size={17} color={colors.ink300} strokeWidth={2.5} />
          </Pressable>
        </View>

        <View className="px-5">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-500">
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Landmine Press"
            placeholderTextColor={colors.ink600}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            className="h-12 rounded-xl bg-ink-900 px-4 text-base text-white"
          />

          <Text className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-ink-500">
            Muscle group
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {MUSCLE_GROUPS.map((group) => {
              const selected = muscle === group;
              return (
                <Pressable
                  key={group}
                  onPress={() => setMuscle(group)}
                  className={`h-10 justify-center rounded-xl px-4 ${
                    selected ? 'bg-flame-500' : 'bg-ink-900'
                  }`}
                >
                  <Text
                    className={`text-sm font-bold ${
                      selected ? 'text-ink-950' : 'text-ink-300'
                    }`}
                  >
                    {group}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={submit}
            className="mt-8 items-center rounded-xl bg-flame-500 py-4 active:bg-flame-600"
          >
            <Text className="text-base font-bold text-ink-950">
              Add to library
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
