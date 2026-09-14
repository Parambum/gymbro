"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * The error boundary around the whole Fuel module (§9).
 *
 * Next.js scopes this to the /fuel segment, which is the point: whatever goes
 * wrong in nutrition, the strength tracker keeps working and the user is one
 * tap from it. No stack traces, no apology theatre — say what happened and
 * offer the two useful doors.
 */
export default function FuelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <AlertTriangle className="h-9 w-9 text-neon-amber" />
      <h1 className="mt-4 font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
        Fuel hit a snag
      </h1>
      <p className="mt-2 max-w-sm font-mono text-xs leading-relaxed text-zinc-500">
        Your logs are safe — this is the screen failing, not your data. Your training
        tracker is unaffected.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="min-h-[44px] rounded-xl border border-hot-green bg-hot-green/10 px-5 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="min-h-[44px] rounded-xl border border-edge px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Back to the deck
        </Link>
      </div>
    </div>
  );
}
