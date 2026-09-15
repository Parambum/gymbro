"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Camera, Dumbbell, Flame, LineChart, ScanLine, Sparkles } from "lucide-react";
import { GymBroMark } from "@/components/brand/gymbro-logo";
import { ThemePicker } from "@/components/theme-picker";
import { Spotlight } from "@/components/ui/spotlight";
import { CardSpotlight } from "@/components/ui/card-spotlight";
import { TextGenerateEffect } from "@/components/ui/text-generate-effect";
import { Meteors } from "@/components/ui/meteors";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * The landing page.
 *
 * This is the one surface that earns heavy scroll choreography: it is read
 * once, at leisure, usually on a desktop, by someone deciding whether to sign
 * up. The signed-in app deliberately does not animate like this — the food
 * logger is opened four times a day, one-handed, mid-meal, and motion there
 * costs taps.
 *
 * Everything is wrapped in `gsap.matchMedia`, which gives us two things at
 * once: per-breakpoint choreography (no pinning on phones, where a pinned
 * section fights the address-bar resize), and a real reduced-motion branch
 * that sets the finished state rather than animating to it.
 */
export function Landing({ signedIn }: { signedIn: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // ── reduced motion: show the final frame, animate nothing ──────
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set("[data-reveal], [data-hero-line], [data-stat]", {
          opacity: 1,
          y: 0,
          rotateX: 0,
        });
      });

      mm.add(
        {
          motionOK: "(prefers-reduced-motion: no-preference)",
          isDesktop: "(min-width: 768px)",
        },
        (context) => {
          const { motionOK, isDesktop } = context.conditions as {
            motionOK: boolean;
            isDesktop: boolean;
          };
          if (!motionOK) return;

          // ── hero: type rises, then the whole thing parallaxes away ──
          const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
          intro
            .from("[data-hero-line]", {
              yPercent: 120,
              opacity: 0,
              duration: 0.9,
              stagger: 0.08,
            })
            .from("[data-hero-sub]", { y: 24, opacity: 0, duration: 0.6 }, "-=0.45")
            .from("[data-hero-cta]", { y: 20, opacity: 0, duration: 0.5 }, "-=0.35")
            .from("[data-stat]", { y: 16, opacity: 0, duration: 0.4, stagger: 0.06 }, "-=0.25");

          // Drift the hero out as you leave it. Pinning is desktop-only:
          // on mobile the URL bar collapsing mid-pin causes a visible jump.
          gsap.to("[data-hero-inner]", {
            yPercent: -18,
            opacity: 0.15,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-hero]",
              start: "top top",
              end: "bottom top",
              scrub: 0.4,
              pin: isDesktop ? "[data-hero]" : false,
              pinSpacing: isDesktop,
            },
          });

          // ── section reveals, batched so a row arrives together ──────
          ScrollTrigger.batch("[data-reveal]", {
            start: "top 85%",
            onEnter: (batch) =>
              gsap.to(batch, {
                opacity: 1,
                y: 0,
                duration: 0.7,
                stagger: 0.09,
                ease: "power2.out",
                overwrite: true,
              }),
          });

          // ── the pillars: 3D tilt that resolves as they scroll past ──
          if (isDesktop) {
            gsap.utils.toArray<HTMLElement>("[data-tilt]").forEach((card) => {
              gsap.fromTo(
                card,
                { rotateX: 18, y: 60, transformPerspective: 900 },
                {
                  rotateX: 0,
                  y: 0,
                  ease: "none",
                  scrollTrigger: {
                    trigger: card,
                    start: "top 90%",
                    end: "top 45%",
                    scrub: 0.6,
                  },
                },
              );
            });
          }

          // ── the metabolism number counts as you scrub through it ────
          const counter = { value: 1980 };
          gsap.to(counter, {
            value: 2470,
            ease: "none",
            scrollTrigger: {
              trigger: "[data-tdee]",
              start: "top 75%",
              end: "bottom 60%",
              scrub: 0.5,
            },
            onUpdate: () => {
              const el = root.current?.querySelector("[data-tdee-value]");
              if (el) el.textContent = String(Math.round(counter.value));
            },
          });

          // ── the rule under each heading draws itself ────────────────
          gsap.utils.toArray<HTMLElement>("[data-rule]").forEach((rule) => {
            gsap.fromTo(
              rule,
              { scaleX: 0, transformOrigin: "left center" },
              {
                scaleX: 1,
                duration: 0.8,
                ease: "power2.out",
                scrollTrigger: { trigger: rule, start: "top 88%" },
              },
            );
          });
        },
      );
    },
    { scope: root },
  );

  return (
    <div ref={root} className="relative">
      {/* ── hero ───────────────────────────────────────────────────── */}
      <section
        data-hero
        className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4"
      >
        <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(var(--accent)/0.16),transparent_70%)]"
        />
        <div className="bg-cyber-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        <div data-hero-inner className="relative z-10 mx-auto max-w-4xl text-center">
          <GymBroMark className="mx-auto mb-8 h-14 w-14 text-ink" />

          <h1 className="font-display text-[15vw] font-bold leading-[0.85] tracking-tight text-ink sm:text-[11vw] lg:text-[9rem]">
            {["TRAIN.", "EAT.", "TRACK."].map((word, i) => (
              <span key={word} className="block overflow-hidden">
                <span
                  data-hero-line
                  className={cn("block", i === 2 && "text-accent")}
                >
                  {word}
                </span>
              </span>
            ))}
          </h1>

          <p
            data-hero-sub
            className="mx-auto mt-8 max-w-xl font-body text-base leading-relaxed text-muted"
          >
            One app for the barbell and the plate. Log a set by clicking a muscle on a 3D
            body. Snap a photo of your thali. And get a calorie target built from{" "}
            <span className="text-ink">your actual metabolism</span> — not a formula that
            stopped being true in week three.
          </p>

          <div
            data-hero-cta
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href={signedIn ? "/dashboard" : "/start"}
              className="group inline-flex min-h-[52px] items-center gap-2 rounded-full bg-accent px-8 font-display text-sm font-semibold uppercase tracking-[0.2em] text-bg transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {signedIn ? "Enter the gym" : "Build my plan"}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            {!signedIn && (
              <Link
                href="/login"
                className="inline-flex min-h-[52px] items-center rounded-full px-6 font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
              >
                Log in
              </Link>
            )}
          </div>

          <dl className="mx-auto mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-border/60 pt-8">
            {[
              { v: "2 min", l: "Setup to first plan" },
              { v: "8 sec", l: "To log an Indian meal" },
              { v: "Weekly", l: "Targets re-learn themselves" },
            ].map((s) => (
              <div key={s.l} data-stat>
                <dd className="font-display text-xl font-bold text-accent-ink">{s.v}</dd>
                <dt className="mt-1 font-mono text-[9px] uppercase leading-snug tracking-widest text-faint">
                  {s.l}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── pillars ────────────────────────────────────────────────── */}
      <Section
        eyebrow="What it is"
        title="Three apps that finally know about each other"
        lead="Most people run a lifting app, a calorie app, and a spreadsheet to reconcile them. Nothing talks. Here, the food knows you squatted."
      >
        <div className="grid gap-4 md:grid-cols-3" style={{ perspective: "1000px" }}>
          {[
            {
              icon: Dumbbell,
              title: "Train",
              body: "Click a muscle on a 3D body to log it. Warm-ups, drop sets, failure sets, supersets, timed holds. Epley e1RM turns every set into a progression datapoint.",
            },
            {
              icon: Flame,
              title: "Eat",
              body: "Indian-first food search that forgives spelling — dhal, daal, dal all land. Portions in katori and roti, not grams. Barcode, photo, or just describe it.",
            },
            {
              icon: LineChart,
              title: "Track",
              body: "Weight smoothed into a trend you can act on. Adherence against the target that was actually in force that day. Protein measured against what you lifted.",
            },
          ].map((p) => (
            <CardSpotlight key={p.title} className="translate-y-8 opacity-0" data-reveal data-tilt>
              <div className="p-6">
                <p.icon className="h-6 w-6 text-accent" />
                <h3 className="mt-4 font-display text-lg font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 font-body text-sm leading-relaxed text-muted">{p.body}</p>
              </div>
            </CardSpotlight>
          ))}
        </div>
      </Section>

      {/* ── adaptive metabolism ────────────────────────────────────── */}
      <section data-tdee className="border-y border-border/60 bg-surface/30 px-4 py-24">
        <div className="mx-auto max-w-4xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-accent-ink">
            The part most apps get wrong
          </p>
          <h2
            data-reveal
            className="mt-4 max-w-2xl translate-y-8 font-display text-3xl font-bold leading-tight text-ink opacity-0 sm:text-5xl"
          >
            Your metabolism isn&apos;t a formula. Stop treating it like one.
          </h2>
          <span data-rule className="mt-6 block h-px w-full bg-accent/40" />

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div data-reveal className="translate-y-8 opacity-0">
              <p className="font-body text-base leading-relaxed text-muted">
                Every calorie app starts you on Mifflin-St Jeor — a population average from
                your height, weight and age. It&apos;s a fine guess on day one and a
                liability by week four, because it never finds out it was wrong.
              </p>
              <p className="mt-4 font-body text-base leading-relaxed text-muted">
                GymBro watches what you actually ate and what the scale actually did, and
                solves for the only number that reconciles them. Miss your target all week?
                The estimate still holds, because it&apos;s reading intake, not obedience.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-bg p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-faint">
                Your real daily burn
              </p>
              <p className="mt-2 font-display text-6xl font-bold tabular-nums text-accent">
                <span data-tdee-value>1980</span>
                <span className="ml-2 font-mono text-sm font-normal uppercase tracking-widest text-faint">
                  kcal
                </span>
              </p>
              <div className="mt-6 space-y-3 font-mono text-[11px] text-muted">
                {[
                  ["Formula said", "1,980"],
                  ["Four weeks of your data says", "2,470"],
                  ["Difference", "+490 / day"],
                ].map(([k, v], i) => (
                  <div
                    key={k}
                    className={cn(
                      "flex items-baseline justify-between gap-4 border-b border-border/60 pb-2",
                      i === 2 && "border-none pb-0 text-accent-ink",
                    )}
                  >
                    <span>{k}</span>
                    <span className="tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 font-body text-xs leading-relaxed text-faint">
                That gap is why people stall on a &ldquo;correct&rdquo; deficit. Targets
                re-derive every week from your own numbers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── logging ────────────────────────────────────────────────── */}
      <Section
        eyebrow="Logging"
        title="Five ways in. None of them a chore."
        lead="The fastest logger is the one that already knows what you eat. Open it and your usuals are waiting before you type a letter."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Sparkles, t: "Search that forgives", b: "Typo-tolerant and transliteration-aware. 'panner' finds paneer." },
            { icon: Camera, t: "Snap a meal", b: "Photo to an editable draft with an honest uncertainty range. Never auto-saved." },
            { icon: ScanLine, t: "Scan a barcode", b: "Open Food Facts, cached, so the second scan of the same packet is instant." },
            { icon: Flame, t: "Just describe it", b: "'2 roti, 1 katori dal aur ek glass doodh.' Hinglish is fine." },
            { icon: Dumbbell, t: "Recipes", b: "Ingredients ÷ servings, saved as a food you can search for forever." },
            { icon: LineChart, t: "Quick add", b: "Raw numbers, no food behind them, for when it isn't worth looking up." },
          ].map((f) => (
            <article
              key={f.t}
              data-reveal
              className="translate-y-8 rounded-xl border border-border bg-surface/50 p-5 opacity-0"
            >
              <f.icon className="h-5 w-5 text-accent-2" />
              <h3 className="mt-3 font-display text-base font-semibold text-ink">{f.t}</h3>
              <p className="mt-1.5 font-body text-sm leading-relaxed text-muted">{f.b}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* ── honesty ────────────────────────────────────────────────── */}
      <Section
        eyebrow="How we treat your numbers"
        title="No invented data. No shame states."
        lead="Two rules the whole app is built around, and both cost us features we could otherwise have shipped."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              t: "Every figure is traceable",
              b: "Food composition comes from USDA FoodData Central and ships with the record id it came from. Anything we can't source is marked unverified in the interface, and anything we can't match doesn't ship at all.",
            },
            {
              t: "Going over is a number, not a verdict",
              b: "Over target renders amber and neutral, never red. There is no guilt copy, no broken-streak punishment, and an eyes-off mode that hides calories entirely while still tracking protein.",
            },
          ].map((c) => (
            <article
              key={c.t}
              data-reveal
              className="translate-y-8 rounded-2xl border border-border bg-surface/50 p-6 opacity-0"
            >
              <h3 className="font-display text-lg font-semibold text-ink">{c.t}</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">{c.b}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* ── theme ──────────────────────────────────────────────────── */}
      <Section
        eyebrow="Make it yours"
        title="Set the tone"
        lead="Pick the look you want to open every day. It applies instantly, across every screen, and remembers."
      >
        <div data-reveal className="translate-y-8 rounded-2xl border border-border bg-surface/50 p-6 opacity-0">
          <ThemePicker />
        </div>
      </Section>

      {/* ── cta ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-28 text-center">
        <Meteors count={14} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_100%,rgb(var(--accent)/0.18),transparent_70%)]"
        />
        <div className="relative z-10 mx-auto max-w-2xl">
          <h2
            data-reveal
            className="translate-y-8 font-display text-4xl font-bold leading-tight text-ink opacity-0 sm:text-6xl"
          >
            Two minutes to a plan that fits you.
          </h2>
          <p data-reveal className="mt-5 translate-y-8 font-body text-base text-muted opacity-0">
            Answer a handful of questions. Get a diet and a training programme built around
            your goal, your kit and your week. Change anything you like afterwards.
          </p>
          <Link
            href={signedIn ? "/fuel" : "/start"}
            className="group mt-10 inline-flex min-h-[56px] items-center gap-2 rounded-full bg-accent px-10 font-display text-sm font-semibold uppercase tracking-[0.2em] text-bg transition-transform hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            {signedIn ? "Open Fuel" : "Start free"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-faint">
            Estimates, not medical advice
          </p>
        </div>
      </section>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-accent-ink">{eyebrow}</p>
        <h2
          data-reveal
          className="mt-4 max-w-2xl translate-y-8 font-display text-3xl font-bold leading-tight text-ink opacity-0 sm:text-5xl"
        >
          {title}
        </h2>
        <span data-rule className="mt-6 block h-px w-full bg-accent/40" />
        {/* The lead un-blurs word by word as it scrolls in — GSAP handles the
            structural reveals, this handles the sentence itself. */}
        <TextGenerateEffect
          words={lead}
          className="mt-6 max-w-2xl font-body text-base leading-relaxed text-muted"
        />
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}
