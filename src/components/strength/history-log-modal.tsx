"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { MUSCLE_GROUPS, groupBySlug } from "@/lib/data/exercise-catalog";
import { useSessionStore } from "@/store/session-store";
import { AnimatedModal } from "@/components/ui/animated-modal";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { prettyDate } from "@/lib/date-utils";
import { ExercisePicker } from "./exercise-picker";
import { SetForm } from "./set-form";

/**
 * Backfill a day you forgot to log, opened from History.
 *
 * Same pick-a-muscle → pick-an-exercise → log-sets flow as the 3D hub's
 * LogModal, but there's no 3D model here, so step one is a plain muscle grid —
 * and, crucially, every set is written to `date` (the day being viewed) instead
 * of today. The History view is refreshed on close so newly added sets and the
 * calendar dot appear immediately.
 */
export function HistoryLogModal({
  open,
  date,
  onClose,
  onChanged,
}: {
  open: boolean;
  date: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [muscle, setMuscle] = useState<string | null>(null);
  const { activeExercise, setActiveExercise, reset } = useSessionStore();

  // Start each backfill session clean: the session store's running list is
  // shared with the 3D hub, so without this a set logged earlier today would
  // bleed into the past-day form's list.
  useEffect(() => {
    if (open) {
      reset();
      setMuscle(null);
    }
  }, [open, reset]);

  const group = muscle ? groupBySlug(muscle) : null;
  const accent = group?.accent ?? "#7c3aed";

  const close = () => {
    reset();
    setMuscle(null);
    onChanged(); // surface whatever was added into the day view + calendar
    onClose();
  };

  const backBtn =
    "flex items-center gap-1.5 self-start font-mono text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200";

  return (
    <AnimatedModal open={open} onClose={close} accent={accent}>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 pt-12">
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
            {group ? (
              <DecryptedText text={group.name} playKey={group.slug} />
            ) : (
              "Log a set"
            )}
          </h2>
          <span
            className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest"
            style={{ borderColor: `${accent}55`, color: accent }}
          >
            {prettyDate(date)}
          </span>
        </header>

        {!group ? (
          <MusclePicker onPick={setMuscle} />
        ) : activeExercise ? (
          <>
            <button onClick={() => setActiveExercise(null)} className={backBtn}>
              <ArrowLeft className="h-3.5 w-3.5" /> {activeExercise.name}
            </button>
            <SetForm
              exercise={activeExercise.name}
              muscleGroup={group.slug}
              accent={accent}
              date={date}
            />
          </>
        ) : (
          <>
            <button onClick={() => setMuscle(null)} className={backBtn}>
              <ArrowLeft className="h-3.5 w-3.5" /> Muscle groups
            </button>
            <ExercisePicker
              muscle={group.slug}
              accent={accent}
              onSelect={(name) => setActiveExercise({ name, muscleGroup: group.slug })}
            />
          </>
        )}
      </div>
    </AnimatedModal>
  );
}

/** Step one: a grid of muscle groups, colour-keyed to each zone's accent. */
function MusclePicker({ onPick }: { onPick: (slug: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="font-mono text-[11px] text-zinc-500">Which muscle did you train?</p>
      <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {MUSCLE_GROUPS.map((g) => (
          <button
            key={g.slug}
            onClick={() => onPick(g.slug)}
            className="group flex flex-col items-start gap-1 rounded-xl border border-edge bg-void/60 px-3 py-3 text-left transition-all hover:bg-panel"
            style={{ borderColor: `${g.accent}33` }}
          >
            <span
              className="h-2 w-2 rounded-full transition-transform group-hover:scale-125"
              style={{ backgroundColor: g.accent, boxShadow: `0 0 10px ${g.accent}` }}
            />
            <span className="font-mono text-xs text-zinc-300 group-hover:text-zinc-100">
              {g.name}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              {g.exercises.length} exercises
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
