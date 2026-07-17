"use client";

import { useEffect, useMemo, useState } from "react";
import { E1rmChart } from "@/components/charts/e1rm-chart";
import { GlowCard } from "@/components/ui/glow-card";
import { CountUp } from "@/components/reactbits/count-up";
import { MUSCLE_GROUPS, exerciseSlug } from "@/lib/data/exercise-catalog";
import { leastSquares, daysBetween } from "@/lib/math/regression";
import type { E1rmPoint } from "@/lib/math/e1rm";

const DEFAULT_EXERCISE = "flat-barbell-bench-press";

export default function AnalyticsPage() {
  const [exercise, setExercise] = useState(DEFAULT_EXERCISE);
  const [series, setSeries] = useState<E1rmPoint[] | null>(null);

  useEffect(() => {
    setSeries(null);
    fetch(`/api/analytics/e1rm?exercise=${encodeURIComponent(exercise)}`)
      .then((r) => r.json())
      .then((json) => setSeries(json.series ?? []))
      .catch(() => setSeries([]));
  }, [exercise]);

  const stats = useMemo(() => {
    if (!series || series.length === 0) return null;
    const current = series[series.length - 1];
    const best = series.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const monthAgo = [...series].reverse().find((p) => p.date <= cutoffIso) ?? series[0];
    const delta30 =
      monthAgo.e1rm > 0 ? ((current.e1rm - monthAgo.e1rm) / monthAgo.e1rm) * 100 : 0;
    const origin = series[0].date;
    const model = leastSquares(
      series.map((p) => ({ x: daysBetween(origin, p.date), y: p.e1rm })),
    );
    return { current, best, delta30, slopePerWeek: model.slope * 7 };
  }, [series]);

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
            Progression<span className="text-neon-purple">.</span>
          </h1>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Exercise
            </span>
            <select
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
              className="rounded-lg border border-edge bg-abyss px-3 py-2 font-mono text-xs text-zinc-200 focus:border-hot-purple focus:outline-none"
            >
              {MUSCLE_GROUPS.map((g) => (
                <optgroup key={g.slug} label={g.name}>
                  {g.exercises.map((name) => (
                    <option key={name} value={exerciseSlug(name)}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <GlowCard accent="#7c3aed" intensity={0.6} className="p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Current e1RM
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-neon-purple">
                <CountUp value={stats.current.e1rm} decimals={1} /> kg
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                {stats.current.weightKg} kg × {stats.current.reps}
              </div>
            </GlowCard>
            <GlowCard accent="#22ff88" intensity={0.6} className="p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                All-time best
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-neon-green">
                <CountUp value={stats.best.e1rm} decimals={1} /> kg
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{stats.best.date}</div>
            </GlowCard>
            <GlowCard
              accent={stats.delta30 >= 0 ? "#22ff88" : "#ff2d55"}
              intensity={Math.min(1, Math.abs(stats.delta30) / 12)}
              className="p-4"
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                30-day delta
              </div>
              <div
                className="mt-1 font-mono text-2xl font-bold"
                style={{ color: stats.delta30 >= 0 ? "#4ade80" : "#fb7185" }}
              >
                {stats.delta30 >= 0 ? "+" : ""}
                {stats.delta30.toFixed(1)}%
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-500">e1RM change</div>
            </GlowCard>
            <GlowCard accent="#06b6d4" intensity={0.5} className="p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Trend velocity
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-neon-blue">
                {stats.slopePerWeek >= 0 ? "+" : ""}
                {stats.slopePerWeek.toFixed(2)}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-zinc-500">kg / week</div>
            </GlowCard>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-edge bg-panel/60 p-5 backdrop-blur-sm">
          {series === null ? (
            <div className="flex h-64 items-center justify-center">
              <span className="animate-pulse-glow font-mono text-xs uppercase tracking-[0.4em] text-zinc-500">
                Computing vectors…
              </span>
            </div>
          ) : (
            <E1rmChart series={series} height={300} />
          )}
        </div>

        {/* accessible table view of the same data */}
        {series && series.length > 0 && (
          <details className="mt-4 rounded-xl border border-edge bg-panel/40 px-4 py-3">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-zinc-400">
              Data table
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-edge text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="py-1.5 pr-4">Date</th>
                    <th className="py-1.5 pr-4">Top set</th>
                    <th className="py-1.5">e1RM (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((p) => (
                    <tr key={p.date} className="border-b border-edge/40 text-zinc-300">
                      <td className="py-1.5 pr-4">{p.date}</td>
                      <td className="py-1.5 pr-4">
                        {p.weightKg} kg × {p.reps}
                      </td>
                      <td className="py-1.5 tabular-nums">{p.e1rm.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
