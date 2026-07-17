import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#05050a",
        abyss: "#0a0a14",
        panel: "#0e0e1c",
        edge: "#1e1e33",
        neon: {
          // chart-safe series colors (validated against #0a0a14, dark mode)
          green: "#4ade80",
          purple: "#a78bfa",
          blue: "#38bdf8",
          crimson: "#fb7185",
          amber: "#fbbf24",
        },
        hot: {
          // saturated variants — glows, gradients, borders only, never chart series
          green: "#22ff88",
          purple: "#7c3aed",
          blue: "#06b6d4",
          crimson: "#ff2d55",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
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
        "neon-green": "0 0 24px -6px rgba(34,255,136,0.55)",
        "neon-purple": "0 0 24px -6px rgba(124,58,237,0.65)",
        "neon-blue": "0 0 24px -6px rgba(6,182,212,0.6)",
        "neon-crimson": "0 0 24px -6px rgba(255,45,85,0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
