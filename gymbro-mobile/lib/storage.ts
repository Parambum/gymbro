import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ActiveSession, CompletedSession, Exercise } from './types';

const KEYS = {
  history: 'gymbro:history',
  active: 'gymbro:active',
  customExercises: 'gymbro:customExercises',
} as const;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt or unreadable entry — fall back rather than crash on launch.
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Writes are best-effort; losing one autosave must not break the session.
  }
}

export const storage = {
  loadHistory: () => readJson<CompletedSession[]>(KEYS.history, []),
  saveHistory: (v: CompletedSession[]) => writeJson(KEYS.history, v),

  loadActive: () => readJson<ActiveSession | null>(KEYS.active, null),
  saveActive: (v: ActiveSession | null) => writeJson(KEYS.active, v),

  loadCustomExercises: () => readJson<Exercise[]>(KEYS.customExercises, []),
  saveCustomExercises: (v: Exercise[]) => writeJson(KEYS.customExercises, v),
};
