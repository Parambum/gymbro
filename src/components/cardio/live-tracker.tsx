"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Square, Satellite, TriangleAlert } from "lucide-react";
import { RouteMap } from "./route-map";
import {
  formatDistance,
  formatDuration,
  formatPace,
  haversineM,
  paceSPerKm,
  type LatLng,
  type TrackPoint,
} from "@/lib/math/geo";

type Status = "idle" | "running" | "paused" | "done";

/** Reject fixes worse than this (metres) — cheap phone GPS drifts wildly indoors. */
const ACCURACY_LIMIT_M = 50;
/** Reject teleports: >40 m/s between samples is a GPS glitch, not a human. */
const MAX_SPEED_MS = 40;

/**
 * Record a run from the browser's GPS.
 *
 * Every accepted fix carries `t` (seconds of *moving* time, so pauses don't
 * inflate pace) and the running distance is accumulated incrementally rather
 * than recomputed, which keeps the display stable on long efforts.
 *
 * Two filters keep the track honest: a fix with poor reported accuracy is
 * dropped, and a jump implying superhuman speed is dropped — otherwise a
 * single bad sample adds hundreds of phantom metres.
 */
export function LiveTracker({
  onFinish,
}: {
  onFinish: (data: { track: TrackPoint[]; distanceM: number; movingTimeS: number }) => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [distanceM, setDistanceM] = useState(0);
  const [elapsedS, setElapsedS] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const watchId = useRef<number | null>(null);
  const segmentStart = useRef<number | null>(null); // ms epoch of current running segment
  const bankedMs = useRef(0); // moving time completed before the current segment
  const lastPoint = useRef<TrackPoint | null>(null);
  const statusRef = useRef<Status>("idle");
  statusRef.current = status;

  /** Moving milliseconds right now, whether or not a segment is open. */
  const movingMs = useCallback(
    () => bankedMs.current + (segmentStart.current ? Date.now() - segmentStart.current : 0),
    [],
  );

  // ---- ticking clock (display only; the track carries its own timestamps) ----
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => setElapsedS(Math.floor(movingMs() / 1000)), 500);
    return () => clearInterval(id);
  }, [status, movingMs]);

  const handleFix = useCallback((pos: GeolocationPosition) => {
    // ignore fixes that arrive while paused — the athlete isn't moving
    if (statusRef.current !== "running") return;

    const { latitude, longitude, altitude, accuracy: acc } = pos.coords;
    setAccuracy(acc);
    if (acc > ACCURACY_LIMIT_M) return;

    const t = Math.floor(movingMs() / 1000);
    const next: TrackPoint = {
      lat: latitude,
      lng: longitude,
      ...(altitude != null && Number.isFinite(altitude) ? { ele: altitude } : {}),
      t,
    };

    const prev = lastPoint.current;
    if (prev) {
      const step = haversineM([prev.lat, prev.lng], [next.lat, next.lng]);
      const dt = Math.max(1, t - (prev.t ?? 0));
      if (step / dt > MAX_SPEED_MS) return; // implausible jump
      if (step < 1) return; // standing still: don't pad the track with noise
      setDistanceM((d) => d + step);
    }

    lastPoint.current = next;
    setPoints((p) => [...p, next]);
  }, [movingMs]);

  const handleGeoError = useCallback((err: GeolocationPositionError) => {
    setError(
      err.code === err.PERMISSION_DENIED
        ? "Location permission denied. Enable it for this site, or log the run manually."
        : err.code === err.POSITION_UNAVAILABLE
          ? "No GPS signal. Step outside and try again."
          : "Could not read your location.",
    );
    setStatus("idle");
  }, []);

  const startWatch = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("This browser has no Geolocation support — log the run manually instead.");
      return false;
    }
    if (watchId.current === null) {
      watchId.current = navigator.geolocation.watchPosition(handleFix, handleGeoError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000,
      });
    }
    return true;
  }, [handleFix, handleGeoError]);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  // release the GPS watch if the component unmounts mid-run
  useEffect(() => stopWatch, [stopWatch]);

  const start = () => {
    setError(null);
    if (!startWatch()) return;
    segmentStart.current = Date.now();
    setStatus("running");
  };

  const pause = () => {
    bankedMs.current = movingMs();
    segmentStart.current = null;
    setStatus("paused");
    setElapsedS(Math.floor(bankedMs.current / 1000));
  };

  const resume = () => {
    segmentStart.current = Date.now();
    setStatus("running");
  };

  const finish = () => {
    const totalS = Math.floor(movingMs() / 1000);
    bankedMs.current = totalS * 1000;
    segmentStart.current = null;
    stopWatch();
    setStatus("done");
    onFinish({ track: points, distanceM: Math.round(distanceM), movingTimeS: Math.max(1, totalS) });
  };

  const route: LatLng[] = points.map((p) => [p.lat, p.lng]);
  const pace = paceSPerKm(distanceM, elapsedS);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-neon-crimson/40 bg-neon-crimson/10 px-3 py-2 font-mono text-[11px] text-neon-crimson">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* live readout */}
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-edge bg-abyss/70 p-4">
        <Readout label="distance" value={formatDistance(distanceM)} accent="text-neon-green" />
        <Readout label="moving" value={formatDuration(elapsedS)} accent="text-zinc-100" />
        <Readout label="pace" value={pace > 0 ? formatPace(pace) : "—"} accent="text-neon-blue" />
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-600">
        <span className="flex items-center gap-1.5">
          <Satellite
            className={`h-3 w-3 ${status === "running" ? "animate-pulse-glow text-neon-green" : "text-zinc-700"}`}
          />
          {status === "running" ? "tracking" : status === "paused" ? "paused" : "gps idle"}
        </span>
        <span>
          {points.length} fixes{accuracy != null ? ` · ±${Math.round(accuracy)} m` : ""}
        </span>
      </div>

      <RouteMap route={route} height={200} interactive={false} />

      {/* transport controls */}
      <div className="flex gap-2">
        {status === "idle" && (
          <ControlButton onClick={start} tone="green">
            <Play className="h-4 w-4" /> Start run
          </ControlButton>
        )}
        {status === "running" && (
          <>
            <ControlButton onClick={pause} tone="amber">
              <Pause className="h-4 w-4" /> Pause
            </ControlButton>
            <ControlButton onClick={finish} tone="crimson" disabled={points.length < 2}>
              <Square className="h-4 w-4" /> Finish
            </ControlButton>
          </>
        )}
        {status === "paused" && (
          <>
            <ControlButton onClick={resume} tone="green">
              <Play className="h-4 w-4" /> Resume
            </ControlButton>
            <ControlButton onClick={finish} tone="crimson" disabled={points.length < 2}>
              <Square className="h-4 w-4" /> Finish
            </ControlButton>
          </>
        )}
      </div>

      {status !== "idle" && points.length < 2 && (
        <p className="text-center font-mono text-[10px] text-zinc-600">
          Waiting for a second GPS fix before the run can be saved…
        </p>
      )}
    </div>
  );
}

function Readout({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`font-display text-lg font-bold tabular-nums ${accent}`}>{value}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-600">{label}</span>
    </div>
  );
}

function ControlButton({
  onClick,
  children,
  tone,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone: "green" | "amber" | "crimson";
  disabled?: boolean;
}) {
  const tones = {
    green: "border-hot-green/50 bg-hot-green/10 text-neon-green hover:bg-hot-green/20",
    amber: "border-neon-amber/50 bg-neon-amber/10 text-neon-amber hover:bg-neon-amber/20",
    crimson: "border-hot-crimson/50 bg-hot-crimson/10 text-neon-crimson hover:bg-hot-crimson/20",
  } as const;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}
