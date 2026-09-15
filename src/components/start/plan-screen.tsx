"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, Flame, RefreshCw, UtensilsCrossed } from "lucide-react";
import { SectionCard } from "@/components/fuel/controls";
import { MEAL_LABELS, type Meal } from "@/lib/fuel/types";
import { todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface PlanPayload {
  onboarded: boolean;
  goal: { label: string; blurb: string; expectation: string; emphasis: string } | null;
  daysPerWeek: number | null;
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  programme: {
    sessions: Array<{
      name: string;
      estimatedMinutes: number;
      exercises: Array<{
        exercise: string;
        muscleGroup: string;
        sets: number;
        repsLow: number;
        repsHigh: number;
        restSeconds: number;
        rir: number;
      }>;
    }>;
    weeklySetsByMuscle: Record<string, number>;
    notes: string[];
  } | null;
  mealPlan: {
    meals: Array<{
      meal: Meal;
      items: Array<{ name: string; portionLabel: string; quantity: number; kcal: number; proteinG: number }>;
      totals: { kcal: number; proteinG: number };
    }>;
    totals: { kcal: number; proteinG: number };
    notes: string[];
  } | null;
}

/**
 * The plan: what to eat and what to lift, on one page.
 *
 * Presented as a worked example rather than a prescription — every meal row
 * links into the ordinary logger and every session logs through the existing
 * click-to-log flow, so the plan is a starting point the user immediately owns
 * rather than a track they have to stay on.
 */
export function PlanScreen() {
  const [tab, setTab] = useState<"eat" | "train">("eat");
  const [data, setData] = useState<PlanPayload | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/plan?date=${todayIso()}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setFailure(j.error) : setData(j)))
      .catch(() => setFailure("No connection. Check your network and refresh."));
  }, []);

  useEffect(load, [load]);

  if (failure) {
    return (
      <Centered>
        <span className="text-danger">{failure}</span>
      </Centered>
    );
  }
  if (!data) return <Skeleton />;
  if (!data.onboarded) {
    return (
      <Centered>
        <Link href="/start" className="underline hover:text-ink">
          Build your plan to see it here
        </Link>
      </Centered>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-16 pt-6">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Your plan</h1>
        {data.goal && (
          <p className="mt-1 font-mono text-[11px] text-muted">
            {data.goal.label} · {data.daysPerWeek} days a week · {data.goal.emphasis} focus
          </p>
        )}
      </header>

      {data.goal && (
        <p className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 font-mono text-[11px] leading-relaxed text-ink">
          {data.goal.expectation}
        </p>
      )}

      <div className="flex gap-1 rounded-xl border border-border bg-surface/40 p-1" role="tablist">
        {(
          [
            ["eat", "Eat", UtensilsCrossed],
            ["train", "Train", Dumbbell],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg font-mono text-[10px] uppercase tracking-widest transition-colors",
              tab === id ? "bg-accent/10 text-accent-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "eat" ? (
        <>
          {data.target && (
            <SectionCard title="Today's target" hint="Your plan aims at this.">
              <div className="grid grid-cols-4 gap-2">
                {[
                  { l: "kcal", v: data.target.kcal },
                  { l: "protein", v: `${data.target.proteinG}g` },
                  { l: "carbs", v: `${data.target.carbsG}g` },
                  { l: "fat", v: `${data.target.fatG}g` },
                ].map((m) => (
                  <div key={m.l} className="rounded-xl border border-border bg-bg p-2 text-center">
                    <p className="font-display text-base font-bold text-ink">{m.v}</p>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-muted">{m.l}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {data.mealPlan?.meals.map((m) => (
            <SectionCard
              key={m.meal}
              title={MEAL_LABELS[m.meal]}
              hint={`${m.totals.kcal} kcal · ${Math.round(m.totals.proteinG)} g protein`}
            >
              {m.items.length === 0 ? (
                <p className="font-mono text-[11px] text-muted">Nothing suggested for this meal yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {m.items.map((i) => (
                    <li
                      key={`${i.name}-${i.portionLabel}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-display text-sm text-ink">{i.name}</span>
                        <span className="font-mono text-[10px] text-muted">
                          {i.quantity} × {i.portionLabel}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-sm font-bold text-accent-ink">
                          {i.kcal}
                        </span>
                        <span className="font-mono text-[9px] uppercase tracking-widest text-faint">
                          kcal
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ))}

          {data.mealPlan?.notes.map((n) => (
            <p key={n} className="px-1 font-mono text-[10px] leading-relaxed text-faint">
              {n}
            </p>
          ))}

          <Link
            href="/fuel"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-accent font-display text-sm font-semibold uppercase tracking-widest text-bg"
          >
            <Flame className="h-4 w-4" /> Log today&apos;s food
          </Link>
        </>
      ) : (
        <>
          {data.programme?.sessions.map((s) => (
            <SectionCard key={s.name} title={s.name} hint={`~${s.estimatedMinutes} min`}>
              <ul className="space-y-1.5">
                {s.exercises.map((e) => (
                  <li
                    key={e.exercise}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-display text-sm text-ink">{e.exercise}</span>
                      <span className="font-mono text-[10px] text-muted">
                        {e.restSeconds}s rest · leave {e.rir} in reserve
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-accent-ink">
                      {e.sets} × {e.repsLow}–{e.repsHigh}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}

          {data.programme && (
            <SectionCard title="Weekly volume" hint="Working sets per muscle across the week.">
              <ul className="grid grid-cols-2 gap-2">
                {Object.entries(data.programme.weeklySetsByMuscle)
                  .sort((a, b) => b[1] - a[1])
                  .map(([muscle, sets]) => (
                    <li
                      key={muscle}
                      className="flex items-baseline justify-between rounded-xl border border-border bg-bg px-3 py-2"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                        {muscle.replace("-", " ")}
                      </span>
                      <span className="font-display text-sm font-bold text-ink">{sets}</span>
                    </li>
                  ))}
              </ul>
            </SectionCard>
          )}

          {data.programme?.notes.map((n) => (
            <p key={n} className="px-1 font-mono text-[10px] leading-relaxed text-faint">
              {n}
            </p>
          ))}

          <Link
            href="/train"
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-accent font-display text-sm font-semibold uppercase tracking-widest text-bg"
          >
            <Dumbbell className="h-4 w-4" /> Start a session
          </Link>
        </>
      )}

      <Link
        href="/start"
        className="flex min-h-[44px] items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:text-ink"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Redo my plan
      </Link>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6 text-center">
      <span className="font-mono text-xs leading-relaxed text-muted">{children}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-6" aria-busy>
      <div className="h-9 w-40 animate-pulse-glow rounded-lg bg-surface" />
      <div className="h-16 animate-pulse-glow rounded-xl bg-surface/60" />
      <div className="h-44 animate-pulse-glow rounded-2xl bg-surface/60" />
      <div className="h-44 animate-pulse-glow rounded-2xl bg-surface/60" />
    </div>
  );
}
