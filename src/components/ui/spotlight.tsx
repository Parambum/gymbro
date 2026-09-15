"use client";

import { cn } from "@/lib/utils";

/**
 * Aceternity-style spotlight — a soft conic wash that makes a dark hero feel
 * lit rather than merely dark.
 *
 * Rewritten against the theme variables instead of a hardcoded white: on the
 * Molten theme this reads as ember light spilling across graphite, and it
 * retones with everything else. Pure CSS/SVG, no JS, no scroll listener.
 */
export function Spotlight({
  className,
  fill = "accent",
}: {
  className?: string;
  fill?: "accent" | "accent-2" | "ink";
}) {
  const colour = `rgb(var(--${fill}))`;

  return (
    <svg
      className={cn(
        "pointer-events-none absolute z-0 h-[169%] w-[138%] animate-pulse-glow opacity-40 lg:w-[84%]",
        className,
      )}
      viewBox="0 0 3787 2842"
      fill="none"
      aria-hidden
    >
      <g filter="url(#spotlight-blur)">
        <ellipse
          cx="1924.71"
          cy="273.501"
          rx="1924.71"
          ry="273.501"
          transform="matrix(-0.822377 -0.568943 -0.568943 0.822377 3631.88 2291.09)"
          fill={colour}
          fillOpacity="0.18"
        />
      </g>
      <defs>
        <filter
          id="spotlight-blur"
          x="0.860352"
          y="0.838989"
          width="3785.16"
          height="2840.26"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="151" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );
}
