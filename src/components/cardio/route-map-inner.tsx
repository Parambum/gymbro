"use client";

import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { routeBounds, type LatLng } from "@/lib/math/geo";

/**
 * Leaflet route renderer. Never imported directly — `route-map.tsx` wraps it
 * in a dynamic(ssr:false) boundary because Leaflet reaches for `window` at
 * module scope and would break the server render.
 *
 * Uses CARTO's dark basemap (free, no API key, attribution below) so the map
 * sits inside the app's palette instead of glowing white in the middle of it.
 * Start/end are CircleMarkers rather than pin Markers on purpose: Leaflet's
 * default pin icons resolve to broken image URLs under bundlers, and circles
 * read better on a dark tile anyway.
 */
export default function RouteMapInner({
  route,
  height = 320,
  interactive = true,
}: {
  route: LatLng[];
  height?: number;
  interactive?: boolean;
}) {
  const bounds = routeBounds(route);
  if (!bounds || route.length < 2) return null;

  const start = route[0];
  const end = route[route.length - 1];

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom={false}
      dragging={interactive}
      zoomControl={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      attributionControl
      style={{ height, width: "100%", background: "#0a0a14" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />

      {/* wide translucent pass under the line fakes a neon bloom */}
      <Polyline positions={route} pathOptions={{ color: "#22ff88", weight: 9, opacity: 0.18 }} />
      <Polyline positions={route} pathOptions={{ color: "#22ff88", weight: 3, opacity: 0.95 }} />

      <CircleMarker
        center={start}
        radius={6}
        pathOptions={{ color: "#05050a", weight: 2, fillColor: "#4ade80", fillOpacity: 1 }}
      >
        <Tooltip direction="top">Start</Tooltip>
      </CircleMarker>
      <CircleMarker
        center={end}
        radius={6}
        pathOptions={{ color: "#05050a", weight: 2, fillColor: "#fb7185", fillOpacity: 1 }}
      >
        <Tooltip direction="top">Finish</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}
