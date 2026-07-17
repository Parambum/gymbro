"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { CountUp } from "@/components/reactbits/count-up";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { VolumeChart } from "@/components/charts/volume-chart";
import { EffortChart } from "@/components/charts/effort-chart";
import type { DemoDashboard } from "@/lib/data/demo-data";

export default function DashboardPage() {
  const [data, setData] = useState<DemoDashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (!data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <span
          className={
            failed
              ? "font-mono text-xs uppercase tracking-[0.4em] text-neon-crimson"
              : "animate-pulse-glow font-mono text-xs uppercase tracking-[0.4em] text-zinc-500"
          }
        >
          {failed ? "Telemetry offline — refresh to retry" : "Booting telemetry…"}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          Command Deck
        </h1>

        <BentoGrid>
          {/* streak */}
          <BentoGridItem
            className="border-hot-green/30"
            header={
              <div className="flex flex-1 flex-col items-center justify-center">
                <CountUp
                  value={data.streakDays}
                  className="text-6xl font-bold text-neon-green"
                  duration={900}
                />
                <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                  day streak
                </span>
              </div>
            }
            title="Consistency"
            description="Days with logged training"
          />

          {/* last workout */}
          <BentoGridItem
            className="md:col-span-2"
            header={
              <div className="flex flex-1 flex-col justify-center gap-2">
                <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {new Date(`${data.lastWorkout.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="font-display text-xl font-bold text-zinc-100">
                  {data.lastWorkout.focus}
                </div>
                <div className="font-mono text-xs text-neon-purple">{data.lastWorkout.topSet}</div>
                <div className="flex gap-6 font-mono text-xs text-zinc-400">
                  <span>
                    <CountUp value={data.lastWorkout.totalVolumeKg} className="text-zinc-200" /> kg
                    total volume
                  </span>
                  <span>{data.lastWorkout.setCount} sets</span>
                </div>
              </div>
            }
            title="Last Session"
            description="Most recent strength log"
          />

          {/* weekly volume */}
          <BentoGridItem
            className="md:col-span-2"
            header={
              <div className="flex-1 pt-1">
                <VolumeChart series={data.weeklyVolume} height={170} />
              </div>
            }
            title="Volume Load"
            description="Weekly tonnage, 8 weeks"
          />

          {/* PRs */}
          <BentoGridItem
            className="border-hot-purple/30"
            header={
              <ul className="flex flex-1 flex-col justify-center gap-3">
                {data.recentPRs.map((pr, i) => (
                  <li key={pr.exercise} className="flex items-baseline justify-between gap-2">
                    <DecryptedText
                      text={pr.exercise}
                      delay={i * 250}
                      className="truncate text-[11px] text-zinc-300"
                    />
                    <span className="shrink-0 font-mono text-sm font-bold text-neon-purple">
                      {pr.e1rm} kg
                    </span>
                  </li>
                ))}
              </ul>
            }
            title="PR Vault"
            description="Freshly decrypted records"
          />

          {/* quick-log cardio */}
          <BentoGridItem
            className="border-hot-crimson/30"
            header={
              <div className="flex flex-1 items-center justify-center">
                <HoverBorderGradient as="div" containerClassName="rounded-full" className="p-0">
                  <Link
                    href="/cardio"
                    className="block px-6 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-neon-crimson"
                  >
                    ▶▶ Quick-log cardio
                  </Link>
                </HoverBorderGradient>
              </div>
            }
            title="Endurance"
            description="Run · ride · row · swim"
          />

          {/* relative effort */}
          <BentoGridItem
            className="md:col-span-2"
            header={
              <div className="flex-1 pt-1">
                <EffortChart
                  series={data.weeklyEffort.map((w) => ({ date: w.week, effort: w.effort }))}
                  height={170}
                />
              </div>
            }
            title="Relative Effort"
            description="Weekly cardio load, 8 weeks"
          />
        </BentoGrid>
      </div>
    </div>
  );
}
