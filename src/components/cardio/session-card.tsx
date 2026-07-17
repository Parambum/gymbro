"use client";

import { GlowCard } from "@/components/ui/glow-card";
import { activityById, type ActivityId, type RunTypeId } from "./cardio-config";
import { formatDuration, formatPace, speedKmh } from "@/lib/math/pace";
import { effortBand } from "@/lib/math/relative-effort";

export interface CardioSessionView {
  id: string;
  activity: ActivityId;
  runType: RunTypeId | null;
  date: string;
  durationSec: number;
  distanceM: number;
  avgHr: number | null;
  paceSecPerKm: number;
  relativeEffort: number;
}

const BAND_LABEL: Record<string, { text: string; color: string }> = {
  easy: { text: "EASY", color: "#38bdf8" },
  moderate: { text: "MODERATE", color: "#4ade80" },
  hard: { text: "HARD", color: "#fbbf24" },
  epic: { text: "EPIC", color: "#fb7185" },
};

/**
 * History card that glows with the session's intensity — a 400-effort
 * interval day burns visibly hotter than a recovery jog.
 */
export function SessionCard({ session }: { session: CardioSessionView }) {
  const def = activityById(session.activity);
  const band = BAND_LABEL[effortBand(session.relativeEffort)];
  const intensity = Math.min(1, session.relativeEffort / 170);

  const paceLabel =
    def.paceMode === "kmh"
      ? `${speedKmh(session.distanceM, session.durationSec).toFixed(1)} km/h`
      : def.paceMode === "per-100m"
        ? `${formatPace(session.paceSecPerKm / 10)} /100m`
        : `${formatPace(session.paceSecPerKm)} /km`;

  return (
    <GlowCard accent={def.accent} intensity={intensity} className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm" style={{ color: def.accent }}>
              {def.glyph}
            </span>
            <span className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
              {def.label}
            </span>
            {session.runType && (
              <span className="rounded-full border border-edge px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                {session.runType.replace("_", " ")}
              </span>
            )}
          </div>
          <div className="mt-1 font-mono text-[10px] text-zinc-500">
            {new Date(`${session.date}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg font-bold tabular-nums" style={{ color: band.color }}>
            {session.relativeEffort}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: band.color }}>
            {band.text}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-edge/60 pt-3 font-mono text-xs">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-600">Dist</div>
          <div className="mt-0.5 tabular-nums text-zinc-200">
            {(session.distanceM / 1000).toFixed(1)} km
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-600">Time</div>
          <div className="mt-0.5 tabular-nums text-zinc-200">{formatDuration(session.durationSec)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-600">Pace</div>
          <div className="mt-0.5 tabular-nums text-zinc-200">{paceLabel}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-zinc-600">HR</div>
          <div className="mt-0.5 tabular-nums text-zinc-200">
            {session.avgHr ? `${session.avgHr} bpm` : "—"}
          </div>
        </div>
      </div>
    </GlowCard>
  );
}
