"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAnatomyStore } from "@/store/anatomy-store";
import { useSessionStore } from "@/store/session-store";
import { groupBySlug, exerciseSlug } from "@/lib/data/exercise-catalog";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { SetLogger } from "./set-logger";
import { cn } from "@/lib/utils";

/**
 * The DOM half of the strength hub. The 3D model is the navigation: the
 * selected muscle zone filters this panel to that group's 20 variations;
 * picking one opens the rapid set logger.
 */
export function StrengthPanel() {
  const selected = useAnatomyStore((s) => s.selected);
  const { activeExercise, setActiveExercise } = useSessionStore();
  const [query, setQuery] = useState("");

  const group = selected ? groupBySlug(selected) : null;

  const exercises = useMemo(() => {
    if (!group) return [];
    const q = query.trim().toLowerCase();
    return q ? group.exercises.filter((e) => e.toLowerCase().includes(q)) : group.exercises;
  }, [group, query]);

  if (!group) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="h-2 w-2 animate-pulse-glow rounded-full bg-hot-purple shadow-neon-purple" />
        <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-zinc-400">
          Select a muscle zone
        </p>
        <p className="max-w-[26ch] font-mono text-xs text-zinc-600">
          Click the model — chest, lats, quads — to load its exercise bank.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
          <DecryptedText text={group.name} playKey={group.slug} />
        </h2>
        <span
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: group.accent }}
        >
          {group.exercises.length} variations
        </span>
      </header>

      <AnimatePresence mode="wait">
        {activeExercise ? (
          <motion.div
            key={`logger-${activeExercise.slug}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <button
              onClick={() => setActiveExercise(null)}
              className="mb-3 self-start font-mono text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-200"
            >
              ← {activeExercise.name}
            </button>
            <SetLogger accent={group.accent} />
          </motion.div>
        ) : (
          <motion.div
            key={`picker-${group.slug}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${group.name.toLowerCase()}…`}
              className="w-full rounded-lg border border-edge bg-abyss px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-hot-purple focus:outline-none"
            />
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {exercises.map((name, i) => (
                <motion.li
                  key={name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <button
                    onClick={() => setActiveExercise({ slug: exerciseSlug(name), name })}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-lg border border-transparent",
                      "bg-abyss/60 px-3 py-2.5 text-left transition-all duration-150",
                      "hover:border-edge hover:bg-panel hover:pl-4",
                    )}
                  >
                    <span className="font-mono text-xs text-zinc-300 group-hover:text-zinc-100">
                      {name}
                    </span>
                    <span
                      className="opacity-0 transition-opacity group-hover:opacity-100 font-mono text-[10px]"
                      style={{ color: group.accent }}
                    >
                      LOG →
                    </span>
                  </button>
                </motion.li>
              ))}
              {exercises.length === 0 && (
                <li className="px-3 py-8 text-center font-mono text-xs text-zinc-600">
                  No match in this bank.
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
