"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Route, Trophy } from "lucide-react";
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { CountUp } from "@/components/reactbits/count-up";
import { DistanceChart } from "@/components/charts/distance-chart";
import { ActivityCard, type FeedActivity } from "@/components/cardio/activity-card";
import { LogActivityModal } from "@/components/cardio/log-activity-modal";
import { StravaPanel } from "@/components/cardio/strava-panel";
import { ACTIVITY_META } from "@/components/cardio/activity-meta";
import { formatDistance, formatDuration, formatPace } from "@/lib/math/geo";
import { todayIso } from "@/lib/date-utils";
import { ACTIVITY_TYPES, type ActivityType } from "@/models/Activity";

interface Stats {
  hasData: boolean;
  totals: { activities: number; distanceM: number; movingTimeS: number; elevationGainM: number };
  streakDays: number;
  weeklyDistance: Array<{ week: string; distanceKm: number }>;
  byType: Array<{ type: ActivityType; count: number; distanceM: number }>;
  personalBests: Array<{
    label: string;
    value: number;
    unit: string;
    activityId: string;
    name: string;
    date: string;
  }>;
}

type Filter = "ALL" | ActivityType;

export default function CardioPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [feed, setFeed] = useState<FeedActivity[] | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadStats = useCallback(() => {
    fetch(`/api/activities/stats?today=${todayIso()}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setFailed(true) : setStats(j)))
      .catch(() => setFailed(true));
  }, []);

  const loadFeed = useCallback(() => {
    fetch(`/api/activities?limit=50&type=${filter}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setFailed(true) : setFeed(j.activities)))
      .catch(() => setFailed(true));
  }, [filter]);

  useEffect(() => loadStats(), [loadStats]);
  useEffect(() => loadFeed(), [loadFeed]);

  const refresh = () => {
    loadStats();
    loadFeed();
  };

  const remove = async (id: string) => {
    // optimistic: the row disappears immediately, totals re-fetch behind it
    setFeed((f) => f?.filter((a) => a.id !== id) ?? null);
    await fetch(`/api/activities?id=${id}`, { method: "DELETE" }).catch(() => {});
    loadStats();
  };

  if (failed) {
    return (
      <CenteredNote className="text-neon-crimson">
        Could not reach the database — verify the MONGODB_URI environment variable, then refresh.
      </CenteredNote>
    );
  }
  if (!stats || !feed) {
    return <CenteredNote className="animate-pulse-glow text-zinc-500">Loading your efforts…</CenteredNote>;
  }

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
              Cardio
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              Runs · rides · walks · hikes · swims
            </p>
          </div>
          <HoverBorderGradient as="div" containerClassName="rounded-full" className="p-0">
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-6 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-neon-green"
            >
              <Plus className="h-4 w-4" /> Log effort
            </button>
          </HoverBorderGradient>
        </header>

        <StravaPanel onSynced={refresh} />

        {!stats.hasData ? (
          <BlankSlate onLog={() => setModalOpen(true)} />
        ) : (
          <>
            <BentoGrid>
              <BentoGridItem
                className="border-hot-green/30"
                header={
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <CountUp
                      value={Number((stats.totals.distanceM / 1000).toFixed(1))}
                      decimals={1}
                      className="text-5xl font-bold text-neon-green"
                      duration={900}
                    />
                    <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                      km lifetime
                    </span>
                  </div>
                }
                title="Total Distance"
                description={`${stats.totals.activities} efforts logged`}
              />

              <BentoGridItem
                className="md:col-span-2"
                header={
                  stats.weeklyDistance.length > 0 ? (
                    <div className="flex-1 pt-1">
                      <DistanceChart series={stats.weeklyDistance} height={170} />
                    </div>
                  ) : (
                    <EmptyTile>Log more weeks to chart distance.</EmptyTile>
                  )
                }
                title="Weekly Distance"
                description="Kilometres per week"
              />

              <BentoGridItem
                header={
                  <div className="flex flex-1 flex-col items-center justify-center gap-1">
                    <CountUp value={stats.streakDays} className="text-4xl font-bold text-neon-blue" />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      day streak
                    </span>
                  </div>
                }
                title="Consistency"
                description="Consecutive cardio days"
              />

              <BentoGridItem
                className="md:col-span-2"
                header={
                  <div className="flex flex-1 flex-col justify-center gap-2 pt-1">
                    {stats.personalBests.map((pb) => (
                      <div key={pb.label} className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                          {pb.label}
                        </span>
                        <span className="truncate font-mono text-[10px] text-zinc-600">{pb.name}</span>
                        <span className="shrink-0 font-mono text-sm font-bold text-neon-amber tabular-nums">
                          {pb.unit === "distance"
                            ? formatDistance(pb.value)
                            : pb.unit === "pace"
                              ? formatPace(pb.value)
                              : pb.unit === "duration"
                                ? formatDuration(pb.value)
                                : `${pb.value} m`}
                        </span>
                      </div>
                    ))}
                  </div>
                }
                title="Personal Bests"
                description="Your standing marks"
              />

              <BentoGridItem
                header={
                  <div className="flex flex-1 flex-col justify-center gap-1.5 pt-1">
                    {stats.byType.map((t) => {
                      const meta = ACTIVITY_META[t.type] ?? ACTIVITY_META.RUN;
                      const Icon = meta.icon;
                      return (
                        <div key={t.type} className="flex items-center gap-2 font-mono text-[11px]">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.accent }} />
                          <span className="text-zinc-400">{meta.label}</span>
                          <span className="ml-auto text-zinc-200 tabular-nums">
                            {formatDistance(t.distanceM)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                }
                title="By Discipline"
                description="Distance split"
              />
            </BentoGrid>

            {/* feed */}
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-300">
                  Activity feed
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {(["ALL", ...ACTIVITY_TYPES] as Filter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                        filter === f
                          ? "border-hot-green/50 bg-hot-green/10 text-neon-green"
                          : "border-edge text-zinc-600 hover:text-zinc-300"
                      }`}
                    >
                      {f === "ALL" ? "All" : ACTIVITY_META[f].label}
                    </button>
                  ))}
                </div>
              </div>

              {feed.length === 0 ? (
                <div className="rounded-xl border border-dashed border-edge bg-panel/30 px-4 py-10 text-center font-mono text-[11px] text-zinc-600">
                  No {filter === "ALL" ? "efforts" : ACTIVITY_META[filter].label.toLowerCase()} logged yet.
                </div>
              ) : (
                <div className="grid gap-2">
                  {feed.map((a) => (
                    <ActivityCard key={a.id} activity={a} onDelete={remove} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <LogActivityModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={refresh} />
    </div>
  );
}

function BlankSlate({ onLog }: { onLog: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-panel/40 px-6 py-20 text-center">
      <Route className="h-10 w-10 text-neon-green" />
      <h2 className="mt-4 font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
        No ground covered yet
      </h2>
      <p className="mt-2 max-w-sm font-mono text-xs leading-relaxed text-zinc-500">
        Same rule as the strength side: nothing fake in here. Track a run with GPS, drop in a
        GPX file, or type one in — your map, splits and records build from real efforts only.
      </p>
      <div className="mt-8">
        <HoverBorderGradient as="div" containerClassName="rounded-full" className="p-0">
          <button
            onClick={onLog}
            className="flex items-center gap-2 px-8 py-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-zinc-100"
          >
            <Trophy className="h-4 w-4" /> Log first effort
          </button>
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
