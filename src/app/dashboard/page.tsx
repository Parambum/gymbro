"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dumbbell, TrendingUp } from "lucide-react";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { CountUp } from "@/components/reactbits/count-up";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { VolumeChart } from "@/components/charts/volume-chart";
import { BodyRadar } from "@/components/charts/body-radar";
import { prettyDate, todayIso } from "@/lib/date-utils";

interface Overview {
  hasData: boolean;
  streakDays: number;
  workoutCount: number;
  totalSets: number;
  totalVolumeKg: number;
  lastWorkout: { date: string; muscles: string[]; topSet: string; setCount: number; volumeKg: number } | null;
  recentPRs: Array<{ exercise: string; e1rm: number; date: string }>;
  radar: Array<{ slug: string; muscle: string; value: number }>;
  weeklyVolume: Array<{ week: string; volumeKg: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/analytics/overview?today=${todayIso()}`)
      .then((r) => r.json())
      .then((json) => (json.error ? setFailed(true) : setData(json)))
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <CenteredNote className="text-neon-crimson">
        Could not reach the database — verify the MONGODB_URI environment variable, then refresh.
      </CenteredNote>
    );
  }
  if (!data) {
    return <CenteredNote className="animate-pulse-glow text-zinc-500">Loading your deck…</CenteredNote>;
  }

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
          Command Deck
        </h1>

        {!data.hasData ? (
          <BlankSlate />
        ) : (
          <BentoGrid>
            <BentoGridItem
              className="border-hot-green/30"
              header={
                <div className="flex flex-1 flex-col items-center justify-center">
                  <CountUp value={data.streakDays} className="text-6xl font-bold text-neon-green" duration={900} />
                  <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                    day streak
                  </span>
                </div>
              }
              title="Consistency"
              description="Consecutive training days"
            />

            <BentoGridItem
              className="md:col-span-2"
              header={
                data.lastWorkout ? (
                  <div className="flex flex-1 flex-col justify-center gap-2">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {prettyDate(data.lastWorkout.date)}
                    </div>
                    <div className="font-display text-xl font-bold text-zinc-100">
                      {data.lastWorkout.muscles.join(" · ")}
                    </div>
                    <div className="font-mono text-xs text-neon-purple">{data.lastWorkout.topSet}</div>
                    <div className="flex gap-6 font-mono text-xs text-zinc-400">
                      <span>
                        <CountUp value={data.lastWorkout.volumeKg} className="text-zinc-200" /> kg volume
                      </span>
                      <span>{data.lastWorkout.setCount} sets</span>
                    </div>
                  </div>
                ) : null
              }
              title="Last Session"
              description="Most recent workout"
            />

            <BentoGridItem
              className="md:col-span-2"
              header={
                data.weeklyVolume.length > 0 ? (
                  <div className="flex-1 pt-1">
                    <VolumeChart series={data.weeklyVolume} height={170} />
                  </div>
                ) : (
                  <EmptyTile>Log more weeks to chart volume.</EmptyTile>
                )
              }
              title="Volume Load"
              description="Weekly tonnage"
            />

            <BentoGridItem
              className="border-hot-purple/30"
              header={
                data.recentPRs.length > 0 ? (
                  <ul className="flex flex-1 flex-col justify-center gap-3">
                    {data.recentPRs.slice(0, 4).map((pr, i) => (
                      <li key={pr.exercise} className="flex items-baseline justify-between gap-2">
                        <DecryptedText text={pr.exercise} delay={i * 220} className="truncate text-[11px] text-zinc-300" />
                        <span className="shrink-0 font-mono text-sm font-bold text-neon-purple">{pr.e1rm} kg</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyTile>PRs unlock as you log.</EmptyTile>
                )
              }
              title="PR Vault"
              description="Best e1RM per lift"
            />

            <BentoGridItem
              className="md:col-span-2 md:row-span-2"
              header={
                <div className="flex-1 pt-1">
                  <BodyRadar data={data.radar} height={300} />
                </div>
              }
              title="Body Progression"
              description="Best e1RM across every muscle"
            />

            <BentoGridItem
              className="border-hot-green/30"
              header={
                <div className="flex flex-1 items-center justify-center">
                  <HoverBorderGradient as="div" containerClassName="rounded-full" className="p-0">
                    <Link
                      href="/train"
                      className="flex items-center gap-2 px-6 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-neon-green"
                    >
                      <Dumbbell className="h-4 w-4" /> Log a workout
                    </Link>
                  </HoverBorderGradient>
                </div>
              }
              title="Train"
              description="Open the 3D hub"
            />

            <BentoGridItem
              header={
                <div className="flex flex-1 flex-col items-center justify-center gap-1">
                  <CountUp value={data.totalVolumeKg} className="text-3xl font-bold text-neon-blue" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    kg lifted · {data.totalSets} sets
                  </span>
                </div>
              }
              title="Lifetime Load"
              description="All-time tonnage"
            />
          </BentoGrid>
        )}
      </div>
    </div>
  );
}

function BlankSlate() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-panel/40 px-6 py-20 text-center">
      <TrendingUp className="h-10 w-10 text-neon-green" />
      <h2 className="mt-4 font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
        Your slate is blank
      </h2>
      <p className="mt-2 max-w-sm font-mono text-xs text-zinc-500">
        No fake data here. Log your first set and this deck — streak, PRs, volume,
        and your body-progression radar — comes to life.
      </p>
      <div className="mt-8">
        <HoverBorderGradient as="div" containerClassName="rounded-full" className="p-0">
          <Link
            href="/train"
            className="flex items-center gap-2 px-8 py-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-zinc-100"
          >
            <Dumbbell className="h-4 w-4" /> Log first workout
          </Link>
        </HoverBorderGradient>
      </div>
    </div>
  );
}

function EmptyTile({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-2 py-8 text-center font-mono text-[11px] text-zinc-600">
      {children}
    </div>
  );
}

function CenteredNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-4">
      <span className={`font-mono text-xs uppercase tracking-[0.35em] ${className ?? ""}`}>{children}</span>
    </div>
  );
}
