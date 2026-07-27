"use client";

import Link from "next/link";
import { Map as MapIcon, Trash2 } from "lucide-react";
import { ACTIVITY_META, SOURCE_LABEL } from "./activity-meta";
import { formatDistance, formatDuration, formatPace, speedKph } from "@/lib/math/geo";
import { prettyDate } from "@/lib/date-utils";
import type { ActivityType } from "@/models/Activity";

export interface FeedActivity {
  id: string;
  type: ActivityType;
  name: string;
  date: string;
  distanceM: number;
  movingTimeS: number;
  elevationGainM: number;
  avgPaceSPerKm: number;
  source: string;
  hasRoute: boolean;
  notes: string;
}

/** One row in the cardio feed. The whole card links through to the detail view. */
export function ActivityCard({
  activity,
  onDelete,
}: {
  activity: FeedActivity;
  onDelete: (id: string) => void;
}) {
  const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.RUN;
  const Icon = meta.icon;

  // rides read naturally in km/h; everything else in min/km
  const rate =
    meta.paceMode === "speed"
      ? `${speedKph(activity.distanceM, activity.movingTimeS).toFixed(1)} km/h`
      : formatPace(activity.avgPaceSPerKm);

  return (
    <div className="group relative rounded-xl border border-edge bg-panel/50 transition-colors hover:border-edge/80 hover:bg-panel">
      <Link href={`/cardio/${activity.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
            style={{ borderColor: `${meta.accent}44`, backgroundColor: `${meta.accent}12` }}
          >
            <Icon className="h-4 w-4" style={{ color: meta.accent }} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate font-display text-sm font-bold text-zinc-100">{activity.name}</h3>
              {activity.hasRoute && <MapIcon className="h-3 w-3 shrink-0 text-zinc-600" />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              <span>{prettyDate(activity.date)}</span>
              <span>·</span>
              <span>{meta.label}</span>
              <span>·</span>
              <span>{SOURCE_LABEL[activity.source] ?? "manual"}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
              <Stat value={formatDistance(activity.distanceM)} label="distance" />
              <Stat value={formatDuration(activity.movingTimeS)} label="time" />
              <Stat value={rate} label={meta.paceMode === "speed" ? "speed" : "pace"} />
              {activity.elevationGainM > 0 && (
                <Stat value={`${activity.elevationGainM} m`} label="climb" />
              )}
            </div>
          </div>
        </div>
      </Link>

      <button
        onClick={() => onDelete(activity.id)}
        aria-label={`Delete ${activity.name}`}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-700 opacity-0 transition-all hover:bg-void hover:text-neon-crimson focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col">
      <span className="font-bold text-zinc-200 tabular-nums">{value}</span>
      <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-600">{label}</span>
    </span>
  );
}
