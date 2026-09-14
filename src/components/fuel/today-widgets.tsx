"use client";

import { Droplet, Dumbbell, Minus } from "lucide-react";
import { progressFraction } from "@/lib/fuel/targets";
import type { MacroTotals } from "@/lib/fuel/types";
import { cn } from "@/lib/utils";

/**
 * The Today hero widgets.
 *
 * The colour rules here are a product requirement, not decoration (§5.6):
 * going over a target renders amber and neutral, never red and never with an
 * exclamation mark. "Over budget!" is a punishment state and this app does not
 * have one. Amber also never carries meaning alone — the number underneath
 * says "220 over" in words.
 */

const RING_SIZE = 200;
const RING_STROKE = 14;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CalorieRing({
  consumed,
  target,
  eyesOff,
}: {
  consumed: number;
  target: number | null;
  eyesOff: boolean;
}) {
  const fraction = target ? progressFraction(consumed, target) : 0;
  const over = target != null && consumed > target;
  const remaining = target != null ? Math.round(target - consumed) : null;

  // The arc stops at a full turn; the overage is reported in the label rather
  // than by a ring that wraps around and lies about where you are.
  const drawn = Math.min(fraction, 1);
  const stroke = over ? "#fbbf24" : "#4ade80";

  return (
    <div className="relative mx-auto" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#1e1e33"
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - drawn)}
          style={{ transition: "stroke-dashoffset 420ms ease-out, stroke 200ms linear" }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {eyesOff ? (
          <>
            <span className="font-display text-2xl font-bold text-zinc-300">Logged</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              eyes-off mode
            </span>
          </>
        ) : target == null ? (
          <>
            <span className="font-display text-4xl font-bold text-zinc-100">{Math.round(consumed)}</span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              kcal logged
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                "font-display text-5xl font-bold tabular-nums",
                over ? "text-neon-amber" : "text-neon-green",
              )}
            >
              {Math.abs(remaining!)}
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {over ? "kcal over" : "kcal left"}
            </span>
            <span className="mt-2 font-mono text-[10px] text-zinc-600">
              {Math.round(consumed)} / {target}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

interface MacroBarProps {
  label: string;
  consumed: number;
  target: number | null;
  colour: string;
  hidden?: boolean;
}

function MacroBar({ label, consumed, target, colour, hidden }: MacroBarProps) {
  const fraction = target ? Math.min(progressFraction(consumed, target), 1) : 0;
  const over = target != null && consumed > target;

  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest">
        <span className="text-zinc-500">{label}</span>
        <span className={cn("tabular-nums", over ? "text-neon-amber" : "text-zinc-400")}>
          {hidden ? "—" : target ? `${Math.round(consumed)} / ${target} g` : `${Math.round(consumed)} g`}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-edge">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${fraction * 100}%`, backgroundColor: over ? "#fbbf24" : colour }}
        />
      </div>
    </div>
  );
}

/**
 * Protein stays visible in eyes-off mode. That is the point of the setting:
 * someone who should not be counting calories can still make sure they are
 * eating enough protein to keep the muscle they are training for.
 */
export function MacroBars({
  consumed,
  target,
  eyesOff,
}: {
  consumed: MacroTotals;
  target: { proteinG: number; carbsG: number; fatG: number } | null;
  eyesOff: boolean;
}) {
  return (
    <div className="space-y-3">
      <MacroBar label="Protein" consumed={consumed.proteinG} target={target?.proteinG ?? null} colour="#4ade80" />
      <MacroBar
        label="Carbs"
        consumed={consumed.carbsG}
        target={target?.carbsG ?? null}
        colour="#38bdf8"
        hidden={eyesOff}
      />
      <MacroBar
        label="Fat"
        consumed={consumed.fatG}
        target={target?.fatG ?? null}
        colour="#fbbf24"
        hidden={eyesOff}
      />
    </div>
  );
}

export function WaterRow({
  ml,
  targetMl,
  glassMl,
  trained,
  onAdd,
  onRemove,
}: {
  ml: number;
  targetMl: number | null;
  glassMl: number;
  trained: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const glasses = Math.round(ml / glassMl);
  const targetGlasses = targetMl ? Math.ceil(targetMl / glassMl) : 8;
  const shown = Math.max(targetGlasses, glasses);

  return (
    <div className="rounded-2xl border border-edge bg-panel/40 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
          Water
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest tabular-nums text-zinc-500">
          {(ml / 1000).toFixed(2)} L{targetMl ? ` / ${(targetMl / 1000).toFixed(1)} L` : ""}
        </span>
      </div>

      {trained && (
        <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-neon-blue">
          <Dumbbell className="h-3 w-3" /> +500 ml — you trained today
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: Math.min(shown, 16) }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={onAdd}
            aria-label={`Log glass ${i + 1}`}
            className={cn(
              "flex h-11 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green",
              i < glasses
                ? "border-hot-blue/60 bg-hot-blue/15 text-neon-blue"
                : "border-edge bg-void text-zinc-700 hover:border-zinc-600",
            )}
          >
            <Droplet className={cn("h-4 w-4", i < glasses && "fill-current")} />
          </button>
        ))}
        {glasses > 0 && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Undo last glass"
            className="flex h-11 w-9 items-center justify-center rounded-lg border border-edge bg-void text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
          >
            <Minus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
