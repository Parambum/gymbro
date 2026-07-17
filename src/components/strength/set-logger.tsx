"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSessionStore, type SetTagUI } from "@/store/session-store";
import { epleyE1RM, roundE1RM } from "@/lib/math/e1rm";
import { MagneticButton } from "@/components/reactbits/magnetic-button";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { cn } from "@/lib/utils";

const TAGS: Array<{ id: SetTagUI; label: string; className: string }> = [
  { id: "WARMUP", label: "Warmup", className: "border-zinc-600 text-zinc-400 data-[on=true]:bg-zinc-500/20" },
  { id: "WORKING", label: "Working", className: "border-hot-green/60 text-neon-green data-[on=true]:bg-hot-green/15" },
  { id: "DROP", label: "Drop", className: "border-hot-purple/60 text-neon-purple data-[on=true]:bg-hot-purple/20" },
  { id: "FAILURE", label: "Failure", className: "border-hot-crimson/60 text-neon-crimson data-[on=true]:bg-hot-crimson/15" },
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
    <div className="flex-1 rounded-xl border border-edge bg-abyss p-3">
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
 * Zero-friction set capture: Set # is automatic, weight/reps are steppers,
 * tag is one tap, LOG SET is magnetic. Every set commits locally first
 * (instant), then syncs to /api/sets; a PR response fires the decrypted
 * celebration banner.
 */
export function SetLogger({ accent }: { accent: string }) {
  const { activeExercise, sets, logSet, markPersisted, celebration, clearCelebration } =
    useSessionStore();
  const [weightKg, setWeightKg] = useState(40);
  const [reps, setReps] = useState(8);
  const [tag, setTag] = useState<SetTagUI>("WORKING");

  const exerciseSets = sets.filter((s) => s.exerciseSlug === activeExercise?.slug);
  const liveE1rm = roundE1RM(epleyE1RM(weightKg, Math.max(1, reps)));

  const handleLog = async () => {
    const entry = logSet({ weightKg, reps, tag });
    if (!entry) return;
    try {
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseSlug: entry.exerciseSlug, weightKg, reps, tag }),
      });
      const json = await res.json();
      markPersisted(entry.localId, Boolean(json?.isPR));
      if (json?.isPR) setTimeout(clearCelebration, 3200);
    } catch {
      // offline / no DB — the set stays local, which is still a logged set
      markPersisted(entry.localId, false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <AnimatePresence>
        {celebration && (
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
        <Stepper label="Weight" value={weightKg} step={2.5} min={0} unit="kg" onChange={setWeightKg} accent={accent} />
        <Stepper label="Reps" value={reps} step={1} min={1} unit="reps" onChange={setReps} accent={accent} />
      </div>

      <div className="flex gap-2">
        {TAGS.map((t) => (
          <button
            key={t.id}
            data-on={tag === t.id}
            onClick={() => setTag(t.id)}
            className={cn(
              "flex-1 rounded-lg border bg-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all",
              t.className,
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-edge bg-abyss/60 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Set {exerciseSets.length + 1} · projected e1RM
        </span>
        <span className="font-mono text-lg font-bold tabular-nums" style={{ color: accent }}>
          {liveE1rm} kg
        </span>
      </div>

      <MagneticButton onClick={handleLog} className="w-full">
        ⚡ Log Set
      </MagneticButton>

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {[...exerciseSets].reverse().map((s) => (
            <motion.li
              key={s.localId}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between rounded-lg border border-edge/60 bg-panel/70 px-3 py-2 font-mono text-xs"
            >
              <span className="text-zinc-500">#{s.setNumber}</span>
              <span className="text-zinc-200">
                {s.weightKg} kg × {s.reps}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                  s.tag === "WORKING" && "bg-hot-green/10 text-neon-green",
                  s.tag === "WARMUP" && "bg-zinc-500/10 text-zinc-400",
                  s.tag === "DROP" && "bg-hot-purple/15 text-neon-purple",
                  s.tag === "FAILURE" && "bg-hot-crimson/10 text-neon-crimson",
                )}
              >
                {s.tag}
              </span>
              <span className="tabular-nums text-zinc-400">
                {s.isPR && <span className="mr-1 text-neon-green">◆</span>}
                {s.e1rm} e1RM
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {exerciseSets.length === 0 && (
          <li className="px-3 py-6 text-center font-mono text-[11px] text-zinc-600">
            First set of the day. Make it count.
          </li>
        )}
      </ul>
    </div>
  );
}
