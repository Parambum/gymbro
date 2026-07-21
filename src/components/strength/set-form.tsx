"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
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

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function Stepper({
  label,
  value,
  step,
  min,
  unit,
  onChange,
  onEnter,
  accent,
  decimals = false,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  unit: string;
  onChange: (v: number) => void;
  onEnter: () => void;
  accent: string;
  decimals?: boolean;
}) {
  // Local text buffer so a trailing "." (typing "62.5") isn't stripped by the
  // numeric parse. Sync down from `value` only when it changed externally
  // (± buttons, prefill) — never mid-keystroke, so typing stays smooth.
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "");
    setText(cleaned);
    if (cleaned === "" || cleaned === ".") {
      onChange(min);
      return;
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) onChange(Math.max(min, n));
  };

  return (
    <div className="flex-1 rounded-xl border border-edge bg-void p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label={`decrease ${label}`}
          onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-zinc-300 transition-colors hover:border-zinc-500 active:scale-95"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <input
            type="text"
            inputMode={decimals ? "decimal" : "numeric"}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEnter();
            }}
            aria-label={`${label} value`}
            className={cn(
              "w-full bg-transparent text-center font-mono text-2xl font-bold tabular-nums focus:outline-none",
              NO_SPIN,
            )}
            style={{ color: accent }}
          />
          <div className="font-mono text-[10px] text-zinc-500">{unit} · tap to type</div>
        </div>
        <button
          type="button"
          aria-label={`increase ${label}`}
          onClick={() => onChange(+(value + step).toFixed(2))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-zinc-300 transition-colors hover:border-zinc-500 active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Weight / reps / set-type capture. Numbers are tap-to-type (no more
 * clicking + thirty times for a heavy lift), Enter logs the set, and the
 * form pre-fills from the last time this exercise was trained. Sets write
 * to MongoDB, mirror into the session store, and can be deleted inline.
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
  const { sets, addSet, removeSet, celebration, clearCelebration } = useSessionStore();
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(8);
  const [setType, setSetType] = useState<SetTypeUI>("WORKING");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [lastHint, setLastHint] = useState<{ weight: number; reps: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // smart prefill: last time this exercise was trained
  useEffect(() => {
    let live = true;
    fetch(`/api/workouts/last?exercise=${encodeURIComponent(exercise)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j.last) return;
        setLastHint({ weight: j.last.weight, reps: j.last.reps });
        setWeight(j.last.weight);
        setReps(j.last.reps);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [exercise]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const forExercise = sets.filter((s) => s.exercise === exercise);
  const projected = roundE1RM(epleyE1RM(weight, Math.max(1, reps)));
  const canLog = weight >= 0 && reps >= 1 && !saving;

  const log = async () => {
    if (!canLog) return;
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
      if (json.isPR) {
        setTimeout(clearCelebration, 3200);
      } else {
        setFlash(true);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(false), 1400);
      }
    } catch {
      setError("Network error. Try again.");
    }
    setSaving(false);
  };

  const del = async (id: string) => {
    removeSet(id); // optimistic
    try {
      await fetch(`/api/workouts?date=${date}&setId=${id}`, { method: "DELETE" });
    } catch {
      /* set already removed from view; DB stays consistent on next load */
    }
  };

  const applyLast = () => {
    if (!lastHint) return;
    setWeight(lastHint.weight);
    setReps(lastHint.reps);
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

      {lastHint && (
        <button
          onClick={applyLast}
          className="self-start rounded-full border border-edge px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
        >
          ↺ Last: {lastHint.weight} kg × {lastHint.reps}
        </button>
      )}

      <div className="flex gap-3">
        <Stepper label="Weight" value={weight} step={2.5} min={0} unit="kg" onChange={setWeight} onEnter={log} accent={accent} decimals />
        <Stepper label="Reps" value={reps} step={1} min={1} unit="reps" onChange={setReps} onEnter={log} accent={accent} />
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

      <div className="relative">
        <MagneticButton onClick={log} disabled={!canLog} className="w-full">
          {saving ? "Saving…" : "⚡ Log Set"}
        </MagneticButton>
        <AnimatePresence>
          {flash && (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute -top-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-hot-green/50 bg-void px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neon-green"
            >
              <Check className="h-3 w-3" /> Logged
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {[...forExercise].reverse().map((s) => (
            <motion.li
              key={s.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex items-center gap-2 rounded-lg border border-edge/60 bg-panel/70 px-3 py-2 font-mono text-xs"
            >
              <span className="text-zinc-500">#{s.setNumber}</span>
              <span className="flex-1 text-zinc-200">
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
              <button
                onClick={() => del(s.id)}
                aria-label={`delete set ${s.setNumber}`}
                className="ml-1 rounded p-1 text-zinc-600 opacity-0 transition-all hover:text-neon-crimson group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
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
