import Link from "next/link";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { GymBroMark } from "@/components/brand/gymbro-logo";
import { TOTAL_EXERCISES, MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  const primaryHref = session?.user ? "/dashboard" : "/signup";
  const primaryLabel = session?.user ? "Enter the gym →" : "Start training →";

  return (
    <div className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden bg-void px-4">
      <BackgroundBeams />

      <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
        <GymBroMark className="mb-6 h-16 w-16 text-zinc-100" accent="#22ff88" />

        <p className="font-mono text-[11px] uppercase tracking-[0.5em] text-neon-green">
          Serious tool for serious progression
        </p>

        <h1 className="mt-4 font-display text-6xl font-bold uppercase tracking-tight text-zinc-50 md:text-8xl">
          <DecryptedText text="GYMBRO" speed={40} />
        </h1>

        <p className="mt-6 max-w-xl font-mono text-sm leading-relaxed text-zinc-400">
          Click a muscle on a 3D anatomy model to log it. Build your own
          exercises. Watch true progression unfold through Epley e1RM — because
          30&nbsp;kg for 14&nbsp;reps beats 30&nbsp;kg for 10, and your charts
          should prove it.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <HoverBorderGradient as="div" containerClassName="rounded-full" className="p-0">
            <Link
              href={primaryHref}
              className="block px-8 py-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-zinc-100"
            >
              {primaryLabel}
            </Link>
          </HoverBorderGradient>
          {!session?.user && (
            <Link
              href="/login"
              className="rounded-full px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Log in
            </Link>
          )}
        </div>

        <dl className="mt-16 grid grid-cols-3 gap-8 border-t border-edge/60 pt-8">
          {[
            { value: String(MUSCLE_GROUPS.length), label: "Clickable muscle zones" },
            { value: `${TOTAL_EXERCISES}+`, label: "Base exercises + your own" },
            { value: "e1RM", label: "Epley progression engine" },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-mono text-2xl font-bold text-neon-green">{stat.value}</dd>
              <dd className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                {stat.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
