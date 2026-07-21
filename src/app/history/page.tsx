"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Calendar } from "@/components/history/calendar";
import { groupBySlug } from "@/lib/data/exercise-catalog";
import { prettyDate, todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface DaySet {
  id: string;
  exercise: string;
  muscleGroup: string;
  weight: number;
  reps: number;
  setType: "WARMUP" | "WORKING" | "DROP" | "FAILURE";
  e1rm: number;
}

export default function HistoryPage() {
  const [selected, setSelected] = useState(todayIso());
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [sets, setSets] = useState<DaySet[] | null>(null);

  const loadDates = useCallback(() => {
    fetch("/api/workouts/dates")
      .then((r) => r.json())
      .then((j) => setMarked(new Set<string>(j.dates ?? [])))
      .catch(() => setMarked(new Set()));
  }, []);

  const loadDay = useCallback((date: string) => {
    setSets(null);
    fetch(`/api/workouts?date=${date}`)
      .then((r) => r.json())
      .then((j) => setSets(j.sets ?? []))
      .catch(() => setSets([]));
  }, []);

  useEffect(() => loadDates(), [loadDates]);
  useEffect(() => loadDay(selected), [selected, loadDay]);

  const del = async (id: string) => {
    setSets((prev) => prev?.filter((s) => s.id !== id) ?? prev); // optimistic
    try {
      await fetch(`/api/workouts?date=${selected}&setId=${id}`, { method: "DELETE" });
      loadDates(); // a day may have just emptied → drop its calendar dot
    } catch {
      loadDay(selected); // reconcile on failure
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, DaySet[]>();
    for (const s of sets ?? []) {
      const list = map.get(s.muscleGroup) ?? [];
      list.push(s);
      map.set(s.muscleGroup, list);
    }
    return [...map.entries()];
  }, [sets]);

  const summary = useMemo(() => {
    if (!sets || sets.length === 0) return null;
    const working = sets.filter((s) => s.setType !== "WARMUP");
    return {
      sets: sets.length,
      volume: Math.round(working.reduce((n, s) => n + s.weight * s.reps, 0)),
      muscles: [...new Set(sets.map((s) => groupBySlug(s.muscleGroup)?.name ?? s.muscleGroup))],
    };
  }, [sets]);

  return (
    <div className="bg-cyber-grid min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[360px_1fr]">
        <section>
          <h1 className="mb-4 font-display text-2xl font-bold uppercase tracking-widest text-zinc-100">
            History<span className="text-neon-green">.</span>
          </h1>
          <Calendar selected={selected} onSelect={setSelected} marked={marked} />
          <p className="mt-3 px-1 font-mono text-[10px] text-zinc-600">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-neon-green align-middle" />
            days with logged sets
          </p>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-widest text-zinc-200">
              {prettyDate(selected)}
            </h2>
            {summary && (
              <span className="font-mono text-[11px] text-zinc-500">
                {summary.sets} sets · {summary.volume} kg
              </span>
            )}
          </div>

          {sets === null ? (
            <Note className="animate-pulse-glow">Loading…</Note>
          ) : sets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge bg-panel/40 px-6 py-16 text-center">
              <p className="font-display text-sm font-bold uppercase tracking-widest text-zinc-300">
                Nothing logged
              </p>
              <p className="mt-2 max-w-xs font-mono text-xs text-zinc-500">
                No sets on {prettyDate(selected)}.
                {selected === todayIso() && " Today's a good day to change that."}
              </p>
              <Link
                href="/train"
                className="mt-6 rounded-lg border border-hot-green/50 bg-hot-green/10 px-5 py-2 font-mono text-[11px] uppercase tracking-widest text-neon-green hover:bg-hot-green/20"
              >
                Log a workout →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([slug, list]) => {
                const group = groupBySlug(slug);
                return (
                  <div key={slug} className="rounded-2xl border border-edge bg-panel/50 p-4">
                    <h3
                      className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em]"
                      style={{ color: group?.accent ?? "#a78bfa" }}
                    >
                      {group?.name ?? slug}
                    </h3>
                    <ul className="space-y-1.5">
                      {list.map((s, i) => (
                        <li key={s.id} className="group flex items-center justify-between font-mono text-xs">
                          <span className="text-zinc-500">#{i + 1}</span>
                          <span className="flex-1 pl-3 text-zinc-300">{s.exercise}</span>
                          <span className="text-zinc-200">
                            {s.weight} kg × {s.reps}
                          </span>
                          <span
                            className={cn(
                              "ml-3 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                              s.setType === "WORKING" && "bg-hot-green/10 text-neon-green",
                              s.setType === "WARMUP" && "bg-zinc-500/10 text-zinc-400",
                              s.setType === "DROP" && "bg-hot-purple/15 text-neon-purple",
                              s.setType === "FAILURE" && "bg-hot-crimson/10 text-neon-crimson",
                            )}
                          >
                            {s.setType}
                          </span>
                          <span className="ml-3 w-16 text-right tabular-nums text-zinc-400">{s.e1rm} e1RM</span>
                          <button
                            onClick={() => del(s.id)}
                            aria-label={`delete ${s.exercise} set ${i + 1}`}
                            className="ml-2 rounded p-1 text-zinc-600 opacity-0 transition-all hover:text-neon-crimson group-hover:opacity-100 focus:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex h-40 items-center justify-center">
      <span className={`font-mono text-xs uppercase tracking-[0.35em] text-zinc-500 ${className}`}>{children}</span>
    </div>
  );
}
