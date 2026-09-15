"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Aceternity meteors, themed and made deterministic.
 *
 * The original randomises position and timing on every render, which in React
 * means the shower reshuffles whenever the parent re-renders and, under SSR,
 * produces a hydration mismatch. Seeding from the index gives the same
 * scattered look with neither problem.
 *
 * Hidden entirely under prefers-reduced-motion: this is pure decoration, and
 * the honest response to "less motion" is none rather than slower.
 */
export function Meteors({ count = 14, className }: { count?: number; className?: string }) {
  const meteors = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Cheap deterministic scatter — no Math.random, no hydration mismatch.
        const spread = (i * 37) % 100;
        const delay = ((i * 13) % 50) / 10;
        const duration = 4 + ((i * 7) % 6);
        return { left: `${spread}%`, delay: `${delay}s`, duration: `${duration}s` };
      }),
    [count],
  );

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden",
        className,
      )}
    >
      {meteors.map((m, i) => (
        <span
          key={i}
          className="absolute top-0 h-0.5 w-0.5 rotate-[215deg] rounded-full bg-accent shadow-[0_0_0_1px_rgb(var(--accent)/0.1)]"
          style={{
            left: m.left,
            animation: `meteor ${m.duration} linear ${m.delay} infinite`,
          }}
        >
          <span className="absolute top-1/2 h-px w-[60px] -translate-y-1/2 bg-gradient-to-r from-accent to-transparent" />
        </span>
      ))}
    </div>
  );
}
