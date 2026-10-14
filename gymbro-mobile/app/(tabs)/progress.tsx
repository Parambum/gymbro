import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronRight, Trophy } from 'lucide-react-native';

import { EmptyState, ScreenTitle, StatCard } from '../../components/ui';
import {
  buildPersonalRecords,
  formatDate,
  formatDuration,
  formatVolume,
  formatWeight,
  totalVolume,
} from '../../lib/stats';
import { useGymBro } from '../../lib/store';
import { colors } from '../../lib/theme';
import type { CompletedSession } from '../../lib/types';

type Tab = 'records' | 'history';

export default function ProgressScreen() {
  const { hydrated, history } = useGymBro();
  const [tab, setTab] = useState<Tab>('records');

  const records = useMemo(() => buildPersonalRecords(history), [history]);
  const volume = useMemo(() => totalVolume(history), [history]);
  const sets = useMemo(
    () => history.reduce((n, s) => n + s.totalSets, 0),
    [history],
  );

  if (!hydrated) {
    return <SafeAreaView className="flex-1 bg-ink-950" edges={['top']} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-ink-950" edges={['top']}>
      <ScreenTitle
        title="Progress"
        subtitle={
          history.length > 0
            ? `${history.length} workout${history.length === 1 ? '' : 's'} logged`
            : 'Your numbers, once you start logging'
        }
      />

      <ScrollView
        contentContainerClassName="px-5 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row gap-2">
          <StatCard
            label="Total volume"
            value={formatVolume(volume)}
            unit="kg"
            accent
          />
          <StatCard label="Workouts" value={String(history.length)} />
          <StatCard label="Sets" value={String(sets)} />
        </View>

        {history.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Nothing logged yet"
            body="Finish your first workout and your records, volume and history will build up here."
          />
        ) : (
          <>
            <View className="mt-5 flex-row rounded-xl bg-ink-900 p-1">
              <SegmentButton
                label="Records"
                active={tab === 'records'}
                onPress={() => setTab('records')}
              />
              <SegmentButton
                label="History"
                active={tab === 'history'}
                onPress={() => setTab('history')}
              />
            </View>

            {tab === 'records' ? (
              <View className="mt-4 gap-2">
                {records.map((pr, index) => (
                  <View
                    key={pr.exerciseId}
                    className="flex-row items-center rounded-xl border border-ink-800 bg-ink-900 px-4 py-3"
                  >
                    <Text className="w-6 text-sm font-bold text-ink-600">
                      {index + 1}
                    </Text>
                    <View className="flex-1 pr-3">
                      <Text className="text-base font-semibold text-white">
                        {pr.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-500">
                        Best set {formatWeight(pr.bestWeight)} kg × {pr.bestReps}
                        {'  ·  '}
                        {pr.totalSets} set{pr.totalSets === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-lg font-bold text-flame-400">
                        {formatWeight(Math.round(pr.bestOneRepMax * 10) / 10)}
                      </Text>
                      <Text className="text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                        est. 1RM
                      </Text>
                    </View>
                  </View>
                ))}

                <Text className="mt-3 text-center text-[11px] leading-4 text-ink-600">
                  Estimated 1RM uses the Epley formula. It is exact at one rep
                  and an approximation above that.
                </Text>
              </View>
            ) : (
              <View className="mt-4 gap-2">
                {history.map((session) => (
                  <HistoryRow key={session.id} session={session} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-lg py-2 ${
        active ? 'bg-ink-750' : ''
      }`}
    >
      <Text
        className={`text-sm font-bold ${active ? 'text-white' : 'text-ink-500'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function HistoryRow({ session }: { session: CompletedSession }) {
  const [expanded, setExpanded] = useState(false);
  const duration = session.finishedAt - session.startedAt;

  return (
    <View className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900">
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center px-4 py-3.5 active:bg-ink-850"
      >
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold text-white">
            {session.name}
          </Text>
          <Text className="mt-0.5 text-xs text-ink-500">
            {formatDate(session.finishedAt)} · {formatDuration(duration)} ·{' '}
            {session.totalSets} sets
          </Text>
        </View>
        <View className="mr-2 items-end">
          <Text className="text-base font-bold text-flame-400">
            {formatVolume(session.totalVolume)}
          </Text>
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-ink-600">
            kg
          </Text>
        </View>
        {expanded ? (
          <ChevronDown size={17} color={colors.ink600} strokeWidth={2.5} />
        ) : (
          <ChevronRight size={17} color={colors.ink600} strokeWidth={2.5} />
        )}
      </Pressable>

      {expanded ? (
        <View className="border-t border-ink-800 px-4 py-3">
          {session.exercises.map((ex) => (
            <View key={ex.id} className="mb-3">
              <Text className="text-sm font-semibold text-ink-200">
                {ex.name}
              </Text>
              <View className="mt-1 flex-row flex-wrap gap-1.5">
                {ex.sets.map((set) => (
                  <Text
                    key={set.id}
                    className="overflow-hidden rounded-md bg-ink-800 px-2 py-1 text-xs font-medium text-ink-300"
                  >
                    {formatWeight(set.weight as number)} × {set.reps}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
