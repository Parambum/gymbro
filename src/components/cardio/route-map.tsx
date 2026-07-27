"use client";

import dynamic from "next/dynamic";
import { MapPinOff } from "lucide-react";
import type { LatLng } from "@/lib/math/geo";

/**
 * SSR-safe wrapper around the Leaflet renderer, plus the empty state for
 * efforts logged without GPS (treadmill runs, pool swims, manual entries) —
 * which is a normal thing to have, not an error.
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

  return (
    <div className={`overflow-hidden rounded-xl border border-edge ${className}`}>
      <RouteMapInner route={route} height={height} interactive={interactive} />
    </div>
  );
}
