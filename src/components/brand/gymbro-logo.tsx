import { cn } from "@/lib/utils";

/**
 * GymBro mark — a broad-shouldered figure with a raised arm hoisting a
 * protein shaker. Body strokes use currentColor; the shaker's liquid
 * window takes `accent` so the logo picks up the app's neon.
 */
export function GymBroMark({
  className,
  accent = "#22ff88",
}: {
  className?: string;
  accent?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      {/* head */}
      <circle cx="18" cy="10" r="5" fill="currentColor" />
      {/* yoke: neck across to broad shoulders */}
      <path
        d="M7 25 C7 25 10.5 17.5 18 17.5 C25 17.5 28.5 20 31 22.5"
        stroke="currentColor"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      {/* down arm (flexed at side) */}
      <path d="M9 24 L11.5 34" stroke="currentColor" strokeWidth="4.6" strokeLinecap="round" />
      {/* torso V-taper */}
      <path
        d="M12.5 23 L15 39 L25.5 39 L27 24.5"
        stroke="currentColor"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* raised forearm reaching the shaker */}
      <path d="M31 22.5 L33.5 15" stroke="currentColor" strokeWidth="4.6" strokeLinecap="round" />
      {/* shaker body + lid + liquid window */}
      <rect x="30" y="4.5" width="9.5" height="11.5" rx="2.6" fill="currentColor" />
      <rect x="30.8" y="1.5" width="8" height="3.2" rx="1.3" fill="currentColor" />
      <rect x="32" y="9" width="5.6" height="5.4" rx="1.2" fill={accent} />
    </svg>
  );
}

/** Full lockup: mark + wordmark. */
export function GymBroLogo({
  className,
  markClassName,
  accent = "#22ff88",
}: {
  className?: string;
  markClassName?: string;
  accent?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <GymBroMark accent={accent} className={cn("h-7 w-7 text-zinc-100", markClassName)} />
      <span className="font-display text-lg font-bold uppercase tracking-[0.22em] text-zinc-100">
        Gym<span className="text-neon-green">Bro</span>
      </span>
    </span>
  );
}
