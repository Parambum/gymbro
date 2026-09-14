"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Scale } from "lucide-react";
import { SectionCard } from "./controls";
import { WeightChart, type WeightPoint } from "@/components/charts/weight-chart";
import { AdherenceChart, type AdherencePoint } from "@/components/charts/adherence-chart";
import { todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface Progress {
  days: number;
  goal: "lose" | "maintain" | "gain" | null;
  targetWeightKg: number | null;
  goalRateKgPerWeek: number | null;
  eyesOffMode: boolean;
  weight: {
    readings: WeightPoint[];
    weeklyChangeKg: number | null;
    direction: "rising" | "falling" | "flat";
  };
  adherence: AdherencePoint[];
  proteinVsProgress: {
    latestProteinPerKg: number | null;
    tonnageChangePct: number | null;
    message: string | null;
  };
  summary: {
    loggedDays: number;
    windowDays: number;
    onTargetDays: number;
    comparableDays: number;
    avgKcal: number | null;
    avgProteinG: number | null;
    avgCarbsG: number | null;
    avgFatG: number | null;
    streak: number;
  };
}

const WINDOWS = [7, 30, 90] as const;

/**
 * Progress (§10, screen 3).
 *
 * The one screen where the app is allowed to draw a conclusion — and it does
 * it in plain language, from the trend rather than from two raw readings, and
 * without ever grading the user. "Losing 0.4 kg a week" is a fact. "Only 3 of
 * 30 days on target" would be a verdict, so the copy says how many days were
 * logged and leaves the judgement out.
 */
export function ProgressScreen() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Progress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [weighing, setWeighing] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/fuel/progress?days=${days}&today=${todayIso()}`)
      .then((r) => r.json())
      .then((json) => (json.error ? setFailure(json.error) : (setData(json), setFailure(null))))
      .catch(() => setFailure("No connection. Check your network and refresh."));
  }, [days]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  async function saveWeight() {
    const kg = Number(weightInput);
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) {
      setFailure("Enter a weight between 20 and 400 kg.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/fuel/weight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate: todayIso(), weightKg: kg }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFailure(json.error ?? "Could not save that weight.");
        return;
      }
      setWeighing(false);
      setWeightInput("");
      setFailure(null);
      load();
    } catch {
      setFailure("No connection. Your weight wasn't saved — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (failure && !data) return <CenteredNote>{failure}</CenteredNote>;
  if (!data) return <ProgressSkeleton />;

  const { weight, summary } = data;
  const eyesOff = data.eyesOffMode;
  const latest = weight.readings.at(-1) ?? null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pb-10 pt-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          Progress
        </h1>
        <div className="flex gap-1" role="group" aria-label="Time window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              aria-pressed={days === w}
              className={cn(
                "min-h-[36px] rounded-lg border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
                days === w
                  ? "border-hot-green bg-hot-green/10 text-neon-green"
                  : "border-edge text-zinc-500 hover:text-zinc-200",
              )}
            >
              {w}d
            </button>
          ))}
        </div>
      </header>

      {/* ── weight ────────────────────────────────────────────────── */}
      <SectionCard
        title="Weight"
        hint="Dots are what the scale said. The line is the trend — that's the one that matters."
      >
        {eyesOff ? (
          <p className="rounded-xl border border-edge bg-void px-3 py-4 text-center font-mono text-[11px] leading-relaxed text-zinc-500">
            Weight is hidden while eyes-off mode is on.
          </p>
        ) : weight.readings.length === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] leading-relaxed text-zinc-500">
            No weigh-ins yet. Log one and the trend starts building — it needs about a
            week before it can tell you anything.
          </p>
        ) : (
          <>
            <WeightChart series={weight.readings} goalKg={data.targetWeightKg} />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Latest" value={latest ? `${latest.weightKg} kg` : "—"} />
              <Stat label="Trend" value={latest ? `${latest.trendKg} kg` : "—"} />
            </div>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-400">
              {weight.weeklyChangeKg == null
                ? "Not enough readings yet to call a direction — give it a week."
                : weight.direction === "flat"
                  ? "Holding steady over the last few weeks."
                  : `${weight.direction === "falling" ? "Down" : "Up"} about ${Math.abs(
                      weight.weeklyChangeKg,
                    )} kg a week on the trend.`}
              {coherenceNote(data)}
            </p>
          </>
        )}

        {/* log a weigh-in */}
        {weighing ? (
          <div className="mt-4 flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="kg"
              aria-label="Today's weight in kilograms"
              className="h-11 flex-1 rounded-xl border border-edge bg-void px-3 text-center font-display text-lg text-zinc-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
            />
            <button
              type="button"
              onClick={saveWeight}
              disabled={saving}
              className="flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-hot-green bg-hot-green/10 px-4 text-neon-green disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setWeighing(true)}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-edge font-mono text-[11px] uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
          >
            <Scale className="h-3.5 w-3.5" /> Log today&apos;s weight
          </button>
        )}
      </SectionCard>

      {/* ── calories ──────────────────────────────────────────────── */}
      <SectionCard
        title="Calories"
        hint={`${summary.loggedDays} of the last ${summary.windowDays} days logged.`}
      >
        {eyesOff ? (
          <p className="rounded-xl border border-edge bg-void px-3 py-4 text-center font-mono text-[11px] leading-relaxed text-zinc-500">
            Calorie history is hidden while eyes-off mode is on.
          </p>
        ) : summary.loggedDays === 0 ? (
          <p className="py-6 text-center font-mono text-[11px] leading-relaxed text-zinc-500">
            Nothing logged in this window yet.{" "}
            <Link href="/fuel" className="text-neon-green underline">
              Log a meal
            </Link>{" "}
            and this fills in.
          </p>
        ) : (
          <>
            <AdherenceChart series={data.adherence} />
            {summary.comparableDays > 0 && (
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-400">
                {summary.onTargetDays} of {summary.comparableDays} logged days landed within 10% of
                target.
              </p>
            )}
          </>
        )}
      </SectionCard>

      {/* ── §8.3 protein vs what you actually lifted ──────────────── */}
      {data.proteinVsProgress.message && (
        <SectionCard
          title="Protein & progress"
          hint="The bit a calorie app on its own can't tell you."
        >
          <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
            {data.proteinVsProgress.message}
          </p>
          {data.proteinVsProgress.tonnageChangePct != null && (
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Stat
                label="Protein"
                value={
                  data.proteinVsProgress.latestProteinPerKg != null
                    ? `${data.proteinVsProgress.latestProteinPerKg} g/kg`
                    : "—"
                }
              />
              <Stat
                label="Volume vs last week"
                value={`${data.proteinVsProgress.tonnageChangePct > 0 ? "+" : ""}${
                  data.proteinVsProgress.tonnageChangePct
                }%`}
              />
            </dl>
          )}
        </SectionCard>
      )}

      {/* ── averages ──────────────────────────────────────────────── */}
      <SectionCard title="Daily average" hint="Across the days you logged, not the whole window.">
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Calories" value={eyesOff || summary.avgKcal == null ? "—" : `${Math.round(summary.avgKcal)}`} />
          <Stat label="Protein" value={summary.avgProteinG == null ? "—" : `${Math.round(summary.avgProteinG)} g`} />
          <Stat label="Carbs" value={eyesOff || summary.avgCarbsG == null ? "—" : `${Math.round(summary.avgCarbsG)} g`} />
          <Stat label="Fat" value={eyesOff || summary.avgFatG == null ? "—" : `${Math.round(summary.avgFatG)} g`} />
        </dl>
        <div className="mt-2">
          <Stat
            label="Logging streak"
            value={summary.streak > 0 ? `${summary.streak} day${summary.streak === 1 ? "" : "s"}` : "—"}
          />
        </div>
      </SectionCard>

      {failure && (
        <p role="alert" className="px-1 font-mono text-[11px] text-neon-crimson">
          {failure}
        </p>
      )}
    </div>
  );
}

/**
 * The §8.4 coherence check, stated as an observation with a suggestion — never
 * applied automatically, and never phrased as the user having done wrong.
 */
function coherenceNote(d: Progress): string {
  const change = d.weight.weeklyChangeKg;
  if (change == null || d.goal == null || d.goal === "maintain") return "";
  if (d.goal === "gain" && change <= 0.02) {
    return " You're aiming to build but the scale isn't moving up — worth adding 100–150 kcal a day.";
  }
  if (d.goal === "lose" && change >= -0.02) {
    return " You're aiming to lose but the trend is flat — worth trimming 100–150 kcal a day.";
  }
  return "";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-void p-3">
      <dt className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">{label}</dt>
      <dd className="mt-1 font-display text-base font-bold tabular-nums text-zinc-100">{value}</dd>
    </div>
  );
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6 text-center">
      <span className="font-mono text-xs leading-relaxed text-neon-crimson">{children}</span>
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-5" aria-busy>
      <div className="h-8 w-40 animate-pulse-glow rounded-lg bg-panel" />
      <div className="h-80 animate-pulse-glow rounded-2xl bg-panel/60" />
      <div className="h-64 animate-pulse-glow rounded-2xl bg-panel/60" />
    </div>
  );
}
