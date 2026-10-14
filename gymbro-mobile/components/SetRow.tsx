import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { colors } from '../lib/theme';
import type { LoggedSet } from '../lib/types';

function parseNumber(text: string, integer: boolean): number | null {
  if (text.trim() === '') return null;
  const n = integer ? parseInt(text, 10) : parseFloat(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Keeps raw text locally so partial input ("60.") survives a keystroke, while
 * pushing the parsed number upward.
 */
function NumField({
  value,
  placeholder,
  integer,
  onChange,
  editable,
}: {
  value: number | null;
  placeholder: string;
  integer: boolean;
  onChange: (v: number | null) => void;
  editable: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));

  // Re-sync only when the stored value diverges from what is typed, so
  // external changes (hydration, autofill) land without fighting the keyboard.
  useEffect(() => {
    if (parseNumber(text, integer) !== value) {
      setText(value == null ? '' : String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      value={text}
      onChangeText={(next) => {
        setText(next);
        onChange(parseNumber(next, integer));
      }}
      editable={editable}
      placeholder={placeholder}
      placeholderTextColor={colors.ink600}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      selectTextOnFocus
      maxLength={integer ? 3 : 6}
      className="h-10 rounded-lg bg-ink-800 text-center text-base font-semibold text-white"
    />
  );
}

export function SetRow({
  index,
  set,
  previous,
  onChangeWeight,
  onChangeReps,
  onToggle,
  onRemove,
}: {
  index: number;
  set: LoggedSet;
  previous: LoggedSet | null;
  onChangeWeight: (v: number | null) => void;
  onChangeReps: (v: number | null) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const previousLabel =
    previous && previous.weight != null && previous.reps != null
      ? `${previous.weight} × ${previous.reps}`
      : '—';

  return (
    <View
      className={`mt-1.5 flex-row items-center gap-2 rounded-xl px-2 py-1.5 ${
        set.completed ? 'bg-flame-500/10' : ''
      }`}
    >
      <Pressable
        onLongPress={onRemove}
        hitSlop={6}
        className="h-8 w-7 items-center justify-center"
      >
        <Text
          className={`text-sm font-bold ${
            set.completed ? 'text-flame-400' : 'text-ink-500'
          }`}
        >
          {index + 1}
        </Text>
      </Pressable>

      <Text className="flex-1 text-center text-xs font-medium text-ink-500">
        {previousLabel}
      </Text>

      <View className="w-16">
        <NumField
          value={set.weight}
          placeholder={previous?.weight != null ? String(previous.weight) : '0'}
          integer={false}
          onChange={onChangeWeight}
          editable={!set.completed}
        />
      </View>

      <View className="w-14">
        <NumField
          value={set.reps}
          placeholder={previous?.reps != null ? String(previous.reps) : '0'}
          integer
          onChange={onChangeReps}
          editable={!set.completed}
        />
      </View>

      <Pressable
        onPress={onToggle}
        hitSlop={6}
        className={`h-10 w-10 items-center justify-center rounded-lg ${
          set.completed ? 'bg-flame-500' : 'bg-ink-800'
        }`}
      >
        <Check
          size={18}
          color={set.completed ? colors.ink950 : colors.ink600}
          strokeWidth={3}
        />
      </Pressable>
    </View>
  );
}

export function SetRowHeader() {
  return (
    <View className="flex-row items-center gap-2 px-2 pb-1">
      <Text className="w-7 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-600">
        Set
      </Text>
      <Text className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-600">
        Previous
      </Text>
      <Text className="w-16 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-600">
        kg
      </Text>
      <Text className="w-14 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-600">
        Reps
      </Text>
      <View className="w-10" />
    </View>
  );
}
