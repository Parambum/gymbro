import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { colors } from '../lib/theme';

export function ScreenTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-end justify-between px-5 pb-4 pt-2">
      <View className="flex-1 pr-3">
        <Text className="text-3xl font-bold tracking-tight text-white">
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-sm text-ink-400">{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function StatCard({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <View className="flex-1 rounded-2xl border border-ink-800 bg-ink-900 px-4 py-3">
      <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </Text>
      <View className="mt-1 flex-row items-baseline">
        <Text
          className={`text-2xl font-bold ${accent ? 'text-flame-400' : 'text-white'}`}
        >
          {value}
        </Text>
        {unit ? (
          <Text className="ml-1 text-xs font-medium text-ink-500">{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: (props: { size: number; color: string; strokeWidth?: number }) => ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <View className="items-center px-8 py-14">
      <View className="h-14 w-14 items-center justify-center rounded-2xl border border-ink-800 bg-ink-900">
        <Icon size={24} color={colors.ink500} strokeWidth={2} />
      </View>
      <Text className="mt-4 text-center text-base font-semibold text-white">
        {title}
      </Text>
      <Text className="mt-1.5 text-center text-sm leading-5 text-ink-500">
        {body}
      </Text>
      {children ? <View className="mt-5 w-full">{children}</View> : null}
    </View>
  );
}

export function Pill({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'accent';
}) {
  const styles =
    tone === 'accent'
      ? 'bg-flame-500/15 text-flame-400'
      : 'bg-ink-800 text-ink-400';
  return (
    <Text
      className={`overflow-hidden rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles}`}
    >
      {label}
    </Text>
  );
}

export function Divider() {
  return <View className="h-px bg-ink-800" />;
}
