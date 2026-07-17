import Link from "next/link";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { DecryptedText } from "@/components/reactbits/decrypted-text";
import { TOTAL_EXERCISES, MUSCLE_GROUPS } from "@/lib/data/exercise-catalog";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center overflow-hidden bg-void px-4">
      <BackgroundBeams />

      <div className="relative z-10 flex max-w-3xl flex-col items-center text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.5em] text-neon-blue">
          Strength × Endurance Telemetry
        </p>

        <h1 className="mt-4 font-display text-5xl font-bold uppercase tracking-tight text-zinc-50 md:text-7xl">
          <DecryptedText text="PROGRESS-O-METER" speed={34} />
        </h1>

        <p className="mt-6 max-w-xl font-mono text-sm leading-relaxed text-zinc-400">
          FitNotes-grade set logging fused with Strava-grade cardio telemetry.
          A 3D anatomy hub for navigation, an e1RM engine that sees volume
          overload as the progress it is, and charts that glow.
        </p>

        <div className="mt-10">
          <HoverBorderGradient
            as="div"
            containerClassName="rounded-full"
            className="cursor-pointer bg-void px-0 py-0"
          >
            <Link
              href="/dashboard"
              className="block px-8 py-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-zinc-100"
            >
              Enter the grid →
            </Link>
          </HoverBorderGradient>
        </div>

        <dl className="mt-16 grid grid-cols-3 gap-8 border-t border-edge/60 pt-8">
          {[
            { value: String(TOTAL_EXERCISES), label: "Seeded exercises" },
            { value: String(MUSCLE_GROUPS.length), label: "3D muscle zones" },
            { value: "e1RM", label: "Epley progression engine" },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="sr-only">{stat.label}</dt>
              <dd className="font-mono text-2xl font-bold text-neon-purple">{stat.value}</dd>
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
