"use client";

import dynamic from "next/dynamic";
import { StrengthPanel } from "@/components/strength/strength-panel";
import { useAnatomyStore } from "@/store/anatomy-store";
import { MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";
import { cn } from "@/lib/utils";

// WebGL is client-only; stream the canvas in after hydration.
const AnatomyCanvas = dynamic(
  () => import("@/components/three/anatomy-canvas").then((m) => m.AnatomyCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <span className="animate-pulse-glow font-mono text-xs uppercase tracking-[0.4em] text-zinc-500">
          Materializing anatomy…
        </span>
      </div>
    ),
  },
);

export default function TrainPage() {
  const { selected, select } = useAnatomyStore();

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      {/* 3D navigation hub */}
      <section className="relative h-[45vh] min-h-[320px] flex-1 lg:h-auto" aria-label="3D anatomy navigator">
        <AnatomyCanvas className="h-full w-full" />

        {/* zone chips — keyboard/screen-reader path to the same navigation */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-center gap-1.5 bg-gradient-to-t from-void via-void/70 to-transparent p-4">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g.slug}
              onClick={() => select(g.slug)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-all",
                selected === g.slug
                  ? "border-transparent bg-panel text-zinc-100"
                  : "border-edge/80 bg-void/60 text-zinc-500 hover:text-zinc-200",
              )}
              style={
                selected === g.slug
                  ? { boxShadow: `0 0 0 1px ${g.accent}99, 0 0 16px -4px ${g.accent}` }
                  : undefined
              }
            >
              {g.name}
            </button>
          ))}
        </div>
      </section>

      {/* logging panel */}
      <aside className="w-full border-t border-edge bg-abyss/60 backdrop-blur lg:w-[420px] lg:border-l lg:border-t-0">
        <StrengthPanel />
      </aside>
    </div>
  );
}
