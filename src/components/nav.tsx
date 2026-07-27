"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  Footprints,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { GymBroLogo } from "@/components/brand/gymbro-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", short: "Deck", icon: LayoutDashboard },
  { href: "/train", label: "Train", short: "Train", icon: Dumbbell },
  { href: "/cardio", label: "Cardio", short: "Cardio", icon: Footprints },
  { href: "/analytics", label: "Analytics", short: "Stats", icon: BarChart3 },
  { href: "/history", label: "History", short: "History", icon: CalendarDays },
];

type NavUser = { name?: string | null; email?: string | null; image?: string | null } | null;

/**
 * Two navigations, one source of truth.
 *
 * Below `md` the app behaves like a native mobile app: a slim top bar for
 * identity, and a fixed bottom tab bar for movement between sections. The
 * desktop inline link row is hidden there — five uppercase, wide-tracked
 * labels measured 466px, which is what was forcing every page to scroll
 * sideways on a phone.
 */
export function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname();

  // auth screens are full-bleed; no chrome
  if (pathname === "/login" || pathname === "/signup") return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* ── top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-edge/70 bg-void/80 backdrop-blur-md">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4">
          <Link
            href={user ? "/dashboard" : "/"}
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            <GymBroLogo />
          </Link>

          {user ? (
            <div className="flex min-w-0 items-center gap-1">
              {/* desktop-only inline links */}
              <div className="hidden items-center gap-1 md:flex">
                {LINKS.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "relative rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors",
                        active ? "text-neon-green" : "text-zinc-500 hover:text-zinc-200",
                      )}
                    >
                      {link.label}
                      {active && (
                        <span className="absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-hot-green to-transparent" />
                      )}
                    </Link>
                  );
                })}
              </div>

              <div className="flex min-w-0 items-center gap-2 border-edge pl-1 md:ml-2 md:border-l md:pl-3">
                <span className="hidden min-w-0 truncate font-mono text-[11px] text-zinc-400 sm:inline">
                  {user.name ?? user.email}
                </span>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  aria-label="Sign out"
                  className="-mr-1.5 shrink-0 rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-panel hover:text-neon-crimson md:p-1.5"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-100"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg border border-hot-green/50 bg-hot-green/10 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20"
              >
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </header>

      {/* ── mobile bottom tab bar ───────────────────────────────── */}
      {user && (
        <nav
          aria-label="Primary"
          className="pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-edge/70 bg-void/95 backdrop-blur-md md:hidden"
        >
          <div className="flex items-stretch justify-around">
            {LINKS.map((link) => {
              const active = isActive(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // 56px min height keeps every tab a comfortable thumb target
                    "relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                    active ? "text-neon-green" : "text-zinc-500 active:text-zinc-300",
                  )}
                >
                  {active && (
                    <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-hot-green to-transparent" />
                  )}
                  <Icon className={cn("h-[18px] w-[18px]", active && "drop-shadow-[0_0_6px_rgba(34,255,136,0.6)]")} />
                  <span className="font-mono text-[9px] uppercase tracking-wider">{link.short}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
