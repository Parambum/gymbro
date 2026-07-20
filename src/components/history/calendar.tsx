"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

function buildMonth(year: number, month: number): Cell[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // Monday-first
  const gridStart = new Date(first);
  gridStart.setUTCDate(1 - startWeekday);

  const weeks: Cell[][] = [];
  for (let w = 0; w < 6; w++) {
    const days: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(gridStart);
      cur.setUTCDate(gridStart.getUTCDate() + w * 7 + d);
      days.push({
        iso: cur.toISOString().slice(0, 10),
        day: cur.getUTCDate(),
        inMonth: cur.getUTCMonth() === month,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

/** Month calendar with dots on days that have logged workouts. */
export function Calendar({
  selected,
  onSelect,
  marked,
}: {
  selected: string;
  onSelect: (iso: string) => void;
  marked: Set<string>;
}) {
  const initial = new Date(`${selected}T00:00:00Z`);
  const [view, setView] = useState({ year: initial.getUTCFullYear(), month: initial.getUTCMonth() });
  const today = todayIso();
  const weeks = buildMonth(view.year, view.month);

  const shift = (delta: number) => {
    const m = view.month + delta;
    setView({ year: view.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="rounded-2xl border border-edge bg-panel/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} aria-label="Previous month" className="rounded-lg p-1.5 text-zinc-400 hover:bg-abyss hover:text-zinc-100">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-display text-sm font-bold uppercase tracking-widest text-zinc-100">
          {MONTHS[view.month]} {view.year}
        </span>
        <button onClick={() => shift(1)} aria-label="Next month" className="rounded-lg p-1.5 text-zinc-400 hover:bg-abyss hover:text-zinc-100">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-center font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((cell) => {
          const isSelected = cell.iso === selected;
          const isToday = cell.iso === today;
          const hasLog = marked.has(cell.iso);
          return (
            <button
              key={cell.iso}
              onClick={() => onSelect(cell.iso)}
              className={cn(
                "relative aspect-square rounded-lg font-mono text-xs transition-colors",
                cell.inMonth ? "text-zinc-300" : "text-zinc-700",
                isSelected ? "bg-hot-purple/25 text-zinc-100 ring-1 ring-hot-purple" : "hover:bg-abyss",
                isToday && !isSelected && "ring-1 ring-edge",
              )}
            >
              {cell.day}
              {hasLog && (
                <span
                  className={cn(
                    "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                    isSelected ? "bg-neon-purple" : "bg-neon-green",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
