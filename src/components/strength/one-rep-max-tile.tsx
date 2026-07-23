"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OneRepMaxEntry {
  exercise: string;
  short: string;
  muscleGroup: string;
  oneRepMax: number | null;
  source: "logged" | "manual" | null;
}

/**
 * Recorded 1-rep max for the main lifts — actual maxes, not Epley estimates.
 * Filtered to the muscle groups trained on the reference day; each lift is
 * inline-editable so a true max can be recorded straight from the dashboard.
 */
export function OneRepMaxTile({
  lifts,
  muscleSlugs,
  onChange,
}: {
  lifts: OneRepMaxEntry[];
  muscleSlugs: string[];
  onChange?: () => void;
}) {
  const relevant =
    muscleSlugs.length > 0 ? lifts.filter((l) => muscleSlugs.includes(l.muscleGroup)) : lifts;

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (exercise: string) => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/one-rep-max", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exercise, oneRepMax: value }),
      });
      onChange?.();
    } catch {
      /* leave value as-is on failure */
    }
    setSaving(false);
    setEditing(null);
  };

  if (relevant.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-2 py-6 text-center font-mono text-[11px] text-zinc-600">
        No main lift for today&apos;s muscles.
      </div>
    );
  }

  return (
    <ul className="flex flex-1 flex-col justify-center gap-2.5">
      {relevant.map((l) => (
        <li key={l.exercise} className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] text-zinc-300">{l.short}</span>
          {editing === l.exercise ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && save(l.exercise)}
                placeholder="kg"
                className="w-16 rounded border border-hot-purple/60 bg-abyss px-1.5 py-0.5 text-right font-mono text-xs text-zinc-100 focus:outline-none"
              />
              <button
                onClick={() => save(l.exercise)}
                disabled={saving}
                aria-label="save 1RM"
                className="rounded p-1 text-neon-green hover:bg-panel"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <button
              onClick={() => {
                setEditing(l.exercise);
                setDraft(l.oneRepMax ? String(l.oneRepMax) : "");
              }}
              className="group/orm flex items-center gap-1.5"
            >
              {l.oneRepMax ? (
                <span className="font-mono text-sm font-bold text-neon-purple">
                  {l.oneRepMax} kg
                  <span
                    className={cn(
                      "ml-1 text-[8px] uppercase tracking-wider",
                      l.source === "logged" ? "text-neon-green" : "text-zinc-600",
                    )}
                  >
                    {l.source === "logged" ? "lifted" : "set"}
                  </span>
                </span>
              ) : (
                <span className="font-mono text-[11px] text-zinc-600">tap to record</span>
              )}
              <Pencil className="h-3 w-3 text-zinc-600 opacity-0 transition-opacity group-hover/orm:opacity-100" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
