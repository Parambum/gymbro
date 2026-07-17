"use client";

import { useEffect, useMemo, useState } from "react";
import { TelemetryForm, type CardioDraft } from "@/components/cardio/telemetry-form";
import { SessionCard, type CardioSessionView } from "@/components/cardio/session-card";
import { EffortChart } from "@/components/charts/effort-chart";
import { WavyBackground } from "@/components/ui/wavy-background";
import { paceSecPerKm } from "@/lib/math/pace";

export default function CardioPage() {
  const [sessions, setSessions] = useState<CardioSessionView[] | null>(null);

  useEffect(() => {
    fetch("/api/cardio")
      .then((r) => r.json())
      .then((json) => setSessions(json.sessions ?? []))
      .catch(() => setSessions([]));
  }, []);

  const handleLogged = (draft: CardioDraft) => {
    const view: CardioSessionView = {
      id: `local-${Date.now()}`,
      activity: draft.activity,
      runType: draft.runType,
      date: new Date().toISOString().slice(0, 10),
      durationSec: draft.durationSec,
      distanceM: draft.distanceM,
      avgHr: draft.avgHr,
      paceSecPerKm: paceSecPerKm(draft.distanceM, draft.durationSec),
      relativeEffort: draft.relativeEffort,
    };
    setSessions((prev) => [view, ...(prev ?? [])]);
  };

  const effortSeries = useMemo(
    () =>
      [...(sessions ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => ({ date: s.date, effort: s.relativeEffort })),
    [sessions],
  );

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[440px_1fr]">
        <section aria-label="Log a session">
          <h1 className="mb-4 font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
            Endurance<span className="text-neon-crimson">.</span>
          </h1>
          <div className="rounded-2xl border border-edge bg-panel/60 p-5 backdrop-blur-sm">
            <TelemetryForm onLogged={handleLogged} />
          </div>

          {effortSeries.length > 1 && (
            <div className="mt-6 rounded-2xl border border-edge bg-panel/60 p-5 backdrop-blur-sm">
              <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500">
                Relative effort trend
              </h2>
              <EffortChart series={effortSeries} height={160} />
            </div>
          )}
        </section>

        <section aria-label="Session history">
          <h2 className="mb-4 mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-500 lg:mt-12">
            Session log
          </h2>

          {sessions === null ? (
            <div className="flex h-40 items-center justify-center">
              <span className="animate-pulse-glow font-mono text-xs uppercase tracking-[0.4em] text-zinc-500">
                Syncing telemetry…
              </span>
            </div>
          ) : sessions.length === 0 ? (
            <WavyBackground containerClassName="h-72 rounded-2xl border border-edge" waveOpacity={0.25}>
              <div className="text-center">
                <p className="font-display text-lg font-bold uppercase tracking-widest text-zinc-200">
                  No sessions yet
                </p>
                <p className="mt-2 font-mono text-xs text-zinc-400">
                  The first kilometer writes the first data point.
                </p>
              </div>
            </WavyBackground>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {sessions.map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
