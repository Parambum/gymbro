"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * ReactBits-style Magnetic Button — leans toward the pointer with spring
 * physics. The primary rapid-log trigger: big target, instant feedback.
 */
export function MagneticButton({
  children,
  className,
  strength = 0.35,
  ...props
}: {
  children: ReactNode;
  className?: string;
  /** 0..1 — how far the button chases the pointer */
  strength?: number;
} & Omit<HTMLMotionProps<"button">, "children" | "className">) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 260, damping: 18, mass: 0.6 });
  const springY = useSpring(y, { stiffness: 260, damping: 18, mass: 0.6 });

  const handleMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      style={{ x: springX, y: springY }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        "relative select-none rounded-xl px-6 py-3 font-display text-sm font-bold uppercase tracking-widest",
        "border border-hot-green/50 bg-hot-green/10 text-neon-green",
        "shadow-neon-green transition-colors duration-200",
        "hover:bg-hot-green/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon-green",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
