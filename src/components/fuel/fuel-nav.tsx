"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChefHat, ClipboardList, LineChart, Target } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Plan lives here rather than in the main nav: the app nav is already at six
 * tabs, and a seventh puts each one under 55px at 390px — below a comfortable
 * thumb target. The plan is also a starting point rather than a daily
 * destination, so it belongs one level in.
 */
const TABS = [
  { href: "/fuel", label: "Today", icon: CalendarDays },
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/fuel/progress", label: "Progress", icon: LineChart },
  { href: "/fuel/foods", label: "Foods", icon: ChefHat },
  { href: "/fuel/profile", label: "Targets", icon: Target },
];

/**
 * Section nav inside Fuel.
 *
 * Deliberately *not* three more entries in the app's main nav — §10 says add
 * one tab and don't restructure what's there. Six bottom tabs at 390 px is
 * already the ceiling; nine would be unusable.
 *
 * Hidden during onboarding: a setup flow with an escape hatch to two screens
 * that need the setup to be finished is just a way to get stuck.
 */
export function FuelNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/fuel/onboarding")) return null;

  return (
    <nav aria-label="Fuel sections" className="mx-auto w-full max-w-lg px-4 pt-4">
      <div className="flex gap-1 rounded-xl border border-edge bg-panel/40 p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // Stacked below sm, inline above. Five tabs of icon-then-label
                // need about 76px each; a 360px phone gives 61px, so the row
                // was overflowing its own container. Stacking puts the label on
                // its own line, which fits, and matches the bottom tab bar.
                "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hot-green sm:min-h-[40px] sm:flex-row sm:gap-1.5 sm:tracking-widest",
                active
                  ? "bg-hot-green/10 text-neon-green"
                  : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
