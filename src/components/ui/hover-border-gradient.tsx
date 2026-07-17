"use client";

import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type Direction = "TOP" | "LEFT" | "BOTTOM" | "RIGHT";

const GRADIENTS: Record<Direction, string> = {
  TOP: "radial-gradient(20.7% 50% at 50% 0%, hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)",
  LEFT: "radial-gradient(16.6% 43.1% at 0% 50%, hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)",
  BOTTOM: "radial-gradient(20.7% 50% at 50% 100%, hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)",
  RIGHT: "radial-gradient(16.2% 41.2% at 100% 50%, hsl(0,0%,100%) 0%, rgba(255,255,255,0) 100%)",
};

const HIGHLIGHT =
  "radial-gradient(75% 181% at 50% 50%, #7c3aed 0%, rgba(255,255,255,0) 100%)";

const ROTATION: Direction[] = ["TOP", "LEFT", "BOTTOM", "RIGHT"];

/**
 * Aceternity-style Hover Border Gradient — a spark of light orbits the
 * border; on hover the whole ring ignites.
 */
export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = "button",
  duration = 1,
  clockwise = true,
  ...props
}: {
  children: ReactNode;
  containerClassName?: string;
  className?: string;
  as?: ElementType;
  duration?: number;
  clockwise?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<Direction>("TOP");
  // polymorphic `as` + strict JSX inference don't mix; HTMLAttributes
  // (which includes children) is the real contract for every valid Tag
  const Comp = Tag as React.FC<React.HTMLAttributes<HTMLElement>>;

  useEffect(() => {
    if (hovered) return;
    const interval = setInterval(() => {
      setDirection((prev) => {
        const idx = ROTATION.indexOf(prev);
        const next = clockwise
          ? (idx - 1 + ROTATION.length) % ROTATION.length
          : (idx + 1) % ROTATION.length;
        return ROTATION[next];
      });
    }, duration * 1000);
    return () => clearInterval(interval);
  }, [hovered, duration, clockwise]);

  return (
    <Comp
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex h-min w-fit flex-col flex-nowrap content-center items-center justify-center gap-10 overflow-visible rounded-full border border-edge bg-black/40 p-px decoration-clone transition duration-500 hover:bg-black/10",
        containerClassName,
      )}
      {...props}
    >
      <div className={cn("z-10 w-auto rounded-[inherit] bg-void px-5 py-2.5 text-zinc-100", className)}>
        {children}
      </div>
      <motion.div
        className="absolute inset-0 z-0 flex-none overflow-hidden rounded-[inherit]"
        style={{ filter: "blur(2px)", width: "100%", height: "100%" }}
        initial={{ background: GRADIENTS[direction] }}
        animate={{ background: hovered ? [GRADIENTS[direction], HIGHLIGHT] : GRADIENTS[direction] }}
        transition={{ ease: "linear", duration }}
      />
      <div className="absolute inset-[2px] z-[1] flex-none rounded-[100px] bg-void" />
    </Comp>
  );
}
