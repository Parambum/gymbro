import type { Config } from "tailwindcss";

/**
 * Colours live in CSS custom properties (see globals.css) so the user can
 * retone the whole app at runtime. Everything below is a reference to one of
 * those variables, never a literal.
 *
 * `channel()` produces `rgb(var(--x) / <alpha-value>)`, which is what keeps
 * Tailwind's opacity modifiers working — `bg-surface/60`, `border-accent/30`
 * and the dozens of translucent surfaces already written across the app.
 *
 * The `void`/`abyss`/`panel`/`edge`/`neon`/`hot` names are ALIASES onto the
 * same variables. They are how the strength tracker was written, and keeping
 * them means ~40 components built before themes existed retone for free
 * rather than needing a risky mechanical rewrite. New code should use the
 * semantic names; the aliases are not deprecated so much as inherited.
 */
const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── semantic (use these) ──────────────────────────────────
        bg: channel("bg"),
        surface: channel("surface"),
        raised: channel("raised"),
        border: channel("border"),
        ink: channel("ink"),
        muted: channel("muted"),
        faint: channel("faint"),
        accent: {
          DEFAULT: channel("accent"),
          ink: channel("accent-ink"),
          2: channel("accent-2"),
        },
        info: channel("info"),
        warn: channel("warn"),
        danger: channel("danger"),

        /**
         * Tailwind's own zinc ramp, redirected at the theme.
         *
         * 392 usages across 47 files were written against `text-zinc-400` and
         * friends before themes existed. Remapping the ramp retones every one
         * of them with no file edits — the alternative was a mechanical
         * find-and-replace across the whole app, which is a lot of risk for a
         * change no user would see.
         *
         * The ramp is read on a dark ground, so the bright end is text and the
         * dark end is chrome.
         */
        zinc: {
          50: channel("ink"),
          100: channel("ink"),
          200: channel("ink"),
          300: channel("ink"),
          400: channel("muted"),
          500: channel("muted"),
          600: channel("faint"),
          700: channel("border"),
          800: channel("raised"),
          900: channel("surface"),
          950: channel("bg"),
        },

        // ── aliases, so pre-theme components retone for free ──────
        void: channel("bg"),
        abyss: channel("surface"),
        panel: channel("raised"),
        edge: channel("border"),
        neon: {
          green: channel("accent-ink"),
          purple: channel("accent-2"),
          blue: channel("info"),
          crimson: channel("danger"),
          amber: channel("warn"),
        },
        hot: {
          green: channel("accent"),
          purple: channel("accent-2"),
          blue: channel("info"),
          crimson: channel("danger"),
        },
      },
      fontFamily: {
        // Space Grotesk for anything that should feel like a headline;
        // IBM Plex Sans for reading; IBM Plex Mono for numbers and the
        // uppercase micro-labels, which finally get a real monospace.
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        scanline: "scanline 6s linear infinite",
        "spin-slow": "spin 8s linear infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      boxShadow: {
        glow: "0 0 28px -6px rgb(var(--accent) / 0.55)",
        "glow-lg": "0 0 60px -12px rgb(var(--accent) / 0.6)",
        "neon-green": "0 0 24px -6px rgb(var(--accent) / 0.55)",
        "neon-purple": "0 0 24px -6px rgb(var(--accent-2) / 0.65)",
        "neon-blue": "0 0 24px -6px rgb(var(--info) / 0.6)",
        "neon-crimson": "0 0 24px -6px rgb(var(--danger) / 0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
