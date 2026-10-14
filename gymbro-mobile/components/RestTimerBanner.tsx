import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Plus, Timer, X } from 'lucide-react-native';

import { formatClock } from '../lib/stats';
import { useGymBro } from '../lib/store';
import { colors } from '../lib/theme';

/**
 * Sticky rest countdown. Driven off an absolute end timestamp rather than a
 * decrementing counter, so it stays accurate across re-renders and tab
 * switches instead of drifting.
 */
export function RestTimerBanner() {
  const { restEndsAt, restTotalSeconds, extendRest, stopRest } = useGymBro();
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (restEndsAt == null) return;

    const tick = () => {
      const secs = Math.ceil((restEndsAt - Date.now()) / 1000);
      setRemaining(secs);
      if (secs <= 0) stopRest();
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [restEndsAt, stopRest]);

  if (restEndsAt == null) return null;

  const total = restTotalSeconds ?? 1;
  const progress = Math.max(0, Math.min(1, remaining / total));

  return (
    <View className="border-t border-ink-800 bg-ink-900 px-4 pb-2 pt-3">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-flame-500/15">
          <Timer size={17} color={colors.flame400} strokeWidth={2.5} />
        </View>

        <View className="flex-1">
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
            Rest
          </Text>
          <Text className="text-xl font-bold tabular-nums text-white">
            {formatClock(Math.max(0, remaining))}
          </Text>
        </View>

        <Pressable
          onPress={() => extendRest(15)}
          hitSlop={6}
          className="h-9 flex-row items-center gap-1 rounded-lg bg-ink-800 px-3 active:bg-ink-700"
        >
          <Plus size={13} color={colors.ink200} strokeWidth={3} />
          <Text className="text-sm font-bold text-ink-200">15s</Text>
        </Pressable>

        <Pressable
          onPress={stopRest}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-lg bg-ink-800 active:bg-ink-700"
        >
          <X size={16} color={colors.ink300} strokeWidth={2.5} />
        </Pressable>
      </View>

      <View className="mt-2 h-1 overflow-hidden rounded-full bg-ink-800">
        <View
          className="h-full rounded-full bg-flame-500"
          style={{ width: `${progress * 100}%` }}
        />
      </View>
    </View>
  );
}
