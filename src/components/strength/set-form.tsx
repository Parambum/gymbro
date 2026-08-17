"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { useSessionStore, type SetTypeUI } from "@/store/session-store";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";
import { MagneticButton } from "@/components/reactbits/magnetic-button";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { todayIso } from "@/lib/date-utils";
import { isMainLift } from "@/lib/data/main-lifts";
import { groupDropSets, nextSetLabel } from "@/lib/set-grouping";
import { loggingMode, formatHold, describeSet } from "@/lib/exercise-modes";
import { ExerciseDemo } from "@/components/strength/exercise-demo";
import { cn } from "@/lib/utils";

const SUPERSETS = ["A", "B", "C"] as const;

const TAGS: Array<{ id: SetTypeUI; label: string; cls: string }> = [
  {
    id: "WARMUP",
    label: "Warmup",
    cls: "border-zinc-600 text-zinc-400 data-[on=true]:border-zinc-300 data-[on=true]:bg-zinc-500/25 data-[on=true]:text-zinc-100 data-[on=true]:shadow-[0_0_18px_-3px_rgba(228,228,231,0.5)]",
  },
  {
    id: "WORKING",
    label: "Working",
    cls: "border-hot-green/60 text-neon-green data-[on=true]:border-hot-green data-[on=true]:bg-hot-green/20 data-[on=true]:shadow-neon-green",
  },
  {
    id: "DROP",
    label: "Drop",
    cls: "border-hot-purple/60 text-neon-purple data-[on=true]:border-hot-purple data-[on=true]:bg-hot-purple/25 data-[on=true]:shadow-neon-purple",
  },
  {
    id: "FAILURE",
    label: "Failure",
    cls: "border-hot-crimson/60 text-neon-crimson data-[on=true]:border-hot-crimson data-[on=true]:bg-hot-crimson/20 data-[on=true]:shadow-neon-crimson",
  },
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
  const mode = loggingMode(exercise);
  const isTime = mode === "time";
  const isReps = mode === "reps";

  const { sets, addSet, removeSet, celebration, clearCelebration } = useSessionStore();
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(8);
  const [durationSec, setDurationSec] = useState(30);
  const [setType, setSetType] = useState<SetTypeUI>("WORKING");
  const [superset, setSuperset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [ormFlash, setOrmFlash] = useState(false);
  const [lastHint, setLastHint] = useState<{ weight: number; reps: number; durationSec: number | null } | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMain = isMainLift(exercise);
  const willRecordOneRepMax = isMain && mode === "weight-reps" && reps === 1 && setType !== "WARMUP";

  // smart prefill: last time this exercise was trained
  useEffect(() => {
    let live = true;
    setPrefillDone(false);
    fetch(`/api/workouts/last?exercise=${encodeURIComponent(exercise)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j.last) {
          setLastHint({ weight: j.last.weight, reps: j.last.reps, durationSec: j.last.durationSec ?? null });
          if (isTime) {
            if (j.last.durationSec) setDurationSec(j.last.durationSec);
          } else {
            if (typeof j.last.weight === "number") setWeight(j.last.weight);
            if (j.last.reps) setReps(j.last.reps);
          }
        }
      })
      .catch(() => {})
      .finally(() => live && setPrefillDone(true));
    return () => {
      live = false;
    };
  }, [exercise, isTime]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const forExercise = sets.filter((s) => s.exercise === exercise);
  const setGroups = groupDropSets(forExercise);
  const nextLabel = nextSetLabel(forExercise, setType);
  const projected = roundE1RM(epleyE1RM(weight, Math.max(1, reps)));
  const canLog = !saving && (isTime ? durationSec >= 1 : reps >= 1);

  const log = async () => {
    if (!canLog) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        date,
        exercise,
        muscleGroup,
        mode,
        weight: mode === "weight-reps" ? weight : 0,
        reps: isTime ? 0 : reps,
        durationSec: isTime ? durationSec : null,
        setType,
        supersetGroup: superset,
      };
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        mode,
        setNumber: json.set.setNumber,
        weight: payload.weight,
        reps: payload.reps,
        durationSec: payload.durationSec,
        setType,
        supersetGroup: superset,
        e1rm: json.set.e1rm,
        isPR: json.isPR,
      });
      if (json.recordedOneRepMax) {
        setOrmFlash(true);
        setTimeout(() => setOrmFlash(false), 3200);
      } else if (json.isPR) {
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
    if (isTime) {
      if (lastHint.durationSec) setDurationSec(lastHint.durationSec);
    } else {
      setWeight(lastHint.weight);
      if (lastHint.reps) setReps(lastHint.reps);
    }
  };

  const lastHintText = lastHint
    ? isTime
      ? `↺ Last: ${formatHold(lastHint.durationSec ?? 0)} hold`
      : isReps
        ? `↺ Last: ${lastHint.reps} reps`
        : `↺ Last: ${lastHint.weight} kg × ${lastHint.reps}`
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Everything scrolls except the pinned action footer below, so the
          "Log Set" button can never be pushed off-screen on a short viewport. */}
      <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <ExerciseDemo exercise={exercise} accent={accent} />

      <AnimatePresence>
        {celebration && celebration.exercise === exercise && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-hot-green/60 bg-hot-green/10 p-3 text-center shadow-neon-green"
          >
            <DecryptedText
              text={`◆ NEW PR — ${celebration.label} ◆`}
              className="text-sm font-bold text-neon-green"
              playKey={celebration.label}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ormFlash && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-hot-purple/60 bg-hot-purple/10 p-3 text-center shadow-neon-purple"
          >
            <DecryptedText
              text={`◆ 1RM RECORDED — ${weight} KG ◆`}
              className="text-sm font-bold text-neon-purple"
              playKey={weight}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {lastHint ? (
        <button
          onClick={applyLast}
          className="self-start rounded-full border border-edge px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
        >
          {lastHintText}
        </button>
      ) : prefillDone ? (
        <span className="self-start rounded-full border border-hot-green/30 bg-hot-green/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-neon-green">
          ★ First time logging this exercise
        </span>
      ) : null}

      {isTime ? (
        <Stepper label="Hold" value={durationSec} step={5} min={0} unit={`sec · = ${formatHold(durationSec)}`} onChange={setDurationSec} onEnter={log} accent={accent} />
      ) : isReps ? (
        <Stepper label="Reps" value={reps} step={1} min={1} unit="reps · bodyweight" onChange={setReps} onEnter={log} accent={accent} />
      ) : (
        <div className="flex gap-3">
          <Stepper label="Weight" value={weight} step={2.5} min={0} unit="kg" onChange={setWeight} onEnter={log} accent={accent} decimals />
          <Stepper label="Reps" value={reps} step={1} min={1} unit="reps" onChange={setReps} onEnter={log} accent={accent} />
        </div>
      )}

      <div className="flex gap-2">
        {TAGS.map((t) => (
          <button
            key={t.id}
            data-on={setType === t.id}
            onClick={() => setSetType(t.id)}
            className={cn(
              "flex-1 rounded-lg border bg-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all data-[on=true]:scale-[1.04]",
              t.cls,
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* superset: link this set to others sharing the same label (across exercises) */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Superset</span>
        <button
          onClick={() => setSuperset(null)}
          data-on={superset === null}
          className="rounded-md border border-edge bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition-all data-[on=true]:border-zinc-300 data-[on=true]:bg-zinc-500/25 data-[on=true]:text-zinc-100 data-[on=true]:shadow-[0_0_14px_-3px_rgba(228,228,231,0.45)]"
        >
          Off
        </button>
        {SUPERSETS.map((label) => (
          <button
            key={label}
            onClick={() => setSuperset(label)}
            data-on={superset === label}
            className="h-7 w-7 rounded-md border border-hot-blue/50 bg-transparent font-mono text-[11px] font-bold text-neon-blue transition-all data-[on=true]:scale-110 data-[on=true]:border-hot-blue data-[on=true]:bg-hot-blue/25 data-[on=true]:text-white data-[on=true]:shadow-neon-blue"
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {[...setGroups]
            .reverse()
            .flatMap((g) => [
              { s: g.parent, isDrop: false, number: g.number },
              ...g.drops.map((d) => ({ s: d, isDrop: true, number: g.number })),
            ])
            .map(({ s, isDrop, number }) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "group flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs",
                  isDrop
                    ? "ml-5 border-hot-purple/25 bg-hot-purple/5"
                    : "border-edge/60 bg-panel/70",
                )}
              >
                <span className="text-zinc-500">{isDrop ? "↳" : `#${number}`}</span>
                <span className="flex-1 text-zinc-200">{describeSet(s)}</span>
                {s.supersetGroup && (
                  <span className="rounded bg-hot-blue/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-neon-blue">
                    SS {s.supersetGroup}
                  </span>
                )}
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
                  {s.mode === "weight-reps" ? `${s.e1rm} e1RM` : ""}
                </span>
                <button
                  onClick={() => del(s.id)}
                  aria-label={`delete ${isDrop ? "drop" : "set"} ${number}`}
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

      {/* Pinned action footer — the next-set summary + Log button stay put at
          the bottom of the card so they're always reachable without scrolling. */}
      <div className="shrink-0 space-y-2 border-t border-edge/60 pt-3">
        <div className="rounded-xl border border-edge bg-void/60 px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {(() => {
                const prefix = nextLabel.isDrop
                  ? `Drop of set ${nextLabel.number}`
                  : `Set ${nextLabel.number}`;
                if (isTime) return `${prefix} · hold`;
                if (isReps) return `${prefix} · bodyweight`;
                if (willRecordOneRepMax) return <span className="text-neon-purple">{prefix} · records 1RM</span>;
                return `${prefix} · Est. 1RM`;
              })()}
            </span>
            <span
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: willRecordOneRepMax ? "#a78bfa" : accent }}
            >
              {isTime ? formatHold(durationSec) : isReps ? `${reps} reps` : `${willRecordOneRepMax ? weight : projected} kg`}
            </span>
          </div>
          {isMain && mode === "weight-reps" && !willRecordOneRepMax && (
            <p className="mt-1 font-mono text-[9px] text-zinc-600">
              estimate only — log this main lift at 1 rep to record a true 1RM
            </p>
          )}
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
      </div>
    </div>
  );
}
