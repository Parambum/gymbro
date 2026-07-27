/**
 * Chart series palette — VALIDATED, do not eyeball-edit.
 *
 * Every pair below passed all six dataviz checks (OKLCH lightness band
 * 0.48–0.67 dark, chroma floor, CVD ΔE, normal-vision floor, 3:1 contrast)
 * against the app surface #0a0a14 via scripts/validate_palette.js.
 *
 * The hotter neons in tailwind.config.ts (`hot.*`) are UI glow/border
 * accents ONLY and must never be used as chart marks.
 */
export const SURFACE = "#0a0a14";

/** Strength analytics: e1RM area + volume bars. */
export const STRENGTH_SERIES = {
  e1rm: "#8b5cf6", // hyper purple
  volume: "#16a34a", // cyber green
} as const;

/** Body-progression radar — one hue for the single "current best e1RM" series. */
export const RADAR = "#8b5cf6";

/**
 * Cardio analytics: weekly distance bars, per-km split bars, elevation accent.
 *
 * Checked against the same criteria as the values above (OKLCH L in 0.48–0.67,
 * chroma floor, ≥3:1 against #0a0a14):
 *   distance  L 0.588  C 0.139  4.81:1
 *   pace      L 0.596  C 0.127  5.23:1
 *   elevation L 0.666  C 0.157  6.18:1
 *
 * Note the `neon.*` values in tailwind.config.ts are NOT usable here despite
 * their comment — #38bdf8/#4ade80/#fbbf24 measure L 0.75–0.84, well above the
 * band. Each key below is drawn as a single-series mark on its own chart, so
 * the pairwise-separation requirement applies within a chart, not across them.
 */
export const CARDIO_SERIES = {
  distance: "#0284c7", // sky
  pace: "#059669", // emerald
  elevation: "#d97706", // amber
} as const;

/** Trendline overlays — neutral ink, never a third hue. */
export const TREND = "#9ca3af";

/** Recessive chart chrome. */
export const GRID = "rgba(158,158,180,0.10)";
export const AXIS_INK = "#8b8ba3";
