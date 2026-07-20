/** Pure yyyy-mm-dd helpers — no timezone drift, safe on client and server. */

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isValidIso(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function addDaysIso(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStartIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  return addDaysIso(iso, -diff);
}

export function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Consecutive-day streak ending at `anchor` (today). If nothing was logged
 * today, the streak may still stand from yesterday; two days idle breaks it.
 */
export function streakFromDates(dates: Iterable<string>, anchor = todayIso()): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;

  let cursor = set.has(anchor) ? anchor : addDaysIso(anchor, -1);
  if (!set.has(cursor)) return 0;

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }
  return streak;
}
