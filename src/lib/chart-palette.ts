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

/** Trendline overlays — neutral ink, never a third hue. */
export const TREND = "#9ca3af";

/** Recessive chart chrome. */
export const GRID = "rgba(158,158,180,0.10)";
export const AXIS_INK = "#8b8ba3";
