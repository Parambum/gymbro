"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, HeartPulse, Mountain, Timer, TrendingUp } from "lucide-react";
import { RouteMap } from "@/components/cardio/route-map";
import { SplitsChart } from "@/components/charts/splits-chart";
import { ACTIVITY_META, SOURCE_LABEL } from "@/components/cardio/activity-meta";
import { GlowCard } from "@/components/ui/glow-card";
import {
  formatDistance,
  formatDuration,
  formatPace,
  speedKph,
  type LatLng,
} from "@/lib/math/geo";
import { prettyDate } from "@/lib/date-utils";
import type { ActivityType } from "@/lib/activity-types";

interface ActivityDetail {
  id: string;
  type: ActivityType;
  name: string;
  date: string;
  startedAt: string;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  elevationGainM: number;
  avgPaceSPerKm: number;
  avgHeartRate: number | null;
  route: number[][];
  splits: Array<{ km: number; timeS: number; paceSPerKm: number; elevGainM: number }>;
  source: string;
  notes: string;
}

export default function ActivityDetailPage() {
  const params = useParams<{ id: string }>();
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/activities/${params.id}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setActivity(j.activity)))
      .catch(() => setError("Could not load this activity."));
  }, [params?.id]);

  if (error) {
    return (
      <Centered>
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-neon-crimson">{error}</span>
        <BackLink />
      </Centered>
    );
  }
  if (!activity) {
    return (
      <Centered>
        <span className="animate-pulse-glow font-mono text-xs uppercase tracking-[0.35em] text-zinc-500">
          Loading effort…
        </span>
      </Centered>
    );
  }

  const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.RUN;
  const Icon = meta.icon;
  const route = activity.route as LatLng[];
  const rate =
    meta.paceMode === "speed"
      ? `${speedKph(activity.distanceM, activity.movingTimeS).toFixed(1)} km/h`
      : formatPace(activity.avgPaceSPerKm);

  return (
    <div className="bg-cyber-grid min-h-[calc(100dvh-3.5rem)] px-4 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <BackLink />

        <header className="flex items-start gap-3">
          <span
            className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: `${meta.accent}44`, backgroundColor: `${meta.accent}12` }}
          >
            <Icon className="h-5 w-5" style={{ color: meta.accent }} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-zinc-100">
              {activity.name}
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              {prettyDate(activity.date)} · {meta.label} · via {SOURCE_LABEL[activity.source] ?? "manual"}
            </p>
          </div>
        </header>

        {/* headline numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={TrendingUp}
            label="Distance"
            value={formatDistance(activity.distanceM)}
            accent="text-neon-green"
          />
          <StatCard
            icon={Timer}
            label="Moving time"
            value={formatDuration(activity.movingTimeS)}
            accent="text-zinc-100"
          />
          <StatCard
            icon={TrendingUp}
            label={meta.paceMode === "speed" ? "Avg speed" : "Avg pace"}
            value={rate}
            accent="text-neon-blue"
          />
          <StatCard
            icon={Mountain}
            label="Elevation"
            value={activity.elevationGainM > 0 ? `${activity.elevationGainM} m` : "—"}
            accent="text-neon-amber"
          />
        </div>

        <RouteMap route={route} height={380} />

        {activity.splits.length > 0 && (
          <GlowCard className="p-5">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
              Kilometre splits
            </h2>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              Taller is faster · the amber bar is your quickest kilometre
            </p>
            <div className="mt-4">
              <SplitsChart splits={activity.splits} height={220} />
            </div>
          </GlowCard>
        )}

        {(activity.avgHeartRate || activity.elapsedTimeS !== activity.movingTimeS || activity.notes) && (
          <GlowCard className="flex flex-col gap-3 p-5">
            {activity.avgHeartRate && (
              <DetailRow icon={HeartPulse} label="Average heart rate">
                {activity.avgHeartRate} bpm
              </DetailRow>
            )}
            {activity.elapsedTimeS !== activity.movingTimeS && (
              <DetailRow icon={Timer} label="Elapsed (incl. stops)">
                {formatDuration(activity.elapsedTimeS)}
              </DetailRow>
            )}
            {activity.notes && (
              <div className="border-t border-edge pt-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  Notes
                </span>
                <p className="mt-1.5 whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
                  {activity.notes}
                </p>
              </div>
            )}
          </GlowCard>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/cardio"
      className="flex w-fit items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-neon-green"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Cardio
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Timer;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-edge bg-panel/50 p-4">
      <Icon className="h-3.5 w-3.5 text-zinc-600" />
      <div className={`mt-2 font-display text-lg font-bold tabular-nums ${accent}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">{label}</div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Timer;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <Icon className="h-3.5 w-3.5 text-zinc-600" />
      <span className="text-zinc-500">{label}</span>
      <span className="ml-auto font-bold text-zinc-200 tabular-nums">{children}</span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 px-4">{children}</div>
  );
}
