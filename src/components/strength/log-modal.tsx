"use client";

import { ArrowLeft } from "lucide-react";
import { useAnatomyStore } from "@/store/anatomy-store";
import { useSessionStore } from "@/store/session-store";
import { groupBySlug } from "@/lib/data/exercise-catalog";
import { AnimatedModal } from "@/components/ui/animated-modal";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { ExercisePicker } from "./exercise-picker";
import { SetForm } from "./set-form";

/**
 * The click-to-log surface. Opens whenever a muscle zone is selected on the
 * 3D model (anatomy-store.selected), filtered to that muscle. Pick an
 * exercise → log sets; closing clears the selection (camera returns home).
 */
export function LogModal() {
  const selected = useAnatomyStore((s) => s.selected);
  const clearSelection = useAnatomyStore((s) => s.clearSelection);
  const { activeExercise, setActiveExercise, reset } = useSessionStore();

  const group = selected ? groupBySlug(selected) : null;
  const accent = group?.accent ?? "#7c3aed";

  const close = () => {
    clearSelection();
    reset();
  };

  return (
    <AnimatedModal open={!!group} onClose={close} accent={accent}>
      {group && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 pt-12">
          <header className="flex items-baseline justify-between">
            <h2 className="font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
              <DecryptedText text={group.name} playKey={group.slug} />
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: accent }}>
              {activeExercise ? "Logging" : `${group.exercises.length}+ exercises`}
            </span>
          </header>

          {activeExercise ? (
            <>
              <button
                onClick={() => setActiveExercise(null)}
                className="flex items-center gap-1.5 self-start font-mono text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> {activeExercise.name}
              </button>
              <SetForm exercise={activeExercise.name} muscleGroup={group.slug} accent={accent} />
            </>
          ) : (
            <ExercisePicker
              muscle={group.slug}
              accent={accent}
              onSelect={(name) => setActiveExercise({ name, muscleGroup: group.slug })}
            />
          )}
        </div>
      )}
    </AnimatedModal>
  );
}
