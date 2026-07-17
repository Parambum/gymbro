"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Canvas-card-effect style interactive card: a mouse-tracked spotlight
 * plus a rim glow whose strength scales with `intensity` (0..1).
 * Workout-history cards pass their session's relative intensity here —
 * harder sessions literally glow hotter.
 */
export function GlowCard({
  children,
  className,
  accent = "#7c3aed",
  intensity = 0.5,
}: {
  children: ReactNode;
  className?: string;
  /** hex glow color (UI accent, not a chart mark) */
  accent?: string;
  /** 0..1 — drives resting rim-glow strength */
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ x: 50, y: 50, active: false });

  const clamped = Math.min(1, Math.max(0, intensity));
  const rimAlpha = 0.12 + clamped * 0.45;
  const spotAlpha = spot.active ? 0.14 : 0;

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setSpot({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
          active: true,
        });
      }}
      onMouseLeave={() => setSpot((s) => ({ ...s, active: false }))}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-panel/80 transition-shadow duration-500",
        className,
      )}
      style={{
        borderColor: `${accent}44`,
        boxShadow: `0 0 ${12 + clamped * 28}px -8px ${accent}${Math.round(rimAlpha * 255)
          .toString(16)
          .padStart(2, "0")}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: spotAlpha > 0 ? 1 : 0,
          background: `radial-gradient(280px circle at ${spot.x}% ${spot.y}%, ${accent}24, transparent 65%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
