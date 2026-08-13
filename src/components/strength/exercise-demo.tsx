"use client";

import { useEffect, useState } from "react";
import { exerciseDemo, DEMO_CDN } from "@/lib/data/exercise-demos";
import { cn } from "@/lib/utils";

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Exercise demonstration for the logging card. The free-exercise-db ships a
 * start + end frame per movement; we cross-fade between them on a loop to
 * approximate the motion. Images lazy-load from a public CDN (no key), and
 * the primary/secondary muscles double as a lightweight targeting readout.
 * Falls back to a clean placeholder when an exercise has no match.
 */
export function ExerciseDemo({ exercise, accent }: { exercise: string; accent: string }) {
  const demo = exerciseDemo(exercise);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    if (!demo || demo.images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setFrame((f) => (f === 0 ? 1 : 0)), 950);
    return () => clearInterval(id);
  }, [demo, exercise]);

  if (!demo) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-edge bg-void">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          No demo for this exercise
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative h-44 overflow-hidden rounded-xl border border-edge bg-white/[0.04]">
        {demo.images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img}
            src={DEMO_CDN + img}
            alt={`${exercise} demonstration, frame ${i + 1}`}
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition-opacity duration-500",
              demo.images.length < 2 || frame === i ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
        <span className="absolute bottom-1.5 right-2 rounded bg-void/85 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-400">
          demo
        </span>
      </div>

      {(demo.primary.length > 0 || demo.secondary.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">Targets</span>
          {demo.primary.map((m) => (
            <span
              key={`p-${m}`}
              className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
              style={{ borderColor: `${accent}66`, color: accent }}
            >
              {cap(m)}
            </span>
          ))}
          {demo.secondary.map((m) => (
            <span
              key={`s-${m}`}
              className="rounded-full border border-edge px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500"
            >
              {cap(m)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
