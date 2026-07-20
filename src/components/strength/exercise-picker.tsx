"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Plus, Sparkles } from "lucide-react";
import type { ExerciseOption } from "@/app/api/exercises/route";
import { cn } from "@/lib/utils";

/**
 * The base library merged with the user's custom exercises for a muscle,
 * plus an inline "Add custom exercise" affordance that persists to
 * MongoDB (POST /api/exercises) tied to the user.
 */
export function ExercisePicker({
  muscle,
  accent,
  onSelect,
}: {
  muscle: string;
  accent: string;
  onSelect: (name: string) => void;
}) {
  const [options, setOptions] = useState<ExerciseOption[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setOptions(null);
    fetch(`/api/exercises?muscle=${muscle}`)
      .then((r) => r.json())
      .then((json) => live && setOptions(json.exercises ?? []))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, [muscle]);

  const filtered = useMemo(() => {
    if (!options) return [];
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const addCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, muscleGroup: muscle }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not add exercise.");
        setSaving(false);
        return;
      }
      setOptions((prev) => [...(prev ?? []), { name, isCustom: true, id: json.exercise?.id }]);
      setNewName("");
      setAdding(false);
      onSelect(name); // jump straight into logging the new exercise
    } catch {
      setError("Network error. Try again.");
    }
    setSaving(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercises…"
        className="w-full rounded-lg border border-edge bg-void px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-hot-purple focus:outline-none"
      />

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {options === null ? (
          <li className="px-3 py-6 text-center font-mono text-xs text-zinc-600">Loading…</li>
        ) : (
          filtered.map((opt, i) => (
            <motion.li
              key={`${opt.name}-${i}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.015, 0.25) }}
            >
              <button
                onClick={() => onSelect(opt.name)}
                className="group flex w-full items-center justify-between rounded-lg border border-transparent bg-void/60 px-3 py-2.5 text-left transition-all hover:border-edge hover:bg-panel hover:pl-4"
              >
                <span className="flex items-center gap-2 font-mono text-xs text-zinc-300 group-hover:text-zinc-100">
                  {opt.isCustom && <Sparkles className="h-3 w-3" style={{ color: accent }} />}
                  {opt.name}
                </span>
                <span className="font-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: accent }}>
                  LOG →
                </span>
              </button>
            </motion.li>
          ))
        )}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-edge bg-void/70 p-3">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Custom exercise name"
            maxLength={80}
            className="w-full rounded-lg border border-edge bg-abyss px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-hot-purple focus:outline-none"
          />
          {error && <p className="mt-2 font-mono text-[11px] text-neon-crimson">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={addCustom}
              disabled={saving || !newName.trim()}
              className="flex-1 rounded-lg border py-2 font-mono text-[11px] uppercase tracking-widest disabled:opacity-40"
              style={{ borderColor: `${accent}88`, color: accent }}
            >
              {saving ? "Saving…" : "Save + log"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded-lg border border-edge px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors",
            "border-edge text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
          )}
        >
          <Plus className="h-3.5 w-3.5" /> Add custom exercise
        </button>
      )}
    </div>
  );
}
