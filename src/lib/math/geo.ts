/**
 * Geospatial + pace math for cardio activities.
 *
 * Pure functions, no I/O — safe on both client and server. Distances are
 * metres, durations seconds, pace seconds-per-kilometre. Everything that
 * lands in Mongo is computed here once at write time so reads never
 * recompute (same denormalisation contract the strength side uses for e1RM).
 */

/** [latitude, longitude] — the order Leaflet and Strava both use. */
export type LatLng = [number, number];

/** A GPS sample: position, optional elevation (m) and offset from start (s). */
export interface TrackPoint {
  lat: number;
  lng: number;
  ele?: number;
  /** seconds since the start of the activity */
  t?: number;
}

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean radius

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total path length of a route, in metres. */
export function routeDistanceM(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1], points[i]);
  return total;
}

/**
 * Cumulative positive elevation change, in metres.
 *
 * Consumer GPS altitude is noisy (±3–5 m even when standing still), so raw
 * summation inflates gain badly. A 3 m threshold is the conventional filter:
 * only count a climb once it clears the noise floor.
 */
export function elevationGainM(elevations: number[], thresholdM = 3): number {
  let gain = 0;
  let anchor = elevations[0];
  if (anchor === undefined) return 0;

  for (const ele of elevations) {
    const delta = ele - anchor;
    if (delta >= thresholdM) {
      gain += delta;
      anchor = ele;
    } else if (delta < 0) {
      anchor = ele; // descending — re-anchor so the next climb measures from the trough
    }
  }
  return Math.round(gain);
}

/**
 * Decode a Google/Strava encoded polyline into coordinates.
 *
 * Strava's `map.summary_polyline` uses this format at precision 5. The
 * algorithm reads little-endian base64 chunks of 5 bits, where the low bit
 * of the assembled value is the sign flag and each value is a delta from
 * the previous coordinate.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const coords: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 1;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 1;
    do {
      byte = encoded.charCodeAt(index++) - 63 - 1;
      result += byte << shift;
      shift += 5;
    } while (byte >= 0x1f && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/**
 * Ramer–Douglas–Peucker simplification.
 *
 * A one-hour run at 1 Hz is ~3,600 points; storing and re-rendering all of
 * them is wasteful when the drawn line is a few hundred pixels wide. This
 * keeps the shape within `toleranceM` while typically cutting 80–95% of
 * points. Endpoints are always preserved.
 */
export function simplifyRoute(points: LatLng[], toleranceM = 8): LatLng[] {
  if (points.length <= 2) return points.slice();

  // Perpendicular distance from `p` to segment a→b, via local equirectangular
  // projection (accurate well past the scale of any single GPS segment).
  const perpDistM = (p: LatLng, a: LatLng, b: LatLng): number => {
    const latRef = toRad((a[0] + b[0]) / 2);
    const x = (q: LatLng) => EARTH_RADIUS_M * toRad(q[1]) * Math.cos(latRef);
    const y = (q: LatLng) => EARTH_RADIUS_M * toRad(q[0]);

    const px = x(p);
    const py = y(p);
    const ax = x(a);
    const ay = y(a);
    const bx = x(b);
    const by = y(b);

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  // iterative (not recursive) so a pathological track can't blow the stack
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let idx = -1;

    for (let i = first + 1; i < last; i++) {
      const d = perpDistM(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }

    if (idx !== -1 && maxDist > toleranceM) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/** Seconds per kilometre. Returns 0 when either input is non-positive. */
export function paceSPerKm(distanceM: number, movingTimeS: number): number {
  if (distanceM <= 0 || movingTimeS <= 0) return 0;
  return movingTimeS / (distanceM / 1000);
}

/** Metres per second → km/h, for rides where speed reads better than pace. */
export function speedKph(distanceM: number, movingTimeS: number): number {
  if (distanceM <= 0 || movingTimeS <= 0) return 0;
  return distanceM / movingTimeS * 3.6;
}

/**
 * Per-kilometre splits from a timed track.
 *
 * Walks the track accumulating distance; each time a kilometre boundary is
 * crossed the elapsed time is interpolated to the exact boundary so splits
 * don't drift by the length of one GPS sample.
 */
export interface Split {
  km: number;
  timeS: number;
  paceSPerKm: number;
  elevGainM: number;
}

export function computeSplits(points: TrackPoint[]): Split[] {
  if (points.length < 2) return [];

  const splits: Split[] = [];
  let cumDist = 0;
  let nextBoundary = 1000;
  let lastBoundaryTime = points[0].t ?? 0;
  let segmentElev: number[] = points[0].ele !== undefined ? [points[0].ele] : [];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const segDist = haversineM([prev.lat, prev.lng], [cur.lat, cur.lng]);
    if (segDist === 0) continue;

    const prevT = prev.t ?? 0;
    const curT = cur.t ?? 0;
    if (cur.ele !== undefined) segmentElev.push(cur.ele);

    // a single segment can span more than one boundary (e.g. a lost GPS fix)
    while (cumDist + segDist >= nextBoundary) {
      const ratio = (nextBoundary - cumDist) / segDist;
      const boundaryTime = prevT + (curT - prevT) * ratio;
      const timeS = Math.round(boundaryTime - lastBoundaryTime);

      splits.push({
        km: nextBoundary / 1000,
        timeS,
        paceSPerKm: timeS,
        elevGainM: elevationGainM(segmentElev),
      });

      lastBoundaryTime = boundaryTime;
      segmentElev = cur.ele !== undefined ? [cur.ele] : [];
      nextBoundary += 1000;
    }
    cumDist += segDist;
  }

  // trailing partial kilometre — scaled to a full-km pace so it's comparable
  const remainder = cumDist - (nextBoundary - 1000);
  if (remainder > 50) {
    const lastT = points[points.length - 1].t ?? 0;
    const timeS = Math.round(lastT - lastBoundaryTime);
    splits.push({
      km: Number((cumDist / 1000).toFixed(2)),
      timeS,
      paceSPerKm: Math.round(timeS / (remainder / 1000)),
      elevGainM: elevationGainM(segmentElev),
    });
  }

  return splits;
}

/**
 * Fastest continuous window covering `targetM` metres, in seconds.
 * This is how "best 5K" is defined — a rolling window over the track, not
 * the first 5 km of the run.
 */
export function bestEffortS(points: TrackPoint[], targetM: number): number | null {
  if (points.length < 2) return null;

  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(
      cum[i - 1] + haversineM([points[i - 1].lat, points[i - 1].lng], [points[i].lat, points[i].lng]),
    );
  }
  if (cum[cum.length - 1] < targetM) return null;

  let best = Infinity;
  let head = 0;
  for (let tail = 1; tail < points.length; tail++) {
    // shrink from the left while the window still covers the target
    while (head + 1 <= tail && cum[tail] - cum[head + 1] >= targetM) head++;
    if (cum[tail] - cum[head] >= targetM) {
      const dt = (points[tail].t ?? 0) - (points[head].t ?? 0);
      if (dt > 0 && dt < best) best = dt;
    }
  }
  return Number.isFinite(best) ? Math.round(best) : null;
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

/** 10500 → "10.50 km"; sub-kilometre falls back to metres. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** 3725 → "1:02:05"; under an hour → "12:05". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 330 → "5:30 /km". */
export function formatPace(sPerKm: number): string {
  if (!sPerKm || !Number.isFinite(sPerKm)) return "—";
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  // 59.6s rounds to 60 — carry it rather than printing "5:60"
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, "0")} /km`;
}

/** Bounding box of a route, as Leaflet's [[southWest],[northEast]]. */
export function routeBounds(points: LatLng[]): [LatLng, LatLng] | null {
  if (points.length === 0) return null;
  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLng = points[0][1];
  let maxLng = points[0][1];

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}
