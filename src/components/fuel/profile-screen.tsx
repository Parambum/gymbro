"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EyeOff, Loader2, RefreshCw, SlidersHorizontal } from "lucide-react";
import { SectionCard, Toggle } from "./controls";
import { ThemePicker } from "@/components/theme-picker";
import { ACTIVITY_LEVELS, type ActivityLevel, type Goal, type Sex } from "@/lib/fuel/types";
import { ageOn, bmiOf, maxRateKgPerWeek } from "@/lib/fuel/engine";
import { prettyDate, todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface ProfilePayload {
  onboarded: boolean;
  profile?: {
    sex: Sex;
    birthDate: string;
    heightCm: number;
    activityLevel: ActivityLevel;
    goal: Goal;
    rateKgPerWeek: number;
    targetWeightKg: number | null;
    dietPref: string;
    macroPreset: string;
    units: string;
    tz: string;
    eyesOffMode: boolean;
    exerciseCaloriesEnabled: boolean;
    calorieCyclingEnabled: boolean;
  };
  weightKg?: number | null;
  target?: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    waterMl: number;
    effectiveFrom: string;
    source: string;
    isEstimate: boolean;
    notes: string[];
  } | null;
}

const GOAL_LABEL: Record<Goal, string> = {
  lose: "Losing fat",
  maintain: "Maintaining",
  gain: "Building",
};

/**
 * Profile & targets (§10, screen 4).
 *
 * Everything here is honest about where a number came from: the target shows
 * its effective date and whether it was computed or typed, an estimated target
 * says so, and every clamp the engine applied is printed verbatim rather than
 * summarised away.
 */
export function ProfileScreen() {
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/fuel/profile?date=${todayIso()}`)
      .then((r) => r.json())
      .then((json) => (json.error ? setFailed(json.error) : setData(json)))
      .catch(() => setFailed("No connection. Check your network and refresh."));
  }, []);

  useEffect(load, [load]);

  async function recalculate() {
    setBusy(true);
    try {
      const res = await fetch("/api/fuel/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "auto", localDate: todayIso() }),
      });
      if (res.ok) load();
      else setFailed((await res.json()).error ?? "Could not recalculate.");
    } catch {
      setFailed("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(settings: Record<string, boolean>) {
    // optimistic: the switch moves now, and rolls back if the server disagrees
    setData((d) => (d?.profile ? { ...d, profile: { ...d.profile, ...settings } } : d));
    try {
      const res = await fetch("/api/fuel/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) load();
    } catch {
      load();
    }
  }

  if (failed) {
    return (
      <CenteredNote className="text-neon-crimson">{failed}</CenteredNote>
    );
  }
  if (!data) {
    return <ProfileSkeleton />;
  }
  if (!data.onboarded || !data.profile) {
    return (
      <CenteredNote className="text-zinc-500">
        <Link href="/fuel/onboarding" className="underline hover:text-zinc-200">
          Set up Fuel to get your targets
        </Link>
      </CenteredNote>
    );
  }

  const p = data.profile;
  const t = data.target;
  const eyesOff = p.eyesOffMode;
  const activity = ACTIVITY_LEVELS.find((a) => a.slug === p.activityLevel);
  const bmi = data.weightKg ? bmiOf(data.weightKg, p.heightCm) : null;

  // The profile keeps what the user *asked* for, because the cap is a function
  // of current bodyweight and has to be re-derived as they gain or lose. What
  // gets shown, though, is the rate actually in force — quoting the request
  // back at them when the engine is running something slower would be a lie.
  const appliedRate = data.weightKg
    ? Math.min(p.rateKgPerWeek, maxRateKgPerWeek(p.goal, data.weightKg))
    : p.rateKgPerWeek;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-10 pt-6">
      <header>
        <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          Targets
        </h1>
        <p className="mt-1 font-mono text-[11px] text-zinc-500">
          {GOAL_LABEL[p.goal]}
          {p.goal !== "maintain" && appliedRate > 0 && ` · ${Math.round(appliedRate * 100) / 100} kg/week`}
          {activity && ` · ${activity.label.toLowerCase()}`}
        </p>
      </header>

      {/* ── the target ────────────────────────────────────────────── */}
      {t ? (
        <SectionCard
          title="Daily target"
          hint={`In force since ${prettyDate(t.effectiveFrom)} · ${
            t.source === "manual" ? "set by you" : "calculated"
          }${t.isEstimate ? " · estimated" : ""}`}
        >
          {eyesOff ? (
            <p className="rounded-xl border border-edge bg-void px-3 py-4 text-center font-mono text-[11px] leading-relaxed text-zinc-500">
              Calories are hidden while eyes-off mode is on. Protein and habits still count.
            </p>
          ) : (
            <div className="text-center">
              <div className="font-display text-5xl font-bold text-neon-green">{t.kcal}</div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                kcal per day
              </div>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-3 gap-2">
            {[
              { label: "Protein", value: `${t.proteinG} g`, cls: "text-neon-green" },
              { label: "Carbs", value: `${t.carbsG} g`, cls: "text-neon-blue", hidden: eyesOff },
              { label: "Fat", value: `${t.fatG} g`, cls: "text-neon-amber", hidden: eyesOff },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-edge bg-void p-3 text-center">
                <dd className={cn("font-display text-lg font-bold", m.cls)}>
                  {m.hidden ? "—" : m.value}
                </dd>
                <dt className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  {m.label}
                </dt>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-600">
            {t.fiberG} g fibre · {(t.waterMl / 1000).toFixed(1)} L water
          </p>

          {t.notes.length > 0 && (
            <ul className="mt-4 space-y-2">
              {t.notes.map((n) => (
                <li
                  key={n}
                  className="rounded-xl border border-neon-amber/30 bg-neon-amber/5 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-300"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={recalculate}
            disabled={busy}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-edge px-4 font-mono text-[11px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Recalculate from today&apos;s weight
          </button>
        </SectionCard>
      ) : (
        <SectionCard title="Daily target" hint="Nothing calculated yet.">
          <Link
            href="/fuel/onboarding"
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-hot-green bg-hot-green/10 font-mono text-[11px] uppercase tracking-widest text-neon-green"
          >
            Work out my target
          </Link>
        </SectionCard>
      )}

      {/* ── your numbers ──────────────────────────────────────────── */}
      <SectionCard title="Your numbers">
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Weight" value={eyesOff ? "—" : data.weightKg ? `${data.weightKg} kg` : "—"} />
          <Stat label="Height" value={`${p.heightCm} cm`} />
          <Stat label="Age" value={`${ageOn(p.birthDate, todayIso())}`} />
          <Stat label="BMI" value={eyesOff || bmi == null ? "—" : String(bmi)} />
          <Stat label="Goal weight" value={eyesOff || !p.targetWeightKg ? "—" : `${p.targetWeightKg} kg`} />
          <Stat label="Split" value={p.macroPreset.replace("-", " ")} />
        </dl>
        <Link
          href="/fuel/onboarding"
          className="mt-3 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-edge font-mono text-[11px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Change my numbers
        </Link>
      </SectionCard>

      {/* ── settings ──────────────────────────────────────────────── */}
      <SectionCard title="Appearance" hint="Set the tone of the whole app — applies instantly, everywhere.">
        <ThemePicker />
      </SectionCard>

      <SectionCard title="Settings">
        <div className="space-y-2">
          <Toggle
            label="Eyes-off mode"
            hint="Hides calories and weight everywhere. Protein and habit tracking carry on."
            checked={p.eyesOffMode}
            onChange={(v) => patch({ eyesOffMode: v })}
          />
          <Toggle
            label="Calorie cycling"
            hint="More carbs on the days you train, funded by your rest days. Same total across the week."
            checked={p.calorieCyclingEnabled}
            onChange={(v) => patch({ calorieCyclingEnabled: v })}
          />
          <Toggle
            label="Add cardio calories back"
            hint="Off for a reason: your activity level already accounts for training, and counting it twice is the commonest way to stall. The estimate is rough — distance and bodyweight only."
            checked={p.exerciseCaloriesEnabled}
            onChange={(v) => patch({ exerciseCaloriesEnabled: v })}
          />
        </div>
      </SectionCard>

      <p className="flex gap-2 px-1 font-mono text-[10px] leading-relaxed text-zinc-600">
        <EyeOff className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Everything here is an estimate, not medical advice. If you&apos;re managing a health
          condition, pregnant, or have a history of disordered eating, talk to a doctor or dietitian
          before following a calorie target.
        </span>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-void p-3">
      <dt className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{label}</dt>
      <dd className="mt-1 font-display text-base font-bold capitalize text-zinc-100">{value}</dd>
    </div>
  );
}

function CenteredNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6 text-center">
      <span className={cn("font-mono text-xs leading-relaxed", className)}>{children}</span>
    </div>
  );
}

/** Skeletons, never spinners, on a list-shaped screen (§10). */
function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-6" aria-busy>
      <div className="h-8 w-40 animate-pulse-glow rounded-lg bg-panel" />
      <div className="h-64 animate-pulse-glow rounded-2xl bg-panel/60" />
      <div className="h-40 animate-pulse-glow rounded-2xl bg-panel/60" />
    </div>
  );
}
