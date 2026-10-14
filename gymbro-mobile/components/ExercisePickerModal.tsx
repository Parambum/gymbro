import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Search, X } from 'lucide-react-native';

import { useGymBro } from '../lib/store';
import { colors } from '../lib/theme';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from '../lib/types';

export function ExercisePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const { allExercises } = useGymBro();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allExercises.filter((e) => {
      if (muscle && e.muscle !== muscle) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allExercises, muscle, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-ink-950" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-3">
          <Text className="text-2xl font-bold text-white">Add exercise</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-ink-800 active:bg-ink-700"
          >
            <X size={17} color={colors.ink300} strokeWidth={2.5} />
          </Pressable>
        </View>

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

        <FlatList
          data={results}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-5 pb-8"
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={
            <Text className="mt-8 text-center text-sm text-ink-500">
              No exercise matches “{query}”. You can create it in the Library
              tab.
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onPick(item);
                onClose();
              }}
              className="flex-row items-center justify-between rounded-xl border border-ink-800 bg-ink-900 px-4 py-3 active:bg-ink-850"
            >
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold text-white">
                  {item.name}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-500">
                  {item.muscle}
                  {item.custom ? ' · Custom' : ''}
                </Text>
              </View>
              <View className="h-8 w-8 items-center justify-center rounded-full bg-flame-500/15">
                <Plus size={16} color={colors.flame400} strokeWidth={3} />
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
