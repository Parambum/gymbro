import type { TrackPoint } from "@/lib/math/geo";

/**
 * GPX parsing — browser only (uses DOMParser).
 *
 * GPX is what every watch and phone app exports, so importing one is the
 * realistic path to getting a real route in without re-running it. We read
 * `<trkpt>` elements: lat/lon attributes, optional `<ele>` and `<time>`.
 * Times are converted to seconds-since-start so the track is timezone-free
 * by the time it reaches the server.
 */

export interface ParsedGpx {
  name: string | null;
  points: TrackPoint[];
  /** wall-clock start, when the file carries timestamps */
  startedAt: Date | null;
  /** span between first and last timestamp, seconds */
  elapsedS: number | null;
}

export class GpxParseError extends Error {}

export function parseGpx(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, "application/xml");

  // DOMParser signals malformed XML with a <parsererror> node rather than throwing
  if (doc.querySelector("parsererror")) {
    throw new GpxParseError("That file isn't valid XML — is it really a .gpx export?");
  }

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  // some exporters (route files) use <rtept> instead of <trkpt>
  const nodes = trkpts.length > 0 ? trkpts : Array.from(doc.getElementsByTagName("rtept"));

  if (nodes.length === 0) {
    throw new GpxParseError("No track points found in that GPX file.");
  }

  const rawTimes: Array<number | null> = [];
  const points: TrackPoint[] = [];

  for (const node of nodes) {
    const lat = Number(node.getAttribute("lat"));
    const lng = Number(node.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;

    const eleText = node.getElementsByTagName("ele")[0]?.textContent;
    const ele = eleText != null ? Number(eleText) : undefined;

    const timeText = node.getElementsByTagName("time")[0]?.textContent;
    const ms = timeText ? Date.parse(timeText) : NaN;
    rawTimes.push(Number.isNaN(ms) ? null : ms);

    points.push({
      lat,
      lng,
      ...(ele !== undefined && Number.isFinite(ele) ? { ele } : {}),
    });
  }

  if (points.length === 0) {
    throw new GpxParseError("Track points in that file had no usable coordinates.");
  }

  // rebase timestamps to seconds-from-start
  const firstMs = rawTimes.find((t): t is number => t !== null) ?? null;
  let elapsedS: number | null = null;

  if (firstMs !== null) {
    let lastMs = firstMs;
    rawTimes.forEach((ms, i) => {
      if (ms !== null) {
        points[i].t = Math.max(0, Math.round((ms - firstMs) / 1000));
        lastMs = ms;
      }
    });
    elapsedS = Math.round((lastMs - firstMs) / 1000);
  }

  const name =
    doc.getElementsByTagName("trk")[0]?.getElementsByTagName("name")[0]?.textContent?.trim() ||
    doc.getElementsByTagName("metadata")[0]?.getElementsByTagName("name")[0]?.textContent?.trim() ||
    null;

  return {
    name,
    points,
    startedAt: firstMs !== null ? new Date(firstMs) : null,
    elapsedS,
  };
}
