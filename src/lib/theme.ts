/**
 * Themes — the user sets the tone of the site.
 *
 * Every colour in the app resolves through a CSS custom property, so a theme
 * is a block of variables rather than a set of classes to swap. That matters
 * for two reasons: the strength tracker's existing components re-theme for
 * free without being rewritten, and adding a theme later is a data change
 * rather than a code change.
 *
 * Values are stored as space-separated RGB channels — `255 90 31` — because
 * that is the form Tailwind needs to keep its opacity modifiers working
 * (`bg-accent/10` compiles to `rgb(var(--accent) / 0.1)`). A hex string here
 * would silently break every translucent surface in the app.
 */

export const THEMES = ["molten", "court", "classic"] as const;
export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = "molten";

export interface ThemeDef {
  name: ThemeName;
  label: string;
  blurb: string;
  /** Two swatches for the picker, as CSS colours. */
  swatch: [string, string];
}

export const THEME_LIST: ThemeDef[] = [
  {
    name: "molten",
    label: "Molten",
    blurb: "Graphite and ember. Gym floor under the lights.",
    swatch: ["#0B0B0D", "#FF5A1F"],
  },
  {
    name: "court",
    label: "Court",
    blurb: "Deep navy and electric lime. Performance kit.",
    swatch: ["#0A0F1A", "#C6FF3D"],
  },
  {
    name: "classic",
    label: "Classic",
    blurb: "The original void and neon green.",
    swatch: ["#05050A", "#22FF88"],
  },
];

export function isTheme(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The cookie the server reads so the first paint is already the right theme. */
export const THEME_COOKIE = "gymbro-theme";
