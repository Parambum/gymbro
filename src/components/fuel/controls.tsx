"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The Fuel form primitives.
 *
 * Nothing new is invented here: the panel/edge/void surfaces, the mono
 * micro-labels and the neon accents all come from the tokens the strength
 * module already uses, so a user cannot tell which part of the app was built
 * later. What these add is the mobile-first behaviour §9 asks for — 44 px
 * minimum targets, a numeric keypad on every number, visible focus rings.
 */

const NO_SPIN =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-edge bg-panel/40 p-4">
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
        {title}
      </h2>
      {hint && <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A number input with a text buffer, so typing "62.5" isn't mangled by the
 * numeric parse mid-keystroke — the same approach the set logger uses.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  decimals = false,
  error,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  decimals?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));

  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "");
    setText(cleaned);
    if (cleaned === "" || cleaned === ".") return; // let them clear it mid-edit
    const n = Number(cleaned);
    if (Number.isFinite(n)) onChange(n);
  };

  const nudge = (delta: number) => {
    const next = Math.min(max, Math.max(min, Number((value + delta).toFixed(decimals ? 1 : 0))));
    onChange(next);
    setText(String(next));
  };

  return (
    <div>
      <label
        htmlFor={id}
        className="font-mono text-[10px] uppercase tracking-widest text-zinc-500"
      >
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => nudge(-step)}
          aria-label={`Decrease ${label}`}
          className="h-11 w-11 shrink-0 rounded-xl border border-edge bg-void font-mono text-lg text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        >
          −
        </button>
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            inputMode={decimals ? "decimal" : "numeric"}
            value={text}
            onChange={(e) => commit(e.target.value)}
            onBlur={() => {
              const n = Number(text);
              const safe = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
              onChange(safe);
              setText(String(safe));
            }}
            aria-invalid={Boolean(error)}
            className={cn(
              NO_SPIN,
              "h-11 w-full rounded-xl border bg-void px-3 text-center font-display text-lg text-zinc-100 transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green",
              error ? "border-hot-crimson/70" : "border-edge",
            )}
          />
          {unit && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => nudge(step)}
          aria-label={`Increase ${label}`}
          className="h-11 w-11 shrink-0 rounded-xl border border-edge bg-void font-mono text-lg text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
        >
          +
        </button>
      </div>
      {error && <p className="mt-1.5 font-mono text-[11px] text-neon-crimson">{error}</p>}
    </div>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  blurb?: string;
}

/**
 * A radio group that looks like the app's chips. `aria-pressed` plus a border
 * change means the selection is never signalled by colour alone (§9).
 */
export function ChoiceGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: ReadonlyArray<Choice<T>>;
  value: T;
  onChange: (v: T) => void;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset>
      <legend className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </legend>
      <div
        className={cn(
          "mt-2 grid gap-2",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-3",
        )}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={cn(
                "min-h-[44px] rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green",
                on
                  ? "border-hot-green bg-hot-green/10 text-neon-green"
                  : "border-edge bg-void text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              )}
            >
              <span className="block font-display text-sm font-bold">{o.label}</span>
              {o.blurb && (
                <span className="mt-0.5 block font-mono text-[10px] leading-snug text-zinc-500">
                  {o.blurb}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A labelled on/off switch for the settings screen. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full min-h-[44px] items-center justify-between gap-4 rounded-xl border border-edge bg-void px-3 py-2.5 text-left transition-colors hover:border-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green"
    >
      <span className="min-w-0">
        <span className="block font-display text-sm text-zinc-100">{label}</span>
        {hint && (
          <span className="mt-0.5 block font-mono text-[10px] leading-snug text-zinc-500">
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-hot-green bg-hot-green/30" : "border-edge bg-panel",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
            checked ? "left-6 bg-neon-green" : "left-1 bg-zinc-600",
          )}
        />
      </span>
    </button>
  );
}

/** A date input that keeps the app's surface instead of the browser's. */
export function DateField({
  label,
  value,
  onChange,
  max,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        className={cn(
          "mt-1.5 h-11 w-full rounded-xl border bg-void px-3 font-display text-base text-zinc-100 [color-scheme:dark] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green",
          error ? "border-hot-crimson/70" : "border-edge",
        )}
      />
      {error && <p className="mt-1.5 font-mono text-[11px] text-neon-crimson">{error}</p>}
    </div>
  );
}
