"use client";

import { useEffect, useState } from "react";

/**
 * Chart series colours — VALIDATED, do not eyeball-edit.
 *
 * Each theme's `--chart-*` values in globals.css were contrast-checked against
 * that theme's own surface (OKLCH lightness band 0.48–0.67, chroma floor, 3:1
 * against the panel). The accent variables are UI glow/border colours and must
 * never be used as chart marks — they are deliberately too light.
 *
 * Why a hook rather than constants: Recharts writes `fill`/`stroke` as SVG
 * presentation attributes, and `var()` does not resolve there — only inside
 * real CSS declarations. So the values have to be read out of the computed
 * style as concrete `rgb()` strings and handed to Recharts. The fallbacks
 * below are the Molten set, used for the server-rendered pass before any
 * computed style exists.
 */

export interface ChartPalette {
  series1: string;
  series2: string;
  series3: string;
  trend: string;
  grid: string;
  axis: string;
  surface: string;
}

const FALLBACK: ChartPalette = {
  series1: "rgb(214 88 32)",
  series2: "rgb(201 134 20)",
  series3: "rgb(41 130 196)",
  trend: "rgb(156 163 175)",
  grid: "rgba(158,158,180,0.10)",
  axis: "rgb(150 150 158)",
  surface: "rgb(20 20 23)",
};

function readVar(styles: CSSStyleDeclaration, name: string): string | null {
  const raw = styles.getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : null;
}

/**
 * The current theme's chart colours, re-read whenever the theme changes.
 *
 * Watches `data-theme` on <html> rather than taking it as a prop, so a chart
 * buried three components deep retones without anyone threading it down.
 */
export function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState<ChartPalette>(FALLBACK);

  useEffect(() => {
    const read = () => {
      const styles = getComputedStyle(document.documentElement);
      const muted = styles.getPropertyValue("--muted").trim();
      const gridChannels = styles.getPropertyValue("--chart-grid").trim();

      setPalette({
        series1: readVar(styles, "--chart-1") ?? FALLBACK.series1,
        series2: readVar(styles, "--chart-2") ?? FALLBACK.series2,
        series3: readVar(styles, "--chart-3") ?? FALLBACK.series3,
        trend: readVar(styles, "--chart-trend") ?? FALLBACK.trend,
        // Grid lines are deliberately a low-alpha wash, not a solid colour.
        grid: gridChannels ? `rgba(${gridChannels.split(" ").join(",")},0.10)` : FALLBACK.grid,
        axis: muted ? `rgb(${muted})` : FALLBACK.axis,
        surface: readVar(styles, "--surface") ?? FALLBACK.surface,
      });
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return palette;
}

/**
 * Names the charts already use, mapped onto the themed series.
 *
 * Each of these is drawn as a single-series mark on its own chart, so the
 * pairwise-separation requirement applies within a chart, not across them.
 * The one two-mark chart is calorie adherence (series1 under target, series2
 * over), and those two sit far apart in lightness in every theme.
 */
export function chartSeries(p: ChartPalette) {
  return {
    strength: { e1rm: p.series3, volume: p.series1 },
    cardio: { distance: p.series3, pace: p.series1, elevation: p.series2 },
    fuel: { weight: p.series3, calories: p.series1, overTarget: p.series2 },
    radar: p.series3,
  };
}
