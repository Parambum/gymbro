"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, PencilLine, Satellite, TriangleAlert } from "lucide-react";
import { AnimatedModal } from "@/components/ui/animated-modal";
import { ACTIVITY_META } from "./activity-meta";
import { LiveTracker } from "./live-tracker";
import { RouteMap } from "./route-map";
import { parseGpx, GpxParseError } from "@/lib/gpx";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/activity-types";
import {
  elevationGainM,
  formatDistance,
  formatDuration,
  routeDistanceM,
  type LatLng,
  type TrackPoint,
} from "@/lib/math/geo";
import { todayIso } from "@/lib/date-utils";

type Mode = "manual" | "gpx" | "live";

/** Everything a GPX/GPS import contributes; manual entry leaves it null. */
interface Draft {
  track: TrackPoint[];
  distanceM: number;
  movingTimeS: number;
  elevationGainM: number;
  startedAt: string | null;
  suggestedName: string | null;
  source: "GPX" | "LIVE";
}

export function LogActivityModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>("manual");
  const [draft, setDraft] = useState<Draft | null>(null);

  const close = () => {
    setDraft(null);
    setMode("manual");
    onClose();
  };

  return (
    <AnimatedModal open={open} onClose={close} accent="#22ff88" className="max-w-xl">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 pt-12">
        <header>
          <h2 className="font-display text-xl font-bold uppercase tracking-widest text-zinc-100">
            Log cardio
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Run · ride · walk · hike · swim
          </p>
        </header>

        {/* mode switch — hidden once an import is staged, to keep focus on saving it */}
        {!draft && (
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-edge bg-abyss/60 p-1">
            <ModeTab active={mode === "manual"} onClick={() => setMode("manual")} icon={PencilLine}>
              Manual
            </ModeTab>
            <ModeTab active={mode === "gpx"} onClick={() => setMode("gpx")} icon={FileUp}>
              GPX
            </ModeTab>
            <ModeTab active={mode === "live"} onClick={() => setMode("live")} icon={Satellite}>
              Live GPS
            </ModeTab>
          </div>
        )}

        {draft ? (
          <ActivityForm draft={draft} onSaved={() => { onSaved(); close(); }} onDiscard={() => setDraft(null)} />
        ) : mode === "manual" ? (
          <ActivityForm draft={null} onSaved={() => { onSaved(); close(); }} onDiscard={null} />
        ) : mode === "gpx" ? (
          <GpxImport onReady={setDraft} />
        ) : (
          <LiveTracker
            onFinish={({ track, distanceM, movingTimeS }) =>
              setDraft({
                track,
                distanceM,
                movingTimeS,
                elevationGainM: elevationGainM(
                  track.map((p) => p.ele).filter((e): e is number => typeof e === "number"),
                ),
                startedAt: new Date(Date.now() - movingTimeS * 1000).toISOString(),
                suggestedName: null,
                source: "LIVE",
              })
            }
          />
        )}
      </div>
    </AnimatedModal>
  );
}

// ---------------------------------------------------------------------------

function ModeTab({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof PencilLine;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors ${
        active ? "bg-hot-green/15 text-neon-green" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function GpxImport({ onReady }: { onReady: (d: Draft) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const text = await file.text();
      const { points, name, startedAt, elapsedS } = parseGpx(text);
      const route: LatLng[] = points.map((p) => [p.lat, p.lng]);
      const distanceM = Math.round(routeDistanceM(route));

      if (distanceM <= 0) {
        setError("That track has no measurable distance.");
        return;
      }
      // a route-only export carries no clock; the athlete types the duration
      const movingTimeS = elapsedS && elapsedS > 0 ? elapsedS : 0;

      onReady({
        track: points,
        distanceM,
        movingTimeS,
        elevationGainM: elevationGainM(
          points.map((p) => p.ele).filter((e): e is number => typeof e === "number"),
        ),
        startedAt: startedAt ? startedAt.toISOString() : null,
        suggestedName: name,
        source: "GPX",
      });
    } catch (err) {
      setError(
        err instanceof GpxParseError ? err.message : "Could not read that file. Is it a .gpx export?",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-edge bg-abyss/50 px-4 py-10 transition-colors hover:border-hot-green/40 hover:bg-hot-green/5 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-neon-green" />
        ) : (
          <FileUp className="h-6 w-6 text-zinc-600" />
        )}
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
          {busy ? "Reading track…" : "Choose a .gpx file"}
        </span>
        <span className="max-w-xs text-center font-mono text-[10px] leading-relaxed text-zinc-600">
          Export from Garmin, Coros, Apple Health, Strava — distance, elevation and splits
          are computed from the track.
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,text/xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ""; // let the same file be re-picked after an error
        }}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-neon-crimson/40 bg-neon-crimson/10 px-3 py-2 font-mono text-[11px] text-neon-crimson">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/** The save form. With a `draft` it confirms an import; without, it's manual entry. */
function ActivityForm({
  draft,
  onSaved,
  onDiscard,
}: {
  draft: Draft | null;
  onSaved: () => void;
  onDiscard: (() => void) | null;
}) {
  const [type, setType] = useState<ActivityType>("RUN");
  const [name, setName] = useState(draft?.suggestedName ?? "");
  const [date, setDate] = useState(draft?.startedAt ? draft.startedAt.slice(0, 10) : todayIso());
  const [km, setKm] = useState(draft ? (draft.distanceM / 1000).toFixed(2) : "");
  const [hh, setHh] = useState(draft ? String(Math.floor(draft.movingTimeS / 3600)) : "");
  const [mm, setMm] = useState(draft ? String(Math.floor((draft.movingTimeS % 3600) / 60)) : "");
  const [ss, setSs] = useState(draft ? String(draft.movingTimeS % 60) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distanceM = draft ? draft.distanceM : Math.round(Number(km) * 1000);
  const movingTimeS =
    (Number(hh) || 0) * 3600 + (Number(mm) || 0) * 60 + (Number(ss) || 0);

  const valid = distanceM > 0 && movingTimeS > 0 && name.trim().length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          date,
          startedAt: draft?.startedAt ?? undefined,
          distanceM,
          movingTimeS,
          elevationGainM: draft?.elevationGainM ?? 0,
          notes: notes.trim() || undefined,
          source: draft?.source ?? "MANUAL",
          track: draft?.track,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save this effort.");
        return;
      }
      onSaved();
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const route: LatLng[] = draft?.track.map((p) => [p.lat, p.lng]) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {draft && (
        <>
          <RouteMap route={route} height={180} interactive={false} />
          <div className="flex items-center justify-between rounded-lg border border-hot-green/30 bg-hot-green/5 px-3 py-2 font-mono text-[11px]">
            <span className="text-neon-green">
              {formatDistance(draft.distanceM)}
              {draft.elevationGainM > 0 && ` · +${draft.elevationGainM} m`}
              {draft.movingTimeS > 0 && ` · ${formatDuration(draft.movingTimeS)}`}
            </span>
            {onDiscard && (
              <button onClick={onDiscard} className="text-zinc-500 transition-colors hover:text-neon-crimson">
                discard
              </button>
            )}
          </div>
          {draft.movingTimeS === 0 && (
            <p className="font-mono text-[10px] text-neon-amber">
              That file had no timestamps — enter the duration below.
            </p>
          )}
        </>
      )}

      {/* discipline */}
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_TYPES.map((t) => {
          const meta = ACTIVITY_META[t];
          const Icon = meta.icon;
          const active = type === t;
          return (
            <button
              key={t}
              onClick={() => setType(t)}
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors"
              style={{
                borderColor: active ? `${meta.accent}66` : "#1e1e33",
                backgroundColor: active ? `${meta.accent}14` : "transparent",
                color: active ? meta.accent : "#71717a",
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>

      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Morning run"
          maxLength={120}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Distance (km)">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={km}
            disabled={Boolean(draft)}
            onChange={(e) => setKm(e.target.value)}
            placeholder="5.00"
            className={`${inputClass} disabled:cursor-not-allowed disabled:text-zinc-500`}
          />
        </Field>
      </div>

      <Field label="Moving time">
        <div className="grid grid-cols-3 gap-2">
          {([
            ["hh", hh, setHh, "hrs"],
            ["mm", mm, setMm, "min"],
            ["ss", ss, setSs, "sec"],
          ] as const).map(([key, val, set, ph]) => (
            <input
              key={key}
              type="number"
              inputMode="numeric"
              min="0"
              value={val}
              onChange={(e) => set(e.target.value)}
              placeholder={ph}
              className={`${inputClass} text-center`}
            />
          ))}
        </div>
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="How did it feel?"
          className={`${inputClass} resize-none`}
        />
      </Field>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-neon-crimson/40 bg-neon-crimson/10 px-3 py-2 font-mono text-[11px] text-neon-crimson">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={save}
        disabled={!valid || saving}
        className="flex items-center justify-center gap-2 rounded-lg border border-hot-green/50 bg-hot-green/10 px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.2em] text-neon-green transition-colors hover:bg-hot-green/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {saving ? "Saving…" : "Save effort"}
      </button>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-edge bg-void/60 px-3 py-2 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-hot-green/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
