import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for the terms and privacy pages.
 *
 * These are read on a phone, usually once, usually because someone is deciding
 * whether to trust the app with what they eat and what they weigh. So the
 * measure is narrow, the type is the body face rather than the display one,
 * and none of the uppercase wide-tracked styling used everywhere else appears
 * here — it is handsome in a dashboard and exhausting in a paragraph.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-bg px-5 py-12">
      <article className="mx-auto w-full max-w-2xl">
        <header className="mb-10 border-b border-border pb-6">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-faint">
            Last updated {updated}
          </p>
        </header>

        <div className="space-y-8 text-[15px] leading-relaxed text-muted">{children}</div>

        <footer className="mt-14 border-t border-border pt-6">
          <nav className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-widest">
            <Link href="/terms" className="text-faint transition-colors hover:text-accent">
              Terms
            </Link>
            <Link href="/privacy" className="text-faint transition-colors hover:text-accent">
              Privacy
            </Link>
            <Link href="/" className="text-faint transition-colors hover:text-accent">
              Home
            </Link>
          </nav>
        </footer>
      </article>
    </div>
  );
}

/** A numbered section. The heading carries the weight; the body stays quiet. */
export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-bold text-ink">
        <span className="mr-2 text-accent tabular-nums">{n}.</span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * The one box on the page that is allowed to shout.
 *
 * A nutrition and training app that sets calorie targets has exactly one
 * paragraph that matters more than the rest, and burying it in a numbered list
 * is how it gets missed.
 */
export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="rounded-xl border border-accent/40 bg-accent/[0.06] p-5">
      <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-widest text-accent">
        {title}
      </p>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink/90">{children}</div>
    </aside>
  );
}
