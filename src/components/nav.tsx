"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { GymBroLogo } from "@/components/brand/gymbro-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/train", label: "Train" },
  { href: "/analytics", label: "Analytics" },
  { href: "/history", label: "History" },
];

type NavUser = { name?: string | null; email?: string | null; image?: string | null } | null;

export function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname();

  // auth screens are full-bleed; no chrome
  if (pathname === "/login" || pathname === "/signup") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-edge/70 bg-void/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href={user ? "/dashboard" : "/"} className="transition-opacity hover:opacity-80">
          <GymBroLogo />
        </Link>

        {user ? (
          <div className="flex items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
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
            <div className="ml-2 flex items-center gap-2 border-l border-edge pl-3">
              <span className="hidden font-mono text-[11px] text-zinc-400 sm:inline">
                {user.name ?? user.email}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                aria-label="Sign out"
                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-panel hover:text-neon-crimson"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg border border-hot-green/50 bg-hot-green/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-neon-green transition-colors hover:bg-hot-green/20"
            >
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
