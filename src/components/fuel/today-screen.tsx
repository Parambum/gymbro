"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Dumbbell, Flame, Trash2 } from "lucide-react";
import { AddButton, LogSheet } from "./log-sheet";
import { CalorieRing, MacroBars, WaterRow } from "./today-widgets";
import { GLASS_ML, MEAL_LABELS, type MacroTotals, type Meal } from "@/lib/fuel/types";
import { addDaysIso, prettyDate, todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface Entry {
  id: string;
  meal: Meal;
  foodName: string;
  portionLabel: string | null;
  quantity: number;
  gramsResolved: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  entryMethod: string;
  confidence: number | null;
  assumptions: string | null;
}

interface Day {
  onboarded: boolean;
  date: string;
  eyesOffMode: boolean;
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number; waterMl: number } | null;
  consumed: MacroTotals;
  remaining: { kcal: number; overKcal: boolean } | null;
  meals: Array<{ meal: Meal; totals: MacroTotals; entries: Entry[] }>;
  water: { ml: number; targetMl: number | null };
  trainedOnDate: boolean;
  workout: { setCount: number; muscles: string[]; tonnageKg: number } | null;
  cardio: Array<{ name: string; type: string; distanceKm: number }>;
  bridgeNotes: string[];
  streak: number;
}

/**
 * Today (§10, screen 1).
 *
 * One fetch drives the whole screen. Writes are optimistic — the glass fills
 * and the entry disappears the instant you tap, because logging must never
 * feel like it is waiting on a network — and roll back with a plain message
 * if the server disagrees.
 *
 * The date lives here rather than on the server: `todayIso()` reads the
 * viewer's own calendar, which is the only correct source for "which day is
 * this" (§9).
 */
export function TodayScreen() {
  const [date, setDate] = useState(todayIso());
  const [day, setDay] = useState<Day | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sheetMeal, setSheetMeal] = useState<Meal | null>(null);

  const load = useCallback(
    (forDate: string) => {
      fetch(`/api/fuel/day?date=${forDate}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.error) setFailure(json.error);
          else {
            setDay(json);
            setFailure(null);
          }
        })
        .catch(() => setFailure("No connection. Check your network and refresh."));
    },
    [],
  );

  useEffect(() => {
    setDay(null);
    load(date);
  }, [date, load]);

  async function nudgeWater(deltaMl: number) {
    if (!day) return;
    const before = day.water.ml;
    const next = Math.max(0, before + deltaMl);
    setDay({ ...day, water: { ...day.water, ml: next } }); // optimistic

    try {
      const res = await fetch("/api/fuel/water", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate: date, deltaMl }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setDay((d) => (d ? { ...d, water: { ...d.water, ml: json.ml } } : d));
    } catch {
      setDay((d) => (d ? { ...d, water: { ...d.water, ml: before } } : d));
      setFailure("Couldn't save that glass — check your connection.");
    }
  }

  async function removeEntry(entry: Entry) {
    if (!day) return;
    const snapshot = day;
    // optimistic: drop it from the meal and the day total at once
    setDay({
      ...day,
      consumed: {
        kcal: day.consumed.kcal - entry.kcal,
        proteinG: day.consumed.proteinG - entry.proteinG,
        carbsG: day.consumed.carbsG - entry.carbsG,
        fatG: day.consumed.fatG - entry.fatG,
        fiberG: day.consumed.fiberG,
      },
      meals: day.meals.map((m) =>
        m.meal === entry.meal ? { ...m, entries: m.entries.filter((e) => e.id !== entry.id) } : m,
      ),
    });

    try {
      const res = await fetch(`/api/fuel/log?id=${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      load(date);
    } catch {
      setDay(snapshot);
      setFailure("Couldn't remove that — check your connection.");
    }
  }

  const isToday = date === todayIso();

  if (failure && !day) return <CenteredNote>{failure}</CenteredNote>;
  if (!day) return <TodaySkeleton />;

  if (!day.onboarded) {
    return (
      <CenteredNote>
        <Link href="/fuel/onboarding" className="underline hover:text-zinc-200">
          Set up Fuel to start logging
        </Link>
      </CenteredNote>
    );
  }

  const eyesOff = day.eyesOffMode;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-24 pt-5">
      {/* ── day navigator ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDate((d) => addDaysIso(d, -1))}
          aria-label="Previous day"
          className="h-11 w-11 rounded-xl border border-edge text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        >
          <ChevronLeft className="mx-auto h-4 w-4" />
        </button>

        <div className="min-w-0 text-center">
          <h1 className="truncate font-display text-lg font-bold uppercase tracking-widest text-zinc-100">
            {isToday ? "Today" : prettyDate(date)}
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {day.streak > 0 ? `${day.streak} day streak` : "Log something to start a streak"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDate((d) => addDaysIso(d, 1))}
          disabled={isToday}
          aria-label="Next day"
          className="h-11 w-11 rounded-xl border border-edge text-zinc-500 transition-colors hover:text-zinc-100 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        >
          <ChevronRight className="mx-auto h-4 w-4" />
        </button>
      </header>

      {/* ── ring + macros ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-edge bg-panel/40 p-4">
        <CalorieRing consumed={day.consumed.kcal} target={day.target?.kcal ?? null} eyesOff={eyesOff} />
        <div className="mt-5">
          <MacroBars consumed={day.consumed} target={day.target} eyesOff={eyesOff} />
        </div>
        {!day.target && (
          <p className="mt-4 text-center font-mono text-[11px] text-zinc-500">
            No target for this day —{" "}
            <Link href="/fuel/profile" className="text-neon-green underline">
              set one
            </Link>
          </p>
        )}

        {/* §8 — why today's target isn't the usual number */}
        {day.bridgeNotes.length > 0 && (
          <ul className="mt-4 space-y-2">
            {day.bridgeNotes.map((n) => (
              <li
                key={n}
                className="rounded-xl border border-hot-blue/30 bg-hot-blue/5 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-300"
              >
                {n}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── §8.5: the same date, both halves ──────────────────────── */}
      {(day.workout || day.cardio.length > 0) && (
        <section className="rounded-2xl border border-edge bg-panel/40 p-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-3.5 w-3.5 text-neon-purple" />
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
              Trained {isToday ? "today" : "this day"}
            </h2>
          </div>

          {day.workout && (
            <p className="mt-2 font-mono text-[11px] text-zinc-400">
              <span className="text-zinc-200">{day.workout.muscles.join(" · ") || "Session"}</span>
              {" — "}
              {day.workout.setCount} sets
              {day.workout.tonnageKg > 0 &&
                ` · ${day.workout.tonnageKg.toLocaleString()} kg volume`}
            </p>
          )}

          {day.cardio.map((c) => (
            <p key={`${c.name}-${c.distanceKm}`} className="mt-1 font-mono text-[11px] text-zinc-400">
              <span className="text-zinc-200">{c.name}</span> — {c.distanceKm} km
            </p>
          ))}

          <Link
            href="/history"
            className="mt-3 inline-flex min-h-[36px] items-center font-mono text-[10px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200"
          >
            See the session →
          </Link>
        </section>
      )}

      {/* ── water ─────────────────────────────────────────────────── */}
      <WaterRow
        ml={day.water.ml}
        targetMl={day.water.targetMl}
        glassMl={GLASS_ML}
        trained={day.trainedOnDate}
        onAdd={() => nudgeWater(GLASS_ML)}
        onRemove={() => nudgeWater(-GLASS_ML)}
      />

      {/* ── meals ─────────────────────────────────────────────────── */}
      {day.meals.map((m) => (
        <section key={m.meal} className="rounded-2xl border border-edge bg-panel/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
                {MEAL_LABELS[m.meal]}
              </h2>
              <p className="font-mono text-[10px] uppercase tracking-widest tabular-nums text-zinc-600">
                {eyesOff
                  ? `${m.entries.length} item${m.entries.length === 1 ? "" : "s"}`
                  : `${Math.round(m.totals.kcal)} kcal · ${Math.round(m.totals.proteinG)} g protein`}
              </p>
            </div>
            <AddButton onClick={() => setSheetMeal(m.meal)} label={`Add to ${MEAL_LABELS[m.meal]}`} />
          </div>

          {m.entries.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {m.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-edge/70 bg-void px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm text-zinc-100">{e.foodName}</p>
                    <p className="truncate font-mono text-[10px] text-zinc-500">
                      {e.portionLabel
                        ? `${e.quantity} × ${e.portionLabel}`
                        : e.gramsResolved > 0
                          ? `${e.gramsResolved} g`
                          : "quick add"}
                      {e.confidence != null && ` · ${Math.round(e.confidence * 100)}% sure`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!eyesOff && (
                      <span className="font-display text-sm font-bold tabular-nums text-zinc-300">
                        {Math.round(e.kcal)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeEntry(e)}
                      aria-label={`Remove ${e.foodName}`}
                      className="rounded-lg p-2 text-zinc-600 transition-colors hover:text-neon-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {failure && (
        <p role="alert" className="px-1 font-mono text-[10px] text-neon-crimson">
          {failure}
        </p>
      )}

      {/* ── the primary action, thumb-reachable above the tab bar ── */}
      <button
        type="button"
        onClick={() => setSheetMeal(nextMealFor(new Date()))}
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-2 rounded-full border border-hot-green bg-abyss px-5 font-mono text-[11px] uppercase tracking-widest text-neon-green shadow-neon-green transition-colors hover:bg-hot-green/10 md:bottom-6"
      >
        <Flame className="h-4 w-4" /> Log food
      </button>

      <LogSheet
        open={sheetMeal !== null}
        meal={sheetMeal ?? "breakfast"}
        date={date}
        onClose={() => setSheetMeal(null)}
        onLogged={() => load(date)}
      />
    </div>
  );
}

/**
 * Which meal the FAB opens on. Guessing from the clock saves a tap most of the
 * time and costs nothing when it is wrong — the sheet header names the meal
 * and the user can back out.
 */
function nextMealFor(now: Date): Meal {
  const h = now.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 19) return "snack";
  return "dinner";
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6 text-center">
      <span className={cn("font-mono text-xs leading-relaxed text-zinc-400")}>{children}</span>
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-5" aria-busy>
      <div className="mx-auto h-8 w-32 animate-pulse-glow rounded-lg bg-panel" />
      <div className="h-80 animate-pulse-glow rounded-2xl bg-panel/60" />
      <div className="h-28 animate-pulse-glow rounded-2xl bg-panel/60" />
      <div className="h-24 animate-pulse-glow rounded-2xl bg-panel/60" />
    </div>
  );
}
