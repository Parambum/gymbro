"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ACTIVITIES, RUN_TYPES, activityById, type ActivityId, type RunTypeId } from "./cardio-config";
import { parseDuration, paceSecPerKm, speedKmh, formatPace, formatDuration } from "@/lib/math/pace";
import { relativeEffortFromAvgHr, relativeEffortFromDuration, effortBand } from "@/lib/math/relative-effort";
import { MagneticButton } from "@/components/reactbits/magnetic-button";
import { cn } from "@/lib/utils";

export interface CardioDraft {
  activity: ActivityId;
  runType: RunTypeId | null;
  durationSec: number;
  distanceM: number;
  avgHr: number | null;
  relativeEffort: number;
}

const BAND_COLORS: Record<string, string> = {
  easy: "#38bdf8",
  moderate: "#4ade80",
  hard: "#fbbf24",
  epic: "#fb7185",
};

/**
 * Endurance telemetry capture. Pace, speed and Relative Effort are computed
 * live as the fields change — the athlete sees the math before committing.
 */
export function TelemetryForm({ onLogged }: { onLogged: (draft: CardioDraft) => void }) {
  const [activity, setActivity] = useState<ActivityId>("RUNNING");
  const [runType, setRunType] = useState<RunTypeId>("TEMPO");
  const [durationRaw, setDurationRaw] = useState("45:00");
  const [distanceKm, setDistanceKm] = useState(8);
  const [avgHr, setAvgHr] = useState<number | "">(155);
  const [saving, setSaving] = useState(false);

  const def = activityById(activity);
  const durationSec = parseDuration(durationRaw);
  const distanceM = Math.round(distanceKm * 1000);
  const valid = Number.isFinite(durationSec) && durationSec > 0 && distanceM > 0;

  const telemetry = useMemo(() => {
    if (!valid) return null;
    const pace = paceSecPerKm(distanceM, durationSec);
    const effort =
      typeof avgHr === "number" && avgHr > 0
        ? relativeEffortFromAvgHr(durationSec, avgHr)
        : relativeEffortFromDuration(durationSec);
    return {
      paceLabel:
        def.paceMode === "kmh"
          ? `${speedKmh(distanceM, durationSec).toFixed(1)} km/h`
          : def.paceMode === "per-100m"
            ? `${formatPace(pace / 10)} /100m`
            : `${formatPace(pace)} /km`,
      effort,
      band: effortBand(effort),
    };
  }, [valid, distanceM, durationSec, avgHr, def.paceMode]);

  const handleSubmit = async () => {
    if (!valid || !telemetry || saving) return;
    setSaving(true);
    const draft: CardioDraft = {
      activity,
      runType: activity === "RUNNING" ? runType : null,
      durationSec,
      distanceM,
      avgHr: typeof avgHr === "number" ? avgHr : null,
      relativeEffort: telemetry.effort,
    };
    try {
      await fetch("/api/cardio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } catch {
      // offline-tolerant: the session still lands in local history
    }
    onLogged(draft);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {ACTIVITIES.map((a) => (
          <button
            key={a.id}
            onClick={() => setActivity(a.id)}
            className={cn(
              "rounded-xl border p-3 text-center transition-all duration-200",
              activity === a.id
                ? "border-transparent bg-panel"
                : "border-edge bg-abyss/50 hover:bg-panel/70",
            )}
            style={
              activity === a.id
                ? { boxShadow: `0 0 0 1px ${a.accent}88, 0 0 22px -6px ${a.accent}` }
                : undefined
            }
          >
            <div className="font-mono text-base" style={{ color: a.accent }}>
              {a.glyph}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              {a.label}
            </div>
          </button>
        ))}
      </div>

      {activity === "RUNNING" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex flex-wrap gap-2"
        >
          {RUN_TYPES.map((rt) => (
            <button
              key={rt.id}
              onClick={() => setRunType(rt.id)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                runType === rt.id
                  ? "border-hot-crimson/70 bg-hot-crimson/15 text-neon-crimson"
                  : "border-edge text-zinc-500 hover:text-zinc-300",
              )}
            >
              {rt.label}
            </button>
          ))}
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <label className="rounded-xl border border-edge bg-abyss p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Duration
          </span>
          <input
            value={durationRaw}
            onChange={(e) => setDurationRaw(e.target.value)}
            placeholder="HH:MM:SS"
            className="mt-1 w-full bg-transparent font-mono text-xl font-bold tabular-nums text-zinc-100 focus:outline-none"
          />
        </label>
        <label className="rounded-xl border border-edge bg-abyss p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Distance (km)
          </span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={distanceKm}
            onChange={(e) => setDistanceKm(Number(e.target.value))}
            className="mt-1 w-full bg-transparent font-mono text-xl font-bold tabular-nums text-zinc-100 focus:outline-none"
          />
        </label>
        <label className="rounded-xl border border-edge bg-abyss p-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Avg HR (bpm)
          </span>
          <input
            type="number"
            min={0}
            max={230}
            value={avgHr}
            onChange={(e) => setAvgHr(e.target.value === "" ? "" : Number(e.target.value))}
            className="mt-1 w-full bg-transparent font-mono text-xl font-bold tabular-nums text-zinc-100 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-edge bg-abyss/60 px-4 py-3">
        {telemetry ? (
          <>
            <div className="font-mono text-xs text-zinc-400">
              <span className="text-zinc-100">{formatDuration(durationSec)}</span>
              {" · "}
              <span style={{ color: def.accent }}>{telemetry.paceLabel}</span>
            </div>
            <div className="text-right">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Relative effort{" "}
              </span>
              <span
                className="font-mono text-lg font-bold tabular-nums"
                style={{ color: BAND_COLORS[telemetry.band] }}
              >
                {telemetry.effort}
              </span>
            </div>
          </>
        ) : (
          <span className="font-mono text-xs text-zinc-600">Enter duration + distance…</span>
        )}
      </div>

      <MagneticButton
        onClick={handleSubmit}
        disabled={!valid || saving}
        className="w-full border-hot-crimson/50 bg-hot-crimson/10 text-neon-crimson shadow-neon-crimson hover:bg-hot-crimson/20 focus-visible:outline-neon-crimson"
      >
        {saving ? "Transmitting…" : "⚡ Log Session"}
      </MagneticButton>
    </div>
  );
}
