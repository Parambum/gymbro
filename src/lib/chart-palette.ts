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

/**
 * Fuel (nutrition) analytics.
 *
 * No new hues: every value here is one of the already-validated marks above,
 * reused on a chart of its own. The weight chart pairs its series with the
 * neutral TREND ink rather than a second hue, exactly as the e1RM chart does,
 * so no unvalidated pair is ever drawn together.
 *
 * `overTarget` is the one two-mark chart — calorie adherence bars, where a day
 * above target is amber. Both hues are validated against the surface and sit
 * far apart in lightness (L 0.59 vs 0.67). Amber here is a neutral fact, never
 * a warning: §5.6 forbids a punishment state, so the same information is
 * always given in words beside the chart.
 */
export const FUEL_SERIES = {
  weight: CARDIO_SERIES.distance,
  calories: STRENGTH_SERIES.volume,
  overTarget: CARDIO_SERIES.elevation,
} as const;

/** Trendline overlays — neutral ink, never a third hue. */
export const TREND = "#9ca3af";

/** Recessive chart chrome. */
export const GRID = "rgba(158,158,180,0.10)";
export const AXIS_INK = "#8b8ba3";
