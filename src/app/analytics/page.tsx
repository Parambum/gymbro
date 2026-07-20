"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { E1rmChart } from "@/components/charts/e1rm-chart";
import { BodyRadar, type RadarDatum } from "@/components/charts/body-radar";
import { GlowCard } from "@/components/ui/glow-card";
import { CountUp } from "@/components/reactbits/count-up";
import { MUSCLE_GROUPS, groupBySlug } from "@/lib/data/exercise-catalog";
import { leastSquares, daysBetween } from "@/lib/math/regression";
import type { E1rmPoint } from "@/lib/math/e1rm";

interface MuscleSeries {
  muscle: string;
  name: string;
  series: Array<{ date: string; e1rm: number; weight: number; reps: number; exercise: string }>;
  exercises: Array<{ exercise: string; best: number; sets: number }>;
}

export default function AnalyticsPage() {
  const [muscle, setMuscle] = useState<string>("chest");
  const [data, setData] = useState<MuscleSeries | null>(null);
  const [radar, setRadar] = useState<RadarDatum[] | null>(null);

  useEffect(() => {
    fetch(`/api/analytics/overview`)
      .then((r) => r.json())
      .then((j) => setRadar(j.radar ?? []))
      .catch(() => setRadar([]));
  }, []);

  useEffect(() => {
    setData(null);
    fetch(`/api/analytics/muscle?muscle=${muscle}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ muscle, name: groupBySlug(muscle)?.name ?? muscle, series: [], exercises: [] }));
  }, [muscle]);

  // adapt Mongo series (weight) → chart's E1rmPoint (weightKg)
  const points: E1rmPoint[] = useMemo(
    () => (data?.series ?? []).map((p) => ({ date: p.date, e1rm: p.e1rm, weightKg: p.weight, reps: p.reps })),
    [data],
  );

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const current = points[points.length - 1];
    const best = points.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const monthAgo = [...points].reverse().find((p) => p.date <= cutoffIso) ?? points[0];
    const delta30 = monthAgo.e1rm > 0 ? ((current.e1rm - monthAgo.e1rm) / monthAgo.e1rm) * 100 : 0;
    const origin = points[0].date;
    const model = leastSquares(points.map((p) => ({ x: daysBetween(origin, p.date), y: p.e1rm })));
    return { current, best, delta30, slopePerWeek: model.slope * 7 };
  }, [points]);

  const muscleName = data?.name ?? groupBySlug(muscle)?.name ?? muscle;
  const hasSeries = points.length > 0;
  const radarHasData = (radar ?? []).some((d) => d.value > 0);

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
            Progression<span className="text-neon-purple">.</span>
          </h1>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Muscle group</span>
            <select
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className="rounded-lg border border-edge bg-abyss px-3 py-2 font-mono text-xs text-zinc-200 focus:border-hot-purple focus:outline-none"
            >
              {MUSCLE_GROUPS.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* per-muscle progression */}
        <section className="mt-6">
          {data === null ? (
            <ChartFrame>
              <Centered className="animate-pulse-glow">Computing vectors…</Centered>
            </ChartFrame>
          ) : !hasSeries ? (
            <ChartFrame>
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
                <p className="font-display text-lg font-bold uppercase tracking-widest text-zinc-300">
                  No {muscleName} data yet
                </p>
                <p className="max-w-sm font-mono text-xs text-zinc-500">
                  Log your first {muscleName.toLowerCase()} workout to generate analytics — the
                  e1RM vector, trendline, and stats all appear here.
                </p>
                <Link
                  href="/train"
                  className="mt-2 rounded-lg border border-hot-green/50 bg-hot-green/10 px-5 py-2 font-mono text-[11px] uppercase tracking-widest text-neon-green hover:bg-hot-green/20"
                >
                  Log {muscleName} →
                </Link>
              </div>
            </ChartFrame>
          ) : (
            <>
              {stats && (
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat accent="#7c3aed" label="Current e1RM" value={stats.current.e1rm} suffix=" kg" decimals={1} sub={`${stats.current.weightKg} kg × ${stats.current.reps}`} color="#a78bfa" />
                  <Stat accent="#22ff88" label="All-time best" value={stats.best.e1rm} suffix=" kg" decimals={1} sub={stats.best.date} color="#4ade80" />
                  <GlowCard accent={stats.delta30 >= 0 ? "#22ff88" : "#ff2d55"} intensity={Math.min(1, Math.abs(stats.delta30) / 12)} className="p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">30-day delta</div>
                    <div className="mt-1 font-mono text-2xl font-bold" style={{ color: stats.delta30 >= 0 ? "#4ade80" : "#fb7185" }}>
                      {stats.delta30 >= 0 ? "+" : ""}
                      {stats.delta30.toFixed(1)}%
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-500">e1RM change</div>
                  </GlowCard>
                  <Stat accent="#0284c7" label="Trend velocity" value={stats.slopePerWeek} prefix={stats.slopePerWeek >= 0 ? "+" : ""} decimals={2} sub="kg / week" color="#38bdf8" />
                </div>
              )}

              <ChartFrame>
                <E1rmChart series={points} height={300} />
              </ChartFrame>

              {data.exercises.length > 0 && (
                <div className="mt-4 rounded-2xl border border-edge bg-panel/50 p-4">
                  <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                    Best e1RM by exercise
                  </h3>
                  <ul className="space-y-1.5">
                    {data.exercises.map((e) => (
                      <li key={e.exercise} className="flex items-baseline justify-between font-mono text-xs">
                        <span className="text-zinc-300">{e.exercise}</span>
                        <span className="text-zinc-500">
                          <span className="text-neon-purple">{e.best.toFixed(1)} kg</span> · {e.sets} sets
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
                      {[...points].reverse().map((p) => (
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
            </>
          )}
        </section>

        {/* overall body radar */}
        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
            Overall body progression
          </h2>
          <div className="rounded-2xl border border-edge bg-panel/50 p-4">
            {radar === null ? (
              <Centered className="animate-pulse-glow">Loading radar…</Centered>
            ) : radarHasData ? (
              <BodyRadar data={radar} height={320} />
            ) : (
              <Centered>Train a few muscle groups to fill the radar.</Centered>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  color,
  sub,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  label: string;
  value: number;
  accent: string;
  color: string;
  sub: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <GlowCard accent={accent} intensity={0.55} className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold" style={{ color }}>
        {prefix}
        <CountUp value={value} decimals={decimals} />
        {suffix}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{sub}</div>
    </GlowCard>
  );
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-edge bg-panel/60 p-5 backdrop-blur-sm">{children}</div>;
}

function Centered({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex h-56 items-center justify-center">
      <span className={`font-mono text-xs uppercase tracking-[0.35em] text-zinc-500 ${className}`}>
        {children}
      </span>
    </div>
  );
}
