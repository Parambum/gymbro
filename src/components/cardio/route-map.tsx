"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Hand, MapPinOff } from "lucide-react";
import type { LatLng } from "@/lib/math/geo";

/**
 * SSR-safe wrapper around the Leaflet renderer, plus the empty state for
 * efforts logged without GPS (treadmill runs, pool swims, manual entries) —
 * a normal thing to have, not an error.
 *
 * On touch devices the map starts non-draggable behind a tap-to-activate
 * veil. A full-width interactive map otherwise swallows vertical swipes and
 * strands the reader halfway down the page.
 */
const RouteMapInner = dynamic(() => import("./route-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-xl border border-edge bg-abyss" style={{ height: 320 }}>
      <span className="animate-pulse-glow font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
        Loading map…
      </span>
    </div>
  ),
});

export function RouteMap({
  route,
  height = 320,
  interactive = true,
  className = "",
}: {
  route: LatLng[];
  height?: number;
  interactive?: boolean;
  className?: string;
}) {
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    // read after mount: matchMedia during render would desync SSR markup
    setCoarsePointer(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!route || route.length < 2) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge bg-abyss/60 ${className}`}
        style={{ height }}
      >
        <MapPinOff className="h-5 w-5 text-zinc-700" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-600">
          No GPS route
        </span>
      </div>
    );
  }

  const needsTap = interactive && coarsePointer && !activated;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-edge ${className}`}>
      <RouteMapInner route={route} height={height} interactive={interactive && !needsTap} />

      {needsTap && (
        <button
          onClick={() => setActivated(true)}
          className="absolute inset-0 z-[500] flex items-end justify-center bg-void/25 pb-4 backdrop-blur-[1px] transition-colors active:bg-void/40"
          aria-label="Activate map interaction"
        >
          <span className="flex items-center gap-1.5 rounded-full border border-edge bg-void/90 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300">
            <Hand className="h-3 w-3" /> Tap to explore
          </span>
        </button>
      )}
    </div>
  );
}
