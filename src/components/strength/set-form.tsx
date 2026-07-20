"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSessionStore, type SetTypeUI } from "@/store/session-store";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";
import { MagneticButton } from "@/components/reactbits/magnetic-button";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const TAGS: Array<{ id: SetTypeUI; label: string; cls: string }> = [
  { id: "WARMUP", label: "Warmup", cls: "border-zinc-600 text-zinc-400 data-[on=true]:bg-zinc-500/20" },
  { id: "WORKING", label: "Working", cls: "border-hot-green/60 text-neon-green data-[on=true]:bg-hot-green/15" },
  { id: "DROP", label: "Drop", cls: "border-hot-purple/60 text-neon-purple data-[on=true]:bg-hot-purple/20" },
  { id: "FAILURE", label: "Failure", cls: "border-hot-crimson/60 text-neon-crimson data-[on=true]:bg-hot-crimson/15" },
];

function Stepper({
  label,
  value,
  step,
  min,
  unit,
  onChange,
  accent,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  unit: string;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-edge bg-void p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          aria-label={`decrease ${label}`}
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="h-9 w-9 rounded-lg border border-edge font-mono text-lg text-zinc-300 transition-colors hover:border-zinc-500 active:scale-95"
        >
          −
        </button>
        <div className="text-center">
          <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: accent }}>
            {value % 1 === 0 ? value : value.toFixed(1)}
          </span>
          <span className="ml-1 font-mono text-[10px] text-zinc-500">{unit}</span>
        </div>
        <button
          aria-label={`increase ${label}`}
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="h-9 w-9 rounded-lg border border-edge font-mono text-lg text-zinc-300 transition-colors hover:border-zinc-500 active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Weight / reps / set-type capture for the active exercise. Writes each set
 * to MongoDB and reflects it in the session store; a server-confirmed PR
 * fires the decrypted celebration.
 */
export function SetForm({
  exercise,
  muscleGroup,
  accent,
  date = todayIso(),
}: {
  exercise: string;
  muscleGroup: string;
  accent: string;
  date?: string;
}) {
  const { sets, addSet, celebration, clearCelebration } = useSessionStore();
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(8);
  const [setType, setSetType] = useState<SetTypeUI>("WORKING");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forExercise = sets.filter((s) => s.exercise === exercise);
  const projected = roundE1RM(epleyE1RM(weight, Math.max(1, reps)));

  const log = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, exercise, muscleGroup, weight, reps, setType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save set.");
        setSaving(false);
        return;
      }
      addSet({
        id: json.set.id,
        exercise,
        muscleGroup,
        setNumber: json.set.setNumber,
        weight,
        reps,
        setType,
        e1rm: json.set.e1rm,
        isPR: json.isPR,
      });
      if (json.isPR) setTimeout(clearCelebration, 3200);
    } catch {
      setError("Network error. Try again.");
    }
    setSaving(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AnimatePresence>
        {celebration && celebration.exercise === exercise && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-hot-green/60 bg-hot-green/10 p-3 text-center shadow-neon-green"
          >
            <DecryptedText
              text={`◆ NEW PR — ${celebration.e1rm} KG e1RM ◆`}
              className="text-sm font-bold text-neon-green"
              playKey={celebration.e1rm}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-3">
        <Stepper label="Weight" value={weight} step={2.5} min={0} unit="kg" onChange={setWeight} accent={accent} />
        <Stepper label="Reps" value={reps} step={1} min={1} unit="reps" onChange={setReps} accent={accent} />
      </div>

      <div className="flex gap-2">
        {TAGS.map((t) => (
          <button
            key={t.id}
            data-on={setType === t.id}
            onClick={() => setSetType(t.id)}
            className={cn(
              "flex-1 rounded-lg border bg-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all",
              t.cls,
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-edge bg-void/60 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Set {forExercise.length + 1} · projected e1RM
        </span>
        <span className="font-mono text-lg font-bold tabular-nums" style={{ color: accent }}>
          {projected} kg
        </span>
      </div>

      {error && <p className="font-mono text-[11px] text-neon-crimson">{error}</p>}

      <MagneticButton onClick={log} disabled={saving} className="w-full">
        {saving ? "Saving…" : "⚡ Log Set"}
      </MagneticButton>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {[...forExercise].reverse().map((s) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between rounded-lg border border-edge/60 bg-panel/70 px-3 py-2 font-mono text-xs"
            >
              <span className="text-zinc-500">#{s.setNumber}</span>
              <span className="text-zinc-200">
                {s.weight} kg × {s.reps}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                  s.setType === "WORKING" && "bg-hot-green/10 text-neon-green",
                  s.setType === "WARMUP" && "bg-zinc-500/10 text-zinc-400",
                  s.setType === "DROP" && "bg-hot-purple/15 text-neon-purple",
                  s.setType === "FAILURE" && "bg-hot-crimson/10 text-neon-crimson",
                )}
              >
                {s.setType}
              </span>
              <span className="tabular-nums text-zinc-400">
                {s.isPR && <span className="mr-1 text-neon-green">◆</span>}
                {s.e1rm} e1RM
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {forExercise.length === 0 && (
          <li className="px-3 py-6 text-center font-mono text-[11px] text-zinc-600">
            First set of the day. Make it count.
          </li>
        )}
      </ul>
    </div>
  );
}
