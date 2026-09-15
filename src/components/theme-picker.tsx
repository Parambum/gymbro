"use client";

import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";
import { DEFAULT_THEME, THEME_COOKIE, THEME_LIST, isTheme, type ThemeName } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The theme picker — the user sets the tone of the site.
 *
 * Applied by writing one attribute on <html> and one cookie. No reload, no
 * request: every colour in the app is a custom property hanging off that
 * attribute, so the whole thing retones in a frame.
 *
 * The cookie exists so the *server* can render the right theme on the next
 * visit. Storing this only in localStorage would mean a flash of the default
 * theme on every cold load, which is the one thing a theme switcher must not
 * do.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState<ThemeName>(DEFAULT_THEME);

  // Read what the server already applied rather than assuming the default.
  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (isTheme(current)) setActive(current);
  }, []);

  function choose(theme: ThemeName) {
    const root = document.documentElement;

    // Opt into the colour transition only once a human has actually picked —
    // animating on first paint would be a flash, not a flourish.
    root.setAttribute("data-theme-animating", "");
    root.dataset.theme = theme;
    setActive(theme);

    // A year, Lax: this is a display preference, not a credential.
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;

    window.setTimeout(() => root.removeAttribute("data-theme-animating"), 400);
  }

  return (
    <div>
      {!compact && (
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-3.5 w-3.5 text-muted" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            Set the tone
          </span>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Colour theme"
        className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}
      >
        {THEME_LIST.map((theme) => {
          const on = theme.name === active;
          return (
            <button
              key={theme.name}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(theme.name)}
              className={cn(
                "group flex min-h-[44px] items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                on
                  ? "border-accent bg-accent/10"
                  : "border-border bg-bg hover:border-muted/50",
              )}
            >
              {/* the swatch is the point — show the actual colours, not a name */}
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border"
              >
                <span className="h-full w-1/2" style={{ background: theme.swatch[0] }} />
                <span className="h-full w-1/2" style={{ background: theme.swatch[1] }} />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "flex items-center gap-1.5 font-display text-sm font-semibold",
                    on ? "text-accent-ink" : "text-ink",
                  )}
                >
                  {theme.label}
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                {!compact && (
                  <span className="mt-0.5 block font-mono text-[10px] leading-snug text-muted">
                    {theme.blurb}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
