"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/train", label: "Train" },
  { href: "/cardio", label: "Cardio" },
  { href: "/analytics", label: "Analytics" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-edge/70 bg-void/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-hot-purple shadow-neon-purple transition-transform group-hover:rotate-45" />
          <span className="font-display text-sm font-bold uppercase tracking-[0.25em] text-zinc-100">
            Progress-O-Meter
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors",
                  active ? "text-neon-purple" : "text-zinc-500 hover:text-zinc-200",
                )}
              >
                {link.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-hot-purple to-transparent" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
