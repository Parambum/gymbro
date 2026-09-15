"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A card that lights up under the cursor — the Aceternity card-spotlight
 * pattern, themed and trimmed.
 *
 * Implemented with CSS custom properties updated on pointer move rather than
 * React state per frame: setting state on every mousemove re-renders the whole
 * card sixty times a second, which is exactly the kind of thing that makes an
 * animated UI feel worse than a static one. The only React state here is
 * whether the pointer is inside at all.
 *
 * Falls back to a plain bordered card when the pointer is coarse (phones), and
 * under prefers-reduced-motion the glow simply never moves.
 */
export function CardSpotlight({
  children,
  className,
  radius = 320,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  radius?: number;
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      {...rest}
      onMouseMove={onMove}
      onMouseEnter={() => setLit(true)}
      onMouseLeave={() => setLit(false)}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-surface/60 transition-colors",
        lit && "border-accent/40",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
        style={{
          background: `radial-gradient(${radius}px circle at var(--spot-x, 50%) var(--spot-y, 0px), rgb(var(--accent) / 0.14), transparent 65%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
